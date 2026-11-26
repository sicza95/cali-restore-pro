import { expect } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { drawingControl, openDetails } from './drawing-review';
import {
  attach,
  control,
  hiddenReason,
  newSurface,
  original,
  originalsPage,
  plasterPng,
  reason,
} from './originals';
import { expectNoReason, expectReasons, reasonShots } from './original-reasons';
import type { Expected } from './original-reasons';

const early = 'side-early.png';
const main = 'side-main.png';
const late = 'side-late.png';
const earlierRows: Record<string, Expected> = {
  [early]: { role: 'draft' },
  [main]: { role: 'draft', remove: 'draft' },
};
const hiddenRows: Record<string, Expected> = { [early]: {}, [main]: { remove: 'hidden' } };
const twoReasonRows: Record<string, Expected> = {
  [early]: { role: 'draft' },
  [main]: { role: 'draft', remove: 'hidden' },
  [late]: { role: 'draft', remove: 'draft' },
};
const damage = (page: Page) =>
  drawingControl(page, 'layer.select').filter({ hasText: 'Damage layer' });

/** From the surface page in photo mode: the main photo (listed second), drawing, Details open. */
async function surfacePage(page: Page, layer = true) {
  await control(page, 'surface.view.photo').selectOption({ index: 1 });
  await drawingControl(page, 'mode.drawing').click();
  await openDetails(page);
  if (layer) await damage(page).click();
}

async function pendingMark(page: Page) {
  await drawingControl(page, 'tool.brush').click();
  await drawingControl(page, 'brush.dot').click();
  await expect(damage(page)).toContainText('Pending marks 1');
}

/** With drafts pending on the main photo, the earlier photo cannot be given the mapping role. */
async function expectEarlierBlocked(page: Page, step: string) {
  const first = original(page, early);
  // The description first: it appears only once the journals are read.
  await expect(first.role, step).toHaveAccessibleDescription(reason);
  await expect(first.role, step).toBeDisabled();
  await expect(first.remove, step).toBeEnabled();
  await expect(first.remove, step).toHaveAccessibleDescription('');
  const source = original(page, main);
  await expect(source.remove, step).toHaveAccessibleDescription(reason);
  await expect(source.remove, step).toBeDisabled();
  await expect(source.role, step).toBeDisabled();
  for (const [name, expected] of Object.entries(earlierRows)) {
    await expectReasons(page, name, expected, step);
  }
}

/** Enabled only once the journals are read: the controls are held while they load. */
async function expectFree(page: Page, step: string) {
  for (const name of [early, main]) {
    const row = original(page, name);
    await expect(row.role, step).toBeEnabled();
    await expect(row.role, step).toHaveAccessibleDescription('');
    await expect(row.remove, step).toBeEnabled();
    await expect(row.remove, step).toHaveAccessibleDescription('');
    await expectNoReason(page, name, step);
  }
}

/** The main photo is no longer the reference but holds drafts: not removable, still re-rolable. */
async function expectHidden(page: Page, step: string) {
  const source = original(page, main);
  await expect(source.remove, step).toHaveAccessibleDescription(hiddenReason);
  await expect(source.remove, step).toBeDisabled();
  await expect(source.role, step).toHaveValue('reference');
  await expect(source.role, step).toBeEnabled();
  await expect(source.role, step).toHaveAccessibleDescription('');
  const first = original(page, early);
  await expect(first.role, step).toBeEnabled();
  await expect(first.remove, step).toBeEnabled();
  for (const [name, expected] of Object.entries(hiddenRows)) {
    await expectReasons(page, name, expected, step);
  }
}

/**
 * Two reasons in one row (#79): a later photo with the mapping role becomes the reference and
 * gets a pending mark while the photo with hidden drafts is listed before it. Called and ended on
 * the project page in the hidden-drafts state.
 */
async function verifyTwoReasons(page: Page, info: TestInfo, png: Buffer) {
  await page
    .locator('.project-originals form')
    .getByRole('combobox', { name: 'Image role', exact: true })
    .selectOption('mapping');
  await attach(page, late, png);
  await expectHidden(page, 'reopened surface page, later reference attached');
  await control(page, 'surface.view.photo').selectOption({ index: 2 });
  await drawingControl(page, 'mode.drawing').click();
  await openDetails(page);
  await drawingControl(page, 'layer.add').click();
  await expect(damage(page)).toHaveAttribute('aria-pressed', 'true');
  await drawingControl(page, 'history.mode').selectOption('manual');
  await pendingMark(page);
  await reasonShots(page, info, 'two-reasons-surface', twoReasonRows, true);
  await drawingControl(page, 'mode.photo').click();
  await originalsPage(page, 'Side plaster');
  await reasonShots(page, info, 'two-reasons', twoReasonRows, true);
  await surfacePage(page);
  await drawingControl(page, 'history.discard').click();
  await expect(damage(page)).not.toContainText('Pending marks');
  await drawingControl(page, 'mode.photo').click();
  await originalsPage(page, 'Side plaster');
  // Enabled only once the journals are read.
  await expect(original(page, late).remove).toBeEnabled();
  await expect(original(page, late).role).toBeEnabled();
  await expectNoReason(page, late, 'reopened surface page, later reference discarded');
  await original(page, late).remove.click();
  await expect(page.locator('.project-originals').getByText(late)).toHaveCount(0);
  await expectHidden(page, 'reopened surface page, later reference removed');
}

