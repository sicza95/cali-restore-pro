import { expect } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { surfaceControls } from '../src/ui/account-access/projects/surface-review-controls';

export function photoControl(page: Page, key: string) {
  const id = 'surface.' + key;
  expect(surfaceControls.some((control) => control.id === id)).toBe(true);
  return page.locator(`[data-control-id="${id}"]`);
}

export async function verifyPhotoMatrix(page: Page, info: TestInfo) {
  const c = (key: string) => photoControl(page, key);
  const frame = page.locator('.surface-canvas .surface-photo-frame');
  await c('view.pan.right').tap();
  await expect(frame).toHaveCSS('transform', /^matrix.*24/);
  await c('view.fit').press('Enter');
  await expect(frame).toHaveAttribute('style', /translate\(0px, 0px\)/);
  await c('review.perspective').fill('20');
  await expect(frame).toHaveAttribute('style', /rotateY\(20deg\)/);
  await c('review.rectify').check();
  await expect(frame.locator('rect')).toBeVisible();
  await expect(frame.locator('rect')).toHaveAttribute('width', '72');
  await expect(frame).toHaveAttribute('style', /rotateY\(0deg\)/);

  const language = page.locator('[data-control-id="app.nav.language"]');
  for (const lang of ['en', 'hu']) {
    await language.selectOption(lang);
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await expect(c('review.rectify')).toHaveAccessibleName(
      lang === 'en' ? 'Show rectification target' : 'A helyesbítés célképének mutatása',
    );
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await expect(page.locator('body')).toHaveAttribute('data-theme', colorScheme);
      for (const viewport of [
        { width: 1194, height: 834 },
        { width: 834, height: 1194 },
      ]) {
        await page.setViewportSize(viewport);
        const rail = (await page.locator('.surface-rail').boundingBox())!;
        const canvas = (await page.locator('.surface-stage').boundingBox())!;
        const inspector = (await page.locator('.surface-inspector').boundingBox())!;
        expect(rail.x).toBeLessThan(canvas.x);
        if (viewport.width === 834) expect(inspector.y).toBeGreaterThan(canvas.y + canvas.height);
        else expect(inspector.x).toBeGreaterThan(canvas.x + canvas.width);
        for (const control of [
          'review.prepare',
          'review.apply',
          'review.cancel',
          'view.pan.right',
        ]) {
          const box = (await c(control).boundingBox())!;
          expect(box.height).toBeGreaterThanOrEqual(44);
          expect(box.width).toBeGreaterThanOrEqual(44);
        }
        await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
        await page.screenshot({
          path: info.outputPath(`photo-${lang}-${colorScheme}-${viewport.width}.png`),
          fullPage: true,
        });
      }
    }
  }
  await language.selectOption('en');
  await page.emulateMedia({ colorScheme: 'light' });
  await c('review.perspective').press('Escape');
  await expect(c('review.prepare')).toBeFocused();
  await expect(c('review.perspective')).toHaveCount(0);
}

export async function verifyCalibrationGuides(page: Page) {
  const c = (key: string) => photoControl(page, 'review.' + key);
  await expect(c('horizontal.start.x')).toHaveCount(0);
  await c('method').selectOption('lines');
  await c('horizontal.start.x').fill('80');
  await expect(c('apply')).toBeDisabled();
  await c('horizontal.start.x').fill('30');
  await expect(page.locator('.surface-guides line').first()).toHaveAttribute('x1', '30');
  await c('apply').tap();
  await expect(c('calibrate')).toBeFocused();
}

export async function verifyAlignmentGuides(page: Page) {
  const c = (key: string) => photoControl(page, 'review.' + key);
  await expect(c('pairOne.start.x')).toHaveCount(0);
  await c('manualPairs').check();
  await expect(page.locator('.surface-guides text')).toHaveCount(4);
  await c('pairOne.end.x').fill('101');
  await expect(c('apply')).toBeDisabled();
  await c('pairOne.end.x').fill('40');
  await expect(page.locator('.surface-guides text').nth(2)).toHaveAttribute('x', '40');
  await c('referenceOnly').check();
  await expect(c('pairOne.end.x')).toHaveCount(0);
  await expect(c('offsetX')).toHaveCount(0);
  await c('referenceOnly').uncheck();
  await expect(c('pairOne.end.x')).toHaveValue('40');
}
