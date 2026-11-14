import type { DrawingLayer, DrawingMark } from '../../../platform/projects/planar-drawing';
import type {
  MaskLayer,
  PlanarSurface,
  SourceFrame,
  Ring,
} from '../../../platform/projects/planar-types';
import { masterId, newLayer } from './constants';
import type { Layer, Mark, Point } from './types';

const asPixel = (point: Point, source: SourceFrame) =>
  [(point.x * source.width) / 100, (point.y * source.height) / 100] as const;
export const asPercent = ([x, y]: readonly [number, number], source: SourceFrame): Point => ({
  x: (100 * x) / source.width,
  y: (100 * y) / source.height,
});

export function storedMark(mark: Mark, source: SourceFrame): DrawingMark {
  return {
    ...mark,
    region: mark.region!,
    width: (mark.width * source.width) / 100,
    points: mark.points.map((point) => ({
      at: asPixel(point, source),
      handle: point.handle && asPixel(point.handle, source),
      pressure: point.pressure,
    })),
  };
}

export function storedLayers(layers: Layer[], source: SourceFrame): DrawingLayer[] {
  return layers.map((layer) => ({
    ...layer,
    marks: layer.marks.map((mark) => storedMark(mark, source)),
  }));
}

export function restoreMark(mark: DrawingMark, source: SourceFrame): Mark {
  return {
    ...mark,
    width: (mark.width / source.width) * 100,
    points: mark.points.map(({ at, handle, pressure }) => ({
      ...asPercent(at, source),
      handle: handle && asPercent(handle, source),
      pressure,
    })),
  };
}

export function restoreLayers(state: PlanarSurface | undefined): Layer[] {
  if (!state) return [newLayer(masterId, 'master')];
  if (state.drawing)
    return state.drawing.map((layer) => ({
      ...layer,
      marks: layer.marks.map((mark) => restoreMark(mark, state.source)),
    }));
  const rows = [...state.categories, ...state.layers];
  const ids = new Map(rows.map((row, index) => [row.id, masterId + index + 1]));
  return [
    { ...newLayer(masterId, 'master'), base: state.master },
    ...rows.map((row) => ({
      ...newLayer(
        ids.get(row.id)!,
        'mask' in row ? (row as MaskLayer).kind : 'folder',
        ids.get(row.parent ?? '') ?? 0,
      ),
      key: row.id,
      base: 'mask' in row ? (row as MaskLayer).mask : undefined,
    })),
  ];
}

export function insideRegion(point: Point, source: SourceFrame, region: Ring) {
  const [x, y] = asPixel(point, source);
  const sides = region.map(([a, b], i) => {
    const [c, d] = region[(i + 1) % region.length]!;
    return (c - a) * (y - b) - (d - b) * (x - a);
  });
  return sides.every((n) => n >= -1e-7) || sides.every((n) => n <= 1e-7);
}
