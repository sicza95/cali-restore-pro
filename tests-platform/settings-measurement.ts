import { expect, type Page, type TestInfo } from '@playwright/test';
import { openSetting } from './app-navigation';

export async function verifyMeasurementPreferences(page: Page, info: TestInfo) {
  let measurement = await openSetting(page, 'measurement');
  const system = () => measurement.getByRole('radiogroup').first();
  const area = () => measurement.getByRole('radiogroup').last();
  await expect(measurement.locator('select')).toHaveCount(0);
  await expect(system().getByRole('radio', { name: 'Metric', exact: true })).toBeChecked();
  await expect(area().getByRole('radio', { name: 'Default (m²)', exact: true })).toBeChecked();
  await system().getByRole('radio', { name: 'Metric', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(system().getByRole('radio', { name: 'Imperial', exact: true })).toBeChecked();
  await expect(system().locator('input:checked')).toHaveCount(1);
  await expect(area().getByRole('radio', { name: 'Default (ft²)', exact: true })).toBeChecked();
  await area().getByRole('radio', { name: 'cm²', exact: true }).check();
  await page.reload();
  measurement = await openSetting(page, 'measurement');
  await expect(system().getByRole('radio', { name: 'Imperial', exact: true })).toBeChecked();
  await expect(area().getByRole('radio', { name: 'cm²', exact: true })).toBeChecked();
  await area().getByRole('radio', { name: 'Default (ft²)', exact: true }).check();
  await system().getByRole('radio', { name: 'Metric', exact: true }).check();
  await expect(area().locator('label > span')).toHaveText([
    'Default (m²)',
    'cm²',
    'm²',
    'in²',
    'ft²',
  ]);

  for (const language of ['en', 'hu']) {
    if (language === 'hu') {
      await openSetting(page, 'language');
      await page.locator('[data-control-id="settings.language.hu"]').check();
      await expect(page.locator('html')).toHaveAttribute('lang', 'hu');
      measurement = await openSetting(page, 'measurement');
      await page.locator('[data-control-id="preferences.measurement-units.imperial"]').check();
      await expect(
        area().getByRole('radio', { name: 'Alapértelmezett (ft²)', exact: true }),
      ).toBeChecked();
    }
    for (const viewport of [
      { width: 1194, height: 834 },
      { width: 834, height: 1194 },
    ]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => document.fonts.ready);
      await measurement.scrollIntoViewIfNeeded();
      expect(
        await measurement.evaluate((element) => {
          const probe = document.createElement('div');
          probe.style.position = 'absolute';
          probe.style.color = 'var(--cr-accent)';
          probe.style.backgroundColor = 'var(--cr-selected)';
          element.append(probe);
          const expected = {
            color: getComputedStyle(probe).color,
            background: getComputedStyle(probe).backgroundColor,
          };
          probe.remove();
          return Array.from(element.querySelectorAll('.settings-choices')).every((group) => {
            const bounds = group.getBoundingClientRect();
            const container = group.parentElement!.getBoundingClientRect();
            const segments = Array.from(group.querySelectorAll('label > span')).map((span) =>
              span.getBoundingClientRect(),
            );
            const selected = group.querySelector('input:checked + span')!;
            const style = getComputedStyle(selected);
            return (
              Math.abs(bounds.width - container.width) < 1 &&
              style.color === expected.color &&
              style.backgroundColor === expected.background &&
              segments.every(
                (rect, i) =>
                  rect.width >= 44 &&
                  rect.height >= 44 &&
                  rect.right <= bounds.right &&
                  Math.abs(rect.y - segments[0].y) < 1 &&
                  (i === 0 || Math.abs(rect.left - segments[i - 1].right) < 1),
              )
            );
          });
        }),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`measurement-${language}-${viewport.width}.png`),
      });
    }
  }
  await openSetting(page, 'language');
  await page.locator('[data-control-id="settings.language.en"]').check();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
}
