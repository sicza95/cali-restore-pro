import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { aead } from '../../vault/aead';
import { binOutbox } from '../../vault/bin-outbox';
import { binDocuments } from '../../vault/bin-store';
import { importCode } from '../../vault/crypto';
import { projectDocuments } from '../../vault/project-store';
import { revisionQueue } from '../../vault/revision-queue';
import { connect, estimateTable, reportTable, vaultTable } from '../../vault/store';
import type { LocalVault } from '../../vault/vault';
import { editorSync } from '../editor-sync';
import { localProjects, newObject, newProject, newSurface } from '../projects';
import type { RevisionHead, RevisionWrite } from '../revisions';
import type { SavedProjectV2 } from '../types';
import type { HostedChunk, HostedCommand } from './hosted-remote';
import { localBin } from './local-bin';

/** Test-only fake of the hosted Bin and revision endpoints with one synthetic device. */
export const account = '11111111-1111-4111-8111-111111111111';
export const epoch = '22222222-2222-4222-8222-222222222222';
export const deadline = '2027-01-01T00:00:00Z';

type Fail = { status: number; error: string } | 'lost';
type Retained = { trash: NonNullable<HostedCommand['trash']>; version: number };

export const fake = {
  head: 0,
  fails: [] as Fail[],
  commands: [] as HostedCommand[],
  revisions: [] as RevisionWrite[],
  staged: [] as string[],
  savedHead: undefined as unknown as RevisionHead,
  projectId: '',
  chunks: new Map<string, HostedChunk>(),
  receipts: new Map<string, { digest: string; outcome: unknown }>(),
  committed: new Set<string>(),
  /** Accepted entries still in the server Bin, by deletion ID. */
  retained: new Map<string, Retained>(),
  vault: undefined as unknown as LocalVault,
  controller: new AbortController(),
};

const capabilities = { read: { allowed: true }, restore: { allowed: true } };

async function server(input: string | URL | Request, init?: RequestInit) {
  const path = String(input);
  const body = JSON.parse(String(init?.body ?? 'null')) as unknown;
  if (path.endsWith('/revision')) {
    if (init?.method === 'GET') return Response.json({ epoch, head: fake.savedHead });
    fake.projectId = path.split('/').at(-2)!;
    const write = body as RevisionWrite;
    fake.revisions.push(write);
    if (write.expected !== fake.head)
      return Response.json({ error: 'revision_conflict' }, { status: 409 });
    fake.head += 1;
    fake.savedHead = { ...write, revision: fake.head };
    return Response.json({ epoch, head: fake.savedHead });
  }
  if (path.includes('/bin/staging/')) {
    const deletion = path.split('/').at(-2)!;
    fake.staged.push(path);
    if (fake.committed.has(deletion))
      return Response.json({ error: 'not_retained' }, { status: 409 });
    fake.chunks.set(path.split('/').slice(-2).join('/'), body as HostedChunk);
    return new Response(null, { status: 204 });
  }
  if (path.startsWith('/api/v1/organisations/')) {
    const entries = [...fake.retained].reverse().map(([deletionId, { trash, version }]) => ({
      ...trash,
      deletionId,
      projectId: fake.projectId,
      state: 'retained',
      version,
      legacy: false,
      capabilities,
    }));
    return Response.json({ entries, next: null, asOf: new Date().toISOString() });
  }
  if (path.startsWith('/api/v1/bin/')) {
    const [, , , , deletion, , index] = path.split('/');
    if (index) return new Response(atob(fake.chunks.get(`${deletion}/${index}`)!.body));
    const trash = fake.commands.find((cmd) => cmd.trash?.deletionId === deletion)!.trash!;
    return Response.json({
      ...trash,
      projectId: fake.projectId,
      state: 'retained',
      version: fake.retained.get(deletion!)?.version ?? 1,
      deletedAt: new Date().toISOString(),
      deletedBy: account,
      recoverUntil: deadline,
      capabilities,
    });
  }
  const command = body as HostedCommand;
  fake.commands.push(command);
  const saved = fake.receipts.get(command.operationId);
  if (saved?.digest === command.digest) return Response.json(saved.outcome);
  const fail = fake.fails.shift();
  if (fail && fail !== 'lost') return Response.json({ error: fail.error }, { status: fail.status });
  if (command.head && command.head.expected !== fake.head)
    return Response.json({ error: 'stale_revision' }, { status: 409 });
  if (command.head) fake.savedHead = { ...command.head, revision: ++fake.head };
  const versions: Record<string, number> = {};
  for (const id of command.deletionIds) {
    versions[id] = command.intent === 'trash' ? 1 : (command.expectedVersions[id] ?? 0) + 1;
    if (command.trash) fake.retained.set(id, { trash: command.trash, version: 1 });
    else fake.retained.delete(id);
  }
  const id = command.deletionIds[0]!;
  const outcome = {
    versions,
    cascaded: [],
    recoverUntil: command.intent === 'trash' ? { [id]: deadline } : {},
    head: command.head ? { ...command.head, revision: fake.head } : null,
  };
  fake.receipts.set(command.operationId, { digest: command.digest, outcome });
  if (command.trash) fake.committed.add(id);
  if (fail === 'lost') throw new TypeError('Failed to fetch');
  return Response.json(outcome);
}

