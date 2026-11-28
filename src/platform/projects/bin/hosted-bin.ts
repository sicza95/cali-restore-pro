import type { BinOutboxRow } from '../../vault/bin-outbox';
import { seal } from '../../vault/crypto';
import type { SyncCheckpoint } from '../../vault/revision-queue';
import type { LocalVault } from '../../vault/vault';
import { upgradeProject } from '../projects';
import { sealRevision, type RevisionKey } from '../revisions';
import type { SavedProject } from '../types';
import { binWriterProtocol } from './constants';
import { canonical } from './digest';
import { BinError, isBinError } from './errors';
import {
  BinTransportError,
  hostedRemote,
  type HostedChunk,
  type HostedCommand,
  type HostedOutcome,
} from './hosted-remote';
import type { BinCommandContext } from './plan-trash';
import { prepareRestore, type PreparedRestore, type RestoreOptions } from './restore-prep';
import { findEntity } from './subtree';
import type { BinEntry } from './types';

type Bytes = Uint8Array<ArrayBuffer>;
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
const base64 = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
const sha256 = async (bytes: Bytes) => hex(await crypto.subtle.digest('SHA-256', bytes));

/** Replay identity: the whole command except the digest itself, so a resealed head differs. */
async function commandDigest(command: Omit<HostedCommand, 'digest'>) {
  return sha256(new TextEncoder().encode(canonical({ ...command, digest: undefined })));
}

/**
 * Hosted Bin commands. A hosted child deletion is committed locally first and queued here; the
 * server receives graph head and Bin entry in one command, never the graph change alone.
 * Restore needs the server first and finishes locally only after it accepts.
 */
