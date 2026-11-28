import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { binOutbox } from '../../vault/bin-outbox';
import { binDocuments } from '../../vault/bin-store';
import { importCode } from '../../vault/crypto';
import { projectDocuments } from '../../vault/project-store';
import { revisionQueue } from '../../vault/revision-queue';
import { connect, estimateTable, reportTable, vaultTable } from '../../vault/store';
import type { LocalVault } from '../../vault/vault';
import { editorSync } from '../editor-sync';
import { localProjects, newObject, newProject, newSurface } from '../projects';
import type { RevisionWrite } from '../revisions';
import type { SavedProjectV2 } from '../types';
import type { HostedCommand } from './hosted-remote';
import { localBin } from './local-bin';

const account = '11111111-1111-4111-8111-111111111111';
const epoch = '22222222-2222-4222-8222-222222222222';
const deadline = '2027-01-01T00:00:00Z';
let vault: LocalVault;
let controller: AbortController;

/** A stand-in for the hosted revision and Bin endpoints, with receipts like the real server. */
type Fail = { status: number; error: string } | 'lost';
let head: number;
let fails: Fail[];
let commands: HostedCommand[];
let revisions: RevisionWrite[];
let staged: string[];
const receipts = new Map<string, { digest: string; outcome: unknown }>();
const committed = new Set<string>();

async function server(input: string | URL | Request, init?: RequestInit) {
  const path = String(input);
  const body = JSON.parse(String(init?.body ?? 'null')) as unknown;
  if (path.endsWith('/revision')) {
    const write = body as RevisionWrite;
    revisions.push(write);
    if (write.expected !== head)
      return Response.json({ error: 'revision_conflict' }, { status: 409 });
    head += 1;
    return Response.json({ epoch, head: { ...write, revision: head } });
  }
  if (path.includes('/bin/staging/')) {
    const deletion = path.split('/').at(-2)!;
    staged.push(path);
    if (committed.has(deletion)) return Response.json({ error: 'not_retained' }, { status: 409 });
    return new Response(null, { status: 204 });
  }
  const command = body as HostedCommand;
  commands.push(command);
  const saved = receipts.get(command.operationId);
  if (saved?.digest === command.digest) return Response.json(saved.outcome);
  const fail = fails.shift();
  if (fail && fail !== 'lost') return Response.json({ error: fail.error }, { status: fail.status });
  if (command.head && command.head.expected !== head)
    return Response.json({ error: 'stale_revision' }, { status: 409 });
  if (command.head) head += 1;
  const id = command.deletionIds[0]!;
  const version = command.intent === 'trash' ? 1 : (command.expectedVersions[id] ?? 0) + 1;
  const outcome = {
    versions: { [id]: version },
    cascaded: [],
    recoverUntil: command.intent === 'trash' ? { [id]: deadline } : {},
    head: command.head ? { ...command.head, revision: head } : null,
  };
  receipts.set(command.operationId, { digest: command.digest, outcome });
  if (command.trash) committed.add(id);
  if (fail === 'lost') throw new TypeError('Failed to fetch');
  return Response.json(outcome);
}

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('fetch', vi.fn(server));
  vi.stubGlobal('navigator', { onLine: true });
  head = 0;
  fails = [];
  commands = [];
  revisions = [];
  staged = [];
  receipts.clear();
  committed.clear();
  controller = new AbortController();
  const signal = controller.signal;
  const root = await importCode('01'.repeat(32));
  const db = await connect();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(vaultTable, 'readwrite');
    tx.objectStore(vaultTable).put({ stamp: 'stamp' }, account);
    tx.oncomplete = () => resolve();
  });
  db.close();
  vault = {
    projects: () => projectDocuments(root, account, 'stamp', signal),
    estimates: () => projectDocuments(root, account, 'stamp', signal, estimateTable),
    reports: () => projectDocuments(root, account, 'stamp', signal, reportTable),
    bin: () => binDocuments(root, account, 'stamp', signal),
    binOutbox: () => binOutbox(account, 'stamp', signal),
    revisions: () => revisionQueue(root, account, () => 'stamp', signal),
  } as unknown as LocalVault;
});
afterEach(() => controller.abort());

