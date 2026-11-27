import type { LocalVault } from '../../vault/vault';
import type { BinDisplay, ProjectWrite } from '../../vault/bin-store';
import { deletionJournals } from '../browser/deletion';
import type { BrowserTarget } from '../browser/mutations';
import { localProjects, upgradeProject } from '../projects';
import type { ProjectV2, SavedProject, SavedProjectV2 } from '../types';
import { decodeBundle, encodeBundle } from './bundle';
import { captureRecovery, type BinCaptureReaders } from './capture';
import { operationDigest } from './digest';
import { applyGraphEdits, type BinGraphEdit } from './graph';
import { planExpiry, planPurge, terminalFence } from './plan-purge';
import { planRestore } from './plan-restore';
import { planTrash, type BinCommandContext } from './plan-trash';
import { reachableAssets } from './reachability';
import { entityRef, findEntity, surfacesOf, type BinEntity } from './subtree';
import type { BinActor, BinEntry } from './types';

/** Local chunks are sealed as base64 text, which must fit one local document envelope. */
const localChunkBytes = 384 * 1024;

const stripRevision = (project: SavedProjectV2) => {
  const value: Partial<SavedProjectV2> = { ...project };
  delete value.revision;
  return value;
};

/**
 * Local Bin for projects that live in this vault. Each command is one atomic vault commit:
 * graph, Bin entry, sealed recovery chunks, pins and fences change together or not at all.
 */
