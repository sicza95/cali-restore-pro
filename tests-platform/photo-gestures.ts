import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Photo setup pans and zooms by gesture, like the drawing canvas (#34): arrow keys and drag pan,
 * Ctrl + wheel zooms around the pointer, a two-finger pinch zooms, and + − 0 work on the focused
 * canvas. Leaves the view at fit.
 */
export async function verifyPhotoGestures(page: Page) {
  const canvas = page.locator('[data-control-id="surface.view.canvas"]');
  const frame = page.locator('.surface-canvas .surface-photo-frame');
  const style = async () => (await frame.getAttribute('style')) ?? '';
  const zoom = async () => Number(/scale\(([\d.]+)\)/.exec(await style())![1]) * 100;
  const translate = async () => {
    const [, x, y] = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(await style())!;
    return { x: Number(x), y: Number(y) };
  };

  await expect(canvas).toHaveAttribute('tabindex', '0');
  await expect(canvas).toHaveAccessibleDescription(/arrow keys move/);
  await canvas.scrollIntoViewIfNeeded();
  await canvas.focus();
  await canvas.press('ArrowRight');
  await expect(frame).toHaveCSS('transform', /^matrix.*24/);
  await canvas.press('ArrowDown');
  expect(await translate()).toEqual({ x: 24, y: 24 });

  // Drag pans by the pointer's movement.
  const box = (await canvas.boundingBox())!;
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.down();
  await page.mouse.move(middle.x + 40, middle.y - 30, { steps: 4 });
  await page.mouse.up();
  expect(await translate()).toEqual({ x: 64, y: -6 });
  await canvas.press('0');
  await expect(frame).toHaveAttribute('style', /translate\(0px, 0px\) scale\(1\)/);

  // Ctrl + wheel zooms one step and keeps the photo point under the pointer.
  const fit = (await frame.boundingBox())!;
  const pointer = { x: fit.x + 0.3 * fit.width, y: fit.y + 0.4 * fit.height };
  await page.mouse.move(pointer.x, pointer.y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect.poll(zoom).toBeCloseTo(125, 2);
  const zoomed = (await frame.boundingBox())!;
  expect(Math.abs(zoomed.x + 0.3 * zoomed.width - pointer.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(zoomed.y + 0.4 * zoomed.height - pointer.y)).toBeLessThanOrEqual(1);

  // A two-finger pinch that spreads the fingers by 1.6 zooms by 1.6.
  const session = await page.context().newCDPSession(page);
  const finger = (dx: number) => ({ x: middle.x + dx, y: middle.y });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [finger(-50), finger(50)].map((point, id) => ({ ...point, id })),
  });
  for (const spread of [60, 70, 80]) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [finger(-spread), finger(spread)].map((point, id) => ({ ...point, id })),
    });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(zoom).toBeCloseTo(200, 0);

  // Keys on the focused canvas: − and + step the zoom, 0 fits.
  await canvas.focus();
  await canvas.press('-');
  await expect.poll(zoom).toBeCloseTo(160, 0);
  await canvas.press('+');
  await expect.poll(zoom).toBeCloseTo(200, 0);
  await canvas.press('0');
  await expect(frame).toHaveAttribute('style', /translate\(0px, 0px\) scale\(1\)/);
}

/** Share of the first screen (page at the top) that a canvas covers, in percent; the photo canvas by default. */
export async function canvasShare(page: Page, selector = '.surface-canvas') {
  await page.evaluate(() => window.scrollTo(0, 0));
  return page.locator(selector).evaluate((element) => {
    const box = element.getBoundingClientRect();
    const visible = Math.max(0, Math.min(box.bottom, innerHeight) - Math.max(box.top, 0));
    return Math.round((visible / innerHeight) * 100);
  });
}
