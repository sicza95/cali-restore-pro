import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { projectTable } from '../src/platform/vault/store';
import { chooseLanguage, expectPageTrail } from './app-navigation';
import { orientedJpeg } from './fixtures/images';
import {
  browserControl as control,
  browserItem,
  browserReady,
  createItem,
  followTrail,
  inspect,
  openProjectSettings,
  openRootSettings,
  overrideRestoration,
} from './project-browser';

const account = '00000000-0000-4000-8000-000000000001';
const names = (page: Page) => page.locator('[data-browser-item] .browser-item-name');
const selected = (page: Page) => page.locator('[data-browser-item][aria-selected="true"]');
const inspector = (page: Page) => page.locator('.browser-inspector');
const closeDialog = (page: Page) =>
  control(page.getByRole('dialog'), 'browser.dialog.close').click();
const projectRows = (page: Page) =>
  page.evaluate(async (table) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('calirestore-vault');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<number>((resolve, reject) => {
        const request = db.transaction(table).objectStore(table).count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }, projectTable);

test.use({ viewport: { width: 1194, height: 834 } });

test('the project browser: three levels, toolbar, find, gear, inspector, keyboard and delete', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        account: { id: account, email: 'restorer@example.test', state: 'active', role: 'member' },
      },
    }),
  );
  await page.route('**/api/v1/status', (route) => route.fulfill({ json: { status: 'ready' } }));
  await page.goto('/projects');
  await browserReady(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Projects');

  // New, then the new item is selected; single click selects.
  await createItem(page, 'North chapel');
  await createItem(page, 'east chapel');
  await expect(selected(page)).toHaveCount(1);

  // Sort: name ascending and descending; view: grid and list, remembered per level.
  await sortBy(page, 'name');
  await sortBy(page, 'asc');
  await expect(names(page)).toHaveText(['east chapel', 'North chapel']);
  await sortBy(page, 'desc');
  await expect(names(page)).toHaveText(['North chapel', 'east chapel']);
  await control(page, 'browser.view.list').click();
  await expect(control(page, 'browser.view.list')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.browser-list-header')).toBeVisible();
  await page.reload();
  await browserReady(page);
  await expect(control(page, 'browser.view.list')).toHaveAttribute('aria-pressed', 'true');
  await expect(names(page)).toHaveText(['North chapel', 'east chapel']);
  await control(page, 'browser.view.grid').click();
  await sortBy(page, 'asc');

  // Find: plain names, the bracketed key/value form, and an inline diagnostic.
  await control(page, 'browser.find').click();
  const query = control(page, 'browser.query');
  await expect(query).toBeFocused();
  await query.fill('north');
  await expect(names(page)).toHaveText(['North chapel']);
  await query.fill('["name":"east"]');
  await expect(names(page)).toHaveText(['east chapel']);
  await query.fill('["owner":"nobody"]');
  await expect(names(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'No matches' })).toBeVisible();
  await query.fill('modified:>2026-13-01');
  await expect(query).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('.browser-find .browser-diagnostics')).toContainText(
    'Use a date such as 2026-01-31',
  );
  await page.screenshot({ path: info.outputPath('browser-find-diagnostic.png') });
  await control(page, 'browser.query.clear').click();
  await expect(names(page)).toHaveText(['east chapel', 'North chapel']);
  await query.press('Escape');
  await expect(control(page, 'browser.find')).toBeFocused();

  // Keyboard: arrows move the selection, F2 renames, Enter opens.
  await browserItem(page, 'east chapel').click();
  await page.keyboard.press('ArrowRight');
  await expect(selected(page)).toContainText('North chapel');
  await page.keyboard.press('ArrowLeft');
  await expect(selected(page)).toContainText('east chapel');
  await page.keyboard.press('F2');
  const rename = page.getByRole('dialog');
  await expect(control(rename, 'browser.dialog.name')).toHaveValue('east chapel');
  await control(rename, 'browser.dialog.name').fill('East Chapel');
  await control(rename, 'browser.dialog.name').press('Enter');
  await expect(rename).toHaveCount(0);
  await expect(names(page)).toHaveText(['East Chapel', 'North chapel']);

  // Root gear: account defaults and branding, offline originals and the hosted trash.
  const root = await openRootSettings(page);
  for (const id of [
    'browser.settings.defaults',
    'browser.settings.branding',
    'projects.offline',
    'project.trash.open',
  ])
    await expect(control(root, id)).toBeVisible();
  await closeDialog(page);

  // Root inspector: a project currency override.
  await inspect(page, 'East Chapel');
  await overrideRestoration(page, 'currency', 'EUR');
  await expect(inspector(page)).toContainText('Overridden here');

  await browserItem(page, 'East Chapel').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  const projectPath = new URL(page.url()).pathname;
  await browserReady(page);
  await expectPageTrail(page, 'Projects › East Chapel');
  await expect(page.locator('[data-browser-item]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'This project has no objects' })).toBeVisible();

  // Object level: an object without photos, its inspector, override and reset to inherited.
  await createItem(page, 'North wall');
  await createItem(page, 'Spare');
  const tile = browserItem(page, 'North wall');
  await expect(tile.locator('.browser-item-status .browser-status-group')).toBeVisible();
  await expect(tile.locator('button')).toHaveCount(0);
  await expect(tile).not.toContainText('Originals available offline');
  await expect(tile.locator('.browser-originals')).toHaveCount(0);
  await inspect(page, 'North wall');
  await inspector(page)
    .locator('details.browser-inspector-section')
    .filter({ hasText: 'Restoration defaults' })
    .locator('summary')
    .click();
  await expect(inspector(page)).toContainText('No photos');
  await expect(inspector(page)).not.toContainText('Originals available offline');
  const units = inspector(page).locator('[data-control-id$=".restoration.units"]');
  const unitsOverride = inspector(page).locator('[data-control-id$=".restoration.units.override"]');
  await expect(units).toBeDisabled();
  await unitsOverride.check();
  // Shown at once and kept: the toggle does not flicker back while the change saves.
  await expect(unitsOverride).toBeChecked();
  await expect(units).toBeEnabled();
  await units.selectOption('imperial');
  await expect(units).toHaveValue('imperial');
  await expect(inspector(page)).toContainText('Overridden here');
  await inspector(page).locator('[data-control-id$=".restoration.units.reset"]').click();
  await expect(unitsOverride).not.toBeChecked();
  await expect(units).toHaveValue('metric');
  await expect(units).toBeDisabled();
  // Currency is the project's: read-only below it, inherited from the project override.
  await expect(inspector(page)).toContainText('EUR');
  await expect(inspector(page)).toContainText('Inherited from Project');

  // Cover: a styled button opens the hidden picker; the tile shows the dedicated cover.
  await inspector(page)
    .locator('details.browser-inspector-section')
    .filter({ hasText: 'Cover image' })
    .locator('summary')
    .click();
  const upload = control(inspector(page), 'browser.cover.upload');
  await expect(upload).toHaveJSProperty('tagName', 'BUTTON');
  await expect(upload).toHaveText('Upload cover image');
  // The native input (its "Choose file" text is never translated) is visually hidden.
  await expect(inspector(page).locator('input[type="file"]')).toBeHidden();
  const chooser = page.waitForEvent('filechooser');
  await upload.click();
  await (
    await chooser
  ).setFiles({ name: 'cover.jpg', mimeType: 'image/jpeg', buffer: orientedJpeg });
  await expect(tile.locator('img')).toHaveCount(1);
  await expect(tile.locator('img')).toHaveAttribute('src', /^blob:/);
  await expect(control(inspector(page), 'browser.cover.reset')).toBeVisible();

  // Project gear: sync, backup, sharing and the review links of the open project.
  const settings = await openProjectSettings(page);
  await expect(settings.getByRole('heading', { name: /East Chapel/ })).toBeVisible();
  for (const id of [
    'project.sync.enable',
    'project.backup',
    'project.collaboration',
    'project.review.estimates',
    'project.archive',
  ])
    await expect(control(settings, id)).toBeVisible();
  await closeDialog(page);

  // A child delete states its contents and that it cannot be undone.
  await browserItem(page, 'Spare').click();
  await control(page, 'browser.delete').click();
  const remove = page.getByRole('dialog');
  await expect(remove).toContainText('Contents: 0 objects, 0 surfaces.');
  await expect(remove).toContainText('This cannot be undone.');
  await control(remove, 'browser.dialog.confirm').click();
  await expect(browserItem(page, 'Spare')).toHaveCount(0);

  // Surface level, the trail and Alt+Up back to the objects.
  await browserItem(page, 'North wall').dblclick();
  await expect(page).toHaveURL(new RegExp(projectPath + '/objects/[0-9a-f-]{36}$'));
  await expectPageTrail(page, 'Projects › East Chapel › North wall');
  await createItem(page, 'Upper plaster');
  await expect(control(page, 'browser.settings')).toHaveAccessibleName('Project settings');
  await browserItem(page, 'Upper plaster').focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(page).toHaveURL(new RegExp(projectPath + '$'));

  // HU at 1194 with the inspector open: "Új objektum" stays on one line in New.
  await showInspectorOn(page, 'North wall');
  await chooseLanguage(page, 'hu');
  const label = control(page, 'browser.new').locator('.browser-action-label');
  await expect(label).toHaveText('Új objektum');
  await expect.poll(() => label.evaluate((node) => node.getClientRects().length)).toBe(1);
  const fits = await page.evaluate(() => {
    const bar = document.querySelector('.browser-toolbar')!.getBoundingClientRect();
    return [...document.querySelectorAll('.browser-toolbar > *')].every((node) => {
      const box = node.getBoundingClientRect();
      return box.right <= bar.right + 0.5 && box.height <= 46;
    });
  });
  expect(fits).toBe(true);
  for (const id of ['browser.rename', 'browser.delete', 'browser.find', 'browser.inspector'])
    await expect(control(page, id)).toHaveAccessibleName(/\S/);
  await page.screenshot({ path: info.outputPath('browser-objects-hu-1194.png') });
  await page.setViewportSize({ width: 834, height: 1194 });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 834);
  await page.screenshot({ path: info.outputPath('browser-objects-hu-834.png'), fullPage: true });
  await page.setViewportSize({ width: 1194, height: 834 });
  await chooseLanguage(page, 'en');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // Root: a project that was never hosted is deleted for good, after a clear warning.
  await followTrail(page, '/projects');
  await browserItem(page, 'East Chapel').click();
  await control(page, 'browser.delete').click();
  const keep = page.getByRole('dialog');
  await expect(keep).toContainText('Contents: 1 objects, 1 surfaces.');
  await control(keep, 'browser.dialog.cancel').click();
  expect(await projectRows(page)).toBe(2);
  await browserItem(page, 'North chapel').click();
  await control(page, 'browser.delete').click();
  const local = page.getByRole('dialog');
  await expect(local).toContainText('This project is only on this device, so it has no trash.');
  await expect(local).toContainText('This cannot be undone.');
  await expect(control(local, 'browser.dialog.confirm')).toHaveText('Delete');
  await page.screenshot({ path: info.outputPath('browser-local-delete.png') });
  await control(local, 'browser.dialog.confirm').click();
  await expect(local).toHaveCount(0);
  await expect(names(page)).toHaveText(['East Chapel']);
  await expect.poll(() => projectRows(page)).toBe(1);
  await page.reload();
  await browserReady(page);
  await expect(names(page)).toHaveText(['East Chapel']);
  expect(errors).toEqual([]);
});

async function showInspectorOn(page: Page, name: string) {
  await inspect(page, name);
  await expect(inspector(page)).toBeVisible();
}

/** One choice of the Sort menu, which closes after each choice. */
async function sortBy(page: Page, choice: string) {
  await control(page, 'browser.sort').click();
  await control(page, 'browser.sort.' + choice).click();
  await expect(control(page, 'browser.sort.' + choice)).toHaveCount(0);
}
