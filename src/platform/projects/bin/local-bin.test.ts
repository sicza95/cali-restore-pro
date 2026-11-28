import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, expect, it, vi } from 'vitest';
import { importCode } from '../../vault/crypto';
import { binOutbox } from '../../vault/bin-outbox';
import { binDocuments } from '../../vault/bin-store';
import { revisionQueue } from '../../vault/revision-queue';
import { projectDocuments } from '../../vault/project-store';
import {
  binEntryTable,
  commitVault,
  connect,
  estimateTable,
  fileTable,
  reportTable,
  vaultTable,
} from '../../vault/store';
import type { LocalVault } from '../../vault/vault';
import { localProjects, newObject, newProject, newSurface } from '../projects';
import type { SavedProjectV2 } from '../types';
import { binRecoveryMs } from './constants';
import { localBin } from './local-bin';

const account = '11111111-1111-4111-8111-111111111111';
const shared = '22222222-2222-4222-8222-222222222222';
const own = '33333333-3333-4333-8333-333333333333';
const t0 = 1_800_000_000_000;
let root: CryptoKey;
let vault: LocalVault;
let now = t0;
const signal = new AbortController().signal;

async function raw<T>(table: string, run: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await connect();
  try {
    return await new Promise<T>((resolve) => {
      const request = run(db.transaction(table, 'readwrite').objectStore(table));
      request.onsuccess = () => resolve(request.result);
    });
  } finally {
    db.close();
  }
}
const file = (id: string, project: string) =>
  raw(fileTable, (store) =>
    store.put({ project, ready: true, started: 0, sourceBytes: 100, manifestBytes: 10 }, [
      account,
      id,
    ]),
  );
const hasFile = async (id: string) =>
  (await raw(fileTable, (store) => store.get([account, id]))) !== undefined;

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  now = t0;
  root = await importCode('01'.repeat(32));
  await raw(vaultTable, (store) => store.put({ stamp: 'stamp' }, account));
  // A fresh instance per call, as after a reload: nothing is cached in memory.
  vault = {
    projects: () => projectDocuments(root, account, 'stamp', signal),
    estimates: () => projectDocuments(root, account, 'stamp', signal, estimateTable),
    reports: () => projectDocuments(root, account, 'stamp', signal, reportTable),
    bin: () => binDocuments(root, account, 'stamp', signal),
    binOutbox: () => binOutbox(account, 'stamp', signal),
    revisions: () => revisionQueue(root, account, () => 'stamp', signal),
  } as unknown as LocalVault;
});
const bin = () => localBin(vault, account, () => now);

/** Object A: North (shared photo) and South (own photo); object B: Panel (shared photo too). */
async function seeded(): Promise<SavedProjectV2> {
  const value = newProject('Chapel', null, null, 'EUR', undefined, account);
  const a = {
    ...newObject('Altar', undefined, account),
    surfaces: [newSurface('North', account), newSurface('South', account)],
  };
  const b = newObject('Door', 'Panel', account);
  a.surfaces[0]!.images.push({ id: shared, role: 'mapping' });
  a.surfaces[1]!.images.push({ id: own, role: 'mapping' });
  b.surfaces[0]!.images.push({ id: shared, role: 'reference' });
  value.objects.push(a, b);
  await file(shared, value.id);
  await file(own, value.id);
  return localProjects(vault).save(value);
}
const projects = () => localProjects(vault).list();

it('moves a surface into Bin atomically and restores it with original IDs after a restart', async () => {
  const project = await seeded();
  const north = project.objects[0]!.surfaces[0]!;
  const { entry, project: next } = await bin().trash(project, {
    kind: 'surface',
    objectId: project.objects[0]!.id,
    surfaceId: north.id,
  });
  expect(next!.objects[0]!.surfaces.map(({ id }) => id)).not.toContain(north.id);
  expect((await projects())[0]!.revision).toBe(next!.revision);
  const listed = await bin().list();
  expect(listed).toEqual([
    {
      entry: expect.objectContaining({
        deletionId: entry.deletionId,
        state: 'retained',
        recoverUntil: t0 + binRecoveryMs,
      }),
      display: { name: 'North', path: ['Chapel', 'Altar'] },
    },
  ]);
  expect(listed[0]!.entry.coverage).toMatchObject({ missing: [], legacy: false });
  await bin().restore(entry.deletionId);
  const [restored] = await projects();
  expect(restored!.objects[0]!.surfaces.find(({ id }) => id === north.id)).toEqual(north);
  expect(await bin().list()).toEqual([]);
});

