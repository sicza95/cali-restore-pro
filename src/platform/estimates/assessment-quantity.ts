import { resultStatus } from '../projects/planar-measurement';
import type { PlanarResult } from '../projects/planar-measurement';
import type { PlanarSurface } from '../projects/planar-types';
import type { Measurement, Phase } from './types';
import { receiveMeasurement } from './units';

export function measuredQuantity(
  project: string,
  object: string,
  projectRevision: number,
  phase: Pick<Phase, 'id' | 'scope' | 'surface' | 'assessment'>,
  state: PlanarSurface,
  result: PlanarResult | null,
): Measurement {
  const status = resultStatus(
    result ?? undefined,
    state,
    projectRevision,
    result ? 'idle' : 'error',
  );
  const layer = state.layers.find((layer) => layer.id === phase.scope && layer.kind === 'phase');
  const value =
    layer?.mask.length && result?.assessed.pixels2
      ? result.layers.find(({ id }) => id === phase.scope)?.areaM2.value
      : null;
  // Fixed-point decimal uses the calculator's existing 18-place input contract.
  const area =
    status === 'valid' && value != null && value >= 0 && value < 1e21 ? value.toFixed(18) : null;
  return {
    version: 1,
    project,
    object,
    surface: phase.surface,
    phase: phase.id,
    scope: phase.scope,
    assessment: phase.assessment ?? 'current',
    revision: [projectRevision, state.source.id, state.revision, state.frame.revision].join('/'),
    calibration: area === null ? null : String(state.calibration!.revision),
    source: 'committed',
    validity:
      area !== null
        ? 'valid'
        : status === 'failed'
          ? 'failed'
          : status === 'stale'
            ? 'stale'
            : 'missing',
    area,
    unit: 'm²',
  };
}

export function updateMeasuredPhase(phase: Phase, next: Measurement | undefined): Partial<Phase> {
  const previous = phase.quantity?.source === 'committed' ? phase.quantity : undefined;
  if (!next || next.validity !== 'valid') {
    return {
      quantity:
        previous?.validity === 'valid' || previous?.validity === 'stale'
          ? { ...previous, validity: 'stale' }
          : next,
      measurement: phase.measurement === 'stale' ? 'stale' : 'missing',
    };
  }
  const update = receiveMeasurement(
    {
      ...phase,
      quantity:
        previous?.validity === 'stale' && previous.area !== null
          ? { ...previous, validity: 'valid' }
          : previous,
    },
    next,
  );
  if (phase.mode === 'time' && phase.measurement === 'stale' && previous)
    update.measurement = 'stale';
  return update;
}
