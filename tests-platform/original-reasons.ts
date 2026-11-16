import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import type { Locator, Page, TestInfo } from '@playwright/test';

/** Why a photo's controls are blocked (#72, #75), as the originals list says it (#79). */
export const reasons = {
  en: {
    draft: 'Resolve the drawing drafts before changing this original.',
    hidden:
      'This original has drawing drafts. To resolve them, make it the first original with the Mapping role.',
    checkpoint: 'A saved checkpoint uses this original.',
  },
  hu: {
    draft: 'Az eredeti kép módosítása előtt rendezze a rajzvázlatokat.',
    hidden:
      'Ehhez az eredeti képhez rajzvázlatok tartoznak. A rendezésükhöz tegye az első „Térképezés” szerepű eredeti képpé.',
    checkpoint: 'Egy mentett ellenőrzőpont használja az eredeti képet.',
  },
};
type Reason = keyof (typeof reasons)['en'];
type Language = keyof typeof reasons;
/** The reason for each blocked control of a row; a control left out is not blocked by a rule. */
export type Expected = { role?: Reason; remove?: Reason };

const row = (page: Page, name: string) =>
  page.locator('.project-originals li').filter({ hasText: name });
const notes = (page: Page, name: string) => row(page, name).locator('.field-help');

/**
 * `inner` lies inside `outer` and inside every ancestor that clips; with `text`, its text too,
 * which can overflow its box. Both are measured at once, and again while the page settles (photos
 * and file names load above and inside the list).
 */
async function expectUnclipped(inner: Locator, outer: Locator, step: string, text = false) {
  const container = await outer.elementHandle();
  const measure = () =>
    inner.evaluate(
      (element, { container, text }) => {
        type Box = { left: number; right: number; top: number; bottom: number };
        const range = document.createRange();
        range.selectNodeContents(element);
        const box = element.getBoundingClientRect();
        const words = text ? range.getBoundingClientRect() : box;
        const own = {
          left: Math.min(box.left, words.left),
          right: Math.max(box.right, words.right),
          top: Math.min(box.top, words.top),
          bottom: Math.max(box.bottom, words.bottom),
        };
        const round = (r: Box) => [r.left, r.top, r.right, r.bottom].map(Math.round).join(',');
        const inside = (r: Box) =>
          own.left >= r.left - 0.5 &&
          own.right <= r.right + 0.5 &&
          own.top >= r.top - 0.5 &&
          own.bottom <= r.bottom + 0.5;
        const problems: string[] = [];
        const outerBox = container!.getBoundingClientRect();
        if (!inside(outerBox)) problems.push(`${round(own)} outside ${round(outerBox)}`);
        if (element.scrollWidth > element.clientWidth) problems.push('overflows');
        for (let node = element.parentElement; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
            if (node !== document.documentElement && node !== document.body)
              if (!inside(node.getBoundingClientRect()))
                problems.push('clipped by ' + node.className);
          }
        }
        return problems;
      },
      { container, text },
    );
  await expect.poll(measure, { message: step }).toEqual([]);
}

/**
 * The row of `name` shows each reason once as visible text, in control order, and each blocked
 * control is described by the paragraph with its own reason only (no `title` repeating it).
 */
export async function expectReasons(
  page: Page,
  name: string,
  expected: Expected,
  step: string,
  language: Language = 'en',
) {
  const copy = reasons[language];
  const texts = [...new Set([expected.role, expected.remove])]
    .filter((key): key is Reason => !!key)
    .map((key) => copy[key]);
  const shown = notes(page, name);
  await expect(shown, step).toHaveText(texts);
  const line = row(page, name);
  for (const note of await shown.all()) {
    await expect(note, step).toBeVisible();
    await expectUnclipped(note, line, step, true);
  }
  const controls = {
    role: line.locator('[data-control-id="originals.change-role"]'),
    remove: line.locator('[data-control-id="originals.remove"]'),
  };
  for (const key of ['role', 'remove'] as const) {
    const control = controls[key];
    await expectUnclipped(control, line, `${step}: ${key} control`);
    await expect(control, step).not.toHaveAttribute('title');
    const reason = expected[key];
    if (!reason) continue;
    await expect(control, step).toBeDisabled();
    await expect(control, step).toHaveAccessibleDescription(copy[reason]);
    const id = await control.getAttribute('aria-describedby');
    expect(id, `${step}: ${key} described by`).toBeTruthy();
    await expect(line.locator(`[id="${id}"]`), step).toHaveText(copy[reason]);
  }
}

/** After the controls are enabled (the journals are read), the row says nothing. */
export async function expectNoReason(page: Page, name: string, step: string) {
  await expect(notes(page, name), step).toHaveCount(0);
}

const language = (page: Page) => page.locator('[data-control-id="app.nav.language"]');

/**
 * Screenshots of the originals list at 1194 and 834 in EN and HU, with the reasons checked in
 * each; `rows` names the photos whose reasons to check. With `dark`, also dark at 834, and axe on
 * the originals list in both themes.
 */
export async function reasonShots(
  page: Page,
  info: TestInfo,
  file: string,
  rows: Record<string, Expected>,
  dark = false,
) {
  const list = page.locator('.project-originals');
  for (const lang of ['en', 'hu'] as const) {
    if (lang === 'hu') await language(page).selectOption('hu');
    for (const viewport of [
      { width: 1194, height: 834 },
      { width: 834, height: 1194 },
    ]) {
      await page.setViewportSize(viewport);
      const step = `${file} ${lang} ${viewport.width}`;
      for (const [name, expected] of Object.entries(rows))
        await expectReasons(page, name, expected, step, lang);
      await expect(page.locator('body'), step).toHaveJSProperty('scrollWidth', viewport.width);
      // A long reason wraps in its row and does not widen the list past the page's content.
      await expectUnclipped(list, page.getByRole('main'), `${step}: originals list`);
      await list.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath(`${file}-${lang}-${viewport.width}.png`),
        fullPage: true,
      });
    }
  }
  await language(page).selectOption('en');
  if (dark) {
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await expect(page.locator('body')).toHaveAttribute('data-theme', colorScheme);
      expect(
        (await new AxeBuilder({ page }).include('.project-originals').analyze()).violations,
        `${file} axe ${colorScheme}`,
      ).toEqual([]);
    }
    await page.setViewportSize({ width: 834, height: 1194 });
    await list.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`${file}-dark-834.png`), fullPage: true });
    await page.emulateMedia({ colorScheme: 'light' });
  }
  await page.setViewportSize({ width: 1194, height: 834 });
}
