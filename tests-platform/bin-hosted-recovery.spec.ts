import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import type { BinCatalog } from '../src/platform/api';
import { aead } from '../src/platform/vault/aead';
import { enableHostingAndSync } from './invitation-hosting';
import {
  browserControl,
  browserItem,
  browserReady,
  createHierarchyViaBrowser,
  followTrail,
  openProjectSettings,
  runItemAction,
} from './project-browser';

async function deleteItem(page: Page, name: string) {
  await browserReady(page);
  await browserItem(page, name).click();
  await runItemAction(page, 'delete');
  await browserControl(page.getByRole('dialog'), 'browser.dialog.confirm').click();
}

test('a second device restores a surface with its deleted object, then the whole hosted project', async ({
  browser,
  baseURL,
}, info) => {
  const session = process.env.M06_BIN_RECOVERY_SESSION;
  test.skip(!session || aead.enabled, 'Requires a disposable owner session in plaintext mode');
  test.setTimeout(90_000);
  const source = await browser.newContext({ baseURL, viewport: { width: 1194, height: 834 } });
  const receiver = await browser.newContext({ baseURL, viewport: { width: 834, height: 1194 } });
  try {
    for (const device of [source, receiver])
      await device.addCookies([{ name: 'calirestore_session', value: session!, url: baseURL! }]);
    const original = await source.newPage();
    await original.goto('/projects');
    const created = await createHierarchyViaBrowser(original, {
      project: 'Recovery chapel',
      object: 'Nave',
      surface: 'West fresco',
    });
    await followTrail(original, created.projectPath);
    const settings = await openProjectSettings(original);
    await browserControl(settings, 'project.collaboration').click();
    await enableHostingAndSync(original);
    await browserControl(settings, 'browser.dialog.close').click();

    const orgs = await (await source.request.get('/api/v1/organisations')).json();
    const personal = orgs.organisations.find((org: { personal: boolean }) => org.personal).id;
    const binPath = `/organisations/${personal}/bin`;
    const catalog = async (context: BrowserContext = receiver) => {
      const response = await context.request.get(`/api/v1/organisations/${personal}/bin`);
      expect(response.ok()).toBe(true);
      return ((await response.json()) as BinCatalog).entries.filter(
        (row) => row.projectId === created.project,
      );
    };
    // Opening the Bin sends queued hosted deletions; one hosted change per project at a time.
    await original.goto(created.objectPath);
    await deleteItem(original, 'West fresco');
    await expect(browserItem(original, 'West fresco')).toHaveCount(0);
    await original.goto(binPath);
    await expect.poll(async () => (await catalog()).length).toBe(1);
    await original.goto(created.projectPath);
    await deleteItem(original, 'Nave');
    await expect(browserItem(original, 'Nave')).toHaveCount(0);
    await original.goto(binPath);
    await expect.poll(async () => (await catalog()).length).toBe(2);

    const device = await receiver.newPage();
    await device.goto(binPath);
    const surfaceRow = device.locator('.bin-row').filter({ hasText: 'West fresco' });
    await browserControl(surfaceRow, 'bin.restore').click();
    await expect(device.locator('.bin-page [aria-live="polite"]')).toHaveText(
      'Restored “West fresco” and the deleted object it belongs to.',
    );
    await expect(device.locator('.bin-empty')).toBeVisible();
    expect(await catalog()).toEqual([]);
    await device.goto(created.objectPath);
    await browserReady(device);
    await expect(browserItem(device, 'West fresco')).toHaveAttribute(
      'data-browser-item',
      created.surface,
    );

    // A whole hosted project deleted through the existing project trash appears in the Bin
    // under the name this device holds, and returns from there. The deleting device keeps
    // its own copy, so only the server state is awaited.
    await original.goto('/projects');
    await deleteItem(original, 'Recovery chapel');
    await expect.poll(async () => (await catalog()).map(({ legacy }) => legacy)).toEqual([true]);
    await device.goto(binPath);
    const projectRow = device.locator('.bin-row').filter({ hasText: 'Recovery chapel' });
    await expect(projectRow).toBeVisible();
    await device.screenshot({ path: info.outputPath('bin-project-portrait.png') });
    await original.goto(binPath);
    await expect(original.locator('.bin-row')).toHaveCount(1);
    await original.screenshot({ path: info.outputPath('bin-project-landscape.png') });
    await browserControl(projectRow, 'bin.restore').click();
    await expect(device.locator('.bin-page [aria-live="polite"]')).toHaveText(
      'Restored “Recovery chapel”.',
    );
    expect(await catalog()).toEqual([]);
    const account = (await (await receiver.request.get('/api/v1/auth/me')).json()).account.id;
    const revision = await receiver.request.get(
      `/api/v1/hosted-projects/${created.project}/revision`,
      { headers: { 'X-Sync-Account': account } },
    );
    expect(revision.ok()).toBe(true);
  } finally {
    await Promise.all([source.close(), receiver.close()]);
  }
});
