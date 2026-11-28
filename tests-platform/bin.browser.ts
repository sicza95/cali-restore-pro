import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { BinCatalogEntry } from '../src/platform/api';
import { plaintextCode } from '../src/platform/vault/aead';
import { importCode, seal } from '../src/platform/vault/crypto';
import { chooseLanguage } from './app-navigation';
import {
  browserControl as control,
  browserItem,
  browserReady,
  createHierarchyViaBrowser,
  followTrail,
} from './project-browser';

const account = '00000000-0000-4000-8000-000000000001';
const personal = '00000000-0000-4000-8000-0000000000aa';

async function signedIn(page: Page) {
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        account: { id: account, email: 'restorer@example.test', state: 'active', role: 'member' },
        csrfToken: 'synthetic-csrf',
      },
    }),
  );
  await page.route('**/api/v1/status', (route) => route.fulfill({ json: { status: 'ready' } }));
  await page.route('**/api/v1/events', (route) =>
    route.fulfill({ headers: { 'Content-Type': 'text/event-stream' }, body: 'retry: 600000\n\n' }),
  );
  await page.route('**/api/v1/organisations', (route) =>
    route.fulfill({
      json: {
        organisations: [{ id: personal, name: '', personal: true, role: 'admin', memberCount: 1 }],
        invitations: [],
      },
    }),
  );
  await page.route('**/api/v1/organisations/*/bin', (route) =>
    route.fulfill({ json: { entries: [], next: null, asOf: new Date().toISOString() } }),
  );
}
const rows = (page: Page) => page.locator('.bin-row');
const row = (page: Page, name: string) => rows(page).filter({ hasText: name });

