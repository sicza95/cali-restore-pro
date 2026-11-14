import { expect, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { drawingControls } from '../src/ui/editor/drawing-review/registry';

export function drawingControl(page: Page, key: string) {
  const id = 'surface.draw.' + key;
  expect(drawingControls.filter((item) => item.id === id)).toHaveLength(1);
  return page.locator(`[data-control-id="${id}"]`);
}

export async function verifyDrawingReview(page: Page, info: TestInfo) {
  const c = (key: string) => drawingControl(page, key);
  const layer = (name: string) => c('layer.select').filter({ hasText: name });
  const selected = () =>
    page.locator('[data-control-id="surface.draw.layer.select"][aria-pressed="true"]');
  const choose = (tool: string) => c('tool.' + tool).click();
  const point = async (x: number, y: number) => {
    await c('place.x').fill(String(x));
    await c('place.y').fill(String(y));
    await c('point.add').click();
  };

  await c('mode.drawing').click();
  await expect(page.getByText(/^Committed masks are saved to this surface/)).toBeVisible();
  await expect(c('tool.nodes')).toBeDisabled();
  await expect(c('brush.width')).toHaveCount(0);
  await c('tool.select').focus();
  await page.keyboard.press('ArrowDown');
  await expect(c('tool.hand')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(c('tool.brush')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(c('tool.brush')).toHaveAttribute('aria-pressed', 'true');
  await expect(c('brush.width')).toHaveValue('2');
  await expect(c('brush.pressure')).not.toBeChecked();
  await expect(c('brush.stabilize')).not.toBeChecked();
  await expect(c('brush.finger')).not.toBeChecked();
  await expect(c('brush.outline')).toBeChecked();
  await expect(c('brush.strength')).toHaveCount(0);
  await c('brush.stabilize').check();
  await expect(c('brush.strength')).toHaveValue('35');
  await c('brush.dot').click();
  await expect(layer('Master mask')).toContainText('1 · Mark');
  await c('tool.brush').focus();
  await page.keyboard.press('Control+z');
  await expect(layer('Master mask')).toContainText('0 · Mark');
  await page.keyboard.press('Control+Shift+z');
  await expect(layer('Master mask')).toContainText('1 · Mark');
  await c('view.original').check();
  await expect(c('tool.brush')).toBeDisabled();
  await expect(page.locator('.drawing-overlay')).toHaveCount(0);
  await c('view.original').uncheck();

  await c('history.mode').selectOption('manual');
  await c('layer.add').click();
  await expect(selected()).toContainText('Damage mask');
  await c('brush.dot').click();
  const photo = page.locator('.drawing-photo img');
  await photo.scrollIntoViewIfNeeded();
  const box = (await photo.boundingBox())!;
  const x = Math.round(box.x + box.width * 0.32);
  const y = Math.round(box.y + box.height * 0.42);
  const session = await page.context().newCDPSession(page);
  const tap = async () => {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await tap();
  await expect(selected()).toContainText('Pending marks 1');
  await c('brush.finger').check();
  await photo.scrollIntoViewIfNeeded();
  // The opt-in switch can scroll the page to the inspector. Use the current image position.
  const touchBox = (await photo.boundingBox())!;
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: touchBox.x + touchBox.width * 0.32, y: touchBox.y + touchBox.height * 0.42 },
    ],
  });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
  await expect(selected()).toContainText('Pending marks 2');
  await c('history.undo').click();
  await expect(selected()).toContainText('Pending marks 1');
  await c('history.redo').click();
  await expect(selected()).toContainText('Pending marks 2');
  await c('layer.kind').selectOption('phase');
  await c('layer.add').click();
  await c('brush.dot').click();
  await expect(layer('Damage mask')).toContainText('Pending marks 2');
  await expect(layer('Work phase mask')).toContainText('Pending marks 1');
  await c('layer.visibility').last().click();
  await expect(selected()).toContainText('Work phase mask');
  await expect(c('brush.width')).toHaveCount(0);
  await expect(c('history.commit')).toBeDisabled();
  await c('layer.visibility').last().click();

  await layer('Damage mask').click();
  await choose('nodes');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(c('resolve.cancel')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(c('tool.nodes')).toBeFocused();
  await expect(selected()).toContainText('Pending marks 2');
  await choose('nodes');
  await c('resolve.commit').click();
  await expect(c('point.mark')).toBeVisible();
  await expect(selected()).toContainText('2 · Mark');
  await expect(c('history.undo')).toHaveAccessibleName('Undo · Draft batch · Damage mask');
  await c('history.undo').click();
  await expect(selected()).toContainText('0 · Mark');
  await c('history.redo').click();
  await expect(selected()).toContainText('2 · Mark');
  await layer('Work phase mask').click();
  await choose('nodes');
  await c('resolve.discard').click();
  await expect(selected()).not.toContainText('Pending marks');
  await expect(c('tool.nodes')).toBeDisabled();

  await c('history.mode').selectOption('stroke');
  await choose('shape');
  await expect(c('path.apply')).toBeDisabled();
  await c('shape.kind').selectOption('ellipse');
  await c('path.operation').selectOption('replace');
  await point(25, 23);
  await point(77, 68);
  await c('path.apply').click();
  await expect(selected()).toContainText('1 · Mark');
  await choose('nodes');
  await c('point.mark').selectOption({ index: 1 });
  await expect(c('point.curve')).toBeChecked();
  await c('point.handleX').fill('80');
  await c('point.x').fill('50');
  await point(60, 30);
  await c('point.delete').click();
  await c('path.apply').click();
  await expect(c('history.undo')).toHaveAccessibleName('Undo · Point edit · Work phase mask');
  await c('layer.properties').click();
  await c('layer.locked').check();
  await expect(c('tool.nodes')).toBeDisabled();
  await expect(c('point.mark')).toHaveCount(0);
  await expect(c('history.undo')).toBeDisabled();
  await c('layer.locked').uncheck();
  await c('layer.clone').click();
  await expect(c('layer.select').filter({ hasText: 'Work phase mask' })).toHaveCount(2);
  await c('layer.name').fill('Independent phase');
  await c('layer.rename').click();
  await expect(selected()).toContainText('Independent phase');
  await expect(selected()).toContainText('1 · Mark');
  await c('layer.properties').click();

  await choose('pen');
  await c('path.operation').selectOption('add');
  await point(14, 32);
  await point(36, 56);
  await point(20, 72);
  await c('path.close').check();
  await c('point.delete').click();
  await expect(c('path.apply')).toBeDisabled();
  await point(19, 73);
  await c('path.apply').click();
  await expect(selected()).toContainText('2 · Mark');
  await c('mode.photo').click();
  await expect(page.locator('.surface-canvas img')).toBeVisible();
  await c('mode.drawing').click();
  await expect(selected()).toContainText('2 · Mark');

  await choose('shape');
  await c('shape.kind').selectOption('rectangle');
  await point(53, 15);
  await point(83, 40);
  for (const viewport of [
    { width: 1194, height: 834 },
    { width: 834, height: 1194 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo(0, 0));
    const rail = (await page.locator('.drawing-rail').boundingBox())!;
    const canvas = (await page.locator('.drawing-stage').boundingBox())!;
    const inspector = (await page.locator('.drawing-inspector').boundingBox())!;
    expect(rail.x + rail.width).toBeLessThan(canvas.x);
    if (viewport.width === 1194) expect(inspector.x).toBeGreaterThan(canvas.x + canvas.width);
    else expect(inspector.y).toBeGreaterThan(canvas.y + canvas.height);
    for (const control of [
      'tool.shape',
      'path.apply',
      'path.cancel',
      'history.undo',
      'layer.add',
      'point.x',
    ]) {
      const target = (await c(control).boundingBox())!;
      expect(target.height).toBeGreaterThanOrEqual(44);
      expect(target.width).toBeGreaterThanOrEqual(44);
    }
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
    await page.screenshot({
      path: info.outputPath('drawing-' + viewport.width + '.png'),
      fullPage: true,
    });
  }
  expect((await new AxeBuilder({ page }).include('.drawing-review').analyze()).violations).toEqual(
    [],
  );
  await c('path.cancel').click();
  await page.setViewportSize({ width: 1194, height: 834 });
  await c('tool.shape').focus();
  await page.keyboard.press('e');
  await expect(c('tool.eraser')).toHaveAttribute('aria-pressed', 'true');
  await c('brush.dot').click();
  await expect(c('history.undo')).toHaveAccessibleName('Undo · Erase stroke · Independent phase');
  await choose('hand');
  await c('view.zoom').fill('150');
  await c('view.zoom').blur();
  const stage = c('view.canvas');
  await stage.scrollIntoViewIfNeeded();
  const stageBox = (await stage.boundingBox())!;
  await page.mouse.move(stageBox.x + stageBox.width / 2, stageBox.y + stageBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + stageBox.width / 2 + 24, stageBox.y + stageBox.height / 2);
  await page.mouse.up();
  await expect(page.locator('.drawing-photo')).not.toHaveAttribute('style', /translate\(0%, 0%\)/);
  await c('view.fit').click();
  await expect(page.locator('.drawing-photo')).toHaveAttribute(
    'style',
    /translate\(0%, 0%\) scale\(1\)/,
  );
  await c('layer.kind').selectOption('folder');
  await c('layer.add').click();
  const folder = layer('Folder');
  await expect(folder).toHaveAttribute('aria-pressed', 'true');
  await c('layer.kind').selectOption('damage');
  await c('layer.add').click();
  await c('layer.expand').click();
  await expect(folder).toHaveAttribute('aria-pressed', 'true');
  await expect(layer('Damage mask')).toHaveCount(1);
  await c('layer.expand').click();
  await expect(layer('Damage mask')).toHaveCount(2);
  await layer('Independent phase').click();
  await c('layer.properties').click();
  await c('layer.parent').selectOption({ label: 'Folder' });
  await c('layer.fill').selectOption('hatch');
  await c('layer.opacity').fill('33');
  await c('layer.opacity').blur();
  await expect(c('layer.outline')).toBeEnabled();
  await c('layer.outline').uncheck();
  await expect(page.locator('.drawing-overlay path[fill^="url("]')).toHaveCount(1);
  await c('layer.down').click();
  await expect(c('layer.select').last()).toContainText('Independent phase');
  await c('mode.photo').click();
}