export async function openDevice() {
  vi.stubGlobal('indexedDB', new IDBFactory());
  fake.controller = new AbortController();
  const signal = fake.controller.signal;
  const root = await importCode('01'.repeat(32));
  const db = await connect();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(vaultTable, 'readwrite');
    tx.objectStore(vaultTable).put({ stamp: 'stamp' }, account);
    tx.oncomplete = () => resolve();
  });
  db.close();
  fake.vault = {
    projects: () => projectDocuments(root, account, 'stamp', signal),
    estimates: () => projectDocuments(root, account, 'stamp', signal, estimateTable),
    reports: () => projectDocuments(root, account, 'stamp', signal, reportTable),
    bin: () => binDocuments(root, account, 'stamp', signal),
    binOutbox: () => binOutbox(account, 'stamp', signal),
    revisions: () => revisionQueue(root, account, () => 'stamp', signal),
  } as unknown as LocalVault;
}

/** Registers the fake server and a fresh device around every test of the calling file. */
export function useHostedFixture() {
  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn(server));
    vi.stubGlobal('navigator', { onLine: true });
    Object.assign(fake, { head: 0, fails: [], commands: [], revisions: [], staged: [] });
    for (const store of [fake.receipts, fake.committed, fake.chunks, fake.retained]) store.clear();
    await openDevice();
  });
  afterEach(() => fake.controller.abort());
  afterEach(() => {
    aead.enabled = false;
  });
}

export const bin = () => localBin(fake.vault, account, Date.now, () => 'csrf');
export const sync = () => editorSync(fake.vault);
export const local = async () => (await localProjects(fake.vault).list())[0]!;
export const checkpoint = async () => (await fake.vault.revisions().checkpoints())[0]!;
export const entries = async () => (await bin().list()).map(({ entry }) => entry);

export async function hosted(): Promise<SavedProjectV2> {
  const value = newProject('Chapel', null, null, 'EUR', undefined, account);
  value.objects.push({
    ...newObject('Altar', undefined, account),
    surfaces: [newSurface('North', account), newSurface('South', account)],
  });
  const saved = await localProjects(fake.vault).save(value);
  await fake.vault.revisions().projectKey(saved.id, epoch, true);
  await fake.vault.revisions().enableEditor(saved.id, epoch);
  await sync().stagePending();
  await fake.vault.revisions().retry('csrf');
  expect(await checkpoint()).toMatchObject({ revision: 1, localRevision: saved.revision });
  return saved;
}

export async function trashNorth(project: SavedProjectV2) {
  const object = project.objects[0]!;
  const surface = object.surfaces[0]!;
  const result = await bin().trash(project, {
    kind: 'surface',
    objectId: object.id,
    surfaceId: surface.id,
  });
  return { ...result, surface };
}
