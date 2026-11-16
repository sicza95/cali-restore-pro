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

/** A pending mark on "Damage mask", journalled; ends in drawing mode with Details open. */
async function drawPendingMark(page: Page) {
  const damage = layer(page, 'Damage mask');
  await drawingControl(page, 'mode.drawing').click();
  await openDetails(page);
  await damage.click();
  await drawingControl(page, 'tool.brush').click();
  await drawingControl(page, 'brush.dot').click();
  await expect(damage).toContainText('Pending marks 1');
}

/** Editing is available with the pending mark kept; starts and ends in photo mode. */
async function expectDraftKept(page: Page, step: string) {
  await drawingControl(page, 'mode.drawing').click();
  // Loaded state first: the tools are enabled only once the journal is open without a conflict.
  await expect(drawingControl(page, 'tool.brush'), step).toBeEnabled();
  await expect(layer(page, 'Damage mask'), step).toContainText('Pending marks 1');
  await expect(page.locator('.surface-recovery'), step).toHaveCount(0);
  await drawingControl(page, 'mode.photo').click();
}

async function reopen(page: Page) {
  await page.reload();
  await page.getByRole('button', { name: 'Unlock on this remembered browser' }).click();
  await expect(control(page, 'surface.view.photo')).toBeEnabled();
}

const removeOriginal = async (page: Page, name: string) => {
  const row = page.locator('.project-originals li').filter({ hasText: name });
  await row.locator('[data-control-id="originals.remove"]').click();
  await expect(row).toHaveCount(0);
};

/**
 * Removing an aligned detail photo with drafts pending keeps editing available on this device
 * (#67): first on the surface page (a new detail, attached and aligned here), then on the project
 * page (`wall-detail.png`), each also after reopening. Called on the surface page in photo mode,
 * on the main photo, with no drafts pending; ends there the same way.
 */
export async function verifyRemovalKeepsDrafts(page: Page, surfacePath: string) {
  const review = (id: string) => control(page, 'surface.' + id);
  const png = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#a89f8c';
      context.fillRect(0, 0, 640, 480);
      context.fillStyle = '#5d5547';
      for (let i = 0; i < 12; i++) context.fillRect(40 + i * 48, 60 + (i % 3) * 120, 24, 90);
      return canvas.toDataURL('image/png').split(',')[1]!;
    }),
    'base64',
  );
  await page
    .getByLabel('Original file', { exact: true })
    .setInputFiles({ name: 'side-detail.png', mimeType: 'image/png', buffer: png });
  await control(page, 'originals.attach').click();
  await expect(page.locator('.project-originals').getByText('side-detail.png')).toBeVisible();
  const photo = review('view.photo');
  const main = await photo.inputValue();
  await photo.selectOption({ label: '4 · side-detail.png' });
  await expect(review('review.align')).toHaveAttribute('aria-disabled', 'false');
  await review('review.align').click();
  await expect(review('review.auto')).toBeEnabled();
  // Distinct guide points, as in the flow's first alignment (`verifyAlignmentGuides`).
  await review('review.manualPairs').check();
  await review('review.pairOne.end.x').fill('40');
  await review('review.offsetX').fill('10');
  await review('review.usable').fill('49');
  await review('review.apply').click();
  await expect(page.getByText('Saved to this surface.', { exact: true })).toBeVisible();
  await photo.selectOption(main);
  await drawPendingMark(page);
  await drawingControl(page, 'mode.photo').click();
  await removeOriginal(page, 'side-detail.png');
  await expectDraftKept(page, 'after removing a detail on the surface page');
  // The open journal took the written revision: the next draft saves go through.
  const damage = layer(page, 'Damage mask');
  await drawingControl(page, 'mode.drawing').click();
  await damage.click();
  await drawingControl(page, 'history.undo').click();
  await expect(damage).toContainText('Undone draft marks 1');
  await drawingControl(page, 'history.redo').click();
  await expect(damage).toContainText('Pending marks 1');
  await drawingControl(page, 'mode.photo').click();
  await reopen(page);
  await expectDraftKept(page, 'surface page removal, reopened');
  await control(page, 'surface.project').click();
  await page
    .getByRole('combobox', { name: 'Object', exact: true })
    .selectOption({ label: 'North wall' });
  await page
    .getByRole('combobox', { name: 'Surface', exact: true })
    .selectOption({ label: 'Upper plaster' });
  await removeOriginal(page, 'wall-detail.png');
  await control(page, 'project.surface').click();
  await expect(page).toHaveURL(surfacePath);
  await expectDraftKept(page, 'after removing a detail on the project page');
  await reopen(page);
  await expectDraftKept(page, 'project page removal, reopened');
  await drawingControl(page, 'mode.drawing').click();
  await damage.click();
  await drawingControl(page, 'history.discard').click();
  await expect(damage).not.toContainText('Pending marks');
  await drawingControl(page, 'mode.photo').click();
}

