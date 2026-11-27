import { expect, test } from '@playwright/test';
import { browserControl as control, browserItem, createItem } from './project-browser';

test('toolbar moves a suffix into overflow and keeps corner indicators inside each item', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        account: { id: '00000000-0000-4000-8000-000000000011', email: 'toolbar@example.test' },
      },
    }),
  );
  await page.route('**/api/v1/status', (route) => route.fulfill({ json: { status: 'ready' } }));
  await page.route('**/api/v1/hosted-projects', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/hosted-projects/*/visibility', (route) =>
    route.fulfill({ status: 404, json: { error: 'not_found' } }),
  );
  await page.goto('/projects');
  await createItem(page, 'Toolbar project');
  await page.evaluate(() => document.fonts.ready);
  const expected = [
    'download',
    'hosting',
    'sync',
    'listed',
    'rename',
    'delete',
    'copy',
    'share',
    'manage',
    'reports',
    'archive',
  ];
  const visible = page.locator('.browser-item-actions > button');
  await expect(visible).toHaveCount(expected.length);
  await expect(page.locator('.browser-toolbar .fa-gear')).toHaveCount(0);
  await expect(control(page, 'browser.import').locator('.fa-upload')).toHaveCount(1);
  let firstHidden: string[] | undefined;
  let previous = expected.length;
  let previousWidth = Infinity;
  const counts = new Set<number>();
  for (const width of [...Array.from({ length: 41 }, (_, i) => 1800 - i * 24), 834]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const snapshot = await page.locator('.browser-toolbar').evaluate((bar) => {
      const b = bar.getBoundingClientRect();
      return {
        toolbarWidth: bar.clientWidth,
        ids: Array.from(bar.querySelectorAll('.browser-item-actions > button')).map((node) =>
          node.getAttribute('data-control-id')!.replace(/^browser\.(action\.)?/, ''),
        ),
        fits: Array.from(bar.querySelectorAll<HTMLElement>('.browser-action'))
          .filter((el) => el.offsetParent)
          .every((el) => {
            const r = el.getBoundingClientRect();
            return r.left >= b.left && r.right <= b.right && r.top >= b.top && r.bottom <= b.bottom;
          }),
      };
    });
    const { ids, toolbarWidth } = snapshot;
    expect(ids).toEqual(expected.slice(0, ids.length));
    if (toolbarWidth <= previousWidth)
      expect(
        ids.length,
        JSON.stringify({ width, toolbarWidth, previousWidth }),
      ).toBeLessThanOrEqual(previous);
    previousWidth = toolbarWidth;
    previous = ids.length;
    counts.add(expected.length - ids.length);
    if (ids.length < expected.length) firstHidden ??= expected.slice(ids.length);
    expect(snapshot.fits).toBe(true);
  }
  expect(firstHidden).toEqual(['reports', 'archive']);
  expect([...counts]).toEqual(expect.arrayContaining([0, 2, 3, 4]));
  await control(page, 'browser.actions.overflow').click();
  await expect(control(page, 'browser.menu.manage')).toBeVisible();
  await page.keyboard.press('End');
  await expect(control(page, 'browser.settings')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(control(page, 'browser.actions.overflow')).toBeFocused();
  const item = browserItem(page, 'Toolbar project');
  const corners = await item.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const left = el.querySelector('.browser-item-visibility')!.getBoundingClientRect();
    const right = el.querySelector('.browser-item-status')!.getBoundingClientRect();
    return (
      left.left >= r.left &&
      left.top > r.top + r.height / 2 &&
      right.right <= r.right &&
      right.top > r.top + r.height / 2 &&
      left.right < right.left
    );
  });
  expect(corners).toBe(true);
  await page.screenshot({ path: info.outputPath('toolbar-834.png') });
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.screenshot({ path: info.outputPath('toolbar-1194.png') });
});
