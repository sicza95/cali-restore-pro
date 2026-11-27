import { describe, expect, it } from 'vitest';
import { actor, context, day, ids, project, t0 } from './bin-fixtures';
import { binRecoveryMs } from './constants';
import { applyGraphEdits } from './graph';
import { planRestore } from './plan-restore';
import { planTrash, trashedIds } from './plan-trash';
import type { BinEntity } from './subtree';

describe('planTrash', () => {
  it('plans a surface deletion without mutating the project', () => {
    const value = project();
    const before = structuredClone(value);
    const [a] = value.objects;
    const plan = planTrash(
      value,
      { kind: 'surface', objectId: a!.id, surfaceId: a!.surfaces[0]!.id },
      'del-1',
      context(),
    );
    expect(value).toEqual(before);
    expect(plan.edits).toEqual([
      { op: 'remove-surface', objectId: a!.id, surfaceId: a!.surfaces[0]!.id },
      { op: 'clear-cover', entityId: value.id },
    ]);
    expect(plan.pins).toEqual([ids.photoA]);
    expect(plan.journals).toEqual([
      { project: value.id, surface: a!.surfaces[0]!.id, source: ids.photoA },
    ]);
    expect(plan.entry).toMatchObject({
      deletionId: 'del-1',
      state: 'retained',
      version: 1,
      deletedAt: t0,
      deletedBy: ids.owner,
      recoverUntil: t0 + binRecoveryMs,
      provisional: false,
      pending: null,
      counts: { objects: 0, surfaces: 1, photos: 1 },
    });
    expect(binRecoveryMs).toBe(30 * day);
    expect(plan.operation.expectedHead).toEqual({ revision: 7, epoch: null });
    expect(plan.captured).toEqual(a!.surfaces[0]);
  });

  it('captures one entry for an object subtree with its assets', () => {
    const value = project();
    const b = value.objects[1]!;
    const plan = planTrash(value, { kind: 'object', objectId: b.id }, 'del-2', context());
    expect(plan.edits).toEqual([{ op: 'remove-object', objectId: b.id }]);
    expect(plan.pins).toEqual([ids.photoB, ids.logo].sort());
    expect(trashedIds(plan)).toEqual([b.id, b.surfaces[0]!.id]);
    expect(plan.entry.counts).toEqual({ objects: 1, surfaces: 1, photos: 1 });
  });

  it('treats a whole project as a lifecycle gate, not a graph edit', () => {
    const value = project();
    const plan = planTrash(value, { kind: 'project' }, 'del-3', context());
    expect(plan.edits).toEqual([{ op: 'remove-project', projectId: value.id }]);
    expect(plan.entry.counts).toEqual({ objects: 2, surfaces: 3, photos: 2 });
    expect(applyGraphEdits(value, plan.edits, new Map(), t0)).toEqual(value);
  });

  it('marks hosted deletions provisional and queued until the server accepts', () => {
    const plan = planTrash(
      project(),
      { kind: 'project' },
      'del-4',
      context({ scope: 'hosted', epoch: 3 }),
    );
    expect(plan.entry.provisional).toBe(true);
    expect(plan.entry.pending).toEqual({ intent: 'trash', operationId: 'op-1', stage: 'queued' });
    expect(plan.operation.expectedHead).toEqual({ revision: 7, epoch: 3 });
  });

  it('allows only owners and organisation administrators to trash hosted work', () => {
    const value = project();
    const member = actor({
      accountId: ids.stranger,
      projectOwner: false,
      organisationRole: 'member',
    });
    expect(() =>
      planTrash(value, { kind: 'project' }, 'd', context({ scope: 'hosted', actor: member })),
    ).toThrow(expect.objectContaining({ code: 'forbidden' }));
    const admin = actor({
      accountId: ids.stranger,
      projectOwner: false,
      organisationRole: 'admin',
    });
    expect(
      planTrash(value, { kind: 'project' }, 'd', context({ scope: 'hosted', actor: admin })).entry
        .deletedBy,
    ).toBe(ids.stranger);
    const other = actor({ accountId: ids.stranger });
    expect(() => planTrash(value, { kind: 'project' }, 'd', context({ actor: other }))).toThrow(
      expect.objectContaining({ code: 'forbidden' }),
    );
  });

  it('restores a trashed surface with original IDs and keeps later project edits', () => {
    const value = project();
    const [a, b] = value.objects;
    const surface = a!.surfaces[0]!;
    const plan = planTrash(
      value,
      { kind: 'surface', objectId: a!.id, surfaceId: surface.id },
      'del-5',
      context(),
    );
    const removed = { ...applyGraphEdits(value, plan.edits, new Map(), t0 + 1), revision: 8 };
    expect(removed.cover).toBeUndefined();
    // A later, unrelated edit must survive the restore.
    removed.objects[1]!.name = 'Renamed door';
    const restore = planRestore(
      {
        project: removed,
        entry: plan.entry,
        catalog: [plan.entry],
        payloads: new Map<string, BinEntity>([['del-5', plan.captured]]),
      },
      context({ now: t0 + day, operationId: 'op-2' }),
    );
    expect(restore.edits).toEqual([
      { op: 'insert-surface', objectId: a!.id, surfaceId: surface.id, deletionId: 'del-5' },
    ]);
    expect(restore.transitions[0]).toMatchObject({ state: 'restored', version: 2 });
    expect(restore.operation).toMatchObject({
      intent: 'restore',
      expectedHead: { revision: 8 },
      expectedVersions: { 'del-5': 1 },
    });
    const back = applyGraphEdits(
      removed,
      restore.edits,
      new Map([['del-5', plan.captured]]),
      t0 + day,
    );
    expect(back.objects[0]!.surfaces.map(({ id }) => id)).toEqual([a!.surfaces[1]!.id, surface.id]);
    expect(back.objects[0]!.surfaces[1]).toEqual(surface);
    expect(back.objects[1]!.name).toBe('Renamed door');
    expect(back.objects[1]!.id).toBe(b!.id);
  });
});
