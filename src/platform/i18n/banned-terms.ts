/**
 * Banned engineering terms from `docs/copy-glossary.md`, shared by the catalogue unit test and the
 * rendered-screen guard (`tests-platform/copy-guard.ts`). Keep this list and the glossary's table
 * in step. English terms match as whole words; Hungarian ones as phrases, because "előnézet"
 * (preview) alone is allowed.
 */
export const bannedTerms: RegExp[] = [
  /\bcommit(s|ted)?\b/i,
  /\bclient-side\b/i,
  /\bnot (yet )?connected\b/i,
  /\bnot cloud-synced\b/i,
  /\b(estimate|report|output|drawing|photo|checkpoint|draft|measurement) review\b/i,
  /\breview (history|version|phases?|commit|restore)\b/i,
  /\bindependent mask scope\b/i,
  /\b(damage|work phase) mask\b/i,
  /\bnumeric snapshot\b/i,
  /\bplatform connection\b/i,
  /\brestoration-v\d\b/i,
  /\bM-\d{2}\b/,
  /\biPad\b/,
  /\br\d+\b/,
  /előnézeti/i,
  /rögzítés|rögzített|rögzítse/i,
  /kliensoldali/i,
  /kármaszk|munkafázis maszk/i,
  /hatókör/i,
  /pillanatkép/i,
  /platformkapcsolat/i,
];

/** Phrases that contain a banned term but stay, per the glossary. */
export const allowedTerms: RegExp[] = [/encrypted backup/gi, /titkosított biztonsági mentés/gi];

/** Every banned term found in `text`, after removing the allowed phrases. */
export function findBannedTerms(text: string): RegExpExecArray[] {
  let rest = text;
  for (const phrase of allowedTerms) rest = rest.replace(phrase, '');
  return bannedTerms.flatMap((pattern) => {
    const match = pattern.exec(rest);
    return match ? [match] : [];
  });
}
