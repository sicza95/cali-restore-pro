import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { drawingCopy } from '../src/ui/editor/drawing-review/copy';
import { drawingControl } from './drawing-review';
import { expectUnclipped } from './original-reasons';
import { chooseLanguage } from './app-navigation';

type Language = 'en' | 'hu';
const editor = (page: Page) => page.locator('.drawing-workspace .cr-editor');

/**
 * The selected layer's Remove is disabled, says why as visible text under the layer actions, and
 * is described by that text only, with no `title` repeating it (#81, the #79 pattern).
 */
export async function expectRemoveReason(
  page: Page,
  key: 'removeHelp' | 'removeDraft',
  step: string,
  lang: Language = 'en',
) {
  const reason = drawingCopy(lang)[key];
  const remove = drawingControl(page, 'layer.remove');
  const properties = page.locator('.drawing-workspace .drawing-properties');
  const note = properties.locator('.drawing-reason');
  await remove.scrollIntoViewIfNeeded();
  await expect(remove, step).toBeDisabled();
  await expect(remove, step).not.toHaveAttribute('title');
  await expect(remove, step).toHaveAccessibleDescription(reason);
  await expect(note, step).toHaveText(reason);
  await expect(note, step).toBeVisible();
  const id = await remove.getAttribute('aria-describedby');
  await expect(properties.locator(`[id="${id}"]`), step).toHaveText(reason);
  await note.scrollIntoViewIfNeeded();
  await expectUnclipped(note, properties, `${step}: remove reason`, true);
}

/** Opens the layer properties, checks Remove's draft reason and closes them again. */
export async function expectRemoveDraftReason(page: Page) {
  await drawingControl(page, 'layer.properties').click();
  await expectRemoveReason(page, 'removeDraft', 'remove with a pending draft');
  await drawingControl(page, 'layer.properties').click();
}

/**
 * A blocked tool keeps its reason as its accessible description; tapping it shows the reason in
 * the tool chip, where touch users see it, until another tool is chosen.
 */
async function expectToolReason(page: Page, step: string, lang: Language) {
  const copy = drawingCopy(lang);
  const nodes = drawingControl(page, 'tool.nodes');
  const chip = page.locator('.drawing-workspace .cr-tool-context');
  const shown = chip.locator('.drawing-tool-reason');
  await expect(nodes, step).toHaveAttribute('aria-disabled', 'true');
  await expect(nodes, step).toHaveAccessibleDescription(copy.noPaths);
  await expect(nodes, step).not.toHaveAttribute('title', copy.noPaths);
  await expect(shown, step).toHaveCount(0);
  // An aria-disabled button still receives the tap; Playwright would wait for it to be enabled.
  await nodes.click({ force: true });
  await expect(shown, step).toHaveText(`${copy.nodes}: ${copy.noPaths}`);
  await expect(shown, step).toBeVisible();
  await expectUnclipped(shown, chip, `${step}: tool reason in chip`, true);
  await expectUnclipped(chip, page.locator('.drawing-workspace .cr-canvas-region'), step);
}

/**
 * On the surface page in drawing mode with a photo and an empty master mask: the embedded editor
 * has no Export, the layer Remove and a blocked tool say why without hovering. EN and HU at both
 * iPad sizes, then axe and a dark screenshot. Leaves the page as it found it: English, light,
 * properties closed, the Navigate tool active, the original viewport.
 */
export async function verifyDrawingReasons(page: Page, info: TestInfo) {
  const original = page.viewportSize()!;
  const c = (key: string) => drawingControl(page, key);
  await expect(c('layer.select').first()).toBeVisible();
  await c('layer.properties').click();
  for (const lang of ['en', 'hu'] as const) {
    if (lang === 'hu') await chooseLanguage(page, 'hu');
    const copy = drawingCopy(lang);
    for (const viewport of [
      { width: 1194, height: 834 },
      { width: 834, height: 1194 },
    ]) {
      await page.setViewportSize(viewport);
      const step = `drawing reasons ${lang} ${viewport.width}`;
      await expect(page.locator('.drawing-workspace .cr-export-button'), step).toHaveCount(0);
      await expect(
        page.locator('.drawing-workspace').getByRole('button', {
          name: lang === 'en' ? 'Export' : 'Exportálás',
          exact: true,
        }),
        step,
      ).toHaveCount(0);
      await expectRemoveReason(page, 'removeHelp', step, lang);
      await expectToolReason(page, step, lang);
      await expect(page.locator('body'), step).toHaveJSProperty('scrollWidth', viewport.width);
      await editor(page).screenshot({
        path: info.outputPath(`drawing-reasons-${lang}-${viewport.width}.png`),
      });
      // Choosing a usable tool takes the reason away again.
      await c('tool.select').click();
      await expect(page.locator('.drawing-tool-reason'), step).toHaveCount(0);
      await expect(page.locator('.drawing-workspace .cr-tool-context'), step).not.toContainText(
        copy.noPaths,
      );
    }
  }
  await chooseLanguage(page, 'en');
  await page.setViewportSize({ width: 834, height: 1194 });
  await c('tool.nodes').click({ force: true });
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator('body')).toHaveAttribute('data-theme', colorScheme);
    await expect(page.locator('.drawing-tool-reason')).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .include('.drawing-workspace .cr-tool-context')
          .include('.drawing-workspace .drawing-properties')
          .analyze()
      ).violations,
      `drawing reasons axe ${colorScheme}`,
    ).toEqual([]);
  }
  await editor(page).screenshot({ path: info.outputPath('drawing-reasons-dark-834.png') });
  await page.emulateMedia({ colorScheme: 'light' });
  await c('tool.select').click();
  await c('layer.properties').click();
  await page.setViewportSize(original);
}