const bin = () => localBin(vault, account, Date.now, () => 'csrf');
const sync = () => editorSync(vault);
const local = async () => (await localProjects(vault).list())[0]!;
const checkpoint = async () => (await vault.revisions().checkpoints())[0]!;
const entries = async () => (await bin().list()).map(({ entry }) => entry);

/** A synchronised project: the server holds its first head. */
async function hosted(): Promise<SavedProjectV2> {
  const value = newProject('Chapel', null, null, 'EUR', undefined, account);
  value.objects.push({
    ...newObject('Altar', undefined, account),
    surfaces: [newSurface('North', account), newSurface('South', account)],
  });
  const saved = await localProjects(vault).save(value);
  await vault.revisions().projectKey(saved.id, epoch, true);
  await vault.revisions().enableEditor(saved.id, epoch);
  await sync().stagePending();
  await vault.revisions().retry('csrf');
  expect(await checkpoint()).toMatchObject({ revision: 1, localRevision: saved.revision });
  return saved;
}
async function trashNorth(project: SavedProjectV2) {
  const object = project.objects[0]!;
  const surface = object.surfaces[0]!;
  const result = await bin().trash(project, {
    kind: 'surface',
    objectId: object.id,
    surfaceId: surface.id,
  });
  return { ...result, surface };
}

it('holds ordinary sync and sends the deletion with its Bin entry in one command', async () => {
  const { entry } = await trashNorth(await hosted());
  expect((await entries())[0]).toMatchObject({
    scope: 'hosted',
    provisional: true,
    pending: { intent: 'trash', stage: 'queued' },
  });
  expect(await sync().stagePending()).toEqual([]);
  expect((await vault.revisions().drafts()).length).toBe(0);

  expect(await bin().dispatch('csrf')).toBe(false);
  expect(revisions).toHaveLength(1);
  expect(commands).toHaveLength(1);
  expect(commands[0]).toMatchObject({
    intent: 'trash',
    deletionIds: [entry.deletionId],
    head: { expected: 1 },
    trash: { deletionId: entry.deletionId, entityKind: 'surface', coverageMissing: [] },
  });
  expect(staged.length).toBe(commands[0]!.trash!.chunkCount);
  expect((await entries())[0]).toMatchObject({
    provisional: false,
    pending: null,
    version: 1,
    recoverUntil: Date.parse(deadline),
  });
  expect(await checkpoint()).toMatchObject({
    revision: 2,
    localRevision: (await local()).revision,
  });
  expect(await vault.binOutbox().list()).toEqual([]);
});

it('replays the identical command after a lost response instead of a new revision', async () => {
  await trashNorth(await hosted());
  fails = ['lost'];
  expect(await bin().dispatch('csrf')).toBe(true);
  expect((await entries())[0]!.pending).toMatchObject({ stage: 'dispatched' });
  expect(await bin().dispatch('csrf')).toBe(false);
  expect(commands).toHaveLength(2);
  expect(commands[1]).toEqual(commands[0]);
  expect(head).toBe(2);
  expect((await entries())[0]).toMatchObject({ provisional: false, pending: null });
});

it('marks a stale head as a conflict and lets ordinary sync raise the review', async () => {
  await trashNorth(await hosted());
  head = 5; // another device wrote meanwhile
  await bin().dispatch('csrf');
  expect((await entries())[0]!.pending).toMatchObject({
    stage: 'conflict',
    failure: 'stale_revision',
  });
  await sync().stagePending();
  expect(await vault.revisions().drafts()).toHaveLength(1);
});

