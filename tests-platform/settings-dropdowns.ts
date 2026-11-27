import { expect, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** Direct selection, dismissal and screen-edge placement of settings popovers. */
export async function verifySettingsDropdowns(page: Page, info: TestInfo) {
  const currency = page.locator('[data-control-id="preferences.currency"]');
  const list = page.getByRole('listbox');
  await expect(
    page.locator('#currency select, details#currency, details#language, details#report-language'),
  ).toHaveCount(0);
  await currency.focus();
  await page.keyboard.press('ArrowDown');
  await expect(list).toBeVisible();
  await expect(list.getByRole('option', { name: 'HUF', exact: true })).toBeFocused();
  await page.keyboard.press('u');
  await expect(list.getByRole('option', { name: 'USD', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(list).toHaveCount(0);
  await expect(currency).toBeFocused();
  await expect(currency).toContainText('USD');
  await page.reload();
  await expect(currency).toContainText('USD');
  await currency.click();
  await expect(list.getByRole('option', { name: 'USD', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('End');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await expect(list.getByRole('option', { name: 'CHF', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(currency).toBeFocused();
  await expect(currency).toContainText('USD');
  await currency.click();
  await currency.click();
  await expect(list).toHaveCount(0);
  await currency.click();
  await page.keyboard.press('Tab');
  await expect(list).toHaveCount(0);
  await expect(page.locator('[data-control-id="preferences.report-language"]')).toBeFocused();

  for (const viewport of [
    { width: 1194, height: 834 },
    { width: 834, height: 1194 },
    { width: 390, height: 360 },
  ]) {
    await page.setViewportSize(viewport);
    for (const edge of ['start', 'end'] as const) {
      await currency.evaluate((button, block) => button.scrollIntoView({ block }), edge);
      await currency.click();
      await expect(list).toBeVisible();
      expect(
        await currency.evaluate((button) => {
          const row = button.parentElement!.getBoundingClientRect();
          const fields = [
            button,
            ...button.querySelectorAll('.settings-option-value, .settings-option-chevron'),
          ];
          return (
            row.right <= innerWidth &&
            fields.every((field) => field.getBoundingClientRect().right <= row.right + 1)
          );
        }),
      ).toBe(true);
      await expect
        .poll(() =>
          list.evaluate((element) => {
            const menu = element.getBoundingClientRect();
            return (
              menu.left >= 7 &&
              menu.top >= 7 &&
              menu.right <= innerWidth - 7 &&
              menu.bottom <= innerHeight - 7
            );
          }),
        )
        .toBe(true);
      const geometry = await currency.evaluate((button) => {
        const anchor = button.getBoundingClientRect();
        const menu = document
          .querySelector('.settings-select-options:popover-open')!
          .getBoundingClientRect();
        return { above: menu.bottom <= anchor.top, below: menu.top >= anchor.bottom };
      });
      expect(edge === 'end' ? geometry.above : geometry.below).toBe(true);
      await page.screenshot({
        path: info.outputPath(`settings-dropdown-${viewport.width}-${edge}.png`),
      });
      await page.keyboard.press('Escape');
    }
  }
  await page.setViewportSize({ width: 834, height: 1194 });
  await currency.click();
  await page.setViewportSize({ width: 390, height: 500 });
  await page.locator('.account-content').evaluate((element) => element.scrollBy(0, 80));
  await expect
    .poll(() =>
      list.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.left >= 7 &&
          rect.right <= innerWidth - 7 &&
          rect.top >= 7 &&
          rect.bottom <= innerHeight - 7
        );
      }),
    )
    .toBe(true);
  await page.locator('#defaults-heading').click();
  await expect(list).toHaveCount(0);
  await currency.click();
  await list.getByRole('option', { name: 'HUF', exact: true }).click();
  await page.setViewportSize({ width: 834, height: 1194 });
}
