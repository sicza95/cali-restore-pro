import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('production shell connects through the real same-origin API in both themes and orientations', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    for (const viewport of [
      { width: 1194, height: 834 },
      { width: 834, height: 1194 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('CaliRestore Pro');
      await expect(page.getByRole('status')).toHaveText('Connected');
      await expect(page.locator('body')).toHaveAttribute('data-theme', colorScheme);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({ path: info.outputPath(`${viewport.width}-${colorScheme}.png`) });
    }
  }
  expect(errors).toEqual([]);
});

test('unavailable API is explicit and a user can retry', async ({ page }) => {
  await page.route('**/api/v1/status', (route) =>
    route.fulfill({ status: 503, json: { status: 'unavailable', milestone: 'M-00' } }),
  );
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Connection unavailable');
  await page.unroute('**/api/v1/status');
  await page.getByRole('button', { name: 'Check connection' }).click();
  await expect(page.getByRole('status')).toHaveText('Connected');
});