export function hostedBin(
  vault: LocalVault,
  context: (entry: BinEntry) => BinCommandContext,
  clock: () => number = Date.now,
) {
  const queue = vault.revisions();
  const remote = hostedRemote(queue.signal);
  const outbox = () => vault.binOutbox();
  const checkpointOf = async (project: string) =>
    (await queue.checkpoints()).find((row) => row.project === project);
  /** A checkpoint ready for a lifecycle head: not paused and no ordinary write in flight. */
  async function ready(project: string) {
    const checkpoint = await checkpointOf(project);
    if (!checkpoint || checkpoint.paused) return;
    if ((await queue.drafts()).some((row) => row.project === project)) return;
    return checkpoint;
  }
  const headBase = (checkpoint: SyncCheckpoint) => ({
    epoch: checkpoint.epoch,
    head: checkpoint.revision ? { revision: checkpoint.revision } : null,
  });
  const live = async (project: string) => {
    const changed = await vault.projects().changed(project, 0);
    if (!changed) return null;
    const saved = { ...JSON.parse(changed.text), revision: changed.revision } as SavedProject;
    return { saved, text: changed.text };
  };

  async function sealChunks(key: RevisionKey, project: string, id: string, chunks: Bytes[]) {
    return Promise.all(
      chunks.map(async (chunk, index): Promise<HostedChunk> => {
        const { salt, ciphertext } = await seal(
          key.key,
          project,
          `bin:${id}:${index}`,
          base64(chunk),
        );
        const bytes = new TextEncoder().encode(JSON.stringify({ salt, ciphertext }));
        return { sha256: await sha256(bytes), body: base64(bytes) };
      }),
    );
  }

  /** Seals a queued trash against the current checkpoint; undefined when it must wait. */
  async function sealTrash(row: BinOutboxRow, checkpoint: SyncCheckpoint) {
    const store = vault.bin();
    const listed = (await store.list()).find(({ entry }) => entry.deletionId === row.deletionId);
    const current = await live(row.projectId);
    // A sync review that kept the cloud copy brought the entity back: the intent no longer applies.
    if (!listed || !current || findEntity(upgradeProject(current.saved), listed.entry.entity)) {
      if (listed) await outbox().release(row);
      return;
    }
    const { entry, display } = listed;
    const ref = entry.entity;
    if (ref.kind === 'project' || !entry.manifest) throw new BinError('incomplete_recovery');
    const key = await queue.projectKey(row.projectId, checkpoint.epoch);
    const { manifest, chunks } = await store.payload(row.deletionId);
    const id = row.deletionId;
    const sealedText = (purpose: `bin:${string}`, text: string) =>
      seal(key.key, row.projectId, purpose, text).then(({ salt, ciphertext }) => ({
        salt,
        ciphertext,
      }));
    const command: Omit<HostedCommand, 'digest'> = {
      operationId: row.operationId,
      writerProtocol: binWriterProtocol,
      intent: 'trash',
      deletionIds: [id],
      expectedVersions: {},
      head: await sealRevision(row.projectId, headBase(checkpoint), key, current.text),
      trash: {
        deletionId: id,
        entityKind: ref.kind,
        entityId: ref.kind === 'object' ? ref.objectId : ref.surfaceId,
        objectId: ref.kind === 'surface' ? ref.objectId : null,
        manifestSchema: manifest.schema,
        manifestSha256: entry.manifest.sha256,
        coverageMissing: manifest.coverage.missing,
        sourceRevision: manifest.sourceRevision,
        logicalBytes: manifest.logicalBytes,
        chunkCount: chunks.length,
        assets: manifest.assets,
        display: await sealedText(`bin:${id}:display`, JSON.stringify(display)),
        manifest: await sealedText(`bin:${id}:manifest`, JSON.stringify(manifest)),
      },
    };
    return {
      ...row,
      stage: 'dispatched',
      failure: undefined,
      conflictAt: undefined,
      command: { ...command, digest: await commandDigest(command) },
      chunks: await sealChunks(key, row.projectId, id, chunks),
      checkpoint,
      localRevision: current.saved.revision,
    } satisfies BinOutboxRow;
  }

  /** A restore whose response was lost: the server has it, so finish it on the current graph. */
  async function commitRestore(row: BinOutboxRow, outcome: HostedOutcome) {
    const current = await live(row.projectId);
    const prep = await prepareRestore(
      vault.bin(),
      current?.saved ?? null,
      row.deletionId,
      row.restore ?? {},
      context,
      clock(),
    );
    // The local graph is pushed again by ordinary sync, carrying any later local edits.
    await vault.bin().finish({
      ...prep.change,
      hosted: { row, checkpoint: row.checkpoint!, outcome, localRevision: row.localRevision! },
    });
  }

  async function send(row: BinOutboxRow, csrf: string) {
    try {
      for (const [index, chunk] of (row.chunks ?? []).entries())
        await remote.stage(row.projectId, row.deletionId, index, chunk, csrf).catch((error) => {
          // Already committed by a request whose response was lost; the receipt follows.
          if (!isBinError(error) || error.code !== 'not_retained') throw error;
        });
      return await remote.execute(row.projectId, row.command!, csrf);
    } catch (error) {
      if (!isBinError(error)) throw error;
      if (row.intent === 'restore') await outbox().settle(row);
      else
        await outbox().replace(row, {
          ...row,
          stage: 'conflict',
          failure: error.code,
          conflictAt: row.checkpoint?.revision,
          command: undefined,
          chunks: undefined,
        });
      throw error;
    }
  }

  /** One pass over the outbox; true when something should be retried later. */
  async function dispatch(csrf: string) {
    let retry = false;
    for (let row of await outbox().list()) {
      try {
        const checkpoint = await ready(row.projectId);
        if (!checkpoint) continue;
        if (row.stage === 'conflict') {
          // Only a stale head is retried, once ordinary sync has moved the checkpoint on.
          if (row.failure !== 'stale_revision' || checkpoint.revision === row.conflictAt) continue;
        }
        if (row.stage !== 'dispatched') {
          if (row.intent !== 'trash') continue;
          const sealed = await sealTrash(row, checkpoint);
          if (!sealed) continue;
          await outbox().replace(row, sealed);
          row = sealed;
        }
        const outcome = await send(row, csrf);
        if (row.intent === 'trash') await outbox().acceptTrash(row, outcome);
        else await commitRestore(row, outcome);
      } catch (error) {
        queue.signal.throwIfAborted();
        if (!isBinError(error)) retry = true;
      }
    }
    return retry;
  }

  /** Server-first restore of an accepted hosted entry; the local graph changes after it accepts. */
  async function restore(prep: PreparedRestore, options: RestoreOptions, csrf: string) {
    const { entry, change } = prep;
    const project = change.project;
    const projectId = entry.entity.projectId;
    if (entry.entity.kind === 'project' || !prep.text || !('next' in project))
      throw new BinError('forbidden');
    const checkpoint = await ready(projectId);
    const held = (await outbox().list()).some(
      (row) => row.projectId === projectId && row.stage !== 'conflict',
    );
    // Other unsynchronised local changes would ride along in the head: sync them first.
    if (!checkpoint || held || project.expected !== checkpoint.localRevision)
      throw new BinError('pending_sync');
    if (change.transitions.some((row) => row.scope !== 'hosted' || row.provisional))
      throw new BinError('pending_sync');
    const key = await queue.projectKey(projectId, checkpoint.epoch);
    const command: Omit<HostedCommand, 'digest'> = {
      operationId: prep.plan.operation.operationId,
      writerProtocol: binWriterProtocol,
      intent: 'restore',
      deletionIds: change.transitions.map(({ deletionId }) => deletionId),
      expectedVersions: Object.fromEntries(
        change.transitions.map((row) => [row.deletionId, row.version - 1]),
      ),
      head: await sealRevision(projectId, headBase(checkpoint), key, prep.text),
      trash: null,
    };
    const row: BinOutboxRow = {
      operationId: command.operationId,
      deletionId: entry.deletionId,
      projectId,
      intent: 'restore',
      stage: 'dispatched',
      command: { ...command, digest: await commandDigest(command) },
      checkpoint,
      localRevision: checkpoint.localRevision,
      restore: options,
    };
    await outbox().add(row);
    const outcome = await send(row, csrf);
    await vault.bin().finish({
      ...change,
      hosted: { row, checkpoint, outcome, localRevision: project.next.revision },
    });
  }

  /** Permanently deletes accepted hosted entries on the server; already-ended ones are fine. */
  async function purge(projectId: string, entries: readonly BinEntry[], csrf: () => string) {
    const hosted = entries.filter((row) => row.scope === 'hosted' && !row.provisional);
    if (!hosted.length) return;
    const command: Omit<HostedCommand, 'digest'> = {
      operationId: crypto.randomUUID(),
      writerProtocol: binWriterProtocol,
      intent: 'purge',
      deletionIds: hosted.map(({ deletionId }) => deletionId),
      expectedVersions: Object.fromEntries(hosted.map((row) => [row.deletionId, row.version])),
      head: null,
      trash: null,
    };
    try {
      await remote.execute(projectId, { ...command, digest: await commandDigest(command) }, csrf());
    } catch (error) {
      if (!isBinError(error) || !['not_retained', 'expired'].includes(error.code)) throw error;
    }
  }

  return {
    dispatch,
    restore,
    purge,
    retryable: (error: unknown) => error instanceof BinTransportError,
  };
}

export type HostedBin = ReturnType<typeof hostedBin>;
