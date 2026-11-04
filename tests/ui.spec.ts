import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

async function openStory(page: Page, id: string, globals = '') {
  await page.goto(`/iframe.html?id=${id}&viewMode=story${globals ? `&globals=${globals}` : ''}`);
  await expect(page.locator('.cr-root')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('#storybook-root .cr-root > *').first()).toBeVisible();
}

test('left tool rail supports explicit keyboard selection', async ({ page }) => {
  await openStory(page, 'editor-tool-rail--on-photograph');
  const rail = page.getByRole('toolbar', { name: 'Drawing tools' });
  const brush = rail.getByRole('button', { name: 'Brush', exact: true });
  const eraser = rail.getByRole('button', { name: 'Eraser', exact: true });
  await brush.focus();
  await brush.press('ArrowDown');
  await expect(eraser).toBeFocused();
  await expect(brush).toHaveAttribute('aria-pressed', 'true');
  await eraser.press('Space');
  await expect(eraser).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Active tool: eraser')).toBeVisible();
  await eraser.press('Home');
  await expect(rail.getByRole('button', { name: 'Select', exact: true })).toBeFocused();
});

test('layer visibility and selection are separate from the active drawing tool', async ({
  page,
}) => {
  await openStory(page, 'editor-workspace--landscape');
  await expect(page.locator('.cr-mask-fill')).toHaveCount(2);
  await page.getByRole('button', { name: 'Hide Flaking', exact: true }).click();
  await expect(page.locator('.cr-mask-fill')).toHaveCount(1);
  await page.getByRole('button', { name: /^Lacunae/ }).click();
  await expect(page.getByRole('button', { name: /^Lacunae/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Brush', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Crack detail', exact: true }).click();
  await expect(page.locator('.cr-canvas')).toHaveAttribute('data-detail', 'true');
  await expect(page.getByRole('button', { name: /^Lacunae/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('focus mode preserves the selection and provides a visible route back', async ({ page }) => {
  await openStory(page, 'editor-workspace--landscape');
  await page.getByRole('button', { name: 'Focus canvas', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Surface inspector' })).toHaveCount(0);
  await expect(page.getByRole('toolbar', { name: 'Drawing tools' })).toBeVisible();
  await page.getByRole('button', { name: 'Show panels', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Surface inspector' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Flaking/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('calibration retains invalid input, traps focus and restores the opening control', async ({
  page,
}) => {
  await openStory(page, 'patterns-calibration-form--editable');
  const opener = page.getByRole('button', { name: 'Open calibration', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Calibration & units' });
  await expect(dialog).toBeVisible();
  await opener.focus();
  await expect(opener).not.toBeFocused();
  await dialog.getByRole('textbox', { name: 'Width', exact: true }).fill('12..5');
  await dialog.getByRole('button', { name: 'Apply calibration', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Width', exact: true })).toHaveValue('12..5');
  await expect(dialog.getByRole('textbox', { name: 'Width', exact: true })).toBeFocused();
  await expect(dialog.getByText('Enter a positive length.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apply calibration' }).click();
  await expect(page.getByRole('status')).toHaveText('300 × 200 cm applied to this example.');
});

for (const scenario of [
  { name: 'ipad-landscape-dark', width: 1194, height: 834, story: 'landscape' },
  { name: 'ipad-landscape-light', width: 1194, height: 834, story: 'light' },
  { name: 'ipad-portrait-dark', width: 834, height: 1194, story: 'landscape' },
  { name: 'ipad-portrait-light', width: 834, height: 1194, story: 'light' },
  { name: 'desktop-dark', width: 1440, height: 900, story: 'landscape' },
]) {
  test(`${scenario.name}: layout, touch targets, font and accessibility`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await openStory(page, `editor-workspace--${scenario.story}`);
    await expect(page.locator('.cr-photo-space img')).toBeVisible();
    await page.locator('.cr-photo-space img').evaluate((image: HTMLImageElement) => image.decode());
    expect(await page.evaluate(() => document.fonts.check('14px "DM Sans Variable"'))).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const canvas = await page.locator('.cr-canvas-region').boundingBox();
    const inspector = await page.locator('.cr-inspector').boundingBox();
    const rail = await page.getByRole('toolbar', { name: 'Drawing tools' }).boundingBox();
    expect(canvas).not.toBeNull();
    expect(inspector).not.toBeNull();
    expect(rail).not.toBeNull();
    if (!canvas || !inspector || !rail) return;
    expect(rail.x - canvas.x).toBeLessThan(24);
    expect(canvas.height).toBeGreaterThan(400);
    if (scenario.width < 961) expect(inspector.y).toBeGreaterThanOrEqual(canvas.y + canvas.height);
    else expect(inspector.x).toBeGreaterThanOrEqual(canvas.x + canvas.width);
    for (const button of await page
      .getByRole('toolbar', { name: 'Drawing tools' })
      .getByRole('button')
      .all()) {
      const box = await button.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    const accessibility = await new AxeBuilder({ page })
      .include('.cr-root')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`${scenario.name}.png`), fullPage: true });
  });
}

test('opaque preference removes blur without moving the tool rail', async ({ page }) => {
  await openStory(page, 'editor-workspace--opaque-controls');
  const rail = page.getByRole('toolbar', { name: 'Drawing tools' });
  expect(await rail.evaluate((element) => getComputedStyle(element).backdropFilter)).toBe('none');
  await expect(rail.getByRole('button', { name: 'Brush', exact: true })).toBeVisible();
});

test('all component stories render without browser errors', async ({ page, request }) => {
  test.setTimeout(90_000);
  const response = await request.get('/index.json');
  const index = (await response.json()) as {
    entries: Record<string, { id: string; type: string }>;
  };
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const stories = Object.values(index.entries).filter((entry) => entry.type === 'story');
  expect(stories.length).toBeGreaterThan(20);
  for (const story of stories) {
    await openStory(page, story.id);
    await expect(page.locator('.sb-errordisplay')).not.toBeVisible();
  }
  expect(errors).toEqual([]);
});
