import clipping from 'polygon-clipping';
import { nonzeroPolygons } from '../projects/planar-drawing';
import { calibrationScale } from '../projects/planar-calibration';
import { polygonBounds, preparationMatrix, project, rect } from '../projects/planar-transform';
import type { Mask, PlanarSurface, Ring } from '../projects/planar-types';
import type { Tile } from '../projects/patterns';

type Paint = {
  path: string;
  color: string;
  opacity: number;
  fill: 'solid' | 'hatch' | 'none';
  outline: boolean;
  tile?: Tile;
};

export function assessmentMap(state: PlanarSurface, calibrated: boolean) {
  const matrix = preparationMatrix(state.source, state.frame.input);
  const crop = rect(state.frame.input.crop);
  const scale =
    calibrated && state.calibration
      ? calibrationScale(state.frame, state.calibration.input)
      : undefined;
  const [sx, sy] = scale ?? [1, 1];
  const transform = (ring: Ring) =>
    ring.map((point) => {
      const [x, y] = project(matrix, point);
      return [x * sx, y * sy] as const;
    });
  const [left, top, width, height] = polygonBounds(transform(crop));
  const factor = Math.min(500 / width, 220 / height);
  if (![width, height, factor].every((value) => Number.isFinite(value) && value > 0))
    throw new Error('Map extent unavailable');
  const path = (mask: Mask) =>
    mask
      .map(
        (ring) =>
          'M' +
          transform(ring)
            .map(([x, y]) =>
              [((x - left) * factor).toFixed(4), ((y - top) * factor).toFixed(4)].join(' '),
            )
            .join('L') +
          'Z',
      )
      .join('');
  const frame = nonzeroPolygons([crop]);
  const assessed = state.master
    ? clipping.intersection(frame, nonzeroPolygons(state.master))
    : frame;
  const flatten = (shape: typeof frame): Mask =>
    shape.flatMap((polygon) => polygon.map((ring) => ring.slice(0, -1)));
  const paints: Paint[] = [];
  const append = (id: string, style?: NonNullable<PlanarSurface['drawing']>[number]) => {
    const layer = state.layers.find((row) => row.id === id);
    if (!layer?.mask.length || !assessed.length || (style && (!style.visible || !style.opacity)))
      return;
    if (style?.fill === 'none' && !style.outline) return;
    const clipped = clipping.intersection(assessed, nonzeroPolygons(layer.mask));
    if (!clipped.length) return;
    paints.push({
      path: path(flatten(clipped)),
      color: style?.color ?? (layer.kind === 'damage' ? '#9c4138' : '#316783'),
      opacity: (style?.opacity ?? 80) / 100,
      fill: style?.fill ?? 'solid',
      outline: style?.outline ?? false,
      tile: style?.fill === 'hatch' ? style.pattern?.tile : undefined,
    });
  };
  const ordered = (parent: number) => {
    for (const layer of state.drawing?.filter((row) => row.parent === parent) ?? []) {
      if (layer.kind === 'folder') ordered(layer.id);
      else append(layer.key ?? String(layer.id), layer);
    }
  };
  if (state.drawing) ordered(0);
  else state.layers.forEach(({ id }) => append(id));
  return {
    width: Math.max(0.001, width * factor),
    height: Math.max(0.001, height * factor),
    extentM: scale ? { width, height } : undefined,
    assessed: path(flatten(assessed)),
    paints,
  };
}

export type AssessmentMap = ReturnType<typeof assessmentMap>;
