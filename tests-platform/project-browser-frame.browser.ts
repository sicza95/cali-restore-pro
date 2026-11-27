import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expectPageTrail } from './app-navigation';
import {
  browserControl as control,
  browserItem,
  browserReady,
  createItem,
} from './project-browser';
const account = '00000000-0000-4000-8000-000000000001';

test('browser frame stays put while fixed square tiles and list rows scroll', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        account: { id: account, email: 'restorer@example.test', state: 'active', role: 'member' },
      },
    }),
  );
  await page.route('**/api/v1/status', (route) => route.fulfill({ json: { status: 'ready' } }));
  await page.route('**/api/v1/hosted-projects', (route) => route.fulfill({ json: [] }));
  await page.goto('/projects');
  await browserReady(page);
  for (let index = 0; index < 20; index++) await createItem(page, `Chapel ${index + 1}`);
  await expect(page.locator('.app-breadcrumbs li')).toHaveText(['Projects']);
  await expect(control(page, 'browser.import')).toBeVisible();
  await expect(control(page, 'browser.import').locator('.fa-upload')).toHaveCount(1);
  await expect(page.locator('.account-footer')).toHaveCount(0);
  const status = page.locator('.app-bar .app-connection');
  await expect(status).toHaveText('Online');
  await status.click();
  await expect(status).toHaveText('Online');

  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const size of [
      { width: 1194, height: 834 },
      { width: 834, height: 1194 },
    ]) {
      await page.setViewportSize(size);
      await control(page, 'browser.view.grid').click();
      await expect
        .poll(() =>
          page
            .locator('.browser-tile')
            .first()
            .evaluate((el) => {
              const rect = el.getBoundingClientRect();
              return [rect.width, rect.height];
            }),
        )
        .toEqual([176, 176]);
      await expect(page.locator('.browser-tile .browser-preview .fa-folder').first()).toBeVisible();
      await expect(page.locator('.browser-tile button')).toHaveCount(20);
      await expect(page.locator('.browser-tile .browser-item-meta')).toHaveCount(0);
      const frame = page.locator('.browser-content');
      await expect.poll(() => frame.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
      const crumb = page.locator('.app-breadcrumbs');
      const toolbar = page.locator('.browser-toolbar');
      const before = { crumb: await crumb.boundingBox(), toolbar: await toolbar.boundingBox() };
      await frame.hover();
      await page.mouse.wheel(0, 600);
      await expect.poll(() => frame.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      expect(await crumb.boundingBox()).toEqual(before.crumb);
      expect(await toolbar.boundingBox()).toEqual(before.toolbar);
      expect(
        await page.evaluate(() => ({
          top: window.scrollY,
          height: document.documentElement.scrollHeight,
          width: document.documentElement.scrollWidth,
        })),
      ).toEqual({ top: 0, height: size.height, width: size.width });
      await frame.evaluate((el) => {
        el.scrollTop = 0;
      });
      await page.screenshot({ path: info.outputPath(`browser-frame-${size.width}-${theme}.png`) });
      await control(page, 'browser.view.list').click();
      await expect(page.locator('.browser-row').first()).toBeVisible();
      await frame.hover();
      await page.mouse.wheel(0, 600);
      await expect.poll(() => frame.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      expect(await crumb.boundingBox()).toEqual(before.crumb);
      expect(await toolbar.boundingBox()).toEqual(before.toolbar);
    }
  }
  await control(page, 'browser.view.grid').click();
  await browserItem(page, 'Chapel 1').focus();
  await page.keyboard.press('Enter');
  await browserReady(page);
  await expectPageTrail(page, 'Projects › Chapel 1');
  await createItem(page, 'North wall');
  await browserItem(page, 'North wall').dblclick();
  await browserReady(page);
  await expectPageTrail(page, 'Projects › Chapel 1 › North wall');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('signed-in pages share a fixed top bar, balanced insets and current-page scrolling', async ({
  page,
}, info) => {
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        account: { id: account, email: 'restorer@example.test', state: 'active', role: 'member' },
      },
    }),
  );
  await page.route('**/api/v1/status', (route) => route.fulfill({ json: { status: 'ready' } }));
  await page.route('**/api/v1/hosted-projects', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/organisations', (route) =>
    route.fulfill({ json: { organisations: [], invitations: [] } }),
  );
  for (const size of [
    { width: 1194, height: 834 },
    { width: 834, height: 1194 },
  ]) {
    await page.setViewportSize(size);
    for (const path of ['/projects', '/organisations', '/settings/account']) {
      await page.goto(path);
      await expect(page.locator('.app-bar')).toBeVisible();
      // The menu control is supplied by the shell; hide it via its accessible name.
      const menu = page.locator('.app-bar-icon');
      if ((await menu.getAttribute('aria-pressed')) === 'true') await menu.click();
      await expect
        .poll(() => page.locator('.app-bar').evaluate((el) => el.getBoundingClientRect().height))
        .toBe(60);
      const geometry = await page.locator('.account-content').evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return {
          left: rect.left,
          right: innerWidth - rect.right,
          bottom: innerHeight - rect.bottom,
          padding: getComputedStyle(el).padding,
        };
      });
      expect(geometry).toEqual({ left: 8, right: 8, bottom: 8, padding: '0px' });
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(size.height);
      if (path === '/projects') {
        await browserReady(page);
        const layout = await page.locator('.browser-layout').evaluate((el) => {
          const rect = el.getBoundingClientRect();
          const panel = document.querySelector('.account-content')!.getBoundingClientRect();
          return {
            left: rect.left - panel.left,
            right: panel.right - rect.right,
            padding: getComputedStyle(el).padding,
            margin: getComputedStyle(el).margin,
          };
        });
        expect(layout).toEqual({ left: 1, right: 1, padding: '0px', margin: '0px' });
      }
      if (path === '/organisations')
        await expect(page.locator('.organisations-page')).toBeVisible();
      if (path === '/settings/account') await expect(page.locator('.settings-page')).toBeVisible();
      await page.screenshot({
        path: info.outputPath(`frame-${path.split('/').at(-1)}-${size.width}.png`),
      });
    }
    const currentPage = page.locator('.account-content');
    await expect
      .poll(() => currentPage.evaluate((el) => el.scrollHeight > el.clientHeight))
      .toBe(true);
    await currentPage.hover();
    await page.mouse.wheel(0, 600);
    await expect.poll(() => currentPage.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  }
});
