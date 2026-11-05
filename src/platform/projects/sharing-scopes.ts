export type EstimateScope = 'none' | 'estimate-summary' | 'estimate-full';
export type OptionalScope = Exclude<EstimateScope, 'none'> | 'history';
export type ScopeSelection = { estimateScope: EstimateScope; shareHistory: boolean };

export function optionalScopes(selection: ScopeSelection): OptionalScope[] {
  const scopes: OptionalScope[] = [];
  if (selection.estimateScope !== 'none') scopes.push(selection.estimateScope);
  if (selection.shareHistory) scopes.push('history');
  return scopes;
}

// The estimate and checkpoint workspaces are still planned. These synthetic
// records exercise separation without fabricating data for the current project.
export const scopeSamples = {
  'estimate-summary': ['1,250 EUR'],
  'estimate-full': ['1,250 EUR', '20 h', '62.50 EUR/h'],
  history: ['Checkpoint 1', 'Synthetic surface inspection'],
} as const satisfies Record<OptionalScope, readonly string[]>;

export function parseScopeSample(scope: OptionalScope, text: string): string[] {
  const rows: unknown = JSON.parse(text);
  if (
    !Array.isArray(rows) ||
    rows.length !== scopeSamples[scope].length ||
    rows.some((row) => typeof row !== 'string' || !row.trim() || row.length > 120)
  )
    throw new Error('Invalid scope sample');
  return rows as string[];
}
