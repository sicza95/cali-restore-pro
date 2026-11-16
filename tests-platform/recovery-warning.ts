import { expect } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { drawingCopy } from '../src/ui/editor/drawing-review/copy';

/**
 * The recovery conflict is a warning on the first screen with its action beside it (#38).
 * Called while the surface shows the conflict: unsaved drawing drafts whose assessment changed.
 */
export async function verifyRecoveryWarning(page: Page, info: TestInfo) {
  // The page-wide check projects.browser.ts ran here before; it moved with the helper.
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const notice = page.locator('.surface-recovery');
  const message = notice.locator('p');
  const discard = notice.getByRole('button');
  const language = page.locator('[data-control-id="app.nav.language"]');
  for (const lang of ['en', 'hu'] as const) {
    const copy = drawingCopy(lang);
    await language.selectOption(lang);
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await expect(page.locator('body')).toHaveAttribute('data-theme', colorScheme);
      for (const viewport of [
        { width: 1194, height: 834 },
        { width: 834, height: 1194 },
      ]) {
        await page.setViewportSize(viewport);
        await page.evaluate(() => window.scrollTo(0, 0));
        // A polite status: the conflict is not time-sensitive and often follows the user's own
        // action, whose status an assertive alert would cut off.
        await expect(message).toHaveRole('status');
        await expect(message).toContainText(copy.recoveryPaused);
        await expect(message).toContainText(copy.recoveryConflict);
        await expect(notice).toHaveAttribute('data-warning', 'true');
        await expect(discard).toHaveText(copy.discard);
        await expect(discard).toHaveAccessibleDescription(
          `${copy.recoveryPaused} ${copy.recoveryConflict}`,
        );
        const rule = await notice.evaluate((element) => {
          const probe = document.createElement('span');
          probe.style.color = 'var(--cr-warning)';
          element.append(probe);
          const token = getComputedStyle(probe).color;
          probe.remove();
          return { token, border: getComputedStyle(element).borderLeftColor };
        });
        expect(rule.border).toBe(rule.token);
        // On the first screen, above the canvas, with the action in the message's row.
        const box = (await notice.boundingBox())!;
        const canvas = (await page.locator('.surface-stage').boundingBox())!;
        const text = (await message.boundingBox())!;
        const button = (await discard.boundingBox())!;
        expect(box.y + box.height).toBeLessThanOrEqual(canvas.y);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
        expect(button.x).toBeGreaterThan(text.x + text.width - 1);
        expect(button.y).toBeLessThan(text.y + text.height);
        expect(button.y + button.height).toBeGreaterThan(text.y);
        expect(button.height).toBeGreaterThanOrEqual(44);
        expect(button.width).toBeGreaterThanOrEqual(44);
        await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
        const results = await new AxeBuilder({ page }).include('.surface-recovery').analyze();
        expect(results.violations).toEqual([]);
        await page.screenshot({
          path: info.outputPath(`recovery-${lang}-${colorScheme}-${viewport.width}.png`),
        });
      }
    }
  }
  // Keyboard: Tab from the last mode tab reaches the action, with a visible outline.
  await page.locator('[data-control-id="checkpoint.review.mode"]').focus();
  await page.keyboard.press('Tab');
  await expect(discard).toBeFocused();
  await expect(discard).toHaveCSS('outline-style', 'solid');
  await language.selectOption('en');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 1194, height: 834 });
}
