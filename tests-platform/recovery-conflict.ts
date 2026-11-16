import { expect } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { drawingControl, openDetails } from './drawing-review';
import { verifyRecoveryWarning } from './recovery-warning';

const control = (page: Page, id: string) => page.locator(`[data-control-id="${id}"]`);
const layer = (page: Page, name: string) =>
  drawingControl(page, 'layer.select').filter({ hasText: name }).first();

/**
 * Attaching a photo keeps the drawing drafts editable (#63). Called right after the reference
 * photo is attached and selected, with a pending mark on "Independent phase" and an undone one on
 * "Damage mask". The assessment did not change, so there is no conflict.
 */
export async function verifyAttachKeepsDrafts(page: Page) {
  const photo = control(page, 'surface.view.photo');
  await drawingControl(page, 'mode.drawing').click();
  await expect(drawingControl(page, 'tool.brush')).toBeDisabled(); // a reference photo
  await drawingControl(page, 'mode.photo').click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const selected = await photo.inputValue();
  await photo.selectOption({ index: 0 });
  await drawingControl(page, 'mode.drawing').click();
  // Loaded state first: the tools are enabled only once the journal is open without a conflict.
  await expect(drawingControl(page, 'tool.brush')).toBeEnabled();
  await expect(layer(page, 'Independent phase')).toContainText('Pending marks 1');
  await expect(layer(page, 'Damage mask')).toContainText('Undone draft marks 1');
  await expect(page.locator('.surface-recovery')).toHaveCount(0);
  await drawingControl(page, 'mode.photo').click();
  await expect(page.locator('.surface-recovery')).toHaveCount(0);
  await photo.selectOption(selected);
}

/**
 * A real conflict for the #38 warning checks: a pending mark is journalled on this device, then
 * the project page removes the aligned detail photo. That page saves the surface without its
 * journal, so the drafts were written against an assessment that no longer exists, as when
 * another device's revision changes it. Called on the surface page with no drafts pending; ends
 * there with the conflict discarded and editing available.
 */
export async function verifyRecoveryConflict(page: Page, info: TestInfo, surfacePath: string) {
  const damage = layer(page, 'Damage mask');
  await drawingControl(page, 'mode.drawing').click();
  await openDetails(page);
  await damage.click();
  await drawingControl(page, 'tool.brush').click();
  await drawingControl(page, 'brush.dot').click();
  await expect(damage).toContainText('Pending marks 1');
  await control(page, 'surface.project').click();
  await page
    .getByRole('combobox', { name: 'Object', exact: true })
    .selectOption({ label: 'North wall' });
  await page
    .getByRole('combobox', { name: 'Surface', exact: true })
    .selectOption({ label: 'Upper plaster' });
  const detail = page.locator('.project-originals li').filter({ hasText: 'wall-detail.png' });
  await detail.locator('[data-control-id="originals.remove"]').click();
  await expect(detail).toHaveCount(0);
  await control(page, 'project.surface').click();
  await expect(page).toHaveURL(surfacePath);
  await expect(page.locator('.surface-recovery')).toBeVisible();
  await verifyRecoveryWarning(page, info);
  await page.locator('.surface-recovery').getByRole('button').click();
  await expect(page.locator('.surface-recovery')).toHaveCount(0);
  await drawingControl(page, 'mode.drawing').click();
  await expect(drawingControl(page, 'tool.brush')).toBeEnabled();
  await expect(damage).not.toContainText('Pending marks');
  await drawingControl(page, 'mode.photo').click();
}
