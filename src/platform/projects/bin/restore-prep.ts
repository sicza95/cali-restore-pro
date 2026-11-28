import type { BinDocuments, ProjectWrite } from '../../vault/bin-store';
import { upgradeProject } from '../projects';
import type { ProjectV2, SavedProject, SavedProjectV2 } from '../types';
import { decodeBundle } from './bundle';
import { operationDigest } from './digest';
import { applyGraphEdits } from './graph';
import { terminalFence } from './plan-purge';
import { planRestore } from './plan-restore';
import type { BinCommandContext } from './plan-trash';
import type { BinEntity } from './subtree';
import type { BinEntry } from './types';

export const stripRevision = (project: SavedProjectV2) => {
  const value: Partial<SavedProjectV2> = { ...project };
  delete value.revision;
  return value;
};

export async function decodedEntry(store: BinDocuments, deletionId: string) {
  const { row, manifest, chunks } = await store.payload(deletionId);
  if (!row.entry.manifest) throw new Error('Bin entry has no manifest');
  return { manifest, body: await decodeBundle(row.entry.manifest, manifest, chunks) };
}

export type RestoreOptions = { destinationObjectId?: string; unarchive?: string[] };
export type PreparedRestore = Awaited<ReturnType<typeof prepareRestore>>;

/**
 * Plans a restore against the current local graph and seals the next project row, without
 * writing. `text` is the restored graph a hosted command carries as its head.
 */
export async function prepareRestore(
  store: BinDocuments,
  current: SavedProject | null,
  deletionId: string,
  options: RestoreOptions,
  context: (entry: BinEntry) => BinCommandContext,
  now: number,
) {
  const catalog = (await store.list()).map(({ entry }) => entry);
  const found = catalog.find((row) => row.deletionId === deletionId);
  if (!found) throw new Error('Bin entry not found');
  // The caller decides what the entry's own pending command means (cancel, wait or replay).
  const cancelsLocalTrash =
    found.provisional && found.pending?.intent === 'trash' && found.pending.stage !== 'dispatched';
  const entry: BinEntry = {
    ...found,
    scope: cancelsLocalTrash ? 'local' : found.scope,
    pending: null,
  };
  const projectId = entry.entity.projectId;
  const siblings = catalog
    .filter((row) => row.entity.projectId === projectId && row.state === 'retained')
    .map((row) => (row.deletionId === deletionId ? entry : row));
  const payloads = new Map<string, BinEntity>();
  const manifests = new Map<string, readonly string[]>();
  for (const row of siblings)
    if (row.deletionId === deletionId || row.entity.kind !== 'surface') {
      const { manifest, body } = await decodedEntry(store, row.deletionId);
      payloads.set(row.deletionId, body.captured);
      manifests.set(row.deletionId, manifest.assets);
    }
  const plan = planRestore(
    { project: current, entry, catalog: siblings, payloads, ...options },
    context(entry),
  );
  const digest = await operationDigest(plan.operation);
  const projectEntry = plan.edits.find((edit) => edit.op === 'restore-project');
  const childEdits = plan.edits.filter((edit) => edit.op !== 'restore-project');
  let project: ProjectWrite | { id: string; restoreRowFrom: string };
  let text: string | null = null;
  if (projectEntry && !childEdits.length)
    project = { id: projectId, restoreRowFrom: projectEntry.deletionId };
  else {
    const base = projectEntry
      ? {
          ...(payloads.get(projectEntry.deletionId) as ProjectV2),
          revision: siblings.find((row) => row.deletionId === projectEntry.deletionId)!
            .sourceRevision,
        }
      : { ...upgradeProject(current!), revision: current!.revision };
    const next = applyGraphEdits(base, childEdits, payloads, now);
    const expected = projectEntry ? null : current!.revision;
    const revision = base.revision + 1;
    text = JSON.stringify(stripRevision(next));
    project = { id: projectId, expected, next: await store.sealProject(projectId, revision, text) };
  }
  return {
    entry: found,
    plan,
    text,
    change: {
      transitions: plan.transitions,
      manifests,
      fences: plan.transitions.map((row) => terminalFence(row, digest)),
      project,
    },
  };
}
