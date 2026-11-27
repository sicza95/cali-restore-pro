import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  runItemAction,
  browserControl as control,
  browserItem,
  browserReady,
  createItem,
} from './project-browser';

test.use({ viewport: { width: 1194, height: 834 } });

test('item menus, inline rename, copy, archive filters and scoped modals', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        account: {
          id: '00000000-0000-4000-8000-000000000001',
          email: 'synthetic@example.test',
          state: 'active',
          role: 'member',
        },
      },
    }),
  );
  await page.route('**/api/v1/status', (route) => route.fulfill({ json: { status: 'ready' } }));
  await page.route('**/api/v1/hosted-projects', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/hosted-projects/*/visibility', (route) =>
    route.fulfill({ status: 404, json: { error: 'not_found' } }),
  );
  await page.goto('/projects');
  await browserReady(page);
  await createItem(page, 'Chapel');
  const item = browserItem(page, 'Chapel');
  await item.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'More actions' });
  await expect(menu).toBeVisible();
  await expect(control(menu, 'browser.menu.listed')).toHaveAttribute('aria-disabled', 'true');
  await expect(menu.getByRole('menuitem')).toHaveCount(9);
  await control(menu, 'browser.menu.rename').click();
  const input = control(page, 'browser.rename.input');
  await expect(input).toBeFocused();
  await expect(input).toHaveJSProperty('selectionStart', 0);
  await input.fill('Discarded');
  await input.press('Escape');
  await expect(item).toBeVisible();
  await item.focus();
  await item.press('Shift+F10');
  await control(menu, 'browser.menu.rename').click();
  await input.fill('');
  await input.press('Enter');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await input.fill('Renamed chapel');
  await input.press('Tab');
  await expect(browserItem(page, 'Renamed chapel')).toBeVisible();
  await browserItem(page, 'Renamed chapel').getByRole('button', { name: 'More actions' }).click();
  await control(page.getByRole('menu'), 'browser.menu.copy').click();
  await expect(browserItem(page, 'Renamed chapel (copy)')).toBeVisible();
  await browserItem(page, 'Renamed chapel').click();
  await runItemAction(page, 'archive');
  await expect(browserItem(page, 'Renamed chapel')).toHaveCount(0);
  await control(page, 'browser.show').click();
  await control(page, 'browser.show.archived').click();
  await expect(browserItem(page, 'Renamed chapel')).toBeVisible();
  await control(page, 'browser.show.offline').click();
  await expect(page.locator('[data-browser-item]')).toHaveCount(0);
  await control(page, 'browser.show.offline').click();
  await page.keyboard.press('Escape');
  await browserItem(page, 'Renamed chapel').click();
  await runItemAction(page, 'archive');
  await control(page, 'browser.actions.overflow').click();
  await expect(control(page, 'browser.menu.archive')).toHaveAccessibleName('Archive');
  await page.keyboard.press('Escape');
  await runItemAction(page, 'share');
  await expect(page.getByRole('dialog')).toContainText(
    'Sharing and downloads apply to the entire project',
  );
  await page.getByRole('tab', { name: 'Groups', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Invitations are individual');
  await page.screenshot({ path: info.outputPath('share-groups-1194.png') });
  await control(page.getByRole('dialog'), 'browser.dialog.close').click();
  await runItemAction(page, 'manage');
  await page.screenshot({ path: info.outputPath('manage-1194.png') });
  await control(page.getByRole('dialog'), 'browser.dialog.close').click();
  await runItemAction(page, 'reports');
  for (const tab of ['estimates', 'reports', 'outputs']) {
    await control(page.getByRole('dialog'), 'project.review.' + tab).click();
    await expect(control(page, 'project.review.' + tab)).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveURL(/\/projects$/);
  }
  await page.screenshot({ path: info.outputPath('reports-1194.png') });
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.screenshot({ path: info.outputPath('reports-834.png') });
  await control(page.getByRole('dialog'), 'browser.dialog.close').click();
  if ((await control(page, 'browser.inspector').getAttribute('aria-pressed')) !== 'true')
    await control(page, 'browser.inspector').click();
  await expect(page.locator('.browser-inspector')).toContainText('Server storage size');
  for (const size of [
    { width: 1194, height: 834 },
    { width: 834, height: 1194 },
  ]) {
    await page.setViewportSize(size);
    await browserItem(page, 'Renamed chapel').click({ button: 'right' });
    await expect(menu).toBeInViewport();
    await page.screenshot({ path: info.outputPath(`item-menu-${size.width}.png`) });
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', size.width);
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});

test('hosting starts synced, scoped dialogs retain context, and Info shows access roles', async ({
  page,
}, info) => {
  const account = '00000000-0000-4000-8000-000000000001';
  const epoch = '00000000-0000-4000-8000-000000000033';
  let hosted = false;
  let visibility = 'private';
  let head: Record<string, unknown> | null = null;
  let writes = 0;
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        account: { id: account, email: 'owner@example.test', state: 'active', role: 'member' },
        csrfToken: 'synthetic-csrf',
      },
    }),
  );
  await page.route('**/api/v1/status', (route) => route.fulfill({ json: { status: 'ready' } }));
  await page.route('**/api/v1/hosted-projects', (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/v1\/hosted-projects\/[^/]+$/, (route) => {
    hosted = true;
    return route.fulfill({ status: 204 });
  });
  await page.route('**/api/v1/hosted-projects/*/visibility', (route) => {
    if (route.request().method() === 'PATCH')
      visibility = route.request().postDataJSON().visibility;
    return route.fulfill(
      hosted
        ? { json: { visibility, version: 1, name: 'Chapel' } }
        : { status: 404, json: { error: 'not_found' } },
    );
  });
  await page.route('**/api/v1/hosted-projects/*/revision', (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      head = { ...body, revision: body.expected + 1 };
      writes++;
    }
    return route.fulfill({ json: { epoch, head } });
  });
  await page.route('**/api/v1/hosted-projects/*/storage', (route) =>
    route.fulfill({ json: { bytes: 1234567 } }),
  );
  await page.route('**/api/v1/hosted-projects/*/owners', (route) =>
    route.fulfill({ json: { owners: [{ id: account, email: 'owner@example.test', host: true }] } }),
  );
  await page.route('**/api/v1/hosted-projects/*/invitations', (route) =>
    route.fulfill({
      json: {
        invitations: [
          {
            id: 'grant',
            recipientId: 'estimator',
            email: 'estimator@example.test',
            state: 'active',
            coOwner: false,
            groupName: 'Estimator',
          },
        ],
      },
    }),
  );
  await page.route('**/api/v1/hosted-projects/*/hosting', (route) => {
    hosted = false;
    head = null;
    return route.fulfill({ status: 204 });
  });
  await page.goto('/projects');
  await createItem(page, 'Chapel');
  if ((await control(page, 'browser.inspector').getAttribute('aria-pressed')) === 'true')
    await control(page, 'browser.inspector').click();
  await expect(control(page, 'browser.more')).toHaveCount(0);
  await runItemAction(page, 'hosting');
  await expect(control(page, 'browser.action.hosting')).toHaveAttribute('aria-pressed', 'true');
  await expect(control(page, 'browser.action.sync')).toHaveAttribute('aria-pressed', 'true');
  await expect(browserItem(page, 'Chapel').locator('[data-status="synced"]')).toHaveCount(1);
  expect(writes).toBeGreaterThan(0);
  const status = browserItem(page, 'Chapel').locator('.browser-status');
  await expect(status.locator('.cr-composite-icon .fa-cloud')).toHaveCount(1);
  await expect(status.locator('.cr-composite-icon .fa-circle-check')).toHaveCount(1);
  await expect(browserItem(page, 'Chapel').locator('.browser-visibility .fa-lock')).toHaveCount(1);
  await runItemAction(page, 'listed');
  await expect(browserItem(page, 'Chapel').locator('.browser-visibility .fa-globe')).toHaveCount(1);
  await expect(control(page, 'browser.action.listed').locator('.fa-globe')).toHaveCount(1);
  const active = control(page, 'browser.action.hosting');
  expect(await active.locator('.cr-icon').evaluate((el) => getComputedStyle(el).color)).not.toBe(
    await active.evaluate((el) => getComputedStyle(el).color),
  );
  await runItemAction(page, 'sync');
  await expect(browserItem(page, 'Chapel').locator('[data-status="paused"]')).toHaveCount(1);
  await expect(status.locator('.cr-composite-icon .fa-circle-xmark')).toHaveCount(1);
  await browserItem(page, 'Chapel').click({ button: 'right' });
  await expect(page.getByRole('menuitemcheckbox')).toHaveText([
    'Server hosting',
    'Cloud sync',
    'Listed in organization',
  ]);
  await expect(control(page, 'browser.menu.listed').locator('.fa-globe')).toHaveCount(1);
  await expect(
    page.locator('[data-control-id="browser.menu.hosting"] .browser-switch'),
  ).toHaveAttribute('data-checked', 'true');
  await page.keyboard.press('Escape');
  if ((await control(page, 'browser.inspector').getAttribute('aria-pressed')) !== 'true')
    await control(page, 'browser.inspector').click();
  const panel = page.locator('.browser-inspector');
  await expect(panel.locator('.project-info-toggle-label .fa-globe')).toHaveCount(1);
  await expect(panel.locator('.project-access-role')).toHaveText(['Owner', 'Estimator']);
  await expect(panel.getByRole('heading', { name: 'Owners', exact: true })).toHaveCount(0);
  await expect(panel.getByText('1.23 MB', { exact: true })).toHaveAttribute('title', /1,234,567/);
  await expect(panel.locator('.project-info-toggle')).toHaveText([
    'Server hosting',
    'Cloud sync',
    'Listed in organization',
  ]);
  await runItemAction(page, 'manage');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('Manage');
  const before = await dialog.locator('.browser-dialog-context').boundingBox();
  await dialog.locator('.browser-dialog-content').evaluate((el) => {
    el.scrollTop = 500;
  });
  await expect
    .poll(() => dialog.locator('.browser-dialog-content').evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  expect(await dialog.locator('.browser-dialog-context').boundingBox()).toEqual(before);
  await page.screenshot({ path: info.outputPath('scoped-manage-1194.png') });
  await control(dialog, 'browser.dialog.close').click();
  await runItemAction(page, 'hosting');
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('Remove server hosting');
  await expect(dialog.locator('.browser-dialog-context')).toContainText('Chapel');
  await expect(control(dialog, 'browser.hosting.remove')).toHaveText('Remove server hosting');
  await expect(control(dialog, 'browser.hosting.remove')).toHaveClass(/cr-button--danger/);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('remove-hosting-1194.png') });
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.screenshot({ path: info.outputPath('remove-hosting-834.png') });
  await control(dialog, 'browser.hosting.remove').click();
  await expect(dialog).toHaveCount(0);
  await expect(browserItem(page, 'Chapel').locator('[data-status="local"]')).toHaveCount(1);
  await control(page, 'browser.view.list').click();
  const row = browserItem(page, 'Chapel');
  expect(
    await row.evaluate((element) => {
      const row = element.getBoundingClientRect();
      const more = element.querySelector('.browser-item-more')!.getBoundingClientRect();
      const sync = element.querySelector('.browser-item-status')!.getBoundingClientRect();
      const visibility = element.querySelector('.browser-item-visibility')!.getBoundingClientRect();
      const name = element.querySelector('.browser-item-name')!.getBoundingClientRect();
      return (
        Math.abs(row.right - more.right - 8) < 1 &&
        [more, sync, visibility].every(
          (box) => Math.abs(box.y + box.height / 2 - row.y - row.height / 2) < 1,
        ) &&
        name.right <= visibility.left &&
        visibility.right < sync.left &&
        sync.right < more.left
      );
    }),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath('thumbnail-list-834.png') });
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.screenshot({ path: info.outputPath('thumbnail-list-1194.png') });
});
