import { expect, it } from 'vitest';
import { plaintextCode } from '../../vault/aead';
import { localProjects } from '../projects';
import {
  account,
  bin,
  checkpoint,
  entries,
  fake,
  hosted,
  local,
  openDevice,
  sync,
  trashNorth,
  useHostedFixture,
} from './hosted-bin-fixture';

useHostedFixture();

it('restores an accepted entry on the server first, then on this device', async () => {
  const { entry, surface } = await trashNorth(await hosted());
  await bin().dispatch('csrf');
  await bin().restore(entry.deletionId);
  expect(fake.commands[1]).toMatchObject({
    intent: 'restore',
    deletionIds: [entry.deletionId],
    expectedVersions: { [entry.deletionId]: 1 },
    head: { expected: 2 },
  });
  const restored = await local();
  expect(restored.objects[0]!.surfaces.map(({ id }) => id)).toContain(surface.id);
  expect(await checkpoint()).toMatchObject({ revision: 3, localRevision: restored.revision });
  expect(await entries()).toEqual([]);
  expect(await fake.vault.binOutbox().list()).toEqual([]);
});

it('leaves the entry and the graph unchanged when the server refuses a restore', async () => {
  const { entry, surface } = await trashNorth(await hosted());
  await bin().dispatch('csrf');
  fake.fails = [{ status: 403, error: 'forbidden' }];
  await expect(bin().restore(entry.deletionId)).rejects.toMatchObject({ code: 'forbidden' });
  expect((await entries())[0]).toMatchObject({ state: 'retained', pending: null });
  expect((await local()).objects[0]!.surfaces.map(({ id }) => id)).not.toContain(surface.id);
  expect(await fake.vault.binOutbox().list()).toEqual([]);
});

it('requires other local changes to sync before a hosted restore', async () => {
  const { entry, project } = await trashNorth(await hosted());
  await bin().dispatch('csrf');
  await localProjects(fake.vault).save({ ...project!, name: 'Chapel (edited)' });
  await expect(bin().restore(entry.deletionId)).rejects.toMatchObject({ code: 'pending_sync' });
});

it('permanently deletes an accepted entry on the server and then locally', async () => {
  const { entry } = await trashNorth(await hosted());
  await bin().dispatch('csrf');
  const target = [{ deletionId: entry.deletionId, version: 1 }];
  fake.fails = ['lost'];
  await expect(bin().purge(target)).rejects.toThrow();
  expect(await entries()).toHaveLength(1);
  await bin().purge(target);
  expect(fake.commands[1]).toMatchObject({ intent: 'purge', head: null });
  expect(fake.commands[2]).toEqual(fake.commands[1]);
  expect(await entries()).toEqual([]);
});

it('finishes a restore whose response was lost from the stored receipt', async () => {
  const { entry, surface } = await trashNorth(await hosted());
  await bin().dispatch('csrf');
  const synced = (await checkpoint()).localRevision;
  fake.fails = ['lost'];
  await expect(bin().restore(entry.deletionId)).rejects.toThrow();
  expect((await entries())[0]!.pending).toMatchObject({ intent: 'restore', stage: 'dispatched' });
  expect(await bin().dispatch('csrf')).toBe(false);
  expect(fake.commands[2]).toEqual(fake.commands[1]);
  expect(fake.head).toBe(3);
  expect((await local()).objects[0]!.surfaces.map(({ id }) => id)).toContain(surface.id);
  expect(await checkpoint()).toMatchObject({ revision: 3, localRevision: synced + 1 });
  await sync().stagePending();
  await fake.vault.revisions().retry('csrf');
  expect(fake.head).toBe(3);
});

it('refreshes a clean device with an older graph before restoring a hosted item', async () => {
  const before = await hosted();
  const originalHead = fake.savedHead;
  const originalText = (await fake.vault.projects().changed(before.id, 0))!.text;
  const { entry, surface, project } = await trashNorth(before);
  await bin().dispatch('csrf');
  await localProjects(fake.vault).save({ ...project!, name: 'Chapel (newer cloud edit)' });
  await sync().stagePending();
  await fake.vault.revisions().retry('csrf');
  fake.controller.abort();
  await openDevice();
  await fake.vault.revisions().acceptKey(before.id, originalHead, plaintextCode, originalText);
  await bin().restoreRemote(account, project!.id, { deletionId: entry.deletionId, version: 1 });
  expect(await local()).toMatchObject({ name: 'Chapel (newer cloud edit)' });
  expect((await local()).objects[0]!.surfaces).toEqual(expect.arrayContaining([surface]));
  expect(await checkpoint()).toMatchObject({ revision: 4, localRevision: 3 });
  expect(await entries()).toEqual([]);
});

it('rejects a corrupt hosted bundle before opening a project on a new device', async () => {
  const { entry, project } = await trashNorth(await hosted());
  await bin().dispatch('csrf');
  fake.chunks.set(`${entry.deletionId}/0`, { sha256: '', body: btoa('{}') });
  fake.controller.abort();
  await openDevice();
  await expect(
    bin().restoreRemote(account, project!.id, {
      deletionId: entry.deletionId,
      version: 1,
    }),
  ).rejects.toMatchObject({ code: 'incomplete_recovery' });
  expect(await local()).toBeUndefined();
  expect(fake.commands).toHaveLength(1);
});

async function trashSurfaceThenObject() {
  const { entry, surface, project } = await trashNorth(await hosted());
  await bin().dispatch('csrf');
  const object = project!.objects[0]!;
  const parent = await bin().trash(project!, { kind: 'object', objectId: object.id });
  await bin().dispatch('csrf');
  expect(fake.retained.size).toBe(2);
  return { entry, surface, object, parent: parent.entry, project: project! };
}

it('restores a surface together with its deleted object on another device', async () => {
  const { entry, surface, object, parent, project } = await trashSurfaceThenObject();
  fake.controller.abort();
  await openDevice();
  const plan = await bin().restoreRemote(account, project.id, {
    deletionId: entry.deletionId,
    version: 1,
  });
  expect(plan.group.map(({ deletionId }) => deletionId)).toEqual([
    parent.deletionId,
    entry.deletionId,
  ]);
  expect(fake.commands.at(-1)).toMatchObject({
    intent: 'restore',
    deletionIds: [parent.deletionId, entry.deletionId],
    expectedVersions: { [parent.deletionId]: 1, [entry.deletionId]: 1 },
  });
  const restored = (await local()).objects.find(({ id }) => id === object.id)!;
  expect(restored.surfaces.map(({ id }) => id).sort()).toEqual(
    [...object.surfaces, surface].map(({ id }) => id).sort(),
  );
  expect(fake.retained.size).toBe(0);
  expect(await entries()).toEqual([]);
});

it('refuses a surface restore when its object is no longer in the Bin', async () => {
  const { entry, parent, project } = await trashSurfaceThenObject();
  await bin().purge([{ deletionId: parent.deletionId, version: 1 }]);
  const sent = fake.commands.length;
  fake.controller.abort();
  await openDevice();
  await expect(
    bin().restoreRemote(account, project.id, { deletionId: entry.deletionId, version: 1 }),
  ).rejects.toMatchObject({ code: 'missing_parent' });
  expect(fake.commands).toHaveLength(sent);
  expect(await entries()).toEqual([]);
});