test('deleted work moves to the Bin and comes back with its contents', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1194, height: 834 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signedIn(page);
  await page.goto('/projects');
  await browserReady(page);
  const created = await createHierarchyViaBrowser(page, {
    project: 'Chapel',
    object: 'Altar',
    surface: 'North wall',
  });

  // Deleting an object says it is recoverable and moves it to the Bin.
  await followTrail(page, created.projectPath);
  await browserItem(page, 'Altar').click();
  await control(page, 'browser.delete').click();
  const remove = page.getByRole('dialog');
  await expect(remove).toContainText('move to the Bin on this device');
  await expect(remove).not.toContainText('cannot be undone');
  await expect(control(remove, 'browser.dialog.confirm')).toHaveText('Move to trash');
  await control(remove, 'browser.dialog.confirm').click();
  await expect(browserItem(page, 'Altar')).toHaveCount(0);

  // The Bin lists it with its original place; Enter opens read-only Info.
  await page.goto(`/organisations/${personal}/bin`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bin');
  await expect(page.getByRole('navigation', { name: 'Breadcrumbs' })).toContainText('Personal');
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, 'Altar')).toContainText('Object · Chapel');
  await expect(row(page, 'Altar')).toContainText('30 days left');
  await row(page, 'Altar').focus();
  await page.keyboard.press('Enter');
  const details = page.getByRole('dialog');
  await expect(details).toContainText('Recoverable until');
  await expect(details.locator('input, [contenteditable]')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('bin-info-1194.png') });
  await page.keyboard.press('Escape');
  await expect(details).toHaveCount(0);
  await expect(row(page, 'Altar')).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // Restore puts the object back with its surface and original identity.
  await control(row(page, 'Altar'), 'bin.restore').click();
  await expect(page.getByRole('status').filter({ hasText: 'Restored “Altar”.' })).toHaveCount(1);
  await expect(page.locator('.bin-empty')).toHaveText('The Bin is empty.');
  await page.goto(created.objectPath);
  await browserReady(page);
  await expect(browserItem(page, 'North wall')).toHaveCount(1);

  // A never-hosted project also goes to the Bin; permanent deletion confirms and cascades.
  await followTrail(page, created.projectPath);
  await browserItem(page, 'Altar').click();
  await control(page, 'browser.delete').click();
  await control(page.getByRole('dialog'), 'browser.dialog.confirm').click();
  await followTrail(page, '/projects');
  await browserItem(page, 'Chapel').click();
  await control(page, 'browser.delete').click();
  await expect(page.getByRole('dialog')).toContainText(
    'moves with its photos, estimate and report to the Bin',
  );
  await control(page.getByRole('dialog'), 'browser.dialog.confirm').click();
  await expect(browserItem(page, 'Chapel')).toHaveCount(0);
  await page.goto(`/organisations/${personal}/bin`);
  await expect(rows(page)).toHaveCount(2);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: info.outputPath('bin-list-dark-1194.png') });
  await page.setViewportSize({ width: 834, height: 1194 });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 834);
  await page.screenshot({ path: info.outputPath('bin-list-dark-834.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.screenshot({ path: info.outputPath('bin-list-light-834.png'), fullPage: true });
  await page.setViewportSize({ width: 1194, height: 834 });
  await control(page.getByLabel('Project: Chapel', { exact: true }), 'bin.purge').click();
  const purge = page.getByRole('dialog');
  await expect(purge).toContainText('One more item of this project in the Bin is removed with it.');
  await expect(purge).toContainText('This cannot be undone.');
  await page.screenshot({ path: info.outputPath('bin-purge-1194.png') });
  await control(purge, 'bin.purge.confirm').click();
  await expect(purge).toHaveCount(0);
  await expect(page.locator('.bin-empty')).toHaveText('The Bin is empty.');
  await page.reload();
  await expect(page.locator('.bin-empty')).toHaveText('The Bin is empty.');
  await page.goto('/projects');
  await browserReady(page);
  await expect(browserItem(page, 'Chapel')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the hosted Bin loads every catalog page and reports an incomplete refresh', async ({
  page,
}, info) => {
  await signedIn(page);
  const cursor = 'next-page';
  const asOf = new Date().toISOString();
  const retained = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const projectId = '00000000-0000-4000-8000-0000000000bb';
  const project: BinCatalogEntry = {
    deletionId: projectId,
    projectId,
    entityKind: 'project',
    entityId: projectId,
    state: 'retained',
    version: 1,
    deletedAt: asOf,
    deletedBy: null,
    recoverUntil: retained,
    manifestSchema: 0,
    manifestSha256: '',
    coverageMissing: ['journals'],
    coverageLegacy: true,
    sourceRevision: 0,
    logicalBytes: 0,
    chunkCount: 0,
    display: null,
    legacy: true,
    capabilities: {
      read: { allowed: true },
      restore: { allowed: false, reason: 'hosting_unavailable' },
      purge: { allowed: true },
      device_export: { allowed: false },
    },
  };
  const child: BinCatalogEntry = {
    ...project,
    deletionId: '00000000-0000-4000-8000-0000000000cc',
    entityKind: 'object',
    entityId: '00000000-0000-4000-8000-0000000000dd',
    legacy: false,
    coverageLegacy: false,
    coverageMissing: [],
    manifestSchema: 1,
    logicalBytes: 420,
  };
  const { salt, ciphertext } = await seal(
    await importCode(plaintextCode),
    projectId,
    `bin:${child.deletionId}:display`,
    JSON.stringify({ name: 'Altar', path: ['Chapel'] }),
  );
  child.display = { salt, ciphertext };
  let unavailable = false;
  let purged = false;
  await page.route(`**/api/v1/hosted-projects/${projectId}/bin/operations`, (route) => {
    expect(route.request().headers()['x-csrf-token']).toBe('synthetic-csrf');
    expect(route.request().postDataJSON()).toMatchObject({
      intent: 'purge',
      deletionIds: [child.deletionId],
      expectedVersions: { [child.deletionId]: child.version },
      head: null,
    });
    purged = true;
    return route.fulfill({ json: { versions: { [child.deletionId]: 2 }, head: null } });
  });
  await page.route(
    (url) => url.pathname === `/api/v1/organisations/${personal}/bin`,
    (route) => {
      const next = new URL(route.request().url()).searchParams.get('before');
      if (next === cursor && unavailable) return route.fulfill({ status: 503 });
      return route.fulfill({
        json:
          next === cursor
            ? { entries: purged ? [] : [child], next: null, asOf }
            : { entries: [project], next: cursor, asOf },
      });
    },
  );
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto(`/organisations/${personal}/bin`);
  await expect(rows(page)).toHaveCount(2);
  await expect(row(page, 'Altar')).toContainText('Object · Chapel');
  await expect(row(page, 'Deleted project')).toContainText('Original place unavailable');
  await expect(control(row(page, 'Deleted project'), 'bin.restore')).toHaveAttribute(
    'title',
    'Server hosting is not available for this project.',
  );
  await expect(control(row(page, 'Altar'), 'bin.purge')).toBeEnabled();
  await expect(control(row(page, 'Altar'), 'bin.restore')).toBeDisabled();
  await page.screenshot({ path: info.outputPath('hosted-bin-1194.png') });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: info.outputPath('hosted-bin-dark-1194.png') });
  await page.setViewportSize({ width: 834, height: 1194 });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 834);
  await page.screenshot({ path: info.outputPath('hosted-bin-834.png') });
  await control(row(page, 'Deleted project'), 'bin.info').click();
  await expect(page.getByRole('dialog')).toContainText('Some saved content was unavailable');
  await page.keyboard.press('Escape');
  unavailable = true;
  await page.reload();
  await expect(
    page.getByRole('status').filter({ hasText: 'Hosted items could not be loaded' }),
  ).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  await expect(page.locator('.bin-empty')).toHaveCount(0);
  unavailable = false;
  await control(page, 'bin.retry').click();
  await expect(rows(page)).toHaveCount(2);
  await chooseLanguage(page, 'hu');
  await expect(row(page, 'Altar')).toContainText('Objektum · Chapel');
  await page.screenshot({ path: info.outputPath('hosted-bin-hu-834.png') });
  await control(row(page, 'Altar'), 'bin.purge').click();
  await control(page.getByRole('dialog'), 'bin.purge.confirm').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row(page, 'Altar')).toHaveCount(0);
  await expect(rows(page)).toHaveCount(1);
});
