import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
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
  const draw = (key: string) => page.locator('[data-control-id="surface.draw.' + key + '"]');
  await draw('mode.drawing').click();
  const damage = draw('layer.select').filter({ hasText: 'Damage mask' }).first();
  const master = draw('layer.select').filter({ hasText: 'Master mask' });
  await master.click();
  await draw('tool.eraser').click();
  await draw('brush.width').fill('15');
  await draw('brush.width').blur();
  await draw('place.x').fill('50');
  await draw('place.y').fill('50');
  await draw('place.y').blur();
  await draw('brush.dot').click();
  await expect(master).toContainText('2 · Mark');
  await checkpoint('mode').click();
  await checkpoint('compare').selectOption({ label: 'Before cleaning' });
  await expect(checkpoint('secondZoom')).toBeDisabled();
  await checkpoint('zoom').press('ArrowRight');
  await expect(checkpoint('secondZoom')).toHaveValue('101');
  await checkpoint('linked').uncheck();
  await expect(checkpoint('secondZoom')).toBeEnabled();
  await checkpoint('overlay').check();
  await expect(page.locator('.checkpoint-removed')).toHaveAttribute('d', /^M/);
  await expect(page.getByText('Calibration required', { exact: true })).toBeVisible();
  await expect(page.locator('.review-facts dd').first()).toContainText('—');
  await expect(checkpoint('unit')).toHaveValue('ft');
  await checkpoint('unit').selectOption('m');
  await checkpoint('version').selectOption({ label: 'Before cleaning' });
  await checkpoint('restore').tap();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(checkpoint('restore')).toBeFocused();
  await checkpoint('restore').tap();
  await checkpoint('cancel').click();
  await checkpoint('restore').tap();
  await checkpoint('confirm').click();
  await expect(checkpoint('version')).toHaveValue('current');
  await expect(
    checkpoint('compare').getByRole('option', { name: 'Before restoration' }),
  ).toHaveCount(1);
  await checkpoint('compare').selectOption({ label: 'Before restoration' });
  await expect(page.locator('.checkpoint-added')).toHaveAttribute('d', /^M/);
  await draw('mode.drawing').click();
  await expect(master).toContainText('1 · Mark');
  await expect(draw('history.undo')).toHaveAccessibleName('Undo · Checkpoint restore');
  await draw('history.undo').click();
  await expect(master).toContainText('2 · Mark');
  await draw('history.redo').click();
  await expect(master).toContainText('1 · Mark');
  await checkpoint('mode').click();
  await pattern('kind').selectOption('motif');
  await expect(pattern('apply')).toBeDisabled();
  await pattern('motif').fill('CR');
  await pattern('presetName').fill('Tracing mark');
  await pattern('save').click();
  await expect(pattern('preset')).toHaveValue(/\/1$/);
  await pattern('angle').press('ArrowRight');
  await pattern('save').click();
  await pattern('preset').selectOption({ label: 'Tracing mark · v1' });
  await draw('mode.drawing').click();
  await damage.click();
  const properties = draw('layer.properties');
  if (!(await draw('layer.pattern').isVisible())) await properties.click();
  await draw('layer.pattern').selectOption({ label: 'Tracing mark · v1' });
  await expect(draw('layer.pattern')).toHaveValue(/\/1$/);
  await expect(page.locator('.drawing-overlay pattern text').first()).toHaveText('CR');
  await draw('layer.properties').click();
  await checkpoint('mode').click();
  await expect(pattern('angle')).toHaveValue('30');
  await pattern('mono').check();
  await pattern('apply').click();
  await expect(page.getByText('Pattern legend preview.')).toBeVisible();
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
  expect((await new AxeBuilder({ page }).include('.review-flow').analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.getByRole('button', { name: 'Photo review', exact: true }).click();
}
