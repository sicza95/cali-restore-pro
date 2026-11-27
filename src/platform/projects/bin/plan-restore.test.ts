import { describe, expect, it } from 'vitest';
import type { SavedProjectV2 } from '../types';
import { actor, context, project, t0 } from './bin-fixtures';
import { binRecoveryMs } from './constants';
import { applyGraphEdits } from './graph';
import { planRestore, type BinRestoreInput } from './plan-restore';
import { planTrash, type BinTrashPlan } from './plan-trash';
import type { BinEntity } from './subtree';

type Trashed = { graph: SavedProjectV2; plans: BinTrashPlan[] };
/** Applies trash plans in order, as storage would. */
function trash(
  value: SavedProjectV2,
  steps: [Parameters<typeof planTrash>[1], string][],
  scope: 'local' | 'hosted' = 'local',
): Trashed {
  let graph = value;
  const plans: BinTrashPlan[] = [];
  for (const [target, id] of steps) {
    const plan = planTrash(graph, target, id, context({ scope }));
    plans.push(plan);
    graph = { ...applyGraphEdits(graph, plan.edits, new Map(), t0), revision: graph.revision + 1 };
  }
  return { graph, plans };
}
const input = (
  trashed: Trashed,
  entry: number,
  extra: Partial<BinRestoreInput> = {},
): BinRestoreInput => ({
  project: trashed.graph,
  entry: trashed.plans[entry]!.entry,
  catalog: trashed.plans.map(({ entry }) => entry),
  payloads: new Map<string, BinEntity>(
    trashed.plans.map((plan) => [plan.entry.deletionId, plan.captured]),
  ),
  ...extra,
});
const code = (code: string) => expect.objectContaining({ code });

