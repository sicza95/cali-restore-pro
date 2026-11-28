import { isBinError } from '../../platform/projects/bin/errors';
import type { HostedCatalogItem } from '../../platform/projects/bin/hosted-catalog';
import { availability } from '../../platform/projects/bin/states';
import type {
  BinAvailability,
  BinCounts,
  BinEntry,
  BinFailureCode,
} from '../../platform/projects/bin/types';
import type { BinCopy } from './bin-copy';

export type BinOrder = 'newest' | 'oldest' | 'deadline' | 'name';
type BinRowEntry = Pick<
  BinEntry,
  'deletionId' | 'scope' | 'state' | 'version' | 'deletedAt' | 'recoverUntil' | 'pending'
> & {
  entity: Pick<BinEntry['entity'], 'kind' | 'projectId'>;
};
export type BinRow = {
  entry: BinRowEntry;
  counts?: BinCounts;
  name: string;
  path?: string[];
  size?: number;
  limitedRecovery?: boolean;
  restoreDenied?: BinFailureCode | 'device_copy_required';
  purgeDenied?: BinFailureCode | 'device_copy_required';
  remotePurge?: true;
  remoteRestore?: true;
  /** A whole project deleted before the Bin: restored on the server, no recovery bundle. */
  legacyProject?: true;
  state: BinAvailability;
  /** Whole days left, rounded up; zero once expired. */
  days: number;
};

const day = 24 * 60 * 60 * 1000;

export function binRows(
  entries: readonly { entry: BinEntry; display: { name: string; path: string[] } }[],
  now: number,
): BinRow[] {
  return entries
    .filter(({ entry }) => entry.state === 'retained')
    .map(({ entry, display }) => ({
      entry,
      counts: entry.counts,
      name: display.name,
      path: display.path,
      state: availability(entry, now),
      days: Math.max(0, Math.ceil((entry.recoverUntil - now) / day)),
    }));
}

/** The server owns accepted events. The vault owns local and pending events. */
export function mergeHostedRows(
  local: readonly BinRow[],
  hosted: readonly HostedCatalogItem[],
  copy: BinCopy,
  now: number,
): BinRow[] {
  const device = new Map(local.map((row) => [row.entry.deletionId, row]));
  const accepted = new Map<string, BinRow>();
  for (const { remote, display } of hosted) {
    if (remote.state !== 'retained' || !remote.capabilities.read.allowed) continue;
    const cached = device.get(remote.deletionId);
    // Keep outbox reconciliation in control while a receipt is still pending locally.
    if (cached?.entry.pending) continue;
    const matching =
      cached?.entry.scope === 'hosted' &&
      cached.entry.version === remote.version &&
      cached.entry.entity.projectId === remote.projectId &&
      cached.entry.entity.kind === remote.entityKind
        ? cached
        : undefined;
    const deletedAt = Date.parse(remote.deletedAt);
    const recoverUntil = Date.parse(remote.recoverUntil);
    if (!Number.isFinite(deletedAt) || !Number.isFinite(recoverUntil)) continue;
    const reason = (action: 'restore' | 'purge') => {
      const capability = remote.capabilities[action];
      if (!capability.allowed) return capability.reason ?? 'forbidden';
      if (remote.legacy) return undefined;
      if (action === 'restore' && remote.entityKind !== 'project' && !remote.legacy)
        return undefined;
      if (matching || (action === 'purge' && remote.entityKind !== 'project' && !remote.legacy))
        return undefined;
      return 'device_copy_required';
    };
    accepted.set(remote.deletionId, {
      entry: {
        deletionId: remote.deletionId,
        scope: 'hosted',
        state: remote.state,
        version: remote.version,
        entity: { kind: remote.entityKind, projectId: remote.projectId },
        deletedAt,
        recoverUntil,
        pending: null,
      },
      counts: matching?.counts,
      name: matching?.name ?? display?.name ?? copy.unnamed[remote.entityKind],
      path: matching?.path ?? display?.path,
      size: remote.manifestSchema ? remote.logicalBytes : undefined,
      limitedRecovery: remote.coverageLegacy || remote.coverageMissing.length > 0,
      restoreDenied: reason('restore'),
      remoteRestore: remote.entityKind !== 'project' && !remote.legacy ? true : undefined,
      legacyProject: remote.legacy ? true : undefined,
      purgeDenied: reason('purge'),
      remotePurge:
        remote.legacy || (!matching && remote.entityKind !== 'project') ? true : undefined,
      state: now >= recoverUntil ? 'expired' : 'recoverable',
      days: Math.max(0, Math.ceil((recoverUntil - now) / day)),
    });
  }
  return [
    ...local.filter(({ entry }) => entry.scope === 'local' || entry.pending),
    ...accepted.values(),
  ];
}

/** Find matches name and original path; ordering never drops rows. */
export function visibleRows(
  rows: readonly BinRow[],
  find: string,
  order: BinOrder,
  language: string,
) {
  const query = find.trim().toLocaleLowerCase(language);
  const matched = query
    ? rows.filter((row) =>
        [row.name, ...(row.path ?? [])].some((part) =>
          part.toLocaleLowerCase(language).includes(query),
        ),
      )
    : [...rows];
  const compare: Record<BinOrder, (a: BinRow, b: BinRow) => number> = {
    newest: (a, b) => b.entry.deletedAt - a.entry.deletedAt,
    oldest: (a, b) => a.entry.deletedAt - b.entry.deletedAt,
    deadline: (a, b) => a.entry.recoverUntil - b.entry.recoverUntil,
    name: (a, b) => a.name.localeCompare(b.name, language),
  };
  return matched.sort(
    (a, b) => compare[order](a, b) || a.entry.deletionId.localeCompare(b.entry.deletionId),
  );
}

/** Entries of one organisation; Personal also shows local entries whose organisation is gone. */
export function forOrganisation<T extends { entry: Pick<BinEntry, 'organisationId' | 'scope'> }>(
  rows: readonly T[],
  organisation: string,
  personal: boolean,
  known: ReadonlySet<string>,
) {
  return rows.filter(({ entry }) => {
    const home = entry.organisationId;
    if (personal)
      return (
        home === null || home === organisation || (entry.scope === 'local' && !known.has(home))
      );
    return home === organisation;
  });
}

export function failureText(copy: BinCopy, error: unknown) {
  return isBinError(error) ? copy.failures[error.code] : copy.unknownFailure;
}

export const pathText = (copy: BinCopy, path: readonly string[] | undefined) =>
  path ? (path.length ? path.join(' › ') : copy.topLevel) : copy.pathUnavailable;

export function commandReason(copy: BinCopy, reason: BinRow['restoreDenied']) {
  return reason === 'device_copy_required'
    ? copy.deviceCopyRequired
    : reason && copy.failures[reason];
}
