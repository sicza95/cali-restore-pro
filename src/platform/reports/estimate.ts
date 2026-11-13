import type { EstimateSummary } from '../estimates/snapshots';
import { summary } from '../estimates/snapshots';
import type { EstimateSnapshot } from '../estimates/types';

export type FullEstimateScope = {
  scope: 'estimate-full';
  snapshot: EstimateSnapshot;
  freshness?: 'current' | 'stale' | 'unknown';
};

export type ReportEstimate = {
  summary: EstimateSummary;
  detail?: ReturnType<typeof itemization>;
  unknownFreshness?: true;
};

function itemization({ input, result }: EstimateSnapshot) {
  const phases = result.phases.map((row) => {
    const phase = input.phases.find(({ id }) => id === row.id)!;
    return {
      name: phase.name,
      surface: phase.surface,
      hours: row.hours,
      work: row.work,
      material: row.material,
      subtotal: row.subtotal,
      unit: phase.units,
      method: phase.price,
      rate: phase.rate[phase.price === 'area' ? phase.units : phase.price],
    };
  });
  return { phases, hours: result.hours, rounding: result.rounding, precision: result.precision };
}

export function reportEstimate(
  source: EstimateSummary | FullEstimateScope,
  mode: 'summary' | 'full',
  revision: number,
  changed = false,
): ReportEstimate {
  if (source.scope === 'estimate-summary') {
    if (mode === 'full') throw new Error('Full estimate access required');
    const totals = structuredClone(source);
    if (totals.projectRevision !== revision) totals.freshness = 'stale';
    return { summary: totals };
  }
  const totals = summary(source.snapshot, revision);
  if (changed || source.freshness === 'stale') totals.freshness = 'stale';
  return mode === 'full'
    ? {
        summary: totals,
        detail: itemization(source.snapshot),
        unknownFreshness: source.freshness === 'unknown' ? true : undefined,
      }
    : { summary: totals };
}

// M-09 stores totals for an entire estimate selection. A report may include the
// whole quote or omit it. Trimming rows would make the issued totals misleading.
export function coversEstimate(snapshot: EstimateSnapshot, surfaces: readonly { id: string }[]) {
  const selected = new Set(surfaces.map(({ id }) => id));
  return snapshot.input.objects
    .filter(({ id }) => snapshot.input.selected.includes(id))
    .every((object) => object.surfaces.every((id) => selected.has(id)));
}
