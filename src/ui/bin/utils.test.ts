import { expect, it } from 'vitest';
import type { BinEntry } from '../../platform/projects/bin/types';
import type { HostedCatalogItem } from '../../platform/projects/bin/hosted-catalog';
import { binCopy } from './bin-copy';
import { binRows, forOrganisation, mergeHostedRows, visibleRows } from './utils';

const day = 24 * 60 * 60 * 1000;
const entry = (id: string, organisationId: string | null, deletedAt: number): BinEntry => ({
  deletionId: id,
  scope: 'local',
  organisationId,
  entity: { kind: 'project', projectId: id },
  state: 'retained',
  version: 1,
  deletedAt,
  deletedBy: null,
  recoverUntil: deletedAt + 30 * day,
  provisional: false,
  manifest: null,
  coverage: { included: [], missing: [], legacy: false },
  counts: { objects: 0, surfaces: 0, photos: 0 },
  sourceRevision: 1,
  operationId: id,
  pending: null,
});

it('derives deadlines, filters by organisation and orders without dropping rows', () => {
  const entries: Parameters<typeof binRows>[0] = [
    { entry: entry('a', null, 0), display: { name: 'Alpha', path: [] } },
    { entry: entry('b', 'org', 10 * day), display: { name: 'Beta', path: ['Chapel'] } },
    { entry: entry('c', 'gone', 20 * day), display: { name: 'Gamma', path: [] } },
    { entry: { ...entry('d', null, 0), state: 'restored' }, display: { name: 'Done', path: [] } },
  ];
  const rows = binRows(entries, 30 * day);
  expect(rows.map(({ name, state, days }) => [name, state, days])).toEqual([
    ['Alpha', 'expired', 0],
    ['Beta', 'recoverable', 10],
    ['Gamma', 'recoverable', 20],
  ]);
  const known = new Set(['personal', 'org']);
  expect(
    binRows(forOrganisation(entries, 'personal', true, known), 30 * day).map(({ name }) => name),
  ).toEqual(['Alpha', 'Gamma']);
  expect(
    binRows(forOrganisation(entries, 'org', false, known), 30 * day).map(({ name }) => name),
  ).toEqual(['Beta']);
  expect(visibleRows(rows, '', 'newest', 'en').map(({ name }) => name)).toEqual([
    'Gamma',
    'Beta',
    'Alpha',
  ]);
  expect(visibleRows(rows, '', 'deadline', 'en').map(({ name }) => name)).toEqual([
    'Alpha',
    'Beta',
    'Gamma',
  ]);
  expect(visibleRows(rows, 'chap', 'name', 'en').map(({ name }) => name)).toEqual(['Beta']);
});

it('offers restore and permanent delete for a whole project deleted before the Bin', () => {
  const allowed = { allowed: true };
  const legacy = {
    remote: {
      deletionId: 'p',
      projectId: 'p',
      entityKind: 'project',
      entityId: 'p',
      objectId: null,
      state: 'retained',
      version: 3,
      deletedAt: new Date(0).toISOString(),
      recoverUntil: new Date(30 * day).toISOString(),
      manifestSchema: 0,
      coverageMissing: ['journals'],
      coverageLegacy: true,
      legacy: true,
      capabilities: { read: allowed, restore: allowed, purge: allowed },
    },
  } as unknown as HostedCatalogItem;
  const [row] = mergeHostedRows([], [legacy], binCopy.en, day);
  expect(row).toMatchObject({
    entry: { deletionId: 'p', version: 3, entity: { kind: 'project' } },
    name: binCopy.en.unnamed.project,
    legacyProject: true,
    remotePurge: true,
    limitedRecovery: true,
  });
  expect(row!.restoreDenied).toBeUndefined();
  expect(row!.purgeDenied).toBeUndefined();
  expect(row!.remoteRestore).toBeUndefined();
});
