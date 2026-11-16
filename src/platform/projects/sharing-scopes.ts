export type EstimateScope = 'none' | 'estimate-summary' | 'estimate-full';
export type OptionalScope = Exclude<EstimateScope, 'none'> | 'history';
export type ScopeSelection = { estimateScope: EstimateScope; shareHistory: boolean };

/**
 * The server's limit for one sealed scope grant, in ciphertext bytes: 64 KiB of plaintext plus
 * the 16-byte tag, like the project snapshot (`scopeGrantMaxBytes` in
 * server/internal/projects/invitation_scopes.go, checked in base64 by migration 0022). The device
 * keeps an estimate with its snapshots in 64 Ki characters; the largest full scope measured
 * within that seals to about 42 KB (#88).
 */
export const scopeGrantMaxBytes = 64 * 1024 + 16;

/** Thrown before sending when a sealed scope would exceed {@link scopeGrantMaxBytes}. */
export class ScopeTooLargeError extends Error {
  constructor(
    readonly scope: OptionalScope,
    readonly bytes: number,
  ) {
    super(`Sealed ${scope} scope is ${bytes} bytes, over the ${scopeGrantMaxBytes}-byte limit`);
    this.name = 'ScopeTooLargeError';
  }
}

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
