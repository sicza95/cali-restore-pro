import { expect, type Page } from '@playwright/test';

/**
 * Banned engineering terms from `docs/copy-glossary.md`. Keep this list and the glossary's
 * table in step. English terms match as whole words; Hungarian ones as phrases, because
 * "előnézet" (preview) alone is allowed.
 */
const banned: RegExp[] = [
  /\bcommit(s|ted)?\b/i,
  /\bclient-side\b/i,
  /\bnot (yet )?connected\b/i,
  /\bnot cloud-synced\b/i,
  /\b(estimate|report|output|drawing|photo|checkpoint|draft|measurement) review\b/i,
  /\breview (history|version|phases?|commit|restore)\b/i,
  /\bindependent mask scope\b/i,
  /\bnumeric snapshot\b/i,
  /\bplatform connection\b/i,
  /\brestoration-v\d\b/i,
  /\bM-\d{2}\b/,
  /\biPad\b/,
  /\br\d+\b/,
  /előnézeti/i,
  /rögzítés|rögzített|rögzítse/i,
  /kliensoldali/i,
  /hatókör/i,
  /pillanatkép/i,
  /platformkapcsolat/i,
];

/** Words that contain a banned term but stay, per the glossary. */
const allowed: RegExp[] = [/encrypted backup/gi, /titkosított biztonsági mentés/gi];

const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

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
  for (const phrase of allowed) text = text.replace(phrase, '');
  const found = [...banned, uuid].flatMap((pattern) => {
    const match = pattern.exec(text);
    return match
      ? [`"${match[0]}" in …${text.slice(Math.max(0, match.index - 40), match.index + 40)}…`]
      : [];
  });
  expect(found, `engineering terms on ${screen}`).toEqual([]);
}