/**
 * Another device's revision lands with the main photo set to "Reference only", leaving its
 * journal and its drafts on this device (as `resolveEditor` does for "Keep cloud").
 */
async function landReferenceOnlyMain(page: Page) {
  await page.evaluate(async () => {
    const vaultModule = '/src/platform/vault/vault.ts';
    const projectModule = '/src/platform/projects/projects.ts';
    const { LocalVault } = (await import(
      vaultModule
    )) as typeof import('../src/platform/vault/vault');
    const { localProjects } = (await import(
      projectModule
    )) as typeof import('../src/platform/projects/projects');
    const me = (await (await fetch('/api/v1/auth/me')).json()) as { account: { id: string } };
    const vault = new LocalVault(me.account.id, () => undefined);
    try {
      await vault.unlock();
      const projects = localProjects(vault);
      const project = (await projects.list()).find((entry) => entry.name === 'East Chapel')!;
      const objects = project.objects.map((object) => ({
        ...object,
        surfaces: object.surfaces.map((surface) =>
          surface.name !== 'Side plaster'
            ? surface
            : {
                ...surface,
                images: surface.images.map((image, index) =>
                  index === 1 ? { ...image, role: 'reference' as const } : image,
                ),
              },
        ),
      }));
      await projects.save({ ...project, objects });
    } finally {
      vault.close();
    }
  });
  await page.reload();
  await expect(drawingControl(page, 'mode.photo')).toBeVisible();
}

/**
 * Drawing drafts and a reference change (#75), on a new surface "Side plaster" without
 * checkpoints, where a "Reference only" photo is listed before the main photo. With drafts
 * pending on the main photo, the earlier photo cannot be given the mapping role, on both pages,
 * and can once the drafts are saved or discarded. When another device's revision makes the main
 * photo "Reference only", its drafts are hidden: it cannot be removed, but giving it the mapping
 * role again brings them back to be resolved. Called on a surface page in photo mode with no
 * drafts pending; ends on the new surface's page in photo mode the same way.
 */
export async function verifyReferenceChange(page: Page, info: TestInfo) {
  const png = await plasterPng(page);
  await newSurface(page, 'Side plaster');
  const newRole = page
    .locator('.project-originals form')
    .getByRole('combobox', { name: 'Image role', exact: true });
  await newRole.selectOption('reference');
  await attach(page, early, png);
  await newRole.selectOption('mapping');
  await attach(page, main, png);
  await expectFree(page, 'no drafts yet');

  await surfacePage(page, false);
  await drawingControl(page, 'layer.add').click();
  await expect(damage(page)).toHaveAttribute('aria-pressed', 'true');
  await drawingControl(page, 'history.mode').selectOption('manual');
  await pendingMark(page);
  await expectEarlierBlocked(page, 'surface page, pending mark');
  await reasonShots(page, info, 'reference-change-earlier-surface', earlierRows);
  await drawingControl(page, 'mode.photo').click();
  await originalsPage(page, 'Side plaster');
  await expectEarlierBlocked(page, 'reopened surface page, pending mark');
  await reasonShots(page, info, 'reference-change-earlier', earlierRows);

  await surfacePage(page);
  await drawingControl(page, 'history.commit').click();
  await expect(damage(page)).not.toContainText('Pending marks');
  await expectFree(page, 'surface page, draft saved');
  await drawingControl(page, 'mode.photo').click();
  await originalsPage(page, 'Side plaster');
  await expectFree(page, 'reopened surface page, draft saved');

  await surfacePage(page);
  await pendingMark(page);
  await expectEarlierBlocked(page, 'surface page, second pending mark');
  await drawingControl(page, 'history.discard').click();
  await expect(damage(page)).not.toContainText('Pending marks');
  await expectFree(page, 'surface page, draft discarded');
  await drawingControl(page, 'mode.photo').click();
  await originalsPage(page, 'Side plaster');
  await expectFree(page, 'reopened surface page, draft discarded');

  // Hidden drafts: the main photo holds a pending mark but is no longer the reference.
  await surfacePage(page);
  await pendingMark(page);
  await drawingControl(page, 'mode.photo').click();
  await landReferenceOnlyMain(page);
  await expectHidden(page, 'surface page, hidden drafts');
  await reasonShots(page, info, 'reference-change-hidden-surface', hiddenRows);
  await originalsPage(page, 'Side plaster');
  await expectHidden(page, 'reopened surface page, hidden drafts');
  await reasonShots(page, info, 'reference-change-hidden', hiddenRows);
  await verifyTwoReasons(page, info, png);

  // The way out: the mapping role makes it the reference again, and its drafts are back.
  await original(page, main).role.selectOption('mapping');
  await expectEarlierBlocked(page, 'reopened surface page, drafts back');
  await surfacePage(page);
  await expect(damage(page)).toContainText('Pending marks 1');
  await drawingControl(page, 'history.discard').click();
  await expect(damage(page)).not.toContainText('Pending marks');
  await expectFree(page, 'surface page, hidden drafts discarded');
  await drawingControl(page, 'mode.photo').click();
  await originalsPage(page, 'Side plaster');
  await expectFree(page, 'reopened surface page, hidden drafts discarded');
  await expect(drawingControl(page, 'mode.photo')).toBeVisible();
}
