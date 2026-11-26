import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, expect, it, vi } from 'vitest';
import { importCode } from '../../vault/crypto';
import {
  connect,
  fileTable,
  thumbnailTable,
  vaultTable,
  commitVault,
  readVault,
} from '../../vault/store';
import { localFiles } from '../../vault/file-store';
import { vaultThumbnailCache } from './thumbnail-store';

const account = 'account';
const ref = { project: crypto.randomUUID(), id: crypto.randomUUID(), version: '1' };
const signal = new AbortController().signal;
let root: CryptoKey;
const cache = (who = account, stamp = 'stamp', locked = signal) =>
  vaultThumbnailCache(root, who, stamp, locked);
async function write(table: string, key: IDBValidKey, value: unknown) {
  const db = await connect();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(table, 'readwrite');
      tx.objectStore(table).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  root = await importCode('ab'.repeat(32));
  await write(vaultTable, account, { stamp: 'stamp' });
  await write(vaultTable, 'other', { stamp: 'stamp' });
});
it('upgrades a v9 database without losing data', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  const old = await new Promise<IDBDatabase>((resolve) => {
    const request = indexedDB.open('calirestore-vault', 9);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(vaultTable).put({ stamp: 'old' }, account);
    };
    request.onsuccess = () => resolve(request.result);
  });
  old.close();
  const db = await connect();
  expect(db.version).toBe(10);
  expect(db.objectStoreNames.contains(thumbnailTable)).toBe(true);
  db.close();
  expect((await readVault(account))!.stamp).toBe('old');
});
it('isolates account, project, asset, content version and locks', async () => {
  const blob = new Blob(['png'], { type: 'image/png' });
  await cache().put(ref, blob, signal);
  expect(await (await cache().get(ref, signal))!.text()).toBe('png');
  for (const key of [
    { ...ref, project: crypto.randomUUID() },
    { ...ref, id: crypto.randomUUID() },
    { ...ref, version: '2' },
  ])
    expect(await cache().get(key, signal)).toBeUndefined();
  expect(await cache('other').get(ref, signal)).toBeUndefined();
  await expect(cache(account, 'stale').get(ref, signal)).rejects.toThrow();
  const locked = new AbortController();
  locked.abort();
  await expect(cache(account, 'stamp', locked.signal).put(ref, blob, signal)).rejects.toThrow();
  await expect(cache().put(ref, new Blob(), signal)).rejects.toThrow();
});
it('treats corrupt cache entries as rebuildable misses', async () => {
  await write(thumbnailTable, [account, ref.project, ref.id, ref.version, 1], new ArrayBuffer(1));
  expect(await cache().get(ref, signal)).toBeUndefined();
  await cache().put(ref, new Blob(['rebuilt']), signal);
  expect(await (await cache().get(ref, signal))!.text()).toBe('rebuilt');
});
it('removes all versions when a file is removed, retaining another account and another asset', async () => {
  await write(fileTable, [account, ref.id], { project: ref.project, ready: true });
  await cache().put(ref, new Blob(['one']), signal);
  await cache().put({ ...ref, version: '2' }, new Blob(['two']), signal);
  const other = { ...ref, id: crypto.randomUUID() };
  await cache().put(other, new Blob(['other']), signal);
  await cache('other').put(ref, new Blob(['account']), signal);
  await localFiles(account, 'stamp').remove(ref.id);
  expect(await cache().get(ref, signal)).toBeUndefined();
  expect(await cache().get({ ...ref, version: '2' }, signal)).toBeUndefined();
  expect(await cache().get(other, signal)).toBeDefined();
  expect(await cache('other').get(ref, signal)).toBeDefined();
});
it('vault reset clears account thumbnails atomically', async () => {
  await cache().put(ref, new Blob(['mine']), signal);
  await cache('other').put(ref, new Blob(['other']), signal);
  await commitVault(account, 'stamp', undefined);
  const db = await connect();
  const keys = await new Promise<IDBValidKey[]>((resolve) => {
    const request = db.transaction(thumbnailTable).objectStore(thumbnailTable).getAllKeys();
    request.onsuccess = () => resolve(request.result);
  });
  db.close();
  expect(keys).toEqual([['other', ref.project, ref.id, '1', 1]]);
});
