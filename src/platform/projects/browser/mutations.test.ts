import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, expect, it, vi } from 'vitest';
import { newProject, validateProject } from '../projects';
import type { SavedProjectV2 } from '../types';
import type { LocalVault } from '../../vault/vault';
import { importCode } from '../../vault/crypto';
import { connect, estimateTable, reportTable, vaultTable } from '../../vault/store';
import { binDocuments } from '../../vault/bin-store';
import { projectDocuments } from '../../vault/project-store';
import { emptyJournal, journalText } from '../surface-journal';
import {
  browserMutations,
  createObject,
  createSurface,
  deletionCounts,
  renameItem,
  setCover,
  setOverride,
} from './mutations';

const actor = '11111111-1111-4111-8111-111111111111';
const photo = '22222222-2222-4222-8222-222222222222';
const cover = '33333333-3333-4333-8333-333333333333';
let documents: ReturnType<typeof projectDocuments>;
let vault: LocalVault;
beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  const root = await importCode('01'.repeat(32));
  const db = await connect();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(vaultTable, 'readwrite');
    tx.objectStore(vaultTable).put({ stamp: 'stamp' }, actor);
    tx.oncomplete = () => resolve();
  });
  db.close();
  documents = projectDocuments(root, actor, 'stamp', new AbortController().signal);
  const signal = new AbortController().signal;
  vault = {
    projects: () => documents,
    estimates: () => projectDocuments(root, actor, 'stamp', signal, estimateTable),
    reports: () => projectDocuments(root, actor, 'stamp', signal, reportTable),
    bin: () => binDocuments(root, actor, 'stamp', signal),
  } as unknown as LocalVault;
});

