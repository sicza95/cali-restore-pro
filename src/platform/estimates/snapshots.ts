import { calculate } from './calculate';
import type { EstimateInput, EstimateSnapshot } from './types';

export function snapshot(input: EstimateInput, version: number, issued: boolean): EstimateSnapshot {
  const copy = structuredClone(input);
  const result = calculate(copy);
  if (issued && !result.complete) throw new Error('Incomplete estimate');
  return {
    schema: 1,
    id: crypto.randomUUID(),
    version,
    createdAt: new Date().toISOString(),
    issued,
    input: copy,
    result,
  };
}

// Deliberate allowlist: no phase names/calculations, hours, materials, rates,
// productivity, preset identifiers or author assumptions cross this boundary.
export function summary(snapshot: EstimateSnapshot, currentRevision: number) {
  const { input, result } = snapshot;
  return {
    schema: 1 as const,
    scope: 'estimate-summary' as const,
    version: snapshot.version,
    snapshot: snapshot.id,
    calculation: result.calculation,
    createdAt: snapshot.createdAt,
    projectRevision: input.revision,
    freshness: currentRevision === input.revision ? ('current' as const) : ('stale' as const),
    illustrative: result.illustrative,
    currency: input.currency,
    objects: result.objects.map(({ id, name, subtotal }) => ({ id, name, subtotal })),
    extras: result.extras,
    adjustments: result.adjustments.map(({ id, amount }) => ({ id, amount })),
    beforeTax: result.beforeTax,
    taxTotal: result.taxTotal,
    total: result.total,
  };
}
export type EstimateSummary = ReturnType<typeof summary>;
