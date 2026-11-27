import { coverAssetIds } from '../browser/assets';
import { validateProject } from '../projects';
import type { ProjectV2, RestorationObjectV2, SavedProjectV2, SurfaceV2 } from '../types';
import { BinError } from './errors';
import type { BinEntity } from './subtree';

/** Edits are pure descriptions; storage applies them inside its own atomic unit of work. */
export type BinGraphEdit =
  | { op: 'remove-project'; projectId: string }
  | { op: 'remove-object'; objectId: string }
  | { op: 'remove-surface'; objectId: string; surfaceId: string }
  /** An ancestor cover pointed at a photo that leaves the live graph with the subtree. */
  | { op: 'clear-cover'; entityId: string }
  | { op: 'restore-project'; projectId: string; deletionId: string }
  | { op: 'insert-object'; objectId: string; deletionId: string }
  | { op: 'insert-surface'; objectId: string; surfaceId: string; deletionId: string }
  /** Only when the person explicitly chose to unarchive the destination. */
  | { op: 'unarchive'; entityId: string };

const objectIn = (project: ProjectV2, id: string) => {
  const object = project.objects.find((row) => row.id === id);
  if (!object) throw new BinError('missing_parent', { objectId: id });
  return object;
};

/**
 * Applies child edits to a copy of the live graph. Whole-project edits are lifecycle gates,
 * not graph changes, and leave the graph untouched. Payloads are captured subtrees keyed by
 * deletion ID and keep their original IDs, creation data and own archived state.
 */
export function applyGraphEdits(
  project: SavedProjectV2,
  edits: readonly BinGraphEdit[],
  payloads: ReadonlyMap<string, BinEntity>,
  now: number,
): SavedProjectV2 {
  const next = structuredClone(project);
  const payload = <T extends BinEntity>(id: string) => {
    const entity = payloads.get(id);
    if (!entity) throw new BinError('incomplete_recovery', { deletionId: id });
    return structuredClone(entity) as T;
  };
  for (const edit of edits) {
    if (edit.op === 'remove-object') {
      next.objects = next.objects.filter(({ id }) => id !== edit.objectId) as RestorationObjectV2[];
    } else if (edit.op === 'remove-surface') {
      const object = objectIn(next, edit.objectId);
      object.surfaces = object.surfaces.filter(({ id }) => id !== edit.surfaceId) as SurfaceV2[];
      object.updatedAt = now;
    } else if (edit.op === 'clear-cover') {
      const node = next.id === edit.entityId ? next : objectIn(next, edit.entityId);
      delete node.cover;
    } else if (edit.op === 'insert-object') {
      next.objects.push(payload<RestorationObjectV2>(edit.deletionId));
    } else if (edit.op === 'insert-surface') {
      const object = objectIn(next, edit.objectId);
      object.surfaces.push(payload<SurfaceV2>(edit.deletionId));
      object.updatedAt = now;
    } else if (edit.op === 'unarchive') {
      const node = next.id === edit.entityId ? next : objectIn(next, edit.entityId);
      node.archived = false;
      node.updatedAt = now;
    }
  }
  if (edits.some(({ op }) => op !== 'remove-project' && op !== 'restore-project'))
    next.updatedAt = now;
  validateProject(next, next.id);
  return next;
}

/** Ancestor covers that would point outside the graph after removing a subtree. */
export function orphanedCovers(project: ProjectV2, removed: BinEntity): BinGraphEdit[] {
  const gone = new Set(
    ('surfaces' in removed ? removed.surfaces : [removed as SurfaceV2]).flatMap(({ images }) =>
      images.map(({ id }) => id),
    ),
  );
  const after = structuredClone(project);
  if ('surfaces' in removed)
    after.objects = after.objects.filter(({ id }) => id !== removed.id) as RestorationObjectV2[];
  else
    for (const object of after.objects)
      object.surfaces = object.surfaces.filter(({ id }) => id !== removed.id) as SurfaceV2[];
  const edits: BinGraphEdit[] = [];
  for (const node of [after, ...after.objects]) {
    const cover = node.cover?.assetId;
    if (cover && gone.has(cover) && !coverAssetIds(after, node).has(cover))
      edits.push({ op: 'clear-cover', entityId: node.id });
  }
  return edits;
}
