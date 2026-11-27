import { expect, test } from '@playwright/test';

test('composite status icons keep one color and a clear lower-right supplement', async ({
  page,
}, info) => {
  for (const theme of ['light', 'dark']) {
    await page.goto(
      `/iframe.html?id=foundations-composite-icon--browser-status&viewMode=story&globals=theme:${theme}`,
    );
    await expect(page.locator('.cr-root')).toHaveAttribute('data-theme', theme);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.browser-status-text')).toHaveText([
      'Local only',
      'Syncing off',
      'Syncing',
      'Synced',
    ]);
    const icons = page.locator('.cr-composite-icon');
    await expect(icons).toHaveCount(9);
    for (const icon of await icons.all()) {
      const geometry = await icon.evaluate((element) => {
        const base = element.querySelector('.cr-composite-icon-base')!;
        const supplement = element.querySelector('.cr-composite-icon-supplement')!;
        const b = base.getBoundingClientRect();
        const s = supplement.getBoundingClientRect();
        const r = element.getBoundingClientRect();
        return {
          sameColor: getComputedStyle(base).color === getComputedStyle(supplement).color,
          smaller: s.width < b.width && s.height < b.height,
          lowerRight:
            s.x + s.width / 2 > b.x + b.width / 2 && s.y + s.height / 2 > b.y + b.height / 2,
          overlaps: s.x < b.right && s.y < b.bottom,
          masked: getComputedStyle(base).maskImage !== 'none',
          transparent: getComputedStyle(element).backgroundColor === 'rgba(0, 0, 0, 0)',
          contained: Array.from(element.querySelectorAll('span')).every((child) => {
            const c = child.getBoundingClientRect();
            return c.left >= r.left && c.top >= r.top && c.right <= r.right && c.bottom <= r.bottom;
          }),
        };
      });
      expect(geometry).toEqual({
        sameColor: true,
        smaller: true,
        lowerRight: true,
        overlaps: true,
        masked: true,
        transparent: true,
        contained: true,
      });
    }
    for (const viewport of [
      { width: 1194, height: 834 },
      { width: 834, height: 1194 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
      await page.screenshot({ path: info.outputPath(`composite-${theme}-${viewport.width}.png`) });
    }
  }
});
