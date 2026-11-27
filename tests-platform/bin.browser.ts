import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
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
}
const rows = (page: Page) => page.locator('.bin-row');
const row = (page: Page, name: string) => rows(page).filter({ hasText: name });

test('deleted work moves to the Bin and comes back with its contents', async ({ page }, info) => {
  test.setTimeout(120_000);
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
