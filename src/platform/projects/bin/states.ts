import { BinError } from './errors';
import type {
  BinAvailability,
  BinEntry,
  BinLifecycleIntent,
  BinPending,
  BinPurgeReason,
} from './types';

/** Expired entries cannot be restored even before background cleanup runs. */
export function availability(entry: BinEntry, now: number): BinAvailability {
  if (entry.state === 'restored') return 'restored';
  if (entry.state === 'purged') return 'purged';
  return now >= entry.recoverUntil ? 'expired' : 'recoverable';
}

/** Rejects a command whose expected entry version is out of date. */
export function expectVersion(entry: BinEntry, expected: number) {
  if (entry.version !== expected)
    throw new BinError('stale_revision', { deletionId: entry.deletionId, current: entry.version });
}

/**
 * Legal transitions: retained → restored, retained → purged (requested, project cascade or
 * expiry). Restored and purged are terminal; deleting a restored entity again is a new event.
 */
export function transition(
  entry: BinEntry,
  intent: Exclude<BinLifecycleIntent, 'trash'>,
  now: number,
  reason: BinPurgeReason = intent === 'expire' ? 'expired' : 'requested',
): BinEntry {
  if (entry.state !== 'retained') throw new BinError('not_retained');
  if (entry.pending && entry.pending.intent !== intent) throw new BinError('pending_sync');
  const current = availability(entry, now);
  if (intent === 'restore' && current === 'expired') throw new BinError('expired');
  if (intent === 'expire' && current !== 'expired') throw new BinError('not_retained');
  const next: BinEntry = { ...entry, version: entry.version + 1, pending: null };
  if (intent === 'restore') return { ...next, state: 'restored' };
  return { ...next, state: 'purged', purgeReason: intent === 'expire' ? 'expired' : reason };
}

export type CancelOutcome =
  | { kind: 'drop' }
  | { kind: 'inverse'; intent: 'trash' | 'restore'; after: string }
  | { kind: 'none' };

/**
 * Cancellation before dispatch drops the queued intent atomically. After dispatch the remote
 * write may have happened: reverse it with an inverse command once its receipt is reconciled.
 * A dispatched purge cannot be reversed.
 */
export function cancelPending(pending: BinPending | null): CancelOutcome {
  if (!pending) return { kind: 'none' };
  if (pending.stage === 'queued') return { kind: 'drop' };
  if (pending.intent === 'purge' || pending.intent === 'expire') throw new BinError('irreversible');
  return {
    kind: 'inverse',
    intent: pending.intent === 'trash' ? 'restore' : 'trash',
    after: pending.operationId,
  };
}