/**
 * Another device's revision lands on this device, as when a blocked sync draft is resolved with
 * the cloud copy (`resolveEditor` replaces the local project row and leaves the journal): the
 * main photo's crop is narrower and the assessment revision goes up. Written through the app's
 * own storage layer, with a second vault handle closed without locking the page's.
 */
async function landOtherDeviceRevision(page: Page) {
  await page.evaluate(async () => {
    const vaultModule = '/src/platform/vault/vault.ts';
    const projectModule = '/src/platform/projects/projects.ts';
    const planarModule = '/src/platform/projects/planar-state.ts';
    const { LocalVault } = (await import(
      vaultModule
    )) as typeof import('../src/platform/vault/vault');
    const { localProjects } = (await import(
      projectModule
    )) as typeof import('../src/platform/projects/projects');
    const { preparePhoto } = (await import(
      planarModule
    )) as typeof import('../src/platform/projects/planar-state');
    const me = (await (await fetch('/api/v1/auth/me')).json()) as { account: { id: string } };
    const vault = new LocalVault(me.account.id, () => undefined);
    try {
      await vault.unlock();
      const projects = localProjects(vault);
      const project = (await projects.list()).find(({ name }) => name === 'East Chapel')!;
      const objects = project.objects.map((object) => ({
        ...object,
        surfaces: object.surfaces.map((surface) => {
          if (surface.name !== 'Upper plaster') return surface;
          const main = surface.images.find(({ role }) => role === 'mapping')!;
          return {
            ...surface,
            assessments: surface.assessments!.map((state) => {
              if (state.source.id !== main.id) return state;
              const [x, y, width, height] = state.frame.input.crop;
              const crop = [x, y, width * 0.9, height] as const;
              return preparePhoto(state, state.source, { ...state.frame.input, crop });
            }),
          };
        }),
      }));
      await projects.save({ ...project, objects });
    } finally {
      vault.close();
    }
  });
}

/**
 * A real conflict for the #38 warning checks: a pending mark is journalled on this device, then
 * another device's revision of the assessment lands. The drafts were written against an
 * assessment that no longer exists here, and on reopening `openJournal` reports them as a
 * conflict. Called on the surface page with no drafts pending; ends there with the conflict
 * discarded and editing available.
 */
export async function verifyRecoveryConflict(page: Page, info: TestInfo) {
  const damage = layer(page, 'Damage mask');
  await drawPendingMark(page);
  await drawingControl(page, 'mode.photo').click();
  await landOtherDeviceRevision(page);
  await reopen(page);
  await expect(page.locator('.surface-recovery')).toBeVisible();
  await verifyRecoveryWarning(page, info);
  await page.locator('.surface-recovery').getByRole('button').click();
  await expect(page.locator('.surface-recovery')).toHaveCount(0);
  await drawingControl(page, 'mode.drawing').click();
  await expect(drawingControl(page, 'tool.brush')).toBeEnabled();
  await expect(damage).not.toContainText('Pending marks');
  await drawingControl(page, 'mode.photo').click();
}