it('keeps the remote source live when the server refuses the deletion', async () => {
  await trashNorth(await hosted());
  fails = [{ status: 409, error: 'quota_exceeded' }];
  await bin().dispatch('csrf');
  expect((await entries())[0]!.pending).toMatchObject({
    stage: 'conflict',
    failure: 'quota_exceeded',
  });
  // Blocked, but not stale: the deletion must not reach the server without its entry.
  expect(await bin().dispatch('csrf')).toBe(false);
  expect(revisions).toHaveLength(1);
  expect(commands).toHaveLength(1);
});

it('cancels a queued deletion on this device before anything is sent', async () => {
  const { entry, surface } = await trashNorth(await hosted());
  await bin().restore(entry.deletionId);
  expect(commands).toEqual([]);
  expect(await vault.binOutbox().list()).toEqual([]);
  expect(await entries()).toEqual([]);
  expect((await local()).objects[0]!.surfaces.map(({ id }) => id)).toContain(surface.id);
});

it('restores an accepted entry on the server first, then on this device', async () => {
  const { entry, surface } = await trashNorth(await hosted());
  await bin().dispatch('csrf');
  await bin().restore(entry.deletionId);
  expect(commands[1]).toMatchObject({
    intent: 'restore',
    deletionIds: [entry.deletionId],
    expectedVersions: { [entry.deletionId]: 1 },
    head: { expected: 2 },
  });
  const restored = await local();
  expect(restored.objects[0]!.surfaces.map(({ id }) => id)).toContain(surface.id);
  expect(await checkpoint()).toMatchObject({ revision: 3, localRevision: restored.revision });
  expect(await entries()).toEqual([]);
  expect(await vault.binOutbox().list()).toEqual([]);
});

it('leaves the entry and the graph unchanged when the server refuses a restore', async () => {
  const { entry, surface } = await trashNorth(await hosted());
  await bin().dispatch('csrf');
  fails = [{ status: 403, error: 'forbidden' }];
  await expect(bin().restore(entry.deletionId)).rejects.toMatchObject({ code: 'forbidden' });
  expect((await entries())[0]).toMatchObject({ state: 'retained', pending: null });
  expect((await local()).objects[0]!.surfaces.map(({ id }) => id)).not.toContain(surface.id);
  expect(await vault.binOutbox().list()).toEqual([]);
});

it('requires other local changes to sync before a hosted restore', async () => {
  const { entry, project } = await trashNorth(await hosted());
  await bin().dispatch('csrf');
  await localProjects(vault).save({ ...project!, name: 'Chapel (edited)' });
  await expect(bin().restore(entry.deletionId)).rejects.toMatchObject({ code: 'pending_sync' });
});

it('permanently deletes an accepted entry on the server and then locally', async () => {
  const { entry } = await trashNorth(await hosted());
  await bin().dispatch('csrf');
  await bin().purge([{ deletionId: entry.deletionId, version: 1 }]);
  expect(commands[1]).toMatchObject({ intent: 'purge', head: null });
  expect(await entries()).toEqual([]);
});

it('finishes a restore whose response was lost from the stored receipt', async () => {
  const { entry, surface } = await trashNorth(await hosted());
  await bin().dispatch('csrf');
  const synced = (await checkpoint()).localRevision;
  fails = ['lost'];
  await expect(bin().restore(entry.deletionId)).rejects.toThrow();
  expect((await entries())[0]!.pending).toMatchObject({ intent: 'restore', stage: 'dispatched' });
  expect(await bin().dispatch('csrf')).toBe(false);
  expect(commands[2]).toEqual(commands[1]);
  expect(head).toBe(3);
  expect((await local()).objects[0]!.surfaces.map(({ id }) => id)).toContain(surface.id);
  // The reconciled graph is pushed again by ordinary sync on top of the accepted head.
  expect(await checkpoint()).toMatchObject({ revision: 3, localRevision: synced });
  await sync().stagePending();
  await vault.revisions().retry('csrf');
  expect(revisions.at(-1)).toMatchObject({ expected: 3 });
  expect(head).toBe(4);
});
