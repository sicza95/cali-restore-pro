import { expect, type Page } from '@playwright/test';
import { allowedTerms, bannedTerms } from '../src/platform/i18n/banned-terms';

const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * A raw float such as `0.00113388` or `1,23456`: five or more fraction digits. The shared
 * formatter (`src/platform/format/number.ts`) never shows more than four.
 */
const rawFloat = /\d[.,]\d{5,}/;

/**
 * Fails when the visible page text uses a banned engineering term or shows a UUID. Text in an
 * open dialog is skipped: the file preview shows the downloaded file's audit rows on purpose
 * (glossary rule 5).
 */
export async function expectTaskLanguage(page: Page, screen: string) {
  let text = await page.evaluate(() => {
    let all = document.body.innerText;
    for (const dialog of document.querySelectorAll<HTMLDialogElement>('dialog[open]'))
      all = all.replace(dialog.innerText, '');
    return all;
  });
  for (const phrase of allowedTerms) text = text.replace(phrase, '');
  const found = [...bannedTerms, uuid, rawFloat].flatMap((pattern) => {
    const match = pattern.exec(text);
    return match
      ? [`"${match[0]}" in …${text.slice(Math.max(0, match.index - 40), match.index + 40)}…`]
      : [];
  });
  expect(found, `task language on ${screen}`).toEqual([]);
}
