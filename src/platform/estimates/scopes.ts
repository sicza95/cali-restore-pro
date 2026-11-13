import type { LocalVault } from '../vault/vault';
import type { OptionalScope } from '../projects/sharing-scopes';
import { estimateRepository } from './persistence';
import { summary } from './snapshots';
import { calculate } from './calculate';
import type { EstimateSnapshot } from './types';

export async function scopeContent(
  vault: LocalVault,
  project: string,
  scope: OptionalScope,
  revision?: number,
) {
  if (scope === 'history') return undefined;
  const saved = await estimateRepository(vault).load(project);
  const latest = saved?.document.snapshots.filter((s) => s.issued).at(-1);
  if (!latest) throw new Error('Issue an estimate before sharing its scope');
  if (revision === undefined) {
    const projectRow = await vault.projects().changed(project, 0);
    revision = projectRow?.revision;
  }
  const projection = summary(latest, revision ?? -1);
  if (JSON.stringify(latest.input) !== JSON.stringify(saved!.document.draft))
    projection.freshness = 'stale';
  return scope === 'estimate-summary'
    ? projection
    : { schema: 1, scope: 'estimate-full', snapshot: latest, freshness: projection.freshness };
}

export function parseEstimateScope(
  scope: OptionalScope,
  text: string,
  project: string,
): string[] | undefined {
  const value = JSON.parse(text) as Record<string, unknown>;
  if (Array.isArray(value)) return undefined;
  if (!value || value.schema !== 1 || value.scope !== scope)
    throw new Error('Invalid estimate scope');
  if (scope === 'estimate-full') {
    const snapshot = value.snapshot as EstimateSnapshot;
    if (
      !snapshot?.issued ||
      snapshot.schema !== 1 ||
      snapshot.input.project !== project ||
      JSON.stringify(calculate(snapshot.input)) !== JSON.stringify(snapshot.result)
    )
      throw new Error('Invalid full estimate');
    const freshness = value.freshness ?? 'unknown';
    if (freshness !== 'current' && freshness !== 'stale' && freshness !== 'unknown')
      throw new Error('Invalid full estimate freshness');
    return [JSON.stringify({ schema: 1, scope, snapshot, freshness })];
  }
  if (scope !== 'estimate-summary') throw new Error('Invalid scope');
  const keys = [
    'schema',
    'scope',
    'version',
    'snapshot',
    'calculation',
    'createdAt',
    'projectRevision',
    'freshness',
    'illustrative',
    'currency',
    'objects',
    'extras',
    'adjustments',
    'beforeTax',
    'taxTotal',
    'total',
  ];
  if (
    Object.keys(value).some((key) => !keys.includes(key)) ||
    keys.some((key) => !Object.hasOwn(value, key)) ||
    value.calculation !== 'restoration-v1' ||
    !['current', 'stale'].includes(String(value.freshness)) ||
    !Array.isArray(value.objects) ||
    !Array.isArray(value.adjustments)
  )
    throw new Error('Invalid summary');
  if (
    typeof value.currency !== 'string' ||
    !/^[A-Z]{3}$/.test(value.currency) ||
    !Number.isSafeInteger(value.version) ||
    Number(value.version) < 1 ||
    !Number.isSafeInteger(value.projectRevision) ||
    typeof value.createdAt !== 'string' ||
    typeof value.snapshot !== 'string' ||
    typeof value.illustrative !== 'boolean'
  )
    throw new Error('Invalid summary provenance');
  const money = (v: unknown) => typeof v === 'string' && /^-?\d+(?:\.\d+)?$/.test(v);
  if (![value.extras, value.beforeTax, value.taxTotal, value.total].every(money))
    throw new Error('Invalid summary money');
  for (const row of value.objects as Record<string, unknown>[]) {
    if (
      Object.keys(row).sort().join() !== 'id,name,subtotal' ||
      typeof row.id !== 'string' ||
      typeof row.name !== 'string' ||
      !money(row.subtotal)
    )
      throw new Error('Invalid summary object');
  }
  for (const row of value.adjustments as Record<string, unknown>[]) {
    if (
      Object.keys(row).sort().join() !== 'amount,id' ||
      typeof row.id !== 'string' ||
      !money(row.amount)
    )
      throw new Error('Invalid summary adjustment');
  }
  return [JSON.stringify(value)];
}
