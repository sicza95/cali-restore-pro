import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { RevisionHead, RevisionWrite } from '../src/platform/projects/revisions';
import { aead } from '../src/platform/vault/aead';
import {
  browserItem,
  browserReady,
  createProjectViaBrowser,
  inspect,
  openItem,
  openProjectSettings,
  overrideRestoration,
} from '../tests-platform/project-browser';

const closeDialog = (device: import('@playwright/test').Page) =>
  device.getByRole('dialog').locator('[data-control-id="browser.dialog.close"]').click();

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
  let cloudProject = '';
  async function routes(device: typeof page, owner: string) {
    await device.route('**/api/v1/auth/me', (route) =>
      route.fulfill({
        json: { account: { id: owner, email: 'editor@example.test' }, csrfToken: 'editor-token' },
      }),
    );
    await device.route('**/api/v1/status', (route) => route.fulfill({ json: { status: 'ready' } }));
    // Owners list their synced projects; no transfer code while encryption is off (aead.ts).
    await device.route('**/api/v1/hosted-projects', (route) =>
      route.fulfill({
        json: cloudProject && head && !(owner === other && revoked) ? [{ id: cloudProject }] : [],
      }),
    );
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
  }
  await routes(page, account);

  await page.setViewportSize({ width: 1194, height: 834 });
  await setupVault(page);
  const projectPath = await createProjectViaBrowser(page, 'East Chapel');
  const project = projectPath.split('/').at(-1)!;

  // Sync is in the project settings dialog; the currency is a project override in the inspector.
  const sync = page.getByRole('region', { name: 'Cloud sync' });
  await openProjectSettings(page);
  await sync.getByRole('button', { name: 'Enable editor sync' }).click();
  await expect(sync.getByRole('status')).toHaveText('Cloud copy saved');
  expect(head).toMatchObject({ epoch: initialEpoch, revision: 1 });
  await closeDialog(page);
  /** At the root, overrides the project's currency in the inspector. */
  const setCurrency = async (device: typeof page, currency: string) => {
    if (new URL(device.url()).pathname !== '/projects')
      await device.locator('[data-control-id="project.library"]').click();
    await inspect(device, 'East Chapel');
    await overrideRestoration(device, 'currency', currency);
  };
  const shownCurrency = (device: typeof page) =>
    device.locator('.browser-inspector [data-control-id$=".restoration.currency"]');
  /** From the root, the project's settings dialog with its sync panel. */
  const syncPanel = async (device: typeof page) => {
    await openItem(device, 'East Chapel');
    await openProjectSettings(device);
  };

  const secondContext = await browser.newContext({ baseURL: info.project.use.baseURL });
  const second = await secondContext.newPage();
  await routes(second, other);
  cloudProject = project;
  await setupVault(second);
  // The online-only project is listed at the root; opening it downloads it to this device.
  await expect(browserItem(second, 'East Chapel')).toContainText('Online only');
  await openItem(second, 'East Chapel');
  const secondSync = second.getByRole('region', { name: 'Cloud sync' });
  await openProjectSettings(second);
  await expect(secondSync.getByRole('status')).toHaveText('Cloud copy saved');
  await closeDialog(second);
  await setCurrency(second, 'EUR');
  await expect.poll(() => head).toMatchObject({ epoch: initialEpoch, revision: 2 });

  const editCurrency = async (currency: string) => {
    await setCurrency(page, currency);
    await expect(browserItem(page, 'East Chapel').locator('.browser-status')).toContainText(
      'Waiting to sync',
    );
  };
  const reconnect = async () => {
    disconnected = false;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await syncPanel(page);
    await sync.getByRole('button', { name: 'Review sync conflict' }).click();
  };

  disconnected = true;
  await editCurrency('USD');
  await editCurrency('GBP');
  await page.reload();
  await inspect(page, 'East Chapel');
  await expect(shownCurrency(page)).toHaveValue('GBP');
  await expect(browserItem(page, 'East Chapel').locator('.browser-status')).toContainText(
    'Waiting to sync',
  );
  await reconnect();
  await expect(sync.getByRole('region', { name: 'This device' })).toContainText(
    'East Chapel · GBP',
  );
  await expect(sync.getByRole('region', { name: 'Cloud copy' })).toContainText('East Chapel · EUR');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('editor-conflict-landscape.png'), fullPage: true });
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.screenshot({ path: info.outputPath('editor-conflict-portrait.png'), fullPage: true });
  await sync.getByRole('button', { name: 'Publish this device’s copy' }).click();
  await expect(sync.getByRole('status')).toHaveText('Cloud copy saved');
  expect(head).toMatchObject({ epoch: initialEpoch, revision: 3 });
  const oldHead = head!;
  await closeDialog(page);

  disconnected = true;
  await editCurrency('HUF');
  revoked = true;
  epoch = rotatedEpoch;
  await setCurrency(second, 'CHF');
  await syncPanel(second);
  await expect(secondSync.getByRole('button', { name: 'Review sync conflict' })).toBeVisible();
  await closeDialog(second);
  // The project is on this device: the root lists it once, not again as online only.
  await second.locator('[data-control-id="project.library"]').click();
  await browserReady(second);
  await expect(browserItem(second, 'East Chapel')).toHaveCount(1);
  await expect(browserItem(second, 'East Chapel')).not.toContainText('Online only');
  await reconnect();
  await expect(sync.getByRole('region', { name: 'This device' })).toContainText(
    'East Chapel · HUF',
  );
  await expect(sync.getByRole('region', { name: 'Cloud copy' })).toContainText('East Chapel · GBP');
  await sync.getByRole('button', { name: 'Use the cloud copy' }).click();
  await expect(sync.getByRole('status')).toHaveText('Cloud copy saved');
  await closeDialog(page);
  await page.locator('[data-control-id="project.library"]').click();
  await inspect(page, 'East Chapel');
  await expect(shownCurrency(page)).toHaveValue('GBP');
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
  // The rotated-out key still opens the head while encryption is off (aead.ts).
  expect(keys).toMatchObject({ oldKeyRejected: aead.enabled, forgotten: true });
  expect(JSON.parse(keys.text)).toMatchObject({ settings: { currency: 'GBP' } });
  await secondContext.close();
});
