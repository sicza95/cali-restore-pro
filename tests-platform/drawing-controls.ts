import { expect, type Page } from '@playwright/test';
import { drawingControls } from '../src/ui/editor/drawing-review/registry';

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

/** The layer row that is selected now. */
export const selectedLayer = (page: Page) =>
  page.locator('[data-control-id="surface.draw.layer.select"][aria-pressed="true"]');

/**
 * Records every `surface.draw.*` control id that the page renders from now on, including ones
 * that appear only briefly (a dialog, a tool's settings). The returned function reads the set.
 */
export async function recordDrawingControls(page: Page) {
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
export function expectDrawingParity(seen: readonly string[]) {
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
