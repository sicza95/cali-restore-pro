import type { LocalVault } from '../../vault/vault';
import type { BinDisplay, ProjectWrite } from '../../vault/bin-store';
import { deletionJournals } from '../browser/deletion';
import type { BrowserTarget } from '../browser/mutations';
import { localProjects, upgradeProject } from '../projects';
import type { ProjectV2, SavedProject, SavedProjectV2 } from '../types';
import { encodeBundle } from './bundle';
import { captureRecovery, type BinCaptureReaders } from './capture';
import { operationDigest } from './digest';
import { BinError } from './errors';
import { applyGraphEdits, type BinGraphEdit } from './graph';
import { hostedBin } from './hosted-bin';
import { planExpiry, planPurge, terminalFence } from './plan-purge';
import { planTrash, type BinCommandContext } from './plan-trash';
import { reachableAssets } from './reachability';
import { decodedEntry, prepareRestore, stripRevision, type RestoreOptions } from './restore-prep';
import { entityRef, findEntity, surfacesOf } from './subtree';
import type { BinActor, BinEntry, BinScope } from './types';

/** Local chunks are sealed as base64 text, which must fit one local document envelope. */
const localChunkBytes = 384 * 1024;

/**
 * Bin for projects in this vault. Each command is one atomic vault commit: graph, Bin entry,
 * sealed recovery chunks, pins and fences change together or not at all. Children of a
 * synchronised project are hosted: trash reaches the server Bin through the outbox, restore and
 * purge go to the server first and need the session `csrf` token.
 */
export function localBin(
  vault: LocalVault,
  account: string,
  clock: () => number = Date.now,
  csrf: () => string = () => '',
) {
  const store = () => vault.bin();
  // The server rechecks hosted roles, hosting and quota inside every command.
  const actor = (scope: BinScope = 'local'): BinActor => ({
    accountId: account,
    projectOwner: scope === 'hosted',
    organisationRole: null,
    localVaultAccount: account,
    hostingEntitled: scope === 'hosted',
    quotaAvailable: scope === 'hosted',
    exportAllowed: true,
    online: scope === 'local' || navigator.onLine,
  });
  const context = (
    organisationId: string | null,
    scope: BinScope = 'local',
  ): BinCommandContext => ({
    actor: actor(scope),
    scope,
    organisationId,
    now: clock(),
    operationId: crypto.randomUUID(),
    epoch: null,
  });
  let hostedCommands: ReturnType<typeof hostedBin> | undefined;
  const hosted = () =>
    (hostedCommands ??= hostedBin(
      vault,
      (entry) => context(entry.organisationId, entry.scope),
      clock,
    ));
  const token = () => {
    const value = csrf();
    if (!value) throw new BinError('offline');
    return value;
  };
  const readers: BinCaptureReaders = {
    journal: (ref) => vault.projects().readJournal(ref),
    estimate: (id) => vault.estimates().changed(id, 0),
    report: (id) => vault.reports().changed(id, 0),
    assetBytes: (id) => store().assetBytes(id),
  };
  const live = async (id: string) =>
    (await localProjects(vault).list()).find((project) => project.id === id) ?? null;
  const decoded = (deletionId: string) => decodedEntry(store(), deletionId);
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
    const synced =
      target.kind !== 'project' &&
      (await vault.revisions().checkpoints()).some((row) => row.project === project.id);
    const plan = planTrash(
      project,
      target,
      crypto.randomUUID(),
      context(project.organisation ?? null, synced ? 'hosted' : 'local'),
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
    // A hosted child waits in the outbox; ordinary sync of the project holds until it is sent.
    const outbox = synced
      ? {
          operationId: plan.operation.operationId,
          deletionId: plan.entry.deletionId,
          projectId: project.id,
          intent: 'trash' as const,
          stage: 'queued' as const,
        }
      : undefined;
    await store().trash(sealed, write, journals, outbox);
    const next = applyGraphEdits(graph, plan.edits, new Map(), clock());
    return { entry: sealed.row.entry, project: { ...next, revision: write.next.revision } };
  }

  async function restore(deletionId: string, options: RestoreOptions = {}) {
    const listed = (await store().list()).find(({ entry }) => entry.deletionId === deletionId);
    if (!listed) throw new Error('Bin entry not found');
    const prep = await prepareRestore(
      store(),
      await live(listed.entry.entity.projectId),
      deletionId,
      options,
      (entry) => context(entry.organisationId, entry.scope),
      clock(),
    );
    const { entry } = prep;
    if (entry.scope === 'local') await store().finish(prep.change);
    else if (entry.pending?.stage === 'dispatched') throw new BinError('pending_sync');
    else if (entry.pending) {
      // Not accepted by the server: restoring cancels the queued trash on this device only.
      const row = (await vault.binOutbox().list()).find(
        ({ operationId }) => operationId === entry.pending!.operationId,
      );
      await store().finish({ ...prep.change, ...(row ? { cancel: row } : {}) });
    } else await hosted().restore(prep, options, token());
    return prep.plan;
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
    /** Sends queued hosted commands; true when something should be retried later. */
    dispatch: (csrfToken: string) => hosted().dispatch(csrfToken),
    async list() {
      return store().list();
    },
    async purge(targets: readonly { deletionId: string; version: number }[]) {
      const catalog = (await store().list()).map(({ entry }) => entry);
      const scopes = new Set(
        targets.map(
          ({ deletionId }) => catalog.find((row) => row.deletionId === deletionId)?.scope,
        ),
      );
      const plan = planPurge(
        targets,
        catalog,
        actor(scopes.has('hosted') ? 'hosted' : 'local'),
        clock(),
      );
      // The server forgets a hosted entry first; this device then removes its own copy.
      for (const group of plan.groups) await hosted().purge(group.projectId, group.entries, token);
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
