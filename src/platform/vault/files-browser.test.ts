import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, expect, it, vi } from 'vitest';
import { buildWorkingImage } from '../images/build';
import { importCode } from './crypto';
import { connect, vaultTable, fileTable } from './store';
import { encryptedFiles } from './files';
import { localFiles } from './file-store';
import { projectDocuments } from './project-store';
import { newProject } from '../projects/projects';
import { browserMutations } from '../projects/browser/mutations';
import type { LocalVault } from './vault';

vi.mock('../images/build', () => ({ buildWorkingImage: vi.fn() }));
let root: CryptoKey;
const signal = new AbortController().signal;
beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  root = await importCode('ab'.repeat(32));
  vi.mocked(buildWorkingImage).mockResolvedValue({
    manifest: {
      version: 1,
      format: 'png',
      embeddedPreview: false,
      pixels: { width: 1, height: 1 },
      proxy: { width: 1, height: 1 },
      levels: [],
    },
    parts: [new Blob(['proxy'])],
  });
  const db = await connect();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(vaultTable, 'readwrite');
    tx.objectStore(vaultTable).put({ stamp: 'stamp' }, 'account');
    tx.oncomplete = () => resolve();
  });
  db.close();
});
it('imports a dedicated cover in the same optimistic transaction as its asset registration', async () => {
  const files = encryptedFiles(root, 'account', 'stamp', signal);
  const projects = projectDocuments(root, 'account', 'stamp', signal);
  const vault = { files: () => files, projects: () => projects } as unknown as LocalVault;
  const project = newProject('P', null, null, 'EUR');
  const next = await browserMutations(vault, null).uploadCover(
    project,
    { kind: 'project' },
    new File(['cover'], 'cover.png'),
    signal,
  );
  const id = next.cover!.assetId;
  expect(next.assets).toEqual([{ id, purpose: 'cover' }]);
  expect(next.objects).toEqual([]);
  expect((await localFiles('account', 'stamp').header(id))!.ready).toBe(true);
  expect(await (await files.workingImage({ project: project.id, id })).proxy.text()).toBe('proxy');
  const stale = browserMutations(vault, null).uploadCover(
    project,
    { kind: 'project' },
    new File(['other'], 'other.png'),
    signal,
  );
  await expect(stale).rejects.toThrow();
  const db = await connect();
  const rows = await new Promise<IDBValidKey[]>((resolve) => {
    const request = db.transaction(fileTable).objectStore(fileTable).getAllKeys();
    request.onsuccess = () => resolve(request.result);
  });
  db.close();
  expect(new Set(rows.map((key) => (key as string[])[1]))).toEqual(new Set([id]));
});
