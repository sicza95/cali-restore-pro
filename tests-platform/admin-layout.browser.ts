import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { operations, routeAdmin } from './admin-fixtures';
import { measureAdmin, type AdminGeometry } from './admin-measure';
import { expectTaskLanguage } from './copy-guard';

const copy = {
  en: { parts: ['Accounts', 'Mail queue', 'Recent security events'], jobs: 'Recent mail jobs' },
  hu: {
    parts: ['Fiókok', 'Levélküldési sor', 'Legutóbbi biztonsági események'],
    jobs: 'Legutóbbi levélküldések',
  },
};
const gutter = 32;

/**
 * Landscape (#36): every part starts in the first screen; the parts' columns tile the content
 * width (gaps up to the grid gutter) and each column is covered by its parts over the first
 * screen (gaps up to the gutter between stacked parts), so no column is empty; and each part's
 * rightmost text or control ends in the right quarter of the part.
 */
function expectNoEmptyColumn(g: AdminGeometry) {
  const bottom = Math.min(g.viewport.height, Math.max(...g.parts.map((p) => p.box.bottom)));
  const top = Math.min(...g.parts.map((p) => p.box.top));
  for (const part of g.parts) expect(part.box.top, part.name).toBeLessThan(g.viewport.height);
  const columns = [...new Set(g.parts.map((p) => Math.round(p.box.left)))].sort((a, b) => a - b);
  let reach = g.content.left;
  for (const left of columns) {
    const parts = g.parts.filter((p) => Math.round(p.box.left) === left);
    expect(left - reach, `gap before the column of ${parts[0].name}`).toBeLessThanOrEqual(gutter);
    reach = Math.max(...parts.map((p) => p.box.right));
    const covered = parts.reduce(
      (sum, p) => sum + Math.max(0, Math.min(p.box.bottom, bottom) - Math.max(p.box.top, top)),
      0,
    );
    expect(
      covered,
      `first screen covered in the column of ${parts[0].name}`,
    ).toBeGreaterThanOrEqual(bottom - top - gutter * (parts.length - 1));
  }
  expect(g.content.right - reach, 'gap after the last column').toBeLessThanOrEqual(1);
  for (const part of g.parts) {
    const width = part.box.right - part.box.left;
    expect(part.inkRight - part.box.left, `${part.name} fills its width`).toBeGreaterThanOrEqual(
      width * 0.75,
    );
  }
}

/** Portrait: full-width parts stacked in reading order without overlap. */
function expectStack(g: AdminGeometry) {
  g.parts.forEach((part, index) => {
    expect(part.box.left - g.content.left, part.name).toBeLessThanOrEqual(1);
    expect(g.content.right - part.box.right, part.name).toBeLessThanOrEqual(1);
    if (index)
      expect(part.box.top, part.name).toBeGreaterThanOrEqual(g.parts[index - 1].box.bottom);
  });
}

async function expectSheet(page: Page, g: AdminGeometry) {
  expect(g.scrollWidth, 'no sideways scroll').toBe(g.viewport.width);
  expect(g.inkRight, 'nothing runs past the sheet').toBeLessThanOrEqual(g.content.right + 1);
  const small = await page
    .locator('.account-content')
    .locator('button, select, summary, input:not([type=checkbox]), label.confirmation')
    .evaluateAll((els) =>
      els.flatMap((el) => {
        const r = el.getBoundingClientRect();
        return r.width && (r.width < 44 || r.height < 44)
          ? [`${el.textContent?.trim() || el.outerHTML.slice(0, 60)} ${r.width}×${r.height}`]
          : [];
      }),
    );
  expect(small, '44 px targets').toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
}

for (const state of ['rows', 'empty'] as const)
  for (const lang of ['en', 'hu'] as const)
    for (const theme of ['light', 'dark'] as const)
      test(`admin parts fill landscape and stack in portrait: ${state}, ${lang}, ${theme}`, async ({
        page,
      }, info) => {
        const c = copy[lang];
        await page.emulateMedia({ colorScheme: theme });
        await page.setViewportSize({ width: 1194, height: 834 });
        await routeAdmin(page, state);
        await page.goto('/admin');
        if (lang === 'hu') await page.getByLabel('App language').selectOption('hu');
        await expect(page.getByRole('heading', { name: c.parts[2] })).toBeVisible();
        const jobs = page.getByText(c.jobs, { exact: true });
        const landscape = await measureAdmin(page, c.parts);
        expectNoEmptyColumn(landscape);
        expect((await jobs.boundingBox())!.y, 'jobs in the first screen').toBeLessThan(834 - 44);
        await expectSheet(page, landscape);
        await expectTaskLanguage(page, `admin ${state} ${lang}`);
        await page.screenshot({
          path: info.outputPath(`admin-1194-${state}-${lang}-${theme}.png`),
        });

        await page.setViewportSize({ width: 834, height: 1194 });
        const portrait = await measureAdmin(page, c.parts);
        expectStack(portrait);
        await expectSheet(page, portrait);
        await page.screenshot({
          path: info.outputPath(`admin-834-${state}-${lang}-${theme}.png`),
          fullPage: true,
        });

        if (state === 'rows') {
          // An open account and the open jobs list keep their long values inside the page.
          await jobs.click();
          // A long email in an audit reference must wrap in both orientations.
          const longReference = page
            .locator('.admin-reference')
            .getByText(operations.audit[1].subjectEmail!, { exact: true });
          await expect(longReference.first()).toBeVisible();
          await expectTaskLanguage(page, `admin open jobs ${lang}`);
          await page.locator('[data-control-id="admin.account.open"]').nth(1).click();
          for (const size of [
            { width: 834, height: 1194 },
            { width: 1194, height: 834 },
          ]) {
            await page.setViewportSize(size);
            await expectSheet(page, await measureAdmin(page, c.parts));
            await page.screenshot({
              path: info.outputPath(`admin-${size.width}-open-${theme}.png`),
              fullPage: true,
            });
          }
        }
      });
