import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { RevisionHead, RevisionWrite } from '../src/platform/projects/revisions';

const account = '00000000-0000-4000-8000-000000000011';
const other = '00000000-0000-4000-8000-000000000014';
const initialEpoch = '00000000-0000-4000-8000-000000000012';
const rotatedEpoch = '00000000-0000-4000-8000-000000000013';

test('the editor recovers offline edits and rotates the project key', async ({
  page,
  browser,
}, info) => {
  let epoch = initialEpoch;
  let head: RevisionHead | null = null;
  let disconnected = false;
  let revoked = false;
  let transfer: { path: string; recipient: string; epoch: string; syncEpoch: string } | undefined;
  async function routes(device: typeof page, owner: string) {
    await device.route('**/api/v1/auth/me', (route) =>
      route.fulfill({
        json: { account: { id: owner, email: 'editor@example.test' }, csrfToken: 'editor-token' },
      }),
    );
    await device.route('**/api/v1/status', (route) => route.fulfill({ json: { status: 'ready' } }));
    await device.route('**/hosted-projects/*/revision-key/*', (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      expect(request.headers()['x-sync-account']).toBe(owner);
      if (owner === other && revoked) return route.fulfill({ status: 404 });
      if (request.method() === 'PUT') {
        expect(request.headers()['x-csrf-token']).toBe('editor-token');
        const next = request.postDataJSON();
        expect(Object.keys(next).sort()).toEqual([
          'ciphertext',
          'epoch',
          'recipient',
          'salt',
          'syncEpoch',
        ]);
        transfer = { ...next, path };
        return route.fulfill({ status: 204 });
      }
      if (transfer?.path !== path || transfer.recipient !== owner || transfer.syncEpoch !== epoch)
        return route.fulfill({ status: 404 });
      return route.fulfill({ json: transfer });
    });
    await device.route('**/hosted-projects/*/revision', (route) => {
      if (owner === other && revoked) return route.fulfill({ status: 404 });
      if (device === page && disconnected) return route.abort('internetdisconnected');
      if (route.request().method() === 'GET') return route.fulfill({ json: { epoch, head } });
      expect(route.request().headers()['x-sync-account']).toBe(owner);
      expect(route.request().headers()['x-csrf-token']).toBe('editor-token');
      const { expected, ...write } = route.request().postDataJSON() as RevisionWrite;
      if (write.epoch !== epoch)
        return route.fulfill({ status: 409, json: { error: 'revision_epoch_changed' } });
      if (expected !== (head?.revision ?? 0))
        return route.fulfill({ status: 409, json: { error: 'revision_conflict' } });
      head = { ...write, revision: expected + 1 };
      return route.fulfill({ json: { epoch, head } });
    });
  }
  async function setupVault(device: typeof page) {
    await device.goto('/projects');
    await device.getByLabel(/Remember this browser/).check();
    await device.getByRole('button', { name: 'Set up vault' }).click();
    await device.getByLabel('I saved the recovery key').check();
    await device.getByRole('button', { name: 'Set up vault' }).click();
  }
  await routes(page, account);

  await page.setViewportSize({ width: 1194, height: 834 });
  await setupVault(page);
  await page.getByLabel('Project name').fill('East Chapel');
  await page.getByRole('button', { name: 'New project' }).click();

  const sync = page.getByRole('region', { name: 'Cloud sync' });
  await sync.getByRole('button', { name: 'Enable editor sync' }).click();
  await expect(sync.getByRole('status')).toHaveText('Cloud copy saved');
  expect(head).toMatchObject({ epoch: initialEpoch, revision: 1 });
  const project = new URL(page.url()).pathname.split('/').at(-1)!;

  const secondContext = await browser.newContext({ baseURL: info.project.use.baseURL });
  const second = await secondContext.newPage();
  await routes(second, other);
  await setupVault(second);
  await page.getByText('Share sync access with a device', { exact: true }).click();
  await page.getByLabel('Recipient owner account ID').fill(other);
  await page.getByRole('button', { name: 'Create transfer code' }).click();
  await expect(page.getByLabel('Transfer code')).toHaveValue(/^cr1\./);
  const code = await page.getByLabel('Transfer code').inputValue();
  expect(JSON.stringify(transfer)).not.toContain(code.split('.').at(-1));
  await page.screenshot({
    path: info.outputPath('pairing-landscape.png'),
    fullPage: true,
    mask: [page.getByLabel('Transfer code')],
  });

  await second.getByText('Open a synced project on this device', { exact: true }).click();
  const redeem = async (value: string) => {
    await second.getByLabel('Transfer code').fill(value);
    await second.getByRole('button', { name: 'Open synced project' }).click();
  };
  await redeem(code.slice(0, -1) + (code.endsWith('0') ? '1' : '0'));
  await expect(second.getByRole('alert').first()).toBeVisible();
  await redeem(code);
  const secondSync = second.getByRole('region', { name: 'Cloud sync' });
  await expect(secondSync.getByRole('status')).toHaveText('Cloud copy saved');
  await second.getByLabel('Currency code').fill('CAD');
  await second.getByRole('button', { name: 'Save settings' }).click();
  await expect(secondSync.getByRole('status')).toHaveText('Cloud copy saved');
  await expect.poll(() => head).toMatchObject({ epoch: initialEpoch, revision: 2 });

  const editCurrency = async (currency: string) => {
    await page.getByLabel('Currency code').fill(currency);
    const save = page.getByRole('button', { name: 'Save settings' });
    await save.click();
    await expect(save).toBeEnabled();
    await expect(sync.getByRole('status')).toContainText('waiting to sync');
  };
  const reconnect = async () => {
    disconnected = false;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await sync.getByRole('button', { name: 'Review sync conflict' }).click();
  };

  disconnected = true;
  await editCurrency('USD');
  await editCurrency('GBP');
  await page.reload();
  await page.getByRole('button', { name: 'Unlock on this remembered browser' }).click();
  await expect(page.getByLabel('Currency code')).toHaveValue('GBP');
  await expect(sync.getByRole('status')).toContainText('waiting to sync');
  await reconnect();
  await expect(sync.getByRole('region', { name: 'This device' })).toContainText(
    'East Chapel · GBP',
  );
  await expect(sync.getByRole('region', { name: 'Cloud copy' })).toContainText('East Chapel · CAD');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('editor-conflict-landscape.png'), fullPage: true });
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.screenshot({ path: info.outputPath('editor-conflict-portrait.png'), fullPage: true });
  await sync.getByRole('button', { name: 'Publish this device’s copy' }).click();
  await expect(sync.getByRole('status')).toHaveText('Cloud copy saved');
  expect(head).toMatchObject({ epoch: initialEpoch, revision: 3 });
  const oldHead = head!;

  disconnected = true;
  await editCurrency('HUF');
  revoked = true;
  epoch = rotatedEpoch;
  await second.getByLabel('Currency code').fill('CHF');
  await second.getByRole('button', { name: 'Save settings' }).click();
  await expect(secondSync.getByRole('button', { name: 'Review sync conflict' })).toBeVisible();
  await second.getByRole('link', { name: 'All projects' }).click();
  await second.getByText('Open a synced project on this device', { exact: true }).click();
  await redeem(code);
  await expect(second.getByRole('alert').first()).toBeVisible();
  await reconnect();
  await expect(sync.getByRole('region', { name: 'This device' })).toContainText(
    'East Chapel · HUF',
  );
  await expect(sync.getByRole('region', { name: 'Cloud copy' })).toContainText('East Chapel · GBP');
  await sync.getByRole('button', { name: 'Use the cloud copy' }).click();
  await expect(page.getByLabel('Currency code')).toHaveValue('GBP');
  await expect(sync.getByRole('status')).toHaveText('Cloud copy saved');
  expect(head).toMatchObject({ epoch: rotatedEpoch, revision: 4 });

  const keys = await page.evaluate(
    async ({ account, project, oldHead, head }) => {
      const vaultPath = '/src/platform/vault/vault.ts';
      const revisionPath = '/src/platform/projects/revisions.ts';
      const { LocalVault } = (await import(
        vaultPath
      )) as typeof import('../src/platform/vault/vault');
      const { openRevision } = (await import(
        revisionPath
      )) as typeof import('../src/platform/projects/revisions');
      const vault = new LocalVault(account, () => undefined);
      await vault.unlock();
      const queue = vault.revisions();
      const oldKey = await queue.projectKey(project, oldHead.epoch);
      const newKey = await queue.projectKey(project, head.epoch);
      const oldKeyRejected = await openRevision(project, head, {
        ...oldKey,
        epoch: head.epoch,
      }).then(
        () => false,
        () => true,
      );
      const text = await openRevision(project, head, newKey);
      await vault.forget(true);
      await vault.create('44'.repeat(32), false);
      const forgotten = await vault
        .revisions()
        .projectKey(project, head.epoch)
        .then(
          () => false,
          () => true,
        );
      vault.close();
      return { oldKeyRejected, forgotten, text };
    },
    { account, project, oldHead, head: head! },
  );
  expect(keys).toMatchObject({ oldKeyRejected: true, forgotten: true });
  expect(JSON.parse(keys.text)).toMatchObject({ settings: { currency: 'GBP' } });
  await secondContext.close();
});
