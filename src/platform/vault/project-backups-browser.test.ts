import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, expect, it, vi } from 'vitest';
import { connect, vaultTable } from './store';
import { importCode } from './crypto';
import { encryptedFiles } from './files';
import { projectDocuments } from './project-store';
import { projectBackups } from './project-backups';
import { newProject } from '../projects/projects';
import { projectAssetIds } from '../projects/browser/assets';

let root: CryptoKey;
const signal = new AbortController().signal;
const account = 'account';
const files = () => encryptedFiles(root, account, 'stamp', signal);
const documents = () => projectDocuments(root, account, 'stamp', signal);
const backups = () => projectBackups(root, account, 'stamp', signal);
beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  root = await importCode('ab'.repeat(32));
  const db = await connect();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(vaultTable, 'readwrite');
    tx.objectStore(vaultTable).put({ stamp: 'stamp' }, account);
    tx.oncomplete = () => resolve();
  });
  db.close();
});
it('enumerates and remaps dedicated covers, unused assets, logos and subtree photo covers at every level', async () => {
  const project = newProject('Backup', 'Object', 'Surface', 'EUR');
  const staged = [];
  for (const name of ['photo', 'cover', 'logo', 'retained'])
    staged.push(
      await files().stage(project.id, new File([name], name + '.png', { type: 'image/png' })),
    );
  const [photo, cover, logo, retained] = staged.map(({ id }) => id);
  project.assets = [
    { id: cover!, purpose: 'cover' },
    { id: logo!, purpose: 'branding' },
    { id: retained!, purpose: 'cover' },
  ];
  project.cover = { assetId: cover! };
  project.overrides = { branding: { logo: { assetId: logo! } } };
  const object = project.objects[0]!;
  object.cover = { assetId: photo! };
  object.overrides = { branding: { logo: { assetId: logo! } } };
  const surface = object.surfaces[0]!;
  surface.images = [{ id: photo!, role: 'mapping' }];
  surface.cover = { assetId: cover! };
  surface.overrides = { branding: { logo: { assetId: logo! }, studio: '' } };
  await documents().save(project.id, 0, JSON.stringify(project));
  const exported = await backups().export(project.id);
  const restored = await backups().import(exported.blob, exported.code);
  const restoredIds = projectAssetIds(restored);
  expect(restoredIds.size).toBe(4);
  for (const { id } of staged) expect(restoredIds.has(id)).toBe(false);
  const nextObject = restored.objects[0]!;
  const nextSurface = nextObject.surfaces[0]!;
  expect(restored.cover!.assetId).toBe(restored.assets![0]!.id);
  expect(nextObject.cover!.assetId).toBe(nextSurface.images[0]!.id);
  expect(nextSurface.cover).toEqual(restored.cover);
  for (const entity of [restored, nextObject, nextSurface])
    expect(entity.overrides!.branding!.logo!.assetId).toBe(restored.assets![1]!.id);
  expect(nextSurface.overrides!.branding!.studio).toBe('');
  const contents = [];
  for (const id of restoredIds) {
    const chunks = [];
    for await (const bytes of files().original({ project: restored.id, id })) chunks.push(bytes);
    contents.push(await new Blob(chunks).text());
  }
  expect(contents.sort()).toEqual(['cover', 'logo', 'photo', 'retained']);
});
it.each([null, 'Empty object'])(
  'backs up and restores an empty v2 hierarchy: %s',
  async (object) => {
    const project = newProject('Empty', object, null, 'EUR');
    await documents().save(project.id, 0, JSON.stringify(project));
    const exported = await backups().export(project.id);
    const restored = await backups().import(exported.blob, exported.code);
    expect(restored.objects).toEqual(project.objects);
  },
);
