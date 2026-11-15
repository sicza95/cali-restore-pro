import { expect, type Page } from '@playwright/test';
import { drawingControl, openDetails } from './drawing-review';

export async function verifyDrawingInput(page: Page) {
  const c = (key: string) => drawingControl(page, key);
  const selected = page.locator(
    '[data-control-id="surface.draw.layer.select"][aria-pressed="true"]',
  );
  await c('layer.add').click();
  await expect(selected).toContainText('Damage mask');
  await c('tool.brush').click();
  await openDetails(page);
  await c('history.mode').selectOption('manual');
  await c('brush.pressure').check();
  await c('brush.finger').check();

  const canvas = c('view.canvas');
  const photo = page.locator('.drawing-photo img');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await photo.boundingBox())!;
  const p = (x: number, y: number) => ({ x: box.x + x * box.width, y: box.y + y * box.height });
  const cdp = await page.context().newCDPSession(page);
  const touch = (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    points: { x: number; y: number }[],
  ) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((point, id) => ({ ...point, id })),
    });
  const pen = (type: 'mousePressed' | 'mouseMoved' | 'mouseReleased', x: number, force: number) =>
    cdp.send('Input.dispatchMouseEvent', {
      type,
      ...p(x, 0.48),
      pointerType: 'pen',
      button: 'left',
      buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: 1,
      force,
    });
  try {
    await touch('touchStart', [p(0.4, 0.5)]);
    await touch('touchStart', [p(0.4, 0.5), p(0.6, 0.5)]);
    await touch('touchMove', [p(0.25, 0.5), p(0.75, 0.5)]);
    await touch('touchEnd', []);
    await expect.poll(async () => Number(await c('view.zoom').inputValue())).toBeCloseTo(250, 2);
    await expect(selected).not.toContainText('Pending marks');
    await c('view.fit').click();
    await canvas.scrollIntoViewIfNeeded();

    await pen('mousePressed', 0.3, 0.1);
    await pen('mouseMoved', 0.45, 0.25);
    await pen('mouseMoved', 0.65, 0.9);
    const outline = await canvas.locator('.drawing-live-stroke').getAttribute('d');
    expect(outline).toMatch(/^M/);
    const points = outline!
      .slice(1, -1)
      .split('L')
      .map((pair) => pair.split(' ').map(Number));
    const left = Math.min(...points.map(([x]) => x!));
    const right = Math.max(...points.map(([x]) => x!));
    const span = (edge: number) => {
      const ys = points.filter(([x]) => Math.abs(x! - edge) < 4).map(([, y]) => y!);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(span(right)).toBeGreaterThan(span(left) * 1.5);
    await pen('mouseReleased', 0.65, 0);
    await expect(selected).toContainText('Pending marks 1');
    await touch('touchStart', [p(0.45, 0.5)]);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(selected).toContainText('Pending marks 1');

    const tap = async (count: number) => {
      await touch(
        'touchStart',
        Array.from({ length: count }, (_, i) => p(0.35 + i * 0.15, 0.5)),
      );
      await touch('touchEnd', []);
    };
    await tap(2);
    await expect(selected).toContainText('Pending marks 1');
    await tap(2);
    await expect(selected).toContainText('Undone draft marks 1');
    await tap(3);
    await expect(selected).toContainText('Pending marks 1');

    await c('history.commit').click();
    await expect(selected).toContainText('1 · Mark');
    await c('history.undo').click();
    await expect(selected).toContainText('0 · Mark');
    await c('layer.properties').click();
    await c('layer.remove').click();
    await expect(selected).toContainText('Master mask');
    await c('layer.properties').click();
    await c('history.mode').selectOption('stroke');
    await c('brush.finger').uncheck();
    await c('brush.pressure').uncheck();
    await c('tool.select').click();
  } finally {
    await cdp.detach();
  }
}

export async function verifyDetailDrawing(page: Page) {
  const c = (key: string) => drawingControl(page, key);
  const row = c('layer.select').filter({ hasText: 'Independent phase' });
  await c('mode.drawing').click();
  await expect(c('tool.brush')).toBeEnabled();
  await row.click();
  await c('tool.brush').click();
  const img = page.locator('.drawing-photo img');
  await img.scrollIntoViewIfNeeded();
  const box = (await img.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.06, box.y + box.height * 0.06);
  await expect(row).toContainText('3 · Mark');
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await expect(row).toContainText('4 · Mark');
  await c('history.undo').click();
  await expect(row).toContainText('3 · Mark');
  await c('mode.photo').click();
}

export async function verifyPointerStroke(page: Page) {
  const c = (key: string) => drawingControl(page, key);
  const selected = page.locator(
    '[data-control-id="surface.draw.layer.select"][aria-pressed="true"]',
  );
  const marks = async () => Number((await selected.textContent())?.match(/(\d+) · Mark/)?.[1]);
  await c('tool.brush').click();
  await expect(c('history.mode')).toHaveValue('stroke');
  const before = await marks();
  expect(before).not.toBeNaN();

  await c('view.canvas').scrollIntoViewIfNeeded();
  const box = (await page.locator('.drawing-photo img').boundingBox())!;
  const at = (x: number, y: number) => [box.x + x * box.width, box.y + y * box.height] as const;
  await page.mouse.move(...at(0.3, 0.6));
  await page.mouse.down();
  await page.mouse.move(...at(0.45, 0.55), { steps: 6 });
  await page.mouse.move(...at(0.6, 0.65), { steps: 6 });
  await page.mouse.up();

  await expect.poll(marks).toBe(before + 1);
  await expect(c('history.undo')).toHaveAccessibleName(/^Undo · Brush stroke · /);
  await c('history.undo').click();
  await expect.poll(marks).toBe(before);

  // Pen taps on the photo; Enter on the canvas applies the path and Escape cancels the next one.
  const count = page.locator('.cr-tool-context .drawing-sketch-count');
  await c('tool.pen').click();
  for (const [x, y] of [
    [0.3, 0.3],
    [0.6, 0.35],
    [0.45, 0.7],
  ] as const)
    await page.mouse.click(...at(x, y));
  await expect(count).toHaveText('3 points');
  await expect(c('view.canvas')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(marks).toBe(before + 1);
  await c('history.undo').click();
  await expect.poll(marks).toBe(before);
  await page.mouse.click(...at(0.3, 0.3));
  await page.mouse.click(...at(0.6, 0.35));
  await expect(count).toHaveText('2 points');
  await page.keyboard.press('Escape');
  await expect(count).toHaveText('0 points');
  await expect.poll(marks).toBe(before);
  await c('tool.select').click();
}
