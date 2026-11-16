import { expect } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import { drawingControl } from '../drawing-review';
import { verifyDetailDrawing } from '../drawing-input';
import { verifyAlignmentGuides, verifyCalibrationGuides, verifyPhotoMatrix } from '../photo-review';
import { attachInput, controls, required, review, revisions } from './flow';
import type { ProjectsFlow } from './flow';

/**
 * Prepares (crop 80 %), zooms, calibrates the main photo, then attaches and aligns the detail
 * photo "wall-detail.png" and draws on it. Starts after the drawing and checkpoint checks; ends on
 * the detail photo.
 */
export async function reviewPhotos(flow: ProjectsFlow, info: TestInfo) {
  const { page } = flow;
  const png = required(flow.png, 'png');
  const beforeReview = required(flow.beforeReview, 'beforeReview');
  const field = (id: string) => review(page, id);
  await field('review.prepare').focus();
  await page.keyboard.press('Enter');
  await field('review.cropWidth').fill('101');
  await expect(field('review.apply')).toBeDisabled();
  await field('review.cropWidth').fill('80');
  await field('review.apply').click();
  await expect(page.getByText('Saved to this surface.', { exact: true })).toBeVisible();
  await field('review.prepare').click();
  await expect(field('review.cropWidth')).toHaveValue('80');
  await field('review.cropWidth').fill('50');
  await field('review.cancel').click();
  await field('review.prepare').click();
  await expect(field('review.cropWidth')).toHaveValue('80');
  const zoom = field('view.zoom');
  await zoom.fill('250');
  await expect(page.locator('.surface-tile-ready').first()).toBeVisible();
  await page.screenshot({ path: info.outputPath('image-tiles-landscape.png'), fullPage: true });
  await page.setViewportSize({ width: 834, height: 1194 });
  await expect(page.locator('.surface-tile-ready').first()).toBeVisible();
  await page.screenshot({ path: info.outputPath('image-tiles-portrait.png'), fullPage: true });
  await page.setViewportSize({ width: 1194, height: 834 });
  await verifyPhotoMatrix(page, info);
  await field('review.calibrate').click();
  await expect(field('review.unit')).toHaveValue('in');
  await expect(field('review.apply')).toBeDisabled();
  await field('review.width').fill('10');
  await field('review.height').fill('12');
  await verifyCalibrationGuides(page);
  await expect(page.getByText('Measurements are current.')).toBeVisible();
  expect((await revisions(page))[0]).not.toEqual(beforeReview[0]);
  await page.setViewportSize({ width: 1194, height: 834 });
  await attachInput(page).setInputFiles({
    name: 'wall-detail.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await controls(page, 'originals.attach').click();
  await expect(field('view.next')).toBeEnabled();
  await field('view.next').click();
  await expect(field('review.align')).toHaveAttribute('aria-disabled', 'false');
  await field('review.align').click();
  await expect(field('review.auto')).toBeEnabled();
  await drawingControl(page, 'mode.drawing').click();
  await expect(drawingControl(page, 'tool.brush')).toBeDisabled();
  await drawingControl(page, 'mode.photo').click();
  await field('review.compare').check();
  await expect(page.locator('.surface-canvas img')).toHaveCount(2);
  await verifyAlignmentGuides(page);
  const beforeAlignment = await revisions(page);
  await field('review.offsetX').fill('10');
  await field('review.usable').fill('49');
  await field('review.apply').click();
  await expect(page.getByText('Saved to this surface.', { exact: true })).toBeVisible();
  expect((await revisions(page))[0]).not.toEqual(beforeAlignment[0]);
  await verifyDetailDrawing(page);
}
