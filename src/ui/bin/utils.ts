import { isBinError } from '../../platform/projects/bin/errors';
import { availability } from '../../platform/projects/bin/states';
import type { BinAvailability, BinEntry } from '../../platform/projects/bin/types';
import type { BinCopy } from './bin-copy';

export type BinOrder = 'newest' | 'oldest' | 'deadline' | 'name';
export type BinRow = {
  entry: BinEntry;
  name: string;
  path: string[];
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
      name: display.name,
      path: display.path,
      state: availability(entry, now),
      days: Math.max(0, Math.ceil((entry.recoverUntil - now) / day)),
    }));
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
        [row.name, ...row.path].some((part) => part.toLocaleLowerCase(language).includes(query)),
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
export function forOrganisation<T extends { entry: BinEntry }>(
  rows: readonly T[],
  organisation: string,
  personal: boolean,
  known: ReadonlySet<string>,
) {
  return rows.filter(({ entry }) => {
    const home = entry.organisationId;
    if (personal) return home === null || home === organisation || !known.has(home);
    return home === organisation;
  });
}

export function failureText(copy: BinCopy, error: unknown) {
  return isBinError(error) ? copy.failures[error.code] : copy.unknownFailure;
}

export const pathText = (copy: BinCopy, path: readonly string[]) =>
  path.length ? path.join(' › ') : copy.topLevel;
