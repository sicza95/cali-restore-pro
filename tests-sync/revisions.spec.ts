import { expect, test } from '@playwright/test';
import type { RevisionHead, RevisionWrite } from '../src/platform/projects/revisions';

test('offline conflict recovery survives reload and requires a new key after rotation', async ({
  page,
}) => {
  const epoch = '00000000-0000-4000-8000-000000000001';
  const rotated = '00000000-0000-4000-8000-000000000002';
  let currentEpoch = epoch;
  let head: RevisionHead | null = null;
  let writes = 0;
  let disconnected = false;
  await page.route('**/revision', async (route) => {
    if (disconnected) return route.abort('internetdisconnected');
    if (route.request().method() === 'GET')
      return route.fulfill({ json: { epoch: currentEpoch, head } });
    writes++;
    const { expected, epoch, salt, ciphertext } = route.request().postDataJSON() as RevisionWrite;
    if (epoch !== currentEpoch)
      return route.fulfill({ status: 409, json: { error: 'revision_epoch_changed' } });
    if (expected !== (head?.revision ?? 0))
      return route.fulfill({ status: 409, json: { error: 'revision_conflict' } });
    head = { epoch, salt, ciphertext, revision: expected + 1 };
    return route.fulfill({ json: { epoch: currentEpoch, head } });
  });
  await page.goto('/');
  const ids = {
    epoch,
    rotated,
    account: '00000000-0000-4000-8000-000000000003',
    project: '00000000-0000-4000-8000-000000000004',
  };
  await page.evaluate(async ({ account, project, epoch }) => {
    const vaultPath = '/src/platform/vault/vault.ts';
    const cryptoPath = '/src/platform/vault/crypto.ts';
    const { LocalVault } = (await import(
      vaultPath
    )) as typeof import('../src/platform/vault/vault');
    const { importCode } = (await import(
      cryptoPath
    )) as typeof import('../src/platform/vault/crypto');
    const vault = new LocalVault(account, () => undefined);
    await vault.create('11'.repeat(32), true);
    await vault
      .revisions()
      .stage(
        project,
        { epoch, head: null },
        { epoch, key: await importCode('22'.repeat(32)) },
        'Offline edit',
      );
    vault.close();
  }, ids);
  await page.reload();
  const result = await page.evaluate(async ({ account, project, epoch }) => {
    const vaultPath = '/src/platform/vault/vault.ts';
    const cryptoPath = '/src/platform/vault/crypto.ts';
    const revisionPath = '/src/platform/projects/revisions.ts';
    const { LocalVault } = (await import(
      vaultPath
    )) as typeof import('../src/platform/vault/vault');
    const { importCode } = (await import(
      cryptoPath
    )) as typeof import('../src/platform/vault/crypto');
    const { sealRevision, openRevision } = (await import(
      revisionPath
    )) as typeof import('../src/platform/projects/revisions');
    const key = { epoch, key: await importCode('22'.repeat(32)) };
    const vault = new LocalVault(account, () => undefined);
    await vault.unlock();
    const queue = vault.revisions();
    const candidate = await sealRevision(project, { epoch, head: null }, key, 'Other device edit');
    await fetch(`/api/v1/hosted-projects/${project}/revision`, {
      method: 'PUT',
      body: JSON.stringify(candidate),
    });
    await queue.retry('test-token');
    const draft = (await queue.review(project))!;
    const state = await queue.readRemote(project);
    const other = await openRevision(project, state.head!, key);
    await queue.resolve(project, draft.id, state, key, other + ' + ' + draft.text);
    await queue.retry('test-token');
    const merged = await queue.readRemote(project);
    const text = await openRevision(project, merged.head!, key);
    await queue.stage(project, merged, key, 'Before key rotation');
    vault.close();
    return { blocked: draft.blocked, text, revision: merged.head!.revision };
  }, ids);
  expect(result).toEqual({
    blocked: 'conflict',
    text: 'Other device edit + Offline edit',
    revision: 2,
  });
  currentEpoch = rotated;
  const priorWrites = writes;
  disconnected = true;
  const offline = await page.evaluate(async ({ account }) => {
    const path = '/src/platform/vault/vault.ts';
    const { LocalVault } = (await import(path)) as typeof import('../src/platform/vault/vault');
    const vault = new LocalVault(account, () => undefined);
    await vault.unlock();
    const queue = vault.revisions();
    const retry = await queue.retry('test-token');
    vault.close();
    return retry;
  }, ids);
  expect(offline).toBe(true);
  expect(writes).toBe(priorWrites);
  disconnected = false;
  const blocked = await page.evaluate(async ({ account, project, epoch, rotated }) => {
    const vaultPath = '/src/platform/vault/vault.ts';
    const cryptoPath = '/src/platform/vault/crypto.ts';
    const revisionPath = '/src/platform/projects/revisions.ts';
    const { LocalVault } = (await import(
      vaultPath
    )) as typeof import('../src/platform/vault/vault');
    const { importCode } = (await import(
      cryptoPath
    )) as typeof import('../src/platform/vault/crypto');
    const { openRevision } = (await import(
      revisionPath
    )) as typeof import('../src/platform/projects/revisions');
    const vault = new LocalVault(account, () => undefined);
    await vault.unlock();
    const queue = vault.revisions();
    await queue.retry('test-token');
    const draft = (await queue.review(project))!;
    const state = await queue.readRemote(project);
    const oldKey = { epoch, key: await importCode('22'.repeat(32)) };
    const newKey = { epoch: rotated, key: await importCode('44'.repeat(32)) };
    const rejected = await queue.resolve(project, draft.id, state, oldKey, draft.text).then(
      () => false,
      () => true,
    );
    await queue.resolve(project, draft.id, state, newKey, draft.text);
    const stop = queue.start(
      async () => 'test-token',
      () => undefined,
    );
    const deadline = Date.now() + 5000;
    while ((await queue.drafts()).length && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 25));
    stop();
    const saved = await queue.readRemote(project);
    const recovered = await openRevision(project, saved.head!, newKey);
    await queue.stage(project, saved, newKey, 'Discard by forgetting vault');
    await vault.forget(true);
    await vault.create('33'.repeat(32), false);
    const remaining = await vault.revisions().drafts();
    vault.close();
    return {
      blocked: draft.blocked,
      rejected,
      recovered,
      remaining,
      revision: saved.head!.revision,
    };
  }, ids);
  expect(blocked).toEqual({
    blocked: 'epoch',
    rejected: true,
    recovered: 'Before key rotation',
    remaining: [],
    revision: 3,
  });
});
