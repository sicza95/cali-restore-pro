import { expect } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import * as recovery from '../recovery-conflict';
import { drawingControl, openDetails } from '../drawing-review';
import { dng } from '../fixtures/images';
import { expectTaskLanguage } from '../copy-guard';
import { attachInput, controls, required, review } from './flow';
import type { ProjectsFlow } from './flow';

const layers = (page: Page) => {
  const select = drawingControl(page, 'layer.select');
  return {
    damage: select.filter({ hasText: 'Damage layer' }).first(),
    phase: select.filter({ hasText: 'Independent phase' }),
  };
};

/**
 * Leaves an undone mark on "Damage layer" and a pending one on "Independent phase" in manual
 * history, then attaches the reference photo "plaster-detail.dng", which keeps the drafts (#63).
 * Starts on the detail photo; ends on the reference photo in photo mode.
 */
export async function draftAndAttachReference(flow: ProjectsFlow, info: TestInfo) {
  const { page } = flow;
  const drawing = (key: string) => drawingControl(page, key);
  const { damage, phase } = layers(page);
  await review(page, 'view.previous').click();
  await drawing('mode.drawing').click();
  await openDetails(page);
  await drawing('history.mode').selectOption('manual');
  await damage.click();
  await drawing('tool.brush').click();
  await drawing('brush.dot').click();
  await expect(damage).toContainText('Pending marks 1');
  await drawing('history.undo').click();
  await expect(damage).toContainText('Undone draft marks 1');
  await phase.click();
  await drawing('brush.dot').click();
  await expect(phase).toContainText('Pending marks 1');
  await drawing('mode.photo').click();
  await expect(review(page, 'review.prepare')).toHaveAttribute('aria-disabled', 'false');
  await review(page, 'review.prepare').click();
  await expect(review(page, 'review.cropWidth')).toHaveValue('80');
  await attachInput(page).setInputFiles({
    name: 'plaster-detail.dng',
    mimeType: 'image/x-adobe-dng',
    buffer: dng,
  });
  await page
    .locator('.project-originals form')
    .getByRole('combobox', { name: 'Image role', exact: true })
    .selectOption('reference');
  await controls(page, 'originals.attach').click();
  await expect(page.locator('.project-originals').getByText('plaster-detail.dng')).toBeVisible();
  await review(page, 'view.photo').selectOption({ label: '3 · plaster-detail.dng' });
  await expect(page.locator('.surface-canvas img')).toHaveJSProperty('naturalWidth', 48);
  await expect(review(page, 'review.prepare')).toHaveAttribute('aria-disabled', 'false');
  await recovery.verifyAttachKeepsDrafts(page);
  await expectTaskLanguage(page, 'project landscape');
  await page.screenshot({ path: info.outputPath('projects-landscape.png'), fullPage: true });
}

/**
 * Goes back to the project page, reopens the locked surface page and checks that the drafts,
 * history mode, checkpoints and preparation came back; then redoes, discards and changes the crop.
 * Ends on the surface page in photo mode with no drafts pending.
 */
export async function reopenSurface(flow: ProjectsFlow, info: TestInfo) {
  const { page } = flow;
  const projectPath = required(flow.projectPath, 'projectPath');
  const surfacePath = required(flow.surfacePath, 'surfacePath');
  const drawing = (key: string) => drawingControl(page, key);
  const { damage, phase } = layers(page);
  await page.goBack();
  await expect(page).toHaveURL(projectPath);
  await expect(page.getByRole('heading', { name: 'East Chapel' })).toBeVisible();
  await page.goto(surfacePath);
  await expect(page.locator('.project-originals').getByText('plaster-detail.dng')).toBeVisible();
  await drawing('mode.drawing').click();
  await expect(phase).toContainText('3 · Mark');
  await expect(damage).toContainText('Undone draft marks 1');
  await expect(phase).toContainText('Pending marks 1');
  await expect(drawing('history.mode')).toHaveValue('manual');
  await page.locator('[data-control-id="checkpoint.review.mode"]').click();
  await page
    .locator('[data-control-id="checkpoint.review.version"]')
    .selectOption({ label: 'Before cleaning' });
  await expect(page.locator('[data-control-id="checkpoint.review.restore"]')).toBeDisabled();
  await expect(
    page
      .locator('[data-control-id="pattern.review.preset"] option')
      .filter({ hasText: 'Tracing mark' }),
  ).toHaveCount(2);
  await drawing('mode.drawing').click();
  await damage.click();
  await drawing('history.redo').click();
  await expect(damage).toContainText('Pending marks 1');
  await drawing('history.discard').click();
  await expect(damage).not.toContainText('Pending marks');
  await damage.click();
  await drawing('layer.properties').click();
  await expect(drawing('layer.pattern')).toHaveValue(/\/1$/);
  await drawing('layer.properties').click();
  await phase.click();
  await drawing('history.discard').click();
  await expect(phase).not.toContainText('Pending marks');
  const master = drawing('layer.select').filter({ hasText: 'Master mask' });
  await master.click();
  await expect(master).toContainText('1 · Mark');
  await expect(drawing('history.redo')).toBeEnabled();
  await drawing('history.redo').click();
  await expect(phase).toContainText('4 · Mark');
  await drawing('history.undo').click();
  await drawing('mode.photo').click();
  await expect(page.getByText('Measurements are current.')).toBeVisible();
  await review(page, 'review.prepare').click();
  await expect(review(page, 'review.cropWidth')).toHaveValue('80');
  await review(page, 'review.cropWidth').fill('75');
  await review(page, 'review.apply').click();
  await expect(page.getByText('The preparation changed. Check the calibration.')).toBeVisible();
  await expectTaskLanguage(page, 'surface reopened');
  await page.screenshot({ path: info.outputPath('surface-reopened.png') });
}