it('keeps a trashed project out of the library and puts the same row back on restore', async () => {
  const project = await seeded();
  const { entry } = await bin().trash(project, { kind: 'project' });
  expect(await projects()).toEqual([]);
  expect(await hasFile(own)).toBe(true);
  await bin().restore(entry.deletionId);
  expect(await projects()).toEqual([project]);
});

it('restores a surface through its trashed project as one dependency group', async () => {
  const project = await seeded();
  const objectId = project.objects[0]!.id;
  const south = project.objects[0]!.surfaces[1]!;
  const child = await bin().trash(project, { kind: 'surface', objectId, surfaceId: south.id });
  await bin().trash(child.project!, { kind: 'project' });
  const plan = await bin().restore(child.entry.deletionId);
  expect(plan.group).toHaveLength(2);
  const [back] = await projects();
  expect(back!.objects[0]!.surfaces.map(({ id }) => id)).toContain(south.id);
  expect(back!.revision).toBe(child.project!.revision + 1);
});

it('purges without deleting photos still referenced elsewhere', async () => {
  const project = await seeded();
  const objectId = project.objects[0]!.id;
  const { entry } = await bin().trash(project, { kind: 'object', objectId });
  const plan = await bin().purge([{ deletionId: entry.deletionId, version: entry.version }]);
  expect(plan.denied).toEqual([]);
  expect(await hasFile(own)).toBe(false);
  expect(await hasFile(shared)).toBe(true);
  expect(await bin().list()).toEqual([]);
  await expect(bin().restore(entry.deletionId)).rejects.toThrow();
});

it('purges a trashed project with its retained children and project files', async () => {
  const project = await seeded();
  const objectId = project.objects[1]!.id;
  const child = await bin().trash(project, { kind: 'object', objectId });
  const whole = await bin().trash(child.project!, { kind: 'project' });
  const plan = await bin().purge([{ deletionId: whole.entry.deletionId, version: 1 }]);
  expect(plan.counts).toEqual({ selected: 1, cascaded: 1, total: 2 });
  expect(await bin().list()).toEqual([]);
  expect(await hasFile(shared)).toBe(false);
  expect(await hasFile(own)).toBe(false);
});

it('commits nothing when the project or vault changed after planning', async () => {
  const project = await seeded();
  await localProjects(vault).save({ ...project, name: 'Concurrent' });
  await expect(
    bin().trash(project, { kind: 'object', objectId: project.objects[0]!.id }),
  ).rejects.toThrow();
  expect(await bin().list()).toEqual([]);
  expect((await projects())[0]!.name).toBe('Concurrent');
  const [current] = await projects();
  await raw(vaultTable, (store) => store.put({ stamp: 'other' }, account));
  await expect(bin().trash(current!, { kind: 'project' })).rejects.toThrow();
  await raw(vaultTable, (store) => store.put({ stamp: 'stamp' }, account));
  expect(await bin().list()).toEqual([]);
  expect(await projects()).toHaveLength(1);
});

it('expires by deadline and forgets Bin data with the account', async () => {
  const project = await seeded();
  const { entry } = await bin().trash(project, {
    kind: 'object',
    objectId: project.objects[0]!.id,
  });
  now = t0 + binRecoveryMs - 1;
  expect(await bin().expire()).toEqual([]);
  now = t0 + binRecoveryMs;
  await expect(bin().restore(entry.deletionId)).rejects.toMatchObject({ code: 'expired' });
  expect((await bin().expire()).map(({ purgeReason }) => purgeReason)).toEqual(['expired']);
  expect(await bin().list()).toEqual([]);
  await bin().trash((await projects())[0]!, { kind: 'project' });
  await commitVault(account, 'stamp', undefined);
  expect(await raw(binEntryTable, (store) => store.count())).toBe(0);
});
