import { BinError } from './errors';
import { requireCapability } from './policy';
import { availability, expectVersion, transition } from './states';
import { entityId } from './subtree';
import type { BinActor, BinEntry, BinFailureCode, BinTerminalFence } from './types';

export type BinPurgeGroup = {
  projectId: string;
  /** Every entry this group terminates, each once. */
  entries: BinEntry[];
  /** Added because their project is purged; shown as cascade in confirmation. */
  cascaded: string[];
  transitions: BinEntry[];
  /** Recovery roots removed; physical asset deletion waits for reachability and leases. */
  releasedRoots: string[];
};
export type BinPurgePlan = {
  groups: BinPurgeGroup[];
  denied: { deletionId: string; reason: BinFailureCode }[];
  counts: { selected: number; cascaded: number; total: number };
};

/**
 * Plans permanent deletion, grouped per project. A project purge includes all of its retained
 * entries. An object purge leaves separately retained surface entries untouched: those can
 * still be restored into another object of the project.
 */
export function planPurge(
  targets: readonly { deletionId: string; version: number }[],
  catalog: readonly BinEntry[],
  actor: BinActor,
  now: number,
): BinPurgePlan {
  const byId = new Map(catalog.map((row) => [row.deletionId, row]));
  const denied: BinPurgePlan['denied'] = [];
  const chosen: BinEntry[] = [];
  for (const target of targets) {
    const row = byId.get(target.deletionId);
    try {
      if (!row) throw new BinError('not_retained');
      expectVersion(row, target.version);
      if (row.state !== 'retained') throw new BinError('not_retained');
      requireCapability(row, actor, 'purge', now);
      chosen.push(row);
    } catch (error) {
      if (!(error instanceof BinError)) throw error;
      denied.push({ deletionId: target.deletionId, reason: error.code });
    }
  }
  const projects = new Map<string, Map<string, BinEntry>>();
  const cascaded = new Map<string, Set<string>>();
  for (const row of chosen) {
    const id = row.entity.projectId;
    const group = projects.get(id) ?? new Map<string, BinEntry>();
    projects.set(id, group);
    group.set(row.deletionId, row);
  }
  for (const [projectId, group] of projects) {
    if (![...group.values()].some(({ entity }) => entity.kind === 'project')) continue;
    const added = new Set<string>();
    for (const row of catalog)
      if (
        row.entity.projectId === projectId &&
        row.state === 'retained' &&
        !group.has(row.deletionId)
      ) {
        group.set(row.deletionId, row);
        added.add(row.deletionId);
      }
    cascaded.set(projectId, added);
  }
  const groups = [...projects].map(([projectId, group]): BinPurgeGroup => {
    const entries = [...group.values()].sort((a, b) => a.deletionId.localeCompare(b.deletionId));
    const added = cascaded.get(projectId) ?? new Set();
    return {
      projectId,
      entries,
      cascaded: [...added].sort(),
      transitions: entries.map((row) =>
        transition(row, 'purge', now, added.has(row.deletionId) ? 'project_purged' : 'requested'),
      ),
      releasedRoots: entries.map(({ deletionId }) => deletionId),
    };
  });
  const cascadeCount = groups.reduce((sum, group) => sum + group.cascaded.length, 0);
  return {
    groups,
    denied,
    counts: {
      selected: chosen.length,
      cascaded: cascadeCount,
      total: chosen.length + cascadeCount,
    },
  };
}

/**
 * Deadline enforcement independent of worker timing. A project's expiry also ends its other
 * retained entries, since child recovery cannot recreate a purged project.
 */
export function planExpiry(catalog: readonly BinEntry[], now: number): BinEntry[] {
  // Provisional (not yet accepted) hosted entries follow the server deadline, not the local one.
  const expired = catalog.filter(
    (row) => row.state === 'retained' && !row.provisional && availability(row, now) === 'expired',
  );
  const projects = new Set(
    expired.filter(({ entity }) => entity.kind === 'project').map(({ entity }) => entity.projectId),
  );
  const ids = new Set(expired.map(({ deletionId }) => deletionId));
  return catalog
    .filter((row) => row.state === 'retained')
    .filter((row) => ids.has(row.deletionId) || projects.has(row.entity.projectId))
    .map((row) =>
      ids.has(row.deletionId)
        ? transition({ ...row, pending: null }, 'expire', now)
        : transition({ ...row, pending: null }, 'purge', now, 'project_purged'),
    );
}

export function terminalFence(entry: BinEntry, digest: string): BinTerminalFence {
  if (entry.state === 'retained') throw new BinError('not_retained');
  return {
    entity: entry.entity,
    deletionId: entry.deletionId,
    state: entry.state,
    version: entry.version,
    digest,
  };
}

/**
 * Graph IDs that a stale writer would resurrect: the latest fence for that identity is a purge.
 * Fences are append-only, so the last one per identity wins.
 */
export function resurrectedIds(
  ids: Iterable<string>,
  fences: readonly BinTerminalFence[],
): string[] {
  const latest = new Map<string, BinTerminalFence['state']>();
  for (const fence of fences) {
    const { entity } = fence;
    latest.set(entityId(entity), fence.state);
  }
  return [...ids].filter((id) => latest.get(id) === 'purged');
}
