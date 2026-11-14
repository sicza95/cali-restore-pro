import { calibrationScale, metres } from './planar-calibration';
import { coveredAreas } from './planar-mask';
import { assertPlanarState, categoryMembership } from './planar-state';
import { assertTransform, extent, preparationMatrix, project, rect } from './planar-transform';
import type { LengthUnit, Mask, PlanarSurface } from './planar-types';

export type QuantityStatus = 'valid' | 'unavailable' | 'pending' | 'stale' | 'invalid' | 'failed';
const policy = 'planar-winding-v1';
type Quantity = { status: QuantityStatus; value: number | null };
type Coverage = { pixels2: number; areaM2: Quantity; percent: Quantity };

export function measurePlanar(state: PlanarSurface, projectRevision: number) {
  assertPlanarState(state);
  const matrix = preparationMatrix(state.source, state.frame.input);
  const transform = (mask: Mask) =>
    mask.map((ring) => {
      assertTransform(matrix, ring);
      return ring.map((point) => project(matrix, point));
    });
  const membership = categoryMembership(state);
  const damage = state.layers.map((layer) => layer.kind === 'damage');
  const groups = state.categories.map((group) =>
    state.layers.map((layer, i) => damage[i] && membership.get(layer.id)!.has(group.id)),
  );
  const masks = [
    [rect(state.frame.input.crop)],
    state.master ?? [rect(extent(state.source))],
    ...state.layers.map((layer) => layer.mask),
  ].map(transform);
  const [denominator, unique, ...areas] = coveredAreas(masks, ([crop, master, ...layers]) => {
    const assessed = !!crop && !!master;
    return [
      assessed,
      assessed && layers.some((filled, i) => filled && damage[i]),
      ...layers.map((filled) => assessed && filled),
      ...groups.map((group) => assessed && layers.some((filled, i) => filled && group[i])),
    ];
  });
  const calibration = state.calibration;
  const current = calibration?.frameRevision === state.frame.revision;
  const scale =
    current && calibration ? calibrationScale(state.frame, calibration.input) : undefined;
  const areaStatus = calibration ? (current ? 'valid' : 'invalid') : 'unavailable';
  const coverage = (pixels2: number): Coverage => {
    const areaM2 = scale ? pixels2 * scale[0] * scale[1] : null;
    if (areaM2 !== null && !Number.isFinite(areaM2))
      throw new Error('Physical area exceeds numeric range');
    return {
      pixels2,
      areaM2: { status: areaStatus, value: areaM2 },
      percent: denominator
        ? { status: 'valid', value: (pixels2 / denominator) * 100 }
        : { status: 'unavailable', value: null },
    };
  };
  return {
    policy,
    projectRevision,
    surfaceRevision: state.revision,
    frameRevision: state.frame.revision,
    calibrationRevision: calibration?.revision ?? null,
    source: state.source,
    assessed: coverage(denominator!),
    damage: coverage(unique!),
    layers: state.layers.map((layer, i) => ({ id: layer.id, ...coverage(areas[i]!) })),
    categories: state.categories.map((group, i) => ({
      id: group.id,
      ...coverage(areas[state.layers.length + i]!),
    })),
  };
}

export type PlanarResult = ReturnType<typeof measurePlanar>;
export function resultStatus(
  result: PlanarResult | undefined,
  state: PlanarSurface,
  projectRevision: number,
  job: 'idle' | 'running' | 'error',
): QuantityStatus {
  if (job === 'error') return 'failed';
  if (
    result &&
    (result.projectRevision !== projectRevision ||
      result.surfaceRevision !== state.revision ||
      result.frameRevision !== state.frame.revision ||
      result.calibrationRevision !== (state.calibration?.revision ?? null) ||
      result.source.id !== state.source.id ||
      result.policy !== policy)
  )
    return 'stale';
  if (job === 'running') return 'pending';
  return result?.assessed.areaM2.status ?? 'unavailable';
}
export const displayArea = (areaM2: number, unit: LengthUnit) => areaM2 / metres[unit] ** 2;
