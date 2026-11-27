import { expect, type Page, type TestInfo } from '@playwright/test';
import { browserControl as control, browserItem } from './project-browser';

export async function verifyArchiveChrome(page: Page, name: string, info: TestInfo) {
  await page.keyboard.press('Escape');
  for (const viewport of [
    { width: 1194, height: 834 },
    { width: 834, height: 1194 },
  ]) {
    await page.setViewportSize(viewport);
    for (const view of ['grid', 'list']) {
      await control(page, `browser.view.${view}`).click();
      const item = browserItem(page, name);
      await expect(item.getByRole('img', { name: 'Archived', exact: true })).toBeVisible();
      await expect(item.locator('.browser-preview')).toHaveCSS('filter', 'grayscale(1)');
      await expect(item.locator('.browser-item-name')).toHaveCSS('opacity', '1');
      await expect(
        browserItem(page, `${name} (copy)`).locator('.browser-item-archived'),
      ).toHaveCount(0);
      const clear = await item.evaluate((element) => {
        const archive = element.querySelector('.browser-item-archived')!.getBoundingClientRect();
        const more = element.querySelector('.browser-item-more')!.getBoundingClientRect();
        const status = element.querySelector('.browser-item-status')!.getBoundingClientRect();
        const visibility = element
          .querySelector('.browser-item-visibility')!
          .getBoundingClientRect();
        return [more, status, visibility].every(
          (rect) =>
            archive.right <= rect.left ||
            archive.left >= rect.right ||
            archive.bottom <= rect.top ||
            archive.top >= rect.bottom,
        );
      });
      expect(clear).toBe(true);
      for (const dropdown of ['browser.show', 'browser.actions.overflow']) {
        await control(page, dropdown).click();
        const panel = page.locator('.browser-toolbar .browser-popup-panel:visible');
        await expect(panel).toHaveCount(1);
        expect(
          await panel.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const x = rect.left + rect.width / 2,
              y = rect.top + Math.min(rect.height / 2, 32);
            const itemButton = document.querySelector<HTMLElement>(
              '.browser-content .browser-item-more',
            )!;
            // Exercise a real item button overlapping either menu, independent of toolbar width.
            const values = {
              position: 'fixed',
              left: `${x - 22}px`,
              top: `${y - 22}px`,
              right: 'auto',
              transform: 'none',
            };
            const previous = Object.keys(values).map((key) => [
              key,
              itemButton.style.getPropertyValue(key),
            ]);
            try {
              for (const [key, value] of Object.entries(values))
                itemButton.style.setProperty(key, value);
              const initial = itemButton.getBoundingClientRect();
              // Query containers can establish a containing block for fixed descendants.
              itemButton.style.left = `${x - 22 + x - (initial.left + initial.width / 2)}px`;
              itemButton.style.top = `${y - 22 + y - (initial.top + initial.height / 2)}px`;
              const overlap = itemButton.getBoundingClientRect();
              return (
                overlap.left <= x &&
                overlap.right >= x &&
                overlap.top <= y &&
                overlap.bottom >= y &&
                element.contains(document.elementFromPoint(x, y))
              );
            } finally {
              for (const [key, value] of previous) {
                if (value) itemButton.style.setProperty(key, value);
                else itemButton.style.removeProperty(key);
              }
            }
          }),
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(`archived-${view}-${viewport.width}-${dropdown}.png`),
        });
        await page.keyboard.press('Escape');
      }
    }
  }
  await page.setViewportSize({ width: 1194, height: 834 });
  await control(page, 'browser.view.grid').click();
  await control(page, 'browser.show').click();
}