function seeded(): SavedProjectV2 {
  const project = newProject('P', 'O', 'S', 'EUR', undefined, actor);
  project.objects[0]!.surfaces[0]!.images.push({ id: photo, role: 'mapping' });
  return project;
}
async function persist(project = seeded()) {
  return { ...project, revision: await documents.save(project.id, 0, JSON.stringify(project)) };
}
it('creates and renames pure v2 entities with actor and changed ancestor timestamps', () => {
  const initial = newProject('P', null, null, 'EUR');
  const objectProject = createObject(initial, ' Object ', actor, 100);
  const object = objectProject.objects[0]!;
  expect(object).toMatchObject({
    name: 'Object',
    createdAt: 100,
    updatedAt: 100,
    createdBy: actor,
    surfaces: [],
  });
  const surfaceProject = createSurface(objectProject, object.id, 'Surface', actor, 200);
  const surface = surfaceProject.objects[0]!.surfaces[0]!;
  expect(surface).toMatchObject({ createdAt: 200, updatedAt: 200, createdBy: actor });
  const renamed = renameItem(
    surfaceProject,
    { kind: 'surface', objectId: object.id, surfaceId: surface.id },
    'New',
    300,
  );
  expect(renamed.updatedAt).toBe(300);
  expect(renamed.objects[0]!.updatedAt).toBe(300);
  expect(renamed.objects[0]!.surfaces[0]!).toMatchObject({
    name: 'New',
    createdAt: 200,
    updatedAt: 300,
  });
  expect(initial.objects).toEqual([]);
  expect(surface.name).toBe('Surface');
  expect(() => createObject(initial, ' ', actor)).toThrow();
});
it('upgrades legacy data only on mutation without fabricating historic child metadata', () => {
  const project = seeded();
  const legacy = {
    ...project,
    version: 1 as const,
    createdAt: undefined,
    createdBy: undefined,
    objects: project.objects.map((object) => ({
      ...object,
      createdAt: undefined,
      updatedAt: undefined,
      createdBy: undefined,
    })),
  };
  const renamed = renameItem(legacy, { kind: 'project' }, 'Renamed', 500);
  expect(renamed).toMatchObject({ version: 2, createdAt: null, createdBy: null, updatedAt: 500 });
  expect(renamed.objects[0]).toMatchObject({ createdAt: null, updatedAt: null, createdBy: null });
});
it('sets and clears covers and explicit override values, rejecting invalid subtree/currency/keys', () => {
  const project = seeded();
  const objectId = project.objects[0]!.id;
  const withCover = setCover(project, { kind: 'object', objectId }, photo);
  expect(withCover.objects[0]!.cover).toEqual({ assetId: photo });
  expect(setCover(withCover, { kind: 'object', objectId }, null).objects[0]!.cover).toBeUndefined();
  expect(() => setCover(project, { kind: 'project' }, cover)).toThrow();
  const dedicated = { ...project, assets: [{ id: cover, purpose: 'cover' as const }] };
  expect(setCover(dedicated, { kind: 'project' }, cover).cover).toEqual({ assetId: cover });
  const change = { kind: 'object' as const, objectId };
  const explicit = setOverride(project, change, {
    group: 'restoration',
    key: 'snap',
    value: false,
  });
  expect(explicit.objects[0]!.overrides?.restoration?.snap).toBe(false);
  expect(
    setOverride(explicit, change, { group: 'restoration', key: 'snap', value: undefined })
      .objects[0]!.overrides,
  ).toBeUndefined();
  expect(
    setOverride(project, change, { group: 'branding', key: 'studio', value: '' }).objects[0]!
      .overrides?.branding?.studio,
  ).toBe('');
  expect(
    setOverride(project, change, { group: 'branding', key: 'logo', value: null }).objects[0]!
      .overrides?.branding?.logo,
  ).toBeNull();
  expect(() =>
    setOverride(project, change, { group: 'restoration', key: 'currency', value: 'USD' }),
  ).toThrow();
  expect(() =>
    setOverride(project, change, { group: 'branding', key: '__proto__', value: {} }),
  ).toThrow();
  expect(() =>
    setOverride(project, change, { group: 'branding', key: 'logo', value: { assetId: photo } }),
  ).toThrow();
});
it('deletes the last child, clears dangling covers and keeps snapshot records intact', async () => {
  const project = await persist();
  const object = project.objects[0]!;
  project.cover = { assetId: photo };
  expect(deletionCounts(project, { kind: 'object', objectId: object.id })).toEqual({
    objects: 1,
    surfaces: 1,
    photos: 1,
  });
  const next = await browserMutations(vault, actor).deleteObject(project, object.id);
  expect(next.objects).toEqual([]);
  expect(next.cover).toBeUndefined();
  expect(project.objects).toHaveLength(1);
  expect(next.revision).toBe(2);
  expect(validateProject(next, next.id).version).toBe(2);
});
it('blocks hidden, undone and conflicted drafts, and fails closed on unreadable journals', async () => {
  const project = await persist();
  const object = project.objects[0]!;
  const ref = { project: project.id, surface: object.surfaces[0]!.id, source: photo };
  await documents.saveJournal(
    {
      ref,
      expected: 0,
      text: journalText({
        ...emptyJournal(),
        conflict: true,
        drafts: [{ layer: 1, pending: [], undone: [] }],
      }),
    },
    project.revision,
  );
  await expect(
    browserMutations(vault, actor).deleteSurface(project, object.id, ref.surface),
  ).rejects.toThrow('Resolve drawing drafts');
  expect(JSON.parse((await documents.changed(project.id, 0))!.text).objects).toHaveLength(1);
  vi.spyOn(documents, 'readJournal').mockRejectedValueOnce(new Error('Unreadable'));
  await expect(browserMutations(vault, actor).deleteObject(project, object.id)).rejects.toThrow(
    'Unreadable',
  );
});
it.each([true, false])(
  'atomically refuses a journal written during deletion (existing: %s)',
  async (existing) => {
    const project = await persist();
    const object = project.objects[0]!;
    const ref = { project: project.id, surface: object.surfaces[0]!.id, source: photo };
    if (existing)
      await documents.saveJournal(
        { ref, expected: 0, text: journalText(emptyJournal()) },
        project.revision,
      );
    const read = documents.readJournal;
    vi.spyOn(documents, 'readJournal').mockImplementationOnce(async (ref) => {
      const row = await read(ref);
      await documents.saveJournal(
        {
          ref,
          expected: row?.revision ?? 0,
          text: journalText({ ...emptyJournal(), drafts: [{ layer: 1, pending: [], undone: [] }] }),
        },
        project.revision,
      );
      return row;
    });
    await expect(browserMutations(vault, actor).deleteObject(project, object.id)).rejects.toThrow();
    expect(JSON.parse((await documents.changed(project.id, 0))!.text).objects).toHaveLength(1);
  },
);
it('rejects a stale project revision without persisting the deletion', async () => {
  const project = await persist();
  await documents.save(
    project.id,
    project.revision,
    JSON.stringify({ ...project, name: 'Concurrent' }),
  );
  await expect(
    browserMutations(vault, actor).deleteObject(project, project.objects[0]!.id),
  ).rejects.toThrow();
  expect(JSON.parse((await documents.changed(project.id, 0))!.text).name).toBe('Concurrent');
});
it('registers a dedicated cover atomically through image import with no surface attachment', async () => {
  const project = seeded();
  const save = vi.spyOn(documents, 'save').mockResolvedValue(1);
  const importImage = vi.fn(
    async (
      project: string,
      file: File,
      attach: (ref: { project: string; id: string }, signal: AbortSignal) => Promise<void>,
    ) => {
      expect(file.name).toBe('cover.png');
      await attach({ project, id: cover }, new AbortController().signal);
    },
  );
  const uploadVault = {
    projects: () => documents,
    files: () => ({ importImage }),
  } as unknown as LocalVault;
  const next = await browserMutations(uploadVault, actor).uploadCover(
    project,
    { kind: 'project' },
    new File(['image'], 'cover.png'),
    new AbortController().signal,
  );
  expect(next.assets).toContainEqual({ id: cover, purpose: 'cover' });
  expect(next.cover).toEqual({ assetId: cover });
  expect(next.objects[0]!.surfaces[0]!.images).toEqual(project.objects[0]!.surfaces[0]!.images);
  expect(save).toHaveBeenCalledWith(
    project.id,
    0,
    expect.any(String),
    { id: cover, signal: expect.any(AbortSignal) },
    undefined,
  );
});
