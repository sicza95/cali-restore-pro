import { expect, it, vi } from 'vitest';
import { aead } from '../../vault/aead';
import { readHostedCatalog } from './hosted-catalog';
import {
  account,
  bin,
  checkpoint,
  deadline,
  entries,
  fake,
  hosted,
  local,
  sync,
  trashNorth,
  useHostedFixture,
} from './hosted-bin-fixture';

useHostedFixture();

it('holds ordinary sync and sends the deletion with its Bin entry in one command', async () => {
  const { entry } = await trashNorth(await hosted());
  expect((await entries())[0]).toMatchObject({
    scope: 'hosted',
    provisional: true,
    pending: { intent: 'trash', stage: 'queued' },
  });
  expect(await sync().stagePending()).toEqual([]);
  expect((await fake.vault.revisions().drafts()).length).toBe(0);

  expect(await bin().dispatch('csrf')).toBe(false);
  expect(fake.revisions).toHaveLength(1);
  expect(fake.commands).toHaveLength(1);
  expect(fake.commands[0]).toMatchObject({
    intent: 'trash',
    deletionIds: [entry.deletionId],
    head: { expected: 1 },
    trash: { deletionId: entry.deletionId, entityKind: 'surface', coverageMissing: [] },
  });
  expect(fake.staged.length).toBe(fake.commands[0]!.trash!.chunkCount);
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
  expect(await fake.vault.binOutbox().list()).toEqual([]);
});

it('replays the identical command after a lost response instead of a new revision', async () => {
  await trashNorth(await hosted());
  fake.fails = ['lost'];
  expect(await bin().dispatch('csrf')).toBe(true);
  expect((await entries())[0]!.pending).toMatchObject({ stage: 'dispatched' });
  expect(await bin().dispatch('csrf')).toBe(false);
  expect(fake.commands).toHaveLength(2);
  expect(fake.commands[1]).toEqual(fake.commands[0]);
  expect(fake.head).toBe(2);
  expect((await entries())[0]).toMatchObject({ provisional: false, pending: null });
});

it('opens catalog display data using the saved project key and the deletion identity', async () => {
  aead.enabled = true;
  const project = await hosted();
  const { entry } = await trashNorth(project);
  await bin().dispatch('csrf');
  const valid = {
    projectId: project.id,
    deletionId: entry.deletionId,
    display: fake.commands[0]!.trash!.display,
    capabilities: { read: { allowed: true } },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Response.json({
        entries: [valid, { ...valid, deletionId: crypto.randomUUID() }],
        next: null,
      }),
    ),
  );
  const catalog = await readHostedCatalog(account, fake.vault, fake.controller.signal);
  expect(catalog.map(({ display }) => display)).toEqual([
    { name: 'North', path: ['Chapel', 'Altar'] },
    undefined,
  ]);
});

it('holds ordinary sync on a stale head until the deletion is undone locally', async () => {
  const { entry } = await trashNorth(await hosted());
  fake.head = 5; // another device wrote meanwhile
  await bin().dispatch('csrf');
  expect((await entries())[0]!.pending).toMatchObject({
    stage: 'conflict',
    failure: 'stale_revision',
  });
  await sync().stagePending();
  expect(await fake.vault.revisions().drafts()).toHaveLength(0);
  await bin().restore(entry.deletionId);
  await sync().stagePending();
  expect(await fake.vault.revisions().drafts()).toHaveLength(1);
});

it('keeps the remote source live when the server refuses the deletion', async () => {
  await trashNorth(await hosted());
  fake.fails = [{ status: 409, error: 'quota_exceeded' }];
  await bin().dispatch('csrf');
  expect((await entries())[0]!.pending).toMatchObject({
    stage: 'conflict',
    failure: 'quota_exceeded',
  });
  expect(await bin().dispatch('csrf')).toBe(false);
  await sync().stagePending();
  const base = await checkpoint();
  const queue = fake.vault.revisions();
  const changed = (await fake.vault.projects().changed(base.project, base.localRevision))!;
  const key = await queue.projectKey(base.project, base.epoch);
  await expect(queue.stageEditor(base, changed.revision, key, changed.text)).rejects.toThrow();
  await queue.retry('csrf');
  expect(fake.revisions).toHaveLength(1);
  expect(fake.commands).toHaveLength(1);
});

it('keeps a second hosted child deletion out of the first recovery command', async () => {
  await trashNorth(await hosted());
  const after = await local();
  const [object] = after.objects;
  const target = {
    kind: 'surface' as const,
    objectId: object!.id,
    surfaceId: object!.surfaces[0]!.id,
  };
  await expect(bin().trash(after, target)).rejects.toMatchObject({ code: 'pending_sync' });
  expect(await local()).toEqual(after);
  await bin().dispatch('csrf');
  await bin().trash(after, target);
  await bin().dispatch('csrf');
  expect(fake.commands).toHaveLength(2);
  expect(fake.commands[0]!.deletionIds).not.toEqual(fake.commands[1]!.deletionIds);
});

it('cancels a queued deletion offline before anything is sent', async () => {
  const { entry, surface } = await trashNorth(await hosted());
  vi.stubGlobal('navigator', { onLine: false });
  await bin().restore(entry.deletionId);
  expect(fake.commands).toEqual([]);
  expect(await fake.vault.binOutbox().list()).toEqual([]);
  expect(await entries()).toEqual([]);
  expect((await local()).objects[0]!.surfaces.map(({ id }) => id)).toContain(surface.id);
});
