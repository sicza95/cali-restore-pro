import { BinError } from './errors';
import { availability } from './states';
import type {
  BinAction,
  BinActor,
  BinCapabilities,
  BinCapability,
  BinEntry,
  BinFailureCode,
} from './types';

const allow: BinCapability = { allowed: true };
const deny = (reason: BinFailureCode): BinCapability => ({ allowed: false, reason });
const all = (reason: BinFailureCode): BinCapabilities => ({
  read: deny(reason),
  restore: deny(reason),
  purge: deny(reason),
  device_export: deny(reason),
});

/**
 * Purpose-scoped Bin authorizer. Hosted entries: project owners/co-owners and current
 * organisation administrators only; listed visibility, membership, editing access and report
 * links grant nothing. Local entries: the account that owns the local vault. This does not
 * loosen ordinary project access, which still rejects deleted projects.
 */
export function binCapabilities(entry: BinEntry, actor: BinActor, now: number): BinCapabilities {
  if (!isManager(entry.scope, actor)) return all('forbidden');
  const state = availability(entry, now);
  if (state === 'restored' || state === 'purged') return { ...all('not_retained'), read: allow };
  const hosted = entry.scope === 'hosted';
  return {
    read: allow,
    restore: restoreCapability(entry, actor, state === 'expired'),
    // Zero quota or no hosting never blocks inspecting or permanently deleting.
    purge: entry.pending ? deny('pending_sync') : hosted && !actor.online ? deny('offline') : allow,
    device_export: exportCapability(entry, actor),
  };
}

function restoreCapability(entry: BinEntry, actor: BinActor, expired: boolean): BinCapability {
  if (expired) return deny('expired');
  if (entry.pending) return deny('pending_sync');
  // Legacy entries restore exactly what they declare; new entries must be complete.
  if (entry.coverage.missing.length && !entry.coverage.legacy) return deny('incomplete_recovery');
  if (entry.scope === 'local') return allow;
  if (!actor.online) return deny('offline');
  if (!actor.hostingEntitled) return deny('hosting_unavailable');
  if (!actor.quotaAvailable) return deny('quota_exceeded');
  return allow;
}

/** Device-only copy of a complete project: fresh IDs, no hosting, no inherited grants. */
function exportCapability(entry: BinEntry, actor: BinActor): BinCapability {
  if (entry.entity.kind !== 'project' || !actor.exportAllowed) return deny('forbidden');
  return entry.coverage.missing.length ? deny('incomplete_recovery') : allow;
}

export function requireCapability(
  entry: BinEntry,
  actor: BinActor,
  action: BinAction,
  now: number,
) {
  const result = binCapabilities(entry, actor, now)[action];
  if (!result.allowed) throw new BinError(result.reason, { deletionId: entry.deletionId, action });
}

/** Trashing needs the same manager role as Bin management; hosted trash also needs a connection
 * to dispatch, but it may queue locally while offline. */
export function canTrash(scope: BinEntry['scope'], actor: BinActor): BinCapability {
  return isManager(scope, actor) ? allow : deny('forbidden');
}

function isManager(scope: BinEntry['scope'], actor: BinActor) {
  if (scope === 'local')
    return actor.localVaultAccount !== null && actor.localVaultAccount === actor.accountId;
  return actor.projectOwner || actor.organisationRole === 'admin';
}