describe('planRestore', () => {
  it('restores a parent in Bin with the child as one group, leaving unrelated entries', () => {
    const value = project();
    const [a, b] = value.objects;
    const trashed = trash(value, [
      [{ kind: 'surface', objectId: a!.id, surfaceId: a!.surfaces[0]!.id }, 'surface'],
      [{ kind: 'surface', objectId: b!.id, surfaceId: b!.surfaces[0]!.id }, 'unrelated'],
      [{ kind: 'object', objectId: a!.id }, 'object'],
    ]);
    const plan = planRestore(input(trashed, 0), context());
    expect(plan.group.map(({ deletionId }) => deletionId)).toEqual(['object', 'surface']);
    expect(plan.edits).toEqual([
      { op: 'insert-object', objectId: a!.id, deletionId: 'object' },
      {
        op: 'insert-surface',
        objectId: a!.id,
        surfaceId: a!.surfaces[0]!.id,
        deletionId: 'surface',
      },
    ]);
    const payloads = input(trashed, 0).payloads;
    const back = applyGraphEdits(trashed.graph, plan.edits, payloads, t0);
    // The object's own previously deleted child is restored only because it was the request.
    expect(back.objects.find(({ id }) => id === a!.id)!.surfaces.map(({ id }) => id)).toEqual([
      a!.surfaces[1]!.id,
      a!.surfaces[0]!.id,
    ]);
    expect(back.objects.find(({ id }) => id === b!.id)!.surfaces).toEqual([]);
  });

  it('does not revive separately deleted children when restoring their parent', () => {
    const value = project();
    const a = value.objects[0]!;
    const trashed = trash(value, [
      [{ kind: 'surface', objectId: a.id, surfaceId: a.surfaces[1]!.id }, 'child'],
      [{ kind: 'object', objectId: a.id }, 'object'],
    ]);
    const plan = planRestore(input(trashed, 1), context());
    expect(plan.group.map(({ deletionId }) => deletionId)).toEqual(['object']);
    const back = applyGraphEdits(trashed.graph, plan.edits, input(trashed, 1).payloads, t0);
    expect(back.objects.find(({ id }) => id === a.id)!.surfaces.map(({ id }) => id)).toEqual([
      a.surfaces[0]!.id,
    ]);
  });

  it('requires another active object of the project when the original object is gone', () => {
    const value = project();
    const [a, b] = value.objects;
    const trashed = trash(value, [
      [{ kind: 'surface', objectId: a!.id, surfaceId: a!.surfaces[0]!.id }, 'surface'],
    ]);
    trashed.graph = {
      ...trashed.graph,
      objects: trashed.graph.objects.filter(({ id }) => id !== a!.id) as SavedProjectV2['objects'],
    };
    expect(() => planRestore(input(trashed, 0), context())).toThrow(code('missing_parent'));
    const plan = planRestore(input(trashed, 0, { destinationObjectId: b!.id }), context());
    expect(plan.edits).toEqual([
      {
        op: 'insert-surface',
        objectId: b!.id,
        surfaceId: a!.surfaces[0]!.id,
        deletionId: 'surface',
      },
    ]);
    expect(() =>
      planRestore(input(trashed, 0, { destinationObjectId: 'elsewhere' }), context()),
    ).toThrow(code('missing_parent'));
  });

  it('requires explicit unarchive of an archived destination', () => {
    const value = project();
    const a = value.objects[0]!;
    const trashed = trash(value, [
      [{ kind: 'surface', objectId: a.id, surfaceId: a.surfaces[0]!.id }, 'surface'],
    ]);
    trashed.graph.objects[0]!.archived = true;
    expect(() => planRestore(input(trashed, 0), context())).toThrow(code('archived_destination'));
    const plan = planRestore(input(trashed, 0, { unarchive: [a.id] }), context());
    expect(plan.edits[0]).toEqual({ op: 'unarchive', entityId: a.id });
    const back = applyGraphEdits(trashed.graph, plan.edits, input(trashed, 0).payloads, t0);
    expect(back.objects[0]!.archived).toBe(false);
  });

  it('keeps an archived entity archived when restored into an active destination', () => {
    const value = project();
    const a = value.objects[0]!;
    a.surfaces[0]!.archived = true;
    const trashed = trash(value, [
      [{ kind: 'surface', objectId: a.id, surfaceId: a.surfaces[0]!.id }, 'surface'],
    ]);
    const plan = planRestore(input(trashed, 0), context());
    expect(
      applyGraphEdits(trashed.graph, plan.edits, input(trashed, 0).payloads, t0).objects[0]!
        .surfaces[1]!.archived,
    ).toBe(true);
  });

  it('blocks identity collisions and permits duplicate names', () => {
    const value = project();
    const a = value.objects[0]!;
    const surface = a.surfaces[0]!;
    const trashed = trash(value, [
      [{ kind: 'surface', objectId: a.id, surfaceId: surface.id }, 'surface'],
    ]);
    trashed.graph.objects[0]!.surfaces.push({
      ...structuredClone(surface),
      id: crypto.randomUUID(),
      images: [],
    });
    expect(planRestore(input(trashed, 0), context()).group).toHaveLength(1);
    trashed.graph.objects[1]!.surfaces.push(structuredClone(surface));
    expect(() => planRestore(input(trashed, 0), context())).toThrow(code('identity_collision'));
  });

  it('restores a child of a trashed project through the project, or fails once it is purged', () => {
    const value = project();
    const a = value.objects[0]!;
    const trashed = trash(value, [
      [{ kind: 'object', objectId: a.id }, 'object'],
      [{ kind: 'project' }, 'project'],
    ]);
    const plan = planRestore(input(trashed, 0, { project: null }), context());
    expect(plan.group.map(({ deletionId }) => deletionId)).toEqual(['project', 'object']);
    expect(plan.edits.map(({ op }) => op)).toEqual(['restore-project', 'insert-object']);
    const purged = { ...input(trashed, 0, { project: null }), catalog: [trashed.plans[0]!.entry] };
    expect(() => planRestore(purged, context())).toThrow(code('project_purged'));
    expect(() => planRestore(input(trashed, 1), context())).toThrow(code('identity_collision'));
  });

  it('enforces deadlines and missing payloads', () => {
    const value = project();
    const a = value.objects[0]!;
    const trashed = trash(value, [[{ kind: 'object', objectId: a.id }, 'object']]);
    expect(() => planRestore(input(trashed, 0), context({ now: t0 + binRecoveryMs }))).toThrow(
      code('expired'),
    );
    expect(
      planRestore(input(trashed, 0), context({ now: t0 + binRecoveryMs - 1 })).group,
    ).toHaveLength(1);
    expect(() => planRestore(input(trashed, 0, { payloads: new Map() }), context())).toThrow(
      code('incomplete_recovery'),
    );
  });

  it('rechecks current roles, hosting and quota for hosted restores', () => {
    const value = project();
    const a = value.objects[0]!;
    const trashed = trash(value, [[{ kind: 'object', objectId: a.id }, 'object']], 'hosted');
    trashed.plans[0]!.entry = { ...trashed.plans[0]!.entry, pending: null, provisional: false };
    const hosted = (overrides: Parameters<typeof actor>[0]) =>
      context({ scope: 'hosted', actor: actor(overrides) });
    expect(() => planRestore(input(trashed, 0), hosted({ projectOwner: false }))).toThrow(
      code('forbidden'),
    );
    expect(() => planRestore(input(trashed, 0), hosted({ hostingEntitled: false }))).toThrow(
      code('hosting_unavailable'),
    );
    expect(() => planRestore(input(trashed, 0), hosted({ quotaAvailable: false }))).toThrow(
      code('quota_exceeded'),
    );
    expect(() => planRestore(input(trashed, 0), hosted({ online: false }))).toThrow(
      code('offline'),
    );
    expect(
      planRestore(input(trashed, 0), hosted({ projectOwner: false, organisationRole: 'admin' }))
        .group,
    ).toHaveLength(1);
    trashed.plans[0]!.entry = {
      ...trashed.plans[0]!.entry,
      pending: { intent: 'trash', operationId: 'x', stage: 'dispatched' },
    };
    expect(() => planRestore(input(trashed, 0), hosted({}))).toThrow(code('pending_sync'));
  });
});
