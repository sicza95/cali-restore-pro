import { expect } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { drawingControl, openDetails } from './drawing-review';
import {
  attach,
  control,
  hiddenReason,
  original,
  plasterPng,
  projectPage,
  reason,
} from './originals';

const early = 'side-early.png';
const main = 'side-main.png';
const damage = (page: Page) =>
  drawingControl(page, 'layer.select').filter({ hasText: 'Damage mask' });

/** On the surface page showing the main photo (listed second), drawing with Details open. */
async function surfacePage(page: Page, layer = true) {
  await control(page, 'project.surface').click();
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
}

/** Enabled only once the journals are read: the controls are held while they load. */
async function expectFree(page: Page, step: string) {
  for (const name of [early, main]) {
    const row = original(page, name);
    await expect(row.role, step).toBeEnabled();
    await expect(row.role, step).toHaveAccessibleDescription('');
    await expect(row.remove, step).toBeEnabled();
    await expect(row.remove, step).toHaveAccessibleDescription('');
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
}

async function shots(page: Page, info: TestInfo, name: string) {
  await page.locator('.project-originals').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath(`${name}-1194.png`), fullPage: true });
  await page.setViewportSize({ width: 834, height: 1194 });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 834);
  await page.locator('.project-originals').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath(`${name}-834.png`), fullPage: true });
  await page.setViewportSize({ width: 1194, height: 834 });
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
  await page.getByRole('button', { name: 'Unlock on this remembered browser' }).click();
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
  await projectPage(page, 'Upper plaster');
  await page.getByRole('textbox', { name: 'Add surface' }).fill('Side plaster');
  await page.getByRole('button', { name: 'Add surface' }).click();
  await expect(
    page.getByRole('combobox', { name: 'Surface', exact: true }).locator('option:checked'),
  ).toHaveText('Side plaster');
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
  await shots(page, info, 'reference-change-earlier-surface');
  await drawingControl(page, 'mode.photo').click();
  await projectPage(page, 'Side plaster');
  await expectEarlierBlocked(page, 'project page, pending mark');
  await shots(page, info, 'reference-change-earlier');

  await surfacePage(page);
  await drawingControl(page, 'history.commit').click();
  await expect(damage(page)).not.toContainText('Pending marks');
  await expectFree(page, 'surface page, draft saved');
  await drawingControl(page, 'mode.photo').click();
  await projectPage(page, 'Side plaster');
  await expectFree(page, 'project page, draft saved');

  await surfacePage(page);
  await pendingMark(page);
  await expectEarlierBlocked(page, 'surface page, second pending mark');
  await drawingControl(page, 'history.discard').click();
  await expect(damage(page)).not.toContainText('Pending marks');
  await expectFree(page, 'surface page, draft discarded');
  await drawingControl(page, 'mode.photo').click();
  await projectPage(page, 'Side plaster');
  await expectFree(page, 'project page, draft discarded');

  // Hidden drafts: the main photo holds a pending mark but is no longer the reference.
  await surfacePage(page);
  await pendingMark(page);
  await drawingControl(page, 'mode.photo').click();
  await landReferenceOnlyMain(page);
  await expectHidden(page, 'surface page, hidden drafts');
  await shots(page, info, 'reference-change-hidden-surface');
  await projectPage(page, 'Side plaster');
  await expectHidden(page, 'project page, hidden drafts');
  await shots(page, info, 'reference-change-hidden');

  // The way out: the mapping role makes it the reference again, and its drafts are back.
  await original(page, main).role.selectOption('mapping');
  await expectEarlierBlocked(page, 'project page, drafts back');
  await surfacePage(page);
  await expect(damage(page)).toContainText('Pending marks 1');
  await drawingControl(page, 'history.discard').click();
  await expect(damage(page)).not.toContainText('Pending marks');
  await expectFree(page, 'surface page, hidden drafts discarded');
  await drawingControl(page, 'mode.photo').click();
  await projectPage(page, 'Side plaster');
  await expectFree(page, 'project page, hidden drafts discarded');
  await control(page, 'project.surface').click();
  await expect(drawingControl(page, 'mode.photo')).toBeVisible();
}
