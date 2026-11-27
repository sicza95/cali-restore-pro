import type { BrowserTarget } from '../browser/mutations';
import { upgradeProject } from '../projects';
import type { SavedProject } from '../types';
import { binRecoveryMs } from './constants';
import { BinError } from './errors';
import { orphanedCovers, type BinGraphEdit } from './graph';
import { canTrash } from './policy';
import {
  entityRef,
  findEntity,
  subtreeAssetIds,
  subtreeCounts,
  subtreeIds,
  subtreeJournals,
  type BinEntity,
} from './subtree';
import type { BinActor, BinEntry, BinOperation, BinScope } from './types';

export type BinCommandContext = {
  actor: BinActor;
  scope: BinScope;
  organisationId: string | null;
  now: number;
  operationId: string;
  /** Hosted head epoch; null for local-only projects. */
  epoch: number | null;
};

export type BinTrashPlan = {
  entry: BinEntry;
  /** Immutable copy of the live subtree, with original IDs, for the recovery bundle. */
  captured: BinEntity;
  edits: BinGraphEdit[];
  /** Journal rows to capture and to revision-check with the drawing-draft guard. */
  journals: { project: string; surface: string; source: string }[];
  /** Assets pinned by this deletion's recovery root until it is purged. */
  pins: string[];
  operation: BinOperation;
};

/**
 * Plans moving a project, object or surface into Bin without touching storage. Deleting a
 * parent creates one entry for its live subtree; children trashed earlier keep their own entries.
 */
export function planTrash(
  project: SavedProject,
  target: BrowserTarget,
  deletionId: string,
  context: BinCommandContext,
): BinTrashPlan {
  const access = canTrash(context.scope, context.actor);
  if (!access.allowed) throw new BinError(access.reason);
  const graph = upgradeProject(project);
  const ref = entityRef(project.id, target);
  const found = findEntity(graph, ref);
  if (!found) throw new BinError('missing_parent', { target });
  const captured = structuredClone(found);
  const edits: BinGraphEdit[] =
    ref.kind === 'project'
      ? [{ op: 'remove-project', projectId: ref.projectId }]
      : [
          ref.kind === 'object'
            ? { op: 'remove-object', objectId: ref.objectId }
            : { op: 'remove-surface', objectId: ref.objectId, surfaceId: ref.surfaceId },
          ...orphanedCovers(graph, found),
        ];
  const hosted = context.scope === 'hosted';
  const entry: BinEntry = {
    deletionId,
    scope: context.scope,
    organisationId: context.organisationId,
    entity: ref,
    state: 'retained',
    version: 1,
    deletedAt: context.now,
    deletedBy: context.actor.accountId,
    recoverUntil: context.now + binRecoveryMs,
    provisional: hosted,
    manifest: null,
    // B02 fills coverage from the captured bundle; nothing is declared before capture.
    coverage: { included: [], missing: [], legacy: false },
    counts: subtreeCounts(found),
    sourceRevision: project.revision,
    operationId: context.operationId,
    pending: hosted ? { intent: 'trash', operationId: context.operationId, stage: 'queued' } : null,
  };
  return {
    entry,
    captured,
    edits,
    journals: subtreeJournals(project.id, found),
    pins: subtreeAssetIds(found),
    operation: {
      operationId: context.operationId,
      intent: 'trash',
      projectId: project.id,
      deletionIds: [deletionId],
      expectedHead: { revision: project.revision, epoch: context.epoch },
      expectedVersions: {},
    },
  };
}

/** IDs leaving the live graph; stale writers must not reintroduce them while retained. */
export const trashedIds = (plan: BinTrashPlan) => subtreeIds(plan.captured);
