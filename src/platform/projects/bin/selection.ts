import { binBatchSize } from './constants';
import type { BinEntry } from './types';

export type BinTarget = { deletionId: string; version: number };
export type BinSelection = {
  scope: 'matching' | 'empty_bin';
  organisationId: string | null;
  targets: BinTarget[];
};

/**
 * The catalog of one organisation. Local entries whose organisation is unavailable on this
 * device stay discoverable under Personal (null); this grants nothing on the former server.
 */
export function organisationCatalog(
  entries: readonly BinEntry[],
  organisationId: string | null,
  available: ReadonlySet<string>,
): BinEntry[] {
  return entries.filter((row) => {
    const home =
      row.scope === 'local' && row.organisationId && !available.has(row.organisationId)
        ? null
        : row.organisationId;
    return home === organisationId;
  });
}

/** Freezes the current matches by ID and version; later arrivals are never added. */
export function selectMatching(
  catalog: readonly BinEntry[],
  organisationId: string | null,
  matches: (entry: BinEntry) => boolean,
): BinSelection {
  return {
    scope: 'matching',
    organisationId,
    targets: catalog.filter((row) => row.state === 'retained' && matches(row)).map(freeze),
  };
}

/** Empty Bin covers every purge-eligible entry of the organisation regardless of Find. */
export function selectEmptyBin(
  catalog: readonly BinEntry[],
  organisationId: string | null,
): BinSelection {
  return {
    scope: 'empty_bin',
    organisationId,
    targets: catalog.filter((row) => row.state === 'retained' && !row.pending).map(freeze),
  };
}

const freeze = ({ deletionId, version }: BinEntry): BinTarget => ({ deletionId, version });

/** Per-project batches of at most `size` targets; each batch commits atomically on its own. */
export function batches(
  targets: readonly BinTarget[],
  catalog: readonly BinEntry[],
  size = binBatchSize,
): { projectId: string; targets: BinTarget[] }[] {
  const project = new Map(catalog.map((row) => [row.deletionId, row.entity.projectId]));
  const grouped = new Map<string, BinTarget[]>();
  for (const target of targets) {
    const id = project.get(target.deletionId);
    if (!id) continue;
    grouped.set(id, [...(grouped.get(id) ?? []), target]);
  }
  return [...grouped].flatMap(([projectId, rows]) =>
    Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => ({
      projectId,
      targets: rows.slice(index * size, (index + 1) * size),
    })),
  );
}
