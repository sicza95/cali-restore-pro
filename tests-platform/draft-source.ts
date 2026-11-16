import { expect } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { drawingControl, openDetails } from './drawing-review';
import { attach, control, original, plasterPng, projectPage, reason } from './originals';
import { verifyReferenceChange } from './reference-change';

/** On the surface page in drawing mode, on "Damage mask", with Details open. */
async function surfacePage(page: Page) {
  await control(page, 'project.surface').click();
  await drawingControl(page, 'mode.drawing').click();
  await openDetails(page);
  await drawingControl(page, 'layer.select').filter({ hasText: 'Damage mask' }).click();
}

const damage = (page: Page) =>
  drawingControl(page, 'layer.select').filter({ hasText: 'Damage mask' });

/** The main photo's "Remove" and role select are blocked with the reason; the other photo is not. */
async function expectBlocked(page: Page, step: string) {
  const main = original(page, 'lower-main.png');
  // The description first: it appears only once the journal is read.
  await expect(main.remove, step).toHaveAccessibleDescription(reason);
  await expect(main.remove, step).toBeDisabled();
  await expect(main.role, step).toHaveAccessibleDescription(reason);
  await expect(main.role, step).toBeDisabled();
  const other = original(page, 'lower-reference.png');
  await expect(other.remove, step).toBeEnabled();
  await expect(other.remove, step).toHaveAccessibleDescription('');
  await expect(other.role, step).toBeEnabled();
}

/** Enabled only once the journal is read: the controls are disabled while it loads. */
async function expectFree(page: Page, step: string) {
  for (const name of ['lower-main.png', 'lower-reference.png']) {
    const row = original(page, name);
    await expect(row.remove, step).toBeEnabled();
    await expect(row.remove, step).toHaveAccessibleDescription('');
    await expect(row.role, step).toBeEnabled();
  }
}

/**
 * The project page blocks removing or re-roling the photo the drawing drafts belong to while
 * they are pending, as the surface page does (#72), on a new surface "Lower plaster" without
 * checkpoints: with a pending mark, with an undone one only, after switching surfaces, and no
 * longer once the draft is committed or discarded. Called on the surface page in photo mode with
 * no drafts pending; ends on the new surface's page in photo mode the same way, and then runs the
 * reference change checks (#75), which end on another new surface's page the same way.
 */
export async function verifyDraftSourceBlocked(page: Page, info: TestInfo) {
  const png = await plasterPng(page);
  await projectPage(page, 'Upper plaster');
  await page.getByRole('textbox', { name: 'Add surface' }).fill('Lower plaster');
  await page.getByRole('button', { name: 'Add surface' }).click();
  await expect(
    page.getByRole('combobox', { name: 'Surface', exact: true }).locator('option:checked'),
  ).toHaveText('Lower plaster');
  await attach(page, 'lower-main.png', png);
  await page
    .locator('.project-originals form')
    .getByRole('combobox', { name: 'Image role', exact: true })
    .selectOption('reference');
  await attach(page, 'lower-reference.png', png);
  await expectFree(page, 'no drafts yet');

  await control(page, 'project.surface').click();
  await drawingControl(page, 'mode.drawing').click();
  await drawingControl(page, 'layer.add').click();
  await expect(damage(page)).toHaveAttribute('aria-pressed', 'true');
  await openDetails(page);
  await drawingControl(page, 'history.mode').selectOption('manual');
  await drawingControl(page, 'tool.brush').click();
  await drawingControl(page, 'brush.dot').click();
  await expect(damage(page)).toContainText('Pending marks 1');
  // The surface page blocks the same controls the same way.
  const main = original(page, 'lower-main.png');
  await expect(main.remove).toHaveAccessibleDescription(reason);
  await expect(main.role).toHaveAccessibleDescription(reason);
  await expect(main.role).toBeDisabled();
  await drawingControl(page, 'mode.photo').click();

  await projectPage(page, 'Lower plaster');
  await expectBlocked(page, 'pending mark');
  await page.locator('.project-originals').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('draft-source-1194.png'), fullPage: true });
  await page.setViewportSize({ width: 834, height: 1194 });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 834);
  await page.screenshot({ path: info.outputPath('draft-source-834.png'), fullPage: true });
  await page.setViewportSize({ width: 1194, height: 834 });
  // Another surface's photos are not blocked, and the selection is read again on the way back.
  await page
    .getByRole('combobox', { name: 'Surface', exact: true })
    .selectOption({ label: 'Upper plaster' });
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: 'wall.png' })
      .getByRole('combobox', { name: 'Image role' }),
  ).toBeEnabled();
  await page
    .getByRole('combobox', { name: 'Surface', exact: true })
    .selectOption({ label: 'Lower plaster' });
  await expectBlocked(page, 'surface selected again');

  await surfacePage(page);
  await drawingControl(page, 'history.undo').click();
  await expect(damage(page)).toContainText('Undone draft marks 1');
  await drawingControl(page, 'mode.photo').click();
  await projectPage(page, 'Lower plaster');
  await expectBlocked(page, 'undone mark only');

  await surfacePage(page);
  await drawingControl(page, 'history.redo').click();
  await expect(damage(page)).toContainText('Pending marks 1');
  await drawingControl(page, 'history.commit').click();
  await expect(damage(page)).not.toContainText('Pending marks');
  await drawingControl(page, 'mode.photo').click();
  await projectPage(page, 'Lower plaster');
  await expectFree(page, 'draft committed');

  await surfacePage(page);
  await drawingControl(page, 'tool.brush').click();
  await drawingControl(page, 'brush.dot').click();
  await expect(damage(page)).toContainText('Pending marks 1');
  await drawingControl(page, 'mode.photo').click();
  await projectPage(page, 'Lower plaster');
  await expectBlocked(page, 'second pending mark');

  await surfacePage(page);
  await drawingControl(page, 'history.discard').click();
  await expect(damage(page)).not.toContainText('Pending marks');
  await drawingControl(page, 'mode.photo').click();
  await projectPage(page, 'Lower plaster');
  await expectFree(page, 'draft discarded');
  await control(page, 'project.surface').click();
  await expect(drawingControl(page, 'mode.photo')).toBeVisible();
  await verifyReferenceChange(page, info);
}
