import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
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
  await control(page, 'browser.more').click();
  await control(page.getByRole('menu'), 'browser.menu.copy').click();
  await expect(browserItem(page, 'Renamed chapel (copy)')).toBeVisible();
  await browserItem(page, 'Renamed chapel').click();
  await control(page, 'browser.action.archive').click();
  await expect(browserItem(page, 'Renamed chapel')).toHaveCount(0);
  await control(page, 'browser.show').click();
  await control(page, 'browser.show.archived').click();
  await expect(browserItem(page, 'Renamed chapel')).toBeVisible();
  await control(page, 'browser.show.offline').click();
  await expect(page.locator('[data-browser-item]')).toHaveCount(0);
  await control(page, 'browser.show.offline').click();
  await page.keyboard.press('Escape');
  await browserItem(page, 'Renamed chapel').click();
  await control(page, 'browser.action.archive').click();
  await expect(control(page, 'browser.action.archive')).toHaveAccessibleName('Archive');
  await control(page, 'browser.action.share').click();
  await expect(page.getByRole('dialog')).toContainText(
    'Sharing and downloads apply to the entire project',
  );
  await page.getByRole('tab', { name: 'Groups', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Invitations are individual');
  await page.screenshot({ path: info.outputPath('share-groups-1194.png') });
  await control(page.getByRole('dialog'), 'browser.dialog.close').click();
  await control(page, 'browser.action.manage').click();
  await page.screenshot({ path: info.outputPath('manage-1194.png') });
  await control(page.getByRole('dialog'), 'browser.dialog.close').click();
  await control(page, 'browser.action.reports').click();
  for (const tab of ['estimates', 'reports', 'outputs']) {
    await control(page.getByRole('dialog'), 'project.review.' + tab).click();
    await expect(control(page, 'project.review.' + tab)).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveURL(/\/projects$/);
  }
  await page.screenshot({ path: info.outputPath('reports-1194.png') });
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.screenshot({ path: info.outputPath('reports-834.png') });
  await control(page.getByRole('dialog'), 'browser.dialog.close').click();
  await control(page, 'browser.action.info').click();
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