export function localBin(vault: LocalVault, account: string, clock: () => number = Date.now) {
  const store = () => vault.bin();
  const actor = (): BinActor => ({
    accountId: account,
    projectOwner: false,
    organisationRole: null,
    localVaultAccount: account,
    hostingEntitled: false,
    quotaAvailable: false,
    exportAllowed: true,
    online: true,
  });
  const context = (organisationId: string | null): BinCommandContext => ({
    actor: actor(),
    scope: 'local',
    organisationId,
    now: clock(),
    operationId: crypto.randomUUID(),
    epoch: null,
  });
  const readers: BinCaptureReaders = {
    journal: (ref) => vault.projects().readJournal(ref),
    estimate: (id) => vault.estimates().changed(id, 0),
    report: (id) => vault.reports().changed(id, 0),
    assetBytes: (id) => store().assetBytes(id),
  };
  const live = async (id: string) =>
    (await localProjects(vault).list()).find((project) => project.id === id) ?? null;
  async function decoded(deletionId: string) {
    const { row, manifest, chunks } = await store().payload(deletionId);
    if (!row.entry.manifest) throw new Error('Bin entry has no manifest');
    return { manifest, body: await decodeBundle(row.entry.manifest, manifest, chunks) };
  }
  async function sealGraph(
    project: SavedProjectV2,
    edits: readonly BinGraphEdit[],
    expected: number | null,
  ): Promise<ProjectWrite> {
    const next = applyGraphEdits(project, edits, new Map(), clock());
    const revision = (expected ?? project.revision) + 1;
    return {
      id: project.id,
      expected,
      next: await store().sealProject(project.id, revision, JSON.stringify(stripRevision(next))),
    };
  }

  async function trash(project: SavedProject, target: BrowserTarget) {
    const plan = planTrash(
      project,
      target,
      crypto.randomUUID(),
      context(project.organisation ?? null),
    );
    // Fail closed on drafts, as before; the journals stay in place and are captured as well.
    const journals =
      target.kind === 'project'
        ? []
        : await deletionJournals(project.id, surfacesOf(plan.captured), (ref) =>
            vault.projects().readJournal(ref),
          );
    const capture = await captureRecovery(plan, readers);
    const bundle = await encodeBundle(plan, capture, null, localChunkBytes);
    const sealed = await store().seal(bundle, plan.entry, display(upgradeProject(project), target));
    if (target.kind === 'project') {
      await store().trash(
        sealed,
        { id: project.id, expected: project.revision, whole: true },
        journals,
      );
      return { entry: sealed.row.entry, project: null };
    }
    const graph = { ...upgradeProject(project), revision: project.revision };
    const write = await sealGraph(graph, plan.edits, project.revision);
    await store().trash(sealed, write, journals);
    const next = applyGraphEdits(graph, plan.edits, new Map(), clock());
    return { entry: sealed.row.entry, project: { ...next, revision: write.next.revision } };
  }

  async function restore(
    deletionId: string,
    options: { destinationObjectId?: string; unarchive?: string[] } = {},
  ) {
    const catalog = (await store().list()).map(({ entry }) => entry);
    const entry = catalog.find((row) => row.deletionId === deletionId);
    if (!entry) throw new Error('Bin entry not found');
    const projectId = entry.entity.projectId;
    const siblings = catalog.filter(
      (row) => row.entity.projectId === projectId && row.state === 'retained',
    );
    const payloads = new Map<string, BinEntity>();
    const manifests = new Map<string, readonly string[]>();
    for (const row of siblings)
      if (row.deletionId === deletionId || row.entity.kind !== 'surface') {
        const { manifest, body } = await decoded(row.deletionId);
        payloads.set(row.deletionId, body.captured);
        manifests.set(row.deletionId, manifest.assets);
      }
    const current = await live(projectId);
    const plan = planRestore(
      { project: current, entry, catalog: siblings, payloads, ...options },
      context(entry.organisationId),
    );
    const digest = await operationDigest(plan.operation);
    const projectEntry = plan.edits.find((edit) => edit.op === 'restore-project');
    const childEdits = plan.edits.filter((edit) => edit.op !== 'restore-project');
    let project: ProjectWrite | { id: string; restoreRowFrom: string };
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
      const next = applyGraphEdits(base, childEdits, payloads, clock());
      const expected = projectEntry ? null : current!.revision;
      const revision = base.revision + 1;
      project = {
        id: projectId,
        expected,
        next: await store().sealProject(projectId, revision, JSON.stringify(stripRevision(next))),
      };
    }
    await store().finish({
      transitions: plan.transitions,
      manifests,
      fences: plan.transitions.map((row) => terminalFence(row, digest)),
      project,
    });
    return plan;
  }

  /** Purges or expires transitions grouped per project, deleting only unreachable files. */
  async function terminate(
    groups: { projectId: string; transitions: BinEntry[] }[],
    catalog: readonly BinEntry[],
    digest: string,
  ) {
    for (const group of groups) {
      const ids = new Set(group.transitions.map(({ deletionId }) => deletionId));
      const manifests = new Map<string, readonly string[]>();
      for (const row of group.transitions)
        manifests.set(row.deletionId, (await decoded(row.deletionId)).manifest.assets);
      const whole = group.transitions.some(({ entity }) => entity.kind === 'project');
      const current = whole ? null : await live(group.projectId);
      const others: { assets: readonly string[] }[] = [];
      for (const row of catalog)
        if (
          row.entity.projectId === group.projectId &&
          row.state === 'retained' &&
          !ids.has(row.deletionId)
        )
          others.push({ assets: (await decoded(row.deletionId)).manifest.assets });
      const reachable = reachableAssets(
        {
          projects: current ? [current] : [],
          manifests: others,
          historical: [],
          pending: [],
          leases: [],
          legacy: [],
        },
        clock(),
      );
      const candidates = [...new Set([...manifests.values()].flat())].filter(
        (id) => !reachable.has(id),
      );
      await store().finish({
        transitions: group.transitions,
        manifests,
        fences: group.transitions.map((row) => terminalFence(row, digest)),
        ...(whole ? { purgeProject: group.projectId } : { collectable: candidates }),
      });
    }
  }

  return {
    trash,
    restore,
    async list() {
      return store().list();
    },
    async purge(targets: readonly { deletionId: string; version: number }[]) {
      const catalog = (await store().list()).map(({ entry }) => entry);
      const plan = planPurge(targets, catalog, actor(), clock());
      const operationId = crypto.randomUUID();
      const digest = await operationDigest({
        operationId,
        intent: 'purge',
        projectId: plan.groups[0]?.projectId ?? '',
        deletionIds: plan.groups.flatMap(({ entries }) =>
          entries.map(({ deletionId }) => deletionId),
        ),
        expectedHead: { revision: 0, epoch: null },
        expectedVersions: Object.fromEntries(
          plan.groups.flatMap(({ entries }) => entries.map((row) => [row.deletionId, row.version])),
        ),
      });
      await terminate(plan.groups, catalog, digest);
      return plan;
    },
    /** Applies recovery deadlines; safe to call at any time and idempotent. */
    async expire() {
      const catalog = (await store().list()).map(({ entry }) => entry);
      const expired = planExpiry(catalog, clock());
      const groups = new Map<string, BinEntry[]>();
      for (const row of expired)
        groups.set(row.entity.projectId, [...(groups.get(row.entity.projectId) ?? []), row]);
      await terminate(
        [...groups].map(([projectId, transitions]) => ({ projectId, transitions })),
        catalog,
        'expiry',
      );
      return expired;
    },
  };
}

function display(project: ProjectV2, target: BrowserTarget): BinDisplay {
  const entity = findEntity(project, entityRef(project.id, target));
  if (!entity || target.kind === 'project') return { name: project.name, path: [] };
  if (target.kind === 'object') return { name: entity.name, path: [project.name] };
  const object = project.objects.find(({ id }) => id === target.objectId);
  return { name: entity.name, path: [project.name, object?.name ?? ''] };
}
