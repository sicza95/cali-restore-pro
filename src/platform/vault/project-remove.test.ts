import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, expect, it, vi } from 'vitest';
import { importCode } from './crypto';
import {
  connect,
  estimateTable,
  fileTable,
  journalTable,
  reportTable,
  thumbnailTable,
  vaultTable,
} from './store';
import { projectDocuments } from './project-store';

const signal = new AbortController().signal;
const project = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const photo = '33333333-3333-4333-8333-333333333333';
const kept = '44444444-4444-4444-8444-444444444444';
let root: CryptoKey;

async function put(table: string, rows: [IDBValidKey, unknown][]) {
  const db = await connect();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(table, 'readwrite');
    for (const [key, value] of rows) tx.objectStore(table).put(value, key);
    tx.oncomplete = () => resolve();
  });
  db.close();
}
async function keys(table: string) {
  const db = await connect();
  const result = await new Promise<IDBValidKey[]>((resolve) => {
    const request = db.transaction(table).objectStore(table).getAllKeys();
    request.onsuccess = () => resolve(request.result);
  });
  db.close();
  return result;
}

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  root = await importCode('ab'.repeat(32));
  await put(vaultTable, [['account', { stamp: 'stamp' }]]);
});

it('removes a local project with its documents, journals, files and thumbnails only', async () => {
  const docs = projectDocuments(root, 'account', 'stamp', signal);
  const revision = await docs.save(project, 0, '{}');
  await docs.save(other, 0, '{}');
  await put(estimateTable, [
    [['account', project], { id: project }],
    [['account', other], { id: other }],
  ]);
  await put(reportTable, [[['account', project], { id: project }]]);
  await put(journalTable, [[['account', project, photo, photo], { revision: 1 }]]);
  await put(thumbnailTable, [[['account', project, photo, 1, 1], new ArrayBuffer(1)]]);
  await put(fileTable, [
    [['account', photo], { project, ready: true }],
    [['account', photo, 0], new ArrayBuffer(1)],
    [['account', kept], { project: other, ready: true }],
    [['account', kept, 0], new ArrayBuffer(1)],
  ]);

  await expect(docs.remove(project, revision + 1)).rejects.toThrow();
  expect((await docs.list()).map(({ id }) => id).sort()).toEqual([project, other]);

  await docs.remove(project, revision);
  expect((await docs.list()).map(({ id }) => id)).toEqual([other]);
  expect(await keys(estimateTable)).toEqual([['account', other]]);
  expect(await keys(reportTable)).toEqual([]);
  expect(await keys(journalTable)).toEqual([]);
  expect(await keys(thumbnailTable)).toEqual([]);
  expect(await keys(fileTable)).toEqual([
    ['account', kept],
    ['account', kept, 0],
  ]);
});
