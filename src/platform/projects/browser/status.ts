import type { BrowserItemStatus, BrowserOriginalAvailability } from '../browser-contracts';
import type { EditorSync } from '../editor-sync';

export type BrowserSyncState = Awaited<ReturnType<EditorSync['status']>>;
export type StatusInput = {
  projectId: string;
  localRevision?: number;
  remote?: boolean;
  unreadable?: boolean;
  unavailable?: boolean;
  stagingErrors?: readonly string[];
  sync?: BrowserSyncState;
};

/** Conflict > explicit error > unreadable state > pending > acknowledged checkpoint.
 * Connectivity alone never changes a known checkpoint to an error or claims a sync succeeded.
 */
export function itemStatus(input: StatusInput): BrowserItemStatus {
  const { projectId, localRevision, sync } = input;
  const base = sync?.checkpoints.find((row) => row.project === projectId);
  const draft = sync?.drafts.find((row) => row.project === projectId);
  if (draft?.blocked) return 'conflict';
  if (input.unreadable || input.stagingErrors?.includes(projectId)) return 'error';
  if (input.unavailable) return 'unknown';
  if (localRevision === undefined) return input.remote ? 'remote' : 'unknown';
  if (!sync) return 'unknown';
  if (base?.paused) return 'paused';
  if (draft) return 'pending';
  if (!base) return input.remote ? 'unknown' : 'local';
  if (localRevision > base.localRevision || base.revision === 0) return 'pending';
  if (localRevision < base.localRevision) return 'unknown';
  return 'synced';
}

/** Originals are deliberately independent of document sync; null means not checked. */
export function originalAvailability(
  available: readonly (boolean | null)[],
): BrowserOriginalAvailability {
  if (!available.length) return 'empty';
  if (available.some((value) => value === null)) return 'unknown';
  if (available.every(Boolean)) return 'all';
  return available.some(Boolean) ? 'partial' : 'none';
}
