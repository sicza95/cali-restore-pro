import { expect, test } from '@playwright/test';
import type { BinCatalog } from '../src/platform/api';
import { aead } from '../src/platform/vault/aead';
import { chooseLanguage } from './app-navigation';
import { enableHostingAndSync } from './invitation-hosting';
import { orientedJpeg } from './fixtures/images';
import {
  browserControl,
  browserItem,
  browserReady,
  createHierarchyViaBrowser,
  followTrail,
  inspect,
  openProjectSettings,
  overrideRestoration,
  runItemAction,
} from './project-browser';

test('a second device restores hosted work and reconciles a lost receipt after reload', async ({
  browser,
  baseURL,
}, info) => {
  const session = process.env.M06_BIN_SESSION;
  test.skip(!session || aead.enabled, 'Requires a disposable owner session in plaintext mode');
  test.setTimeout(60_000);
  const source = await browser.newContext({ baseURL, viewport: { width: 1194, height: 834 } });
  const receiver = await browser.newContext({ baseURL, viewport: { width: 834, height: 1194 } });
  try {
    for (const device of [source, receiver])
      await device.addCookies([{ name: 'calirestore_session', value: session!, url: baseURL! }]);
    const original = await source.newPage();
    await original.goto('/projects');
    const created = await createHierarchyViaBrowser(original, {
      project: 'Hosted Bin chapel',
      object: 'Choir loft',
      surface: 'East plaster',
    });
    await original.getByLabel('Original file', { exact: true }).setInputFiles({
      name: 'bin-original.jpg',
      mimeType: 'image/jpeg',
      buffer: orientedJpeg,
    });
    await original.getByRole('button', { name: 'Attach original', exact: true }).click();
    await expect(original.locator('.project-originals')).toContainText('bin-original.jpg');
    await followTrail(original, created.projectPath);
    const settings = await openProjectSettings(original);
    await browserControl(settings, 'project.collaboration').click();
    await enableHostingAndSync(original);
    await browserControl(settings, 'browser.dialog.close').click();

    const orgs = await (await source.request.get('/api/v1/organisations')).json();
    const personal = orgs.organisations.find((org: { personal: boolean }) => org.personal).id;
    const catalogPath = `/api/v1/organisations/${personal}/bin`;
    const catalog = async () => {
      const response = await receiver.request.get(catalogPath);
      expect(response.ok()).toBe(true);
      return ((await response.json()) as BinCatalog).entries;
    };
    await browserItem(original, 'Choir loft').click();
    await runItemAction(original, 'delete');
    await browserControl(original.getByRole('dialog'), 'browser.dialog.confirm').click();
    await expect(browserItem(original, 'Choir loft')).toHaveCount(0);
    await original.goto(`/organisations/${personal}/bin`);
    await expect
      .poll(async () => (await catalog()).filter((row) => row.projectId === created.project))
      .toHaveLength(1);
    const entry = (await catalog()).find((row) => row.projectId === created.project)!;
    expect(entry).toMatchObject({ entityId: created.object, entityKind: 'object', version: 1 });

    const device = await receiver.newPage();
    let committed = 0;
    await device.route('**/api/v1/hosted-projects/*/bin/operations', async (route) => {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      expect(await response.json()).toMatchObject({ versions: { [entry.deletionId]: 2 } });
      committed++;
      await route.abort('internetdisconnected');
    });
    await device.goto(`/organisations/${personal}/bin`);
    await browserControl(
      device.locator('.bin-row').filter({ hasText: 'Choir loft' }),
      'bin.restore',
    ).click();
    await expect.poll(() => committed).toBeGreaterThan(0);
    expect((await catalog()).find((row) => row.deletionId === entry.deletionId)).toBeUndefined();
    await device.unroute('**/api/v1/hosted-projects/*/bin/operations');
    await device.reload();
    await expect(device.locator('.bin-empty')).toBeVisible();
    await device.goto(created.objectPath);
    await browserReady(device);
    await expect(browserItem(device, 'East plaster')).toHaveAttribute(
      'data-browser-item',
      created.surface,
    );
    await device.goto(created.surfacePath);
    await expect(device.locator('.project-originals')).toContainText('bin-original.jpg');
    const revision = await receiver.request.get(
      `/api/v1/hosted-projects/${created.project}/revision`,
      {
        headers: {
          'X-Sync-Account': (await (await receiver.request.get('/api/v1/auth/me')).json()).account
            .id,
        },
      },
    );
    expect(await revision.json()).toMatchObject({ head: { revision: 3 }, binRevisionFloor: 3 });

    // The original device still has the graph from before the restore. A normal edit
    // must not publish that graph over the restored object.
    await original.goto('/projects');
    await inspect(original, 'Hosted Bin chapel');
    await overrideRestoration(original, 'currency', 'CHF');
    await original.goto(created.projectPath);
    const conflict = await openProjectSettings(original);
    await browserControl(conflict, 'project.sync.review').click();
    await expect(browserControl(conflict, 'project.sync.keep-local')).toBeDisabled();
    await expect(conflict.getByRole('region', { name: 'This device' })).toContainText('CHF');
    await expect(conflict.getByRole('region', { name: 'Cloud copy' })).toContainText('Choir loft');
    await browserControl(conflict, 'project.sync.keep-cloud').scrollIntoViewIfNeeded();
    await original.screenshot({ path: info.outputPath('bin-sync-landscape.png') });
    await browserControl(conflict, 'browser.dialog.close').click();
    await chooseLanguage(original, 'hu');
    await original.setViewportSize({ width: 834, height: 1194 });
    await openProjectSettings(original);
    await browserControl(conflict, 'project.sync.review').click();
    await expect(conflict).toContainText(
      'A szinkronizálás folytatásához használd a felhőmásolatot.',
    );
    await browserControl(conflict, 'project.sync.keep-cloud').scrollIntoViewIfNeeded();
    await original.screenshot({ path: info.outputPath('bin-sync-portrait.png') });
    await browserControl(conflict, 'project.sync.keep-cloud').click();
    await expect(
      conflict.getByRole('region', { name: 'Felhőszinkronizálás' }).getByRole('status'),
    ).toHaveText('Felhőbe mentve');
    await browserControl(conflict, 'browser.dialog.close').click();
    await expect(browserItem(original, 'Choir loft')).toHaveAttribute(
      'data-browser-item',
      created.object,
    );
  } finally {
    await Promise.all([source.close(), receiver.close()]);
  }
});
