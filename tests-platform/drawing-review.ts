import { expect, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { drawingControls } from '../src/ui/editor/drawing-review/registry';
import { expectTaskLanguage } from './copy-guard';
import { canvasShare } from './photo-gestures';

export function drawingControl(page: Page, key: string) {
  const id = 'surface.draw.' + key;
  expect(drawingControls.filter((item) => item.id === id)).toHaveLength(1);
  return page.locator(`[data-control-id="${id}"]`);
}

/**
 * Opens "Enter by number" when it is closed. It holds the coordinate fields, point editing and
 * save mode, which Playwright cannot fill or select while the disclosure is closed.
 */
export async function openDetails(page: Page) {
  const details = page.locator('.drawing-workspace details.drawing-details');
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open)))
    await details.locator('> summary').click();
  await expect(details).toHaveAttribute('open', '');
}

/** Closes "Enter by number" when it is open, so the pointer path is the only one on screen. */
export async function closeDetails(page: Page) {
  const details = page.locator('.drawing-workspace details.drawing-details');
  if (await details.evaluate((element) => (element as HTMLDetailsElement).open))
    await details.locator('> summary').click();
  await expect(details).not.toHaveAttribute('open', '');
}

/**
 * Records every `surface.draw.*` control id that the page renders from now on, including ones
 * that appear only briefly (a dialog, a tool's settings). The returned function reads the set.
 */
async function recordDrawingControls(page: Page) {
  await page.evaluate(() => {
    const seen = new Set<string>();
    const scan = (root: Element) => {
      for (const element of [root, ...root.querySelectorAll('[data-control-id]')]) {
        const id = element.getAttribute('data-control-id');
        if (id?.startsWith('surface.draw.')) seen.add(id);
      }
    };
    scan(document.body);
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes') scan(record.target as Element);
        for (const node of record.addedNodes) if (node instanceof Element) scan(node);
      }
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-control-id'],
    });
    (window as unknown as { drawingControlsSeen: Set<string> }).drawingControlsSeen = seen;
  });
  return () =>
    page.evaluate(() => [
      ...(window as unknown as { drawingControlsSeen: Set<string> }).drawingControlsSeen,
    ]);
}

/**
 * Parity: the workspace renders every registered drawing control at some point of the flow, and
 * nothing it renders is missing from the registry.
 */
function expectDrawingParity(seen: readonly string[]) {
  const registered = new Set(drawingControls.map(({ id }) => id));
  const rendered = new Set(seen);
  expect(
    [...registered].filter((id) => !rendered.has(id)).sort(),
    'registered, never rendered',
  ).toEqual([]);
  expect(
    [...rendered].filter((id) => !registered.has(id)).sort(),
    'rendered, not registered',
  ).toEqual([]);
}

export async function verifyDrawingReview(page: Page, info: TestInfo) {
  const seen = await recordDrawingControls(page);
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
  await expect(page.getByText(/^Masks are saved to this surface/)).toBeVisible();
  await openDetails(page);
  // The exact zoom field sits in "Enter by number" with the other exact values, not the footer.
  await expect(page.locator('.drawing-details').locator(c('view.zoom'))).toHaveCount(1);
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
  await expect(c('history.undo')).toHaveAccessibleName('Undo · Several marks · Damage mask');
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
  await expect(c('history.undo')).toHaveAccessibleName('Undo · Layer change · Work phase mask');
  await c('history.undo').click();
  await expect(c('layer.locked')).not.toBeChecked();
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
  expectDrawingParity(await seen());
}
