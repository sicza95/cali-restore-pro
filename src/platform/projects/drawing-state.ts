import { assertPattern } from './patterns';
import { assertMask } from './planar-mask';
import { replaceMasks } from './planar-state';
import { drawMask } from './planar-drawing';
import type { DrawingLayer } from './planar-drawing';
import type { PlanarSurface, Point } from './planar-types';

export function commitDrawing(state: PlanarSurface, drawing: DrawingLayer[]): PlanarSurface {
  assertDrawing(drawing);
  const masks = new Map(drawing.map((layer) => [layer.id, drawMask(layer, state.source)]));
  const key = (id: number) => {
    const layer = drawing.find((item) => item.id === id);
    return layer?.key ?? String(id);
  };
  const parent = (id: number) => (id ? key(id) : undefined);
  return {
    ...replaceMasks(state, {
      master: masks.get(1),
      categories: drawing
        .filter((item) => item.kind === 'folder')
        .map((item) => ({
          id: key(item.id),
          parent: parent(item.parent),
        })),
      layers: drawing.flatMap((item) =>
        item.kind === 'phase' || item.kind === 'damage'
          ? [
              {
                id: key(item.id),
                parent: parent(item.parent),
                kind: item.kind,
                mask: masks.get(item.id)!,
              },
            ]
          : [],
      ),
    }),
    drawing,
  };
}

export function assertDrawing(layers: DrawingLayer[]) {
  const id = (value: number) => Number.isSafeInteger(value) && value > 0;
  const point = (value: Point) =>
    Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
  if (
    !Array.isArray(layers) ||
    layers.length > 129 ||
    layers.filter((row) => row.kind === 'master').length !== 1 ||
    new Set(layers.map((row) => row.id)).size !== layers.length
  )
    throw new Error('Invalid drawing layers');
  const parents = new Map(layers.map((row) => [row.id, row.parent]));
  const keys = new Set(
    layers.filter((row) => row.kind !== 'master').map((row) => row.key ?? String(row.id)),
  );
  if (keys.size !== layers.length - 1) throw new Error('Duplicate drawing mask key');
  for (const row of layers) {
    if (
      !id(row.id) ||
      (row.kind === 'master') !== (row.id === 1) ||
      !['master', 'damage', 'phase', 'folder'].includes(row.kind) ||
      (row.parent !== 0 &&
        !layers.some((parent) => parent.id === row.parent && parent.kind === 'folder')) ||
      typeof row.name !== 'string' ||
      row.name.length > 80 ||
      ![row.visible, row.locked, row.expanded, row.outline].every(
        (value) => typeof value === 'boolean',
      ) ||
      !Number.isFinite(row.opacity) ||
      row.opacity < 0 ||
      row.opacity > 100 ||
      !/^#[0-9a-f]{6}$/i.test(row.color) ||
      !['solid', 'hatch', 'none'].includes(row.fill) ||
      !Array.isArray(row.marks) ||
      row.marks.length > 512 ||
      new Set(row.marks.map((mark) => mark.id)).size !== row.marks.length ||
      (row.key !== undefined && (typeof row.key !== 'string' || !row.key)) ||
      (row.kind === 'master' && row.parent !== 0) ||
      (row.kind === 'folder' && (row.base !== undefined || row.marks.length > 0))
    )
      throw new Error('Invalid drawing layer');
    const ancestors = new Set([row.id]);
    for (let parent = row.parent; parent; parent = parents.get(parent)!) {
      if (ancestors.has(parent)) throw new Error('Invalid drawing tree');
      ancestors.add(parent);
    }
    if (row.pattern) assertPattern(row.pattern);
    if (row.base) assertMask(row.base);
    for (const mark of row.marks) {
      assertMask([mark.region]);
      if (
        !id(mark.id) ||
        !['stroke', 'erase', 'path', 'shape'].includes(mark.action) ||
        !['add', 'subtract', 'replace'].includes(mark.operation) ||
        typeof mark.closed !== 'boolean' ||
        !Number.isFinite(mark.width) ||
        mark.width <= 0 ||
        !Array.isArray(mark.points) ||
        mark.points.length < (mark.closed ? 3 : 1) ||
        mark.points.length > 512 ||
        mark.points.some(
          (p) =>
            !point(p.at) ||
            (p.handle && !point(p.handle)) ||
            (p.pressure !== undefined && !(p.pressure >= 0.25 && p.pressure <= 1)),
        )
      )
        throw new Error('Invalid drawing mark');
    }
  }
}
