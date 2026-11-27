import { upgradeProject } from '../projects';
import type { ProjectV2, SavedProject } from '../types';
import { BinError } from './errors';
import type { BinGraphEdit } from './graph';
import type { BinCommandContext } from './plan-trash';
import { requireCapability } from './policy';
import { transition } from './states';
import { liveIds, subtreeAssetIds, subtreeIds, type BinEntity } from './subtree';
import type { BinEntry, BinOperation } from './types';

export type BinRestoreInput = {
  /** Current live graph; null when the project itself is in Bin or no longer exists. */
  project: SavedProject | null;
  entry: BinEntry;
  /** Every Bin entry of the same project, used only to find required ancestors. */
  catalog: readonly BinEntry[];
  /** Captured subtrees keyed by deletion ID, for the entry and any ancestor it needs. */
  payloads: ReadonlyMap<string, BinEntity>;
  /** Another active object of the same project, when the original object no longer exists. */
  destinationObjectId?: string;
  /** Destinations the person explicitly chose to unarchive. */
  unarchive?: readonly string[];
};

export type BinRestorePlan = {
  /** One dependency group: required ancestors first, then the item. Committed atomically. */
  group: BinEntry[];
  transitions: BinEntry[];
  edits: BinGraphEdit[];
  /** Assets returning to the live graph from these recovery roots. */
  pins: string[];
  operation: BinOperation;
};

const retainedFor = (catalog: readonly BinEntry[], kind: 'project' | 'object', id: string) =>
  catalog.find(({ state, entity }) => {
    if (state !== 'retained' || entity.kind !== kind) return false;
    return entity.kind === 'object' ? entity.objectId === id : entity.projectId === id;
  });

/**
 * Plans restoring one entry into the latest graph with its original IDs. Restores only the
 * ancestors it needs, never unrelated entries; previously deleted children stay in Bin.
 * Duplicate names are allowed; identity collisions block instead of overwriting.
 */
export function planRestore(input: BinRestoreInput, context: BinCommandContext): BinRestorePlan {
  const { entry, catalog, payloads, now } = { ...input, now: context.now };
  const unarchive = new Set(input.unarchive);
  const group: BinEntry[] = [];
  const edits: BinGraphEdit[] = [];
  const pins = new Set<string>();
  let graph: ProjectV2 | null = input.project ? upgradeProject(input.project) : null;
  const ids = new Set(graph ? liveIds(graph) : []);

  const take = (row: BinEntry) => {
    requireCapability(row, context.actor, 'restore', now);
    const payload = payloads.get(row.deletionId);
    if (!payload) throw new BinError('incomplete_recovery', { deletionId: row.deletionId });
    const collision = subtreeIds(payload).find((id) => ids.has(id));
    if (collision) throw new BinError('identity_collision', { id: collision });
    for (const id of subtreeIds(payload)) ids.add(id);
    for (const asset of subtreeAssetIds(payload)) pins.add(asset);
    group.push(row);
    return payload;
  };
  const destination = (node: { id: string; archived?: boolean }) => {
    if (!node.archived) return;
    if (!unarchive.has(node.id)) throw new BinError('archived_destination', { id: node.id });
    edits.push({ op: 'unarchive', entityId: node.id });
  };
  const liveProject = (): ProjectV2 => {
    if (graph) return graph;
    const ancestor = retainedFor(catalog, 'project', entry.entity.projectId);
    if (!ancestor) throw new BinError('project_purged', { projectId: entry.entity.projectId });
    graph = take(ancestor) as ProjectV2;
    edits.push({ op: 'restore-project', projectId: graph.id, deletionId: ancestor.deletionId });
    return graph;
  };

  const ref = entry.entity;
  if (ref.kind === 'project') {
    if (graph) throw new BinError('identity_collision', { id: ref.projectId });
    take(entry);
    edits.push({ op: 'restore-project', projectId: ref.projectId, deletionId: entry.deletionId });
  } else {
    const project = liveProject();
    destination(project);
    if (ref.kind === 'object') {
      take(entry);
      edits.push({ op: 'insert-object', objectId: ref.objectId, deletionId: entry.deletionId });
    } else {
      const target = surfaceDestination(project, ref.objectId, input, catalog);
      if (target.kind === 'ancestor') {
        const object = take(target.entry);
        edits.push({
          op: 'insert-object',
          objectId: object.id,
          deletionId: target.entry.deletionId,
        });
        destination(object as { id: string; archived?: boolean });
      } else destination(target.object);
      const objectId = target.kind === 'ancestor' ? ref.objectId : target.object.id;
      take(entry);
      edits.push({
        op: 'insert-surface',
        objectId,
        surfaceId: ref.surfaceId,
        deletionId: entry.deletionId,
      });
    }
  }

  return {
    group,
    transitions: group.map((row) => transition(row, 'restore', now)),
    edits,
    pins: [...pins].sort(),
    operation: {
      operationId: context.operationId,
      intent: 'restore',
      projectId: ref.projectId,
      deletionIds: group.map(({ deletionId }) => deletionId),
      expectedHead: {
        revision: input.project?.revision ?? entry.sourceRevision,
        epoch: context.epoch,
      },
      expectedVersions: Object.fromEntries(group.map((row) => [row.deletionId, row.version])),
    },
  };
}

function surfaceDestination(
  project: ProjectV2,
  objectId: string,
  input: BinRestoreInput,
  catalog: readonly BinEntry[],
):
  | { kind: 'live'; object: { id: string; archived?: boolean } }
  | { kind: 'ancestor'; entry: BinEntry } {
  const original = project.objects.find(({ id }) => id === objectId);
  if (original) return { kind: 'live', object: original };
  const ancestor = retainedFor(catalog, 'object', objectId);
  if (ancestor) return { kind: 'ancestor', entry: ancestor };
  // The original object was purged: only another active object of the same project qualifies.
  const other = project.objects.find(({ id }) => id === input.destinationObjectId);
  if (!other) throw new BinError('missing_parent', { objectId });
  return { kind: 'live', object: other };
}
