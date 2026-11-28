import { expect, it } from 'vitest';
import type { BinEntry } from '../../platform/projects/bin/types';
import { binRows, forOrganisation, visibleRows } from './utils';

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
