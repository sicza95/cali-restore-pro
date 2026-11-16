import { expect, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expectTaskLanguage } from './copy-guard';
import { closeDetails, drawingControl, openDetails, selectedLayer } from './drawing-controls';
import { canvasShare } from './photo-gestures';

/**
 * Drawing layout on both iPad orientations, with a shape path in progress: canvas share, rail
 * and inspector placement, fit, touch targets, one title, the portrait inspector grip, copy and
 * axe with "Details" closed and open. Leaves the viewport in portrait with "Details" open, as the
 * steps after it expect.
 */
export async function verifyDrawingLayout(page: Page, info: TestInfo) {
  const c = (key: string) => drawingControl(page, key);
  const selected = () => selectedLayer(page);
  for (const viewport of [
    { width: 1194, height: 834 },
    { width: 834, height: 1194 },
  ]) {
    await page.setViewportSize(viewport);
    await closeDetails(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    // The canvas gets half the first screen or more (#39): it was 44.5 % at 1194 and 56.9 % at 834.
    expect(await canvasShare(page, '.drawing-workspace .cr-canvas-region')).toBeGreaterThanOrEqual(
      viewport.width === 834 ? 60 : 50,
    );
    const rail = (await page.locator('.drawing-workspace .cr-tool-rail').boundingBox())!;
    const canvas = (await page.locator('.drawing-workspace .cr-canvas-region').boundingBox())!;
    const inspector = (await page.locator('.drawing-workspace .cr-inspector').boundingBox())!;
    // The rail floats on the left edge of the canvas.
    expect(rail.x).toBeGreaterThanOrEqual(canvas.x);
    expect(rail.x + rail.width).toBeLessThan(canvas.x + canvas.width / 2);
    if (viewport.width === 1194) expect(inspector.x).toBeGreaterThan(canvas.x + canvas.width);
    else expect(inspector.y).toBeGreaterThan(canvas.y + canvas.height);
    // At fit the photo fills the canvas on one axis and stays inside it on the other.
    const view = await c('view.canvas').evaluate((element) => ({
      width: element.clientWidth,
      height: element.clientHeight,
    }));
    const fitted = (await page.locator('.drawing-workspace .drawing-photo').boundingBox())!;
    expect(fitted.width).toBeLessThanOrEqual(view.width + 1);
    expect(fitted.height).toBeLessThanOrEqual(view.height + 1);
    expect(
      Math.min(Math.abs(fitted.width - view.width), Math.abs(fitted.height - view.height)),
    ).toBeLessThanOrEqual(1);
    const touchTargets = async (controls: string[]) => {
      for (const control of controls) {
        const target = (await c(control).boundingBox())!;
        expect(target.height, control).toBeGreaterThanOrEqual(44);
        expect(target.width, control).toBeGreaterThanOrEqual(44);
      }
    };
    // Apply and Cancel sit in the canvas chip and undo in the shell header, outside "Details".
    await touchTargets(['tool.shape', 'path.apply', 'path.cancel', 'history.undo', 'layer.add']);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
    // Drawing mode compacts the pickers into one row; the surface select still shows this surface.
    await expect(
      page.locator('[data-control-id="surface.view.surface"] option:checked'),
    ).toHaveText((await page.locator('.app-page-title').textContent())!);
    // One title per surface page (#39): the editor header holds status and actions, no identity.
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.locator('.drawing-workspace .cr-editor-header')).not.toContainText(
      'CaliRestore',
    );
    expect(
      (await page.locator('.drawing-workspace .cr-editor-header').boundingBox())!.height,
    ).toBeLessThanOrEqual(56);
    // Both iPad orientations must pass axe with "Details" closed and open.
    for (const state of ['closed', 'open'] as const) {
      if (state === 'open') {
        await openDetails(page);
        await touchTargets(['point.x']);
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      await expectTaskLanguage(page, `drawing ${viewport.width} ${state}`);
      await page.screenshot({
        path: info.outputPath(`drawing-${viewport.width}-${state}.png`),
        fullPage: true,
      });
      expect(
        (await new AxeBuilder({ page }).include('.drawing-workspace').analyze()).violations,
      ).toEqual([]);
    }
    if (viewport.width < 1194) {
      // Portrait: the grip switches the inspector to its tall height and back.
      await closeDetails(page);
      await touchTargets(['view.inspector']);
      // Closing "Enter by number" and switching height bring the selected layer row into view.
      const rowInView = () =>
        selected().evaluate((row) => {
          const body = row.closest('.cr-inspector-body')!.getBoundingClientRect();
          const item = row.getBoundingClientRect();
          return item.top >= body.top - 1 && item.bottom <= body.bottom + 1;
        });
      await expect.poll(rowInView).toBe(true);
      const short = (await page.locator('.drawing-workspace .cr-inspector').boundingBox())!;
      await c('view.inspector').click();
      await expect(c('view.inspector')).toHaveAttribute('aria-expanded', 'true');
      const tall = (await page.locator('.drawing-workspace .cr-inspector').boundingBox())!;
      expect(tall.height).toBeGreaterThan(short.height);
      await expect.poll(rowInView).toBe(true);
      await page
        .locator('.drawing-workspace .cr-editor')
        .screenshot({ path: info.outputPath(`drawing-${viewport.width}-tall.png`) });
      expect(
        (await new AxeBuilder({ page }).include('.drawing-workspace').analyze()).violations,
      ).toEqual([]);
      await c('view.inspector').click();
      await expect(c('view.inspector')).toHaveAttribute('aria-expanded', 'false');
      await expect.poll(rowInView).toBe(true);
      // The steps after this loop expect "Details" open, as the last state left it.
      await openDetails(page);
    }
  }
}
