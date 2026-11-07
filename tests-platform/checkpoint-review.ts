import { expect } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { checkpointControls } from '../src/ui/editor/checkpoint-review/registry';

export async function verifyCheckpointReview(page: Page, info: TestInfo) {
  const control = (id: string) => {
    expect(checkpointControls.some((entry) => entry.id === id)).toBe(true);
    return page.locator(`[data-control-id="${id}"]`);
  };
  const checkpoint = (key: string) => control('checkpoint.review.' + key);
  const pattern = (key: string) => control('pattern.review.' + key);
  await checkpoint('mode').focus();
  await page.keyboard.press('Enter');
  await expect(checkpoint('create')).toBeDisabled();
  await checkpoint('name').fill('Before cleaning');
  await checkpoint('name').press('Enter');
  await expect(checkpoint('version').getByRole('option', { name: 'Before cleaning' })).toHaveCount(
    1,
  );
  await checkpoint('compare').selectOption('baseline');
  await expect(checkpoint('secondZoom')).toBeDisabled();
  await checkpoint('zoom').press('ArrowRight');
  await expect(checkpoint('secondZoom')).toHaveValue('101');
  await checkpoint('linked').uncheck();
  await expect(checkpoint('secondZoom')).toBeEnabled();
  await checkpoint('overlay').check();
  await expect(page.locator('.checkpoint-added')).toBeVisible();
  await expect(page.getByText('Change from comparison', { exact: false }).first()).toBeVisible();
  await checkpoint('state').selectOption('stale');
  await expect(page.getByText('Stale · Illustrative calibration')).toBeVisible();
  await expect(page.getByText('Change from comparison', { exact: false })).toHaveCount(0);
  await checkpoint('state').selectOption('missing');
  await expect(page.getByText('Missing · Calibration required')).toBeVisible();
  await expect(page.locator('.review-facts dd').nth(1)).toHaveText('—');
  for (const state of ['computing', 'error']) {
    await checkpoint('state').selectOption(state);
    await expect(page.locator('.review-facts dd').nth(1)).toHaveText('—');
  }
  await checkpoint('state').selectOption('ready');
  await expect(checkpoint('unit')).toHaveValue('ft²');
  await checkpoint('unit').selectOption('m²');
  await expect(page.locator('.review-facts dd').nth(1)).toContainText('5.8 m²');
  await checkpoint('version').selectOption('baseline');
  await checkpoint('restore').tap();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(checkpoint('restore')).toBeFocused();
  await checkpoint('restore').tap();
  await checkpoint('cancel').click();
  await expect(checkpoint('version')).toHaveValue('baseline');
  await checkpoint('restore').tap();
  await checkpoint('confirm').click();
  await expect(checkpoint('version')).toHaveValue('current');
  await expect(page.locator('.review-facts dd').nth(1)).toHaveText('6 m²');
  await expect(checkpoint('compare').getByRole('option', { name: 'Previous review' })).toHaveCount(
    1,
  );
  await checkpoint('compare').selectOption({ label: 'Previous review' });
  await pattern('kind').selectOption('motif');
  await expect(pattern('apply')).toBeDisabled();
  await pattern('motif').fill('CR');
  await pattern('presetName').fill('Tracing mark');
  await pattern('save').click();
  await pattern('angle').press('ArrowRight');
  await pattern('save').click();
  await pattern('preset').selectOption({ label: 'Tracing mark · v1' });
  await expect(pattern('angle')).toHaveValue('30');
  await pattern('mono').check();
  await pattern('apply').click();
  await expect(page.getByText('Applied to the review legend.')).toBeVisible();
  await expect(pattern('library')).toHaveAttribute('href', '/settings/libraries');
  for (const viewport of [
    { width: 1194, height: 834 },
    { width: 834, height: 1194 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
    for (const target of [
      checkpoint('version'),
      checkpoint('create'),
      checkpoint('overlay'),
      pattern('save'),
      pattern('library'),
    ]) {
      const box = (await target.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({
      path: info.outputPath(`checkpoint-${viewport.width}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.getByRole('button', { name: 'Photo review', exact: true }).click();
}
