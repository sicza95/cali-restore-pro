import { expect, it } from 'vitest';
import { itemStatus, originalAvailability } from './status';
import type { StatusInput } from './status';

const base = { project: 'p', epoch: 'e', revision: 4, localRevision: 6 };
const draft = { project: 'p', id: 'd', expected: 4, epoch: 'e', blocked: undefined };
const known = { projectId: 'p', localRevision: 6, sync: { checkpoints: [base], drafts: [] } };
it.each<[Partial<StatusInput>, string]>([
  [{ sync: { checkpoints: [], drafts: [] } }, 'local'],
  [{ localRevision: undefined, remote: true }, 'remote'],
  [{}, 'synced'],
  [{ sync: { checkpoints: [{ ...base, paused: true }], drafts: [draft] } }, 'paused'],
  [{ localRevision: 7 }, 'pending'],
  [{ sync: { checkpoints: [{ ...base, revision: 0 }], drafts: [] } }, 'pending'],
  [{ sync: { checkpoints: [base], drafts: [draft] } }, 'pending'],
  [{ sync: { checkpoints: [base], drafts: [{ ...draft, blocked: 'conflict' }] } }, 'conflict'],
  [{ stagingErrors: ['p'] }, 'error'],
  [{ unreadable: true, localRevision: undefined }, 'error'],
  [{ unavailable: true }, 'unknown'],
  [{ sync: undefined }, 'unknown'],
  [{ localRevision: 5 }, 'unknown'],
  [{ localRevision: undefined, remote: false }, 'unknown'],
  [{ sync: { checkpoints: [], drafts: [] }, remote: true }, 'unknown'],
])('derives status for %j as %s', (input, expected) => {
  expect(itemStatus({ ...known, ...input })).toBe(expected);
});
it('keeps conflicts ahead of staging errors and isolates projects', () => {
  expect(
    itemStatus({
      ...known,
      stagingErrors: ['p'],
      sync: { checkpoints: [base], drafts: [{ ...draft, blocked: 'conflict' }] },
    }),
  ).toBe('conflict');
  expect(itemStatus({ ...known, stagingErrors: ['other'] })).toBe('synced');
});
it.each<[Array<boolean | null>, string]>([
  [[], 'empty'],
  [[true], 'all'],
  [[false], 'none'],
  [[true, false], 'partial'],
  [[true, null], 'unknown'],
])('tracks original availability independently: %j', (input, expected) => {
  expect(originalAvailability(input)).toBe(expected);
});
