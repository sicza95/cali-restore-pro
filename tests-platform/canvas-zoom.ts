import { expect, type Page } from '@playwright/test';
import { drawingControl } from './drawing-review';

/**
 * Wheel, trackpad (Ctrl + wheel) and keyboard zoom on the drawing canvas: Ctrl + wheel zooms
 * around the pointer, a plain wheel is left to the page at fit and pans when zoomed in, and the
 * `+`, `-` and `0` keys zoom from the focused canvas up to 800 %. The footer's zoom out and in
 * buttons step around the middle of the canvas, and the readout names the zoom.
 */
export async function verifyCanvasZoom(page: Page) {
  const c = (key: string) => drawingControl(page, key);
  const zoom = async () => Number(await c('view.zoom').inputValue());
  const photo = page.locator('.drawing-photo img');
  await c('tool.select').click();
  await c('view.canvas').scrollIntoViewIfNeeded();
  // A listener on window runs after the canvas's, so it sees whether the canvas cancelled the wheel.
  await page.evaluate(() => {
    const state = window as unknown as { wheelCancelled?: boolean };
    window.addEventListener('wheel', (event) => (state.wheelCancelled = event.defaultPrevented), {
      passive: true,
    });
  });
  const cancelled = () =>
    page.evaluate(() => (window as unknown as { wheelCancelled?: boolean }).wheelCancelled);

  const start = (await photo.boundingBox())!;
  await page.mouse.move(start.x + 0.3 * start.width, start.y + 0.6 * start.height);
  await page.mouse.wheel(0, 100);
  await expect.poll(cancelled).toBe(false);
  expect(await zoom()).toBe(100);
  // The page scrolled under the pointer; measure the photo again where it now is.
  await c('view.canvas').scrollIntoViewIfNeeded();
  const fit = (await photo.boundingBox())!;
  const pointer = { x: fit.x + 0.3 * fit.width, y: fit.y + 0.4 * fit.height };
  await page.mouse.move(pointer.x, pointer.y);

  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect.poll(zoom).toBeCloseTo(125, 2);
  expect(await cancelled()).toBe(true);
  // The photo point under the pointer stays under it.
  const zoomed = (await photo.boundingBox())!;
  expect(Math.abs(zoomed.x + 0.3 * zoomed.width - pointer.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(zoomed.y + 0.4 * zoomed.height - pointer.y)).toBeLessThanOrEqual(1);

  await page.mouse.wheel(0, 40);
  await expect.poll(async () => (await photo.boundingBox())!.y).toBeLessThan(zoomed.y);
  expect(await cancelled()).toBe(true);
  expect(await zoom()).toBeCloseTo(125, 2);

  // Footer buttons zoom one step around the middle of the canvas; the readout names the zoom.
  const stage = (await c('view.canvas').boundingBox())!;
  const middle = { x: stage.x + stage.width / 2, y: stage.y + stage.height / 2 };
  const before = (await photo.boundingBox())!;
  const at = {
    x: (middle.x - before.x) / before.width,
    y: (middle.y - before.y) / before.height,
  };
  await expect(c('view.fit')).toHaveAccessibleName('Fit · 125 %');
  await c('view.zoomIn').click();
  await expect.poll(zoom).toBeCloseTo(156.25, 2);
  await expect(c('view.fit')).toHaveText('156 %');
  const after = (await photo.boundingBox())!;
  expect(Math.abs(after.x + at.x * after.width - middle.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.y + at.y * after.height - middle.y)).toBeLessThanOrEqual(1);
  await c('view.zoomOut').click();
  await expect.poll(zoom).toBeCloseTo(125, 2);
  await c('view.zoomOut').click();
  await expect.poll(zoom).toBe(100);
  await expect(c('view.zoomOut')).toBeDisabled();
  await c('view.zoomIn').click();
  await expect.poll(zoom).toBeCloseTo(125, 2);

  await c('view.canvas').focus();
  await page.keyboard.press('+');
  await expect.poll(zoom).toBeCloseTo(156.25, 2);
  await page.keyboard.press('-');
  await expect.poll(zoom).toBeCloseTo(125, 2);
  for (let i = 0; i < 12; i++) await page.keyboard.press('=');
  await expect.poll(zoom).toBe(800);
  await page.keyboard.press('0');
  await expect.poll(zoom).toBe(100);
  const back = (await photo.boundingBox())!;
  expect(Math.abs(back.x - fit.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(back.y - fit.y)).toBeLessThanOrEqual(1);
}
