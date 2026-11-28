import type { BinDetail } from '../../api';
import { aead, plaintextCode } from '../../vault/aead';
import { importCode, open } from '../../vault/crypto';
import type { LocalVault } from '../../vault/vault';
import { validateProject } from '../projects';
import { openRevision, RevisionError } from '../revisions';
import type { Project } from '../types';
import { decodeBundle } from './bundle';
import { BinError } from './errors';
import { hostedRemote } from './hosted-remote';
import { downloadBinAssets } from './hosted-assets';
import type { BinEntityRef, BinEntry, BinManifest } from './types';
import { canonical } from './digest';

type Target = { deletionId: string; version: number };

function checkDetail(detail: BinDetail, projectId: string, target: Target): BinEntityRef {
  if (detail.projectId !== projectId || detail.deletionId !== target.deletionId)
    throw new BinError('incomplete_recovery');
  if (detail.state !== 'retained') throw new BinError('not_retained');
  if (detail.version !== target.version) throw new BinError('stale_revision');
  for (const action of ['read', 'restore'] as const) {
    const capability = detail.capabilities[action];
    if (!capability.allowed) throw new BinError(capability.reason ?? 'forbidden');
  }
  if (detail.entityKind === 'object')
    return { kind: 'object', projectId, objectId: detail.entityId };
  if (detail.entityKind === 'surface' && detail.objectId)
    return { kind: 'surface', projectId, objectId: detail.objectId, surfaceId: detail.entityId };
  throw new BinError('incomplete_recovery');
}

/** Verifies the recovery payload, then opens or refreshes a clean device copy of the live head. */
export async function prepareHostedRestore(
  vault: LocalVault,
  organisationId: string,
  projectId: string,
  target: Target,
) {
  const queue = vault.revisions();
  const store = vault.bin();
  const remote = hostedRemote(queue.signal);
  if (!navigator.onLine) throw new BinError('offline');
  const detail = await remote.detail(target.deletionId);
  const entity = checkDetail(detail, projectId, target);
  const checkpoint = (await queue.checkpoints()).find(({ project }) => project === projectId);
  if (
    checkpoint?.paused ||
    (await queue.drafts()).some(({ project }) => project === projectId) ||
    (await vault.binOutbox().list()).some((row) => row.projectId === projectId) ||
    (await vault.projects().changed(projectId, 0))?.revision !== checkpoint?.localRevision
  )
    throw new BinError('pending_sync');

  const state = await queue.readRemote(projectId).catch((error: unknown) => {
    if (error instanceof RevisionError && [401, 403, 404].includes(error.status))
      throw new BinError('forbidden');
    throw error;
  });
  const head = state.head;
  if (!head || head.epoch !== state.epoch || (checkpoint && checkpoint.epoch !== head.epoch))
    throw new BinError('pending_sync');
  const key = aead.enabled
    ? await queue.projectKey(projectId, head.epoch).catch(() => {
        throw new BinError('incomplete_recovery');
      })
    : { epoch: head.epoch, key: await importCode(plaintextCode) };
  if (!checkpoint && aead.enabled) throw new BinError('pending_sync');

  const text = await openRevision(projectId, head, key);
  const graph = validateProject(JSON.parse(text) as Project, projectId);
  if (entity.kind === 'surface' && !graph.objects.some(({ id }) => id === entity.objectId))
    throw new BinError('missing_parent', { objectId: entity.objectId });

  const sealed = await downloadRecovery(remote, store, key.key, detail, entity, organisationId);
  await downloadBinAssets(vault, projectId, sealed.pins);
  await store.retain(sealed);
  if (!checkpoint) {
    if (!(await queue.acceptKey(projectId, head, plaintextCode, text)))
      throw new BinError('stale_revision');
  } else if (head.revision !== checkpoint.revision) {
    if (head.revision < checkpoint.revision) throw new BinError('stale_revision');
    const next = await store.sealProject(projectId, checkpoint.localRevision + 1, text);
    await vault.binOutbox().refreshProject(checkpoint, next, head);
  }
}

async function downloadRecovery(
  remote: ReturnType<typeof hostedRemote>,
  store: ReturnType<LocalVault['bin']>,
  key: CryptoKey,
  detail: BinDetail,
  entity: BinEntityRef,
  organisationId: string,
) {
  const { projectId } = entity;
  const { deletionId, version } = detail;
  const read = (purpose: string, envelope: { salt: string; ciphertext: string }) =>
    open(key, projectId, `bin:${deletionId}:${purpose}`, { ...envelope, version: 1 }).catch(() => {
      throw new BinError('incomplete_recovery');
    });
  const ref = { schema: detail.manifestSchema, sha256: detail.manifestSha256 };
  try {
    const manifest = JSON.parse(await read('manifest', detail.manifest)) as BinManifest;
    const deletedAt = Date.parse(detail.deletedAt);
    const recoverUntil = Date.parse(detail.recoverUntil);
    if (
      manifest.deletionId !== deletionId ||
      canonical(manifest.entity) !== canonical(entity) ||
      manifest.coverage.missing.length ||
      manifest.coverage.legacy ||
      manifest.chunks.length !== detail.chunkCount ||
      detail.chunkCount < 1 ||
      detail.chunkCount > 64 ||
      manifest.sourceRevision !== detail.sourceRevision ||
      !Number.isFinite(deletedAt) ||
      !Number.isFinite(recoverUntil)
    )
      throw new BinError('incomplete_recovery');
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    for (let index = 0; index < detail.chunkCount; index++) {
      const envelope = JSON.parse(await remote.chunk(deletionId, index));
      chunks.push(
        Uint8Array.from(atob(await read(String(index), envelope)), (c) => c.charCodeAt(0)),
      );
    }
    const { captured } = await decodeBundle(ref, manifest, chunks);
    const entry: BinEntry = {
      deletionId,
      organisationId,
      entity,
      version,
      deletedAt,
      recoverUntil,
      state: 'retained',
      scope: 'hosted',
      provisional: false,
      pending: null,
      deletedBy: detail.deletedBy,
      manifest: ref,
      coverage: manifest.coverage,
      counts: manifest.counts,
      sourceRevision: manifest.sourceRevision,
      operationId: deletionId,
    };
    const display = detail.display && JSON.parse(await read('display', detail.display));
    return await store.seal({ manifest, ref, chunks }, entry, {
      name: captured.name,
      path:
        Array.isArray(display?.path) &&
        display.path.every((part: unknown) => typeof part === 'string')
          ? display.path
          : [],
    });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError || error instanceof DOMException)
      throw new BinError('incomplete_recovery');
    throw error;
  }
}
