import { describe, expect, it } from 'vitest';
import { findBannedTerms } from './banned-terms';
import { declaredCatalogues } from './define';
import { languages } from './language';

// Loading every copy module declares its catalogues (see `guard.test.ts` for where copy may live).
const modules = import.meta.glob(['/src/**/copy.ts', '/src/**/*-copy.ts'], { eager: true });

type Problem = string;

/** Differences between the English entry and a translation, as readable paths. */
function compare(en: unknown, other: unknown, path: string, problems: Problem[]) {
  const kind = (value: unknown) => (Array.isArray(value) ? 'array' : typeof value);
  if (kind(en) !== kind(other)) {
    problems.push(`${path}: ${kind(en)} in English, ${kind(other)} here`);
    return;
  }
  if (typeof en === 'string') {
    if (en.trim() === '' || (other as string).trim() === '') problems.push(`${path}: empty`);
  } else if (typeof en === 'function') {
    if (en.length !== (other as () => string).length)
      problems.push(
        `${path}: ${en.length} parameters in English, ${(other as () => string).length} here`,
      );
  } else if (en && typeof en === 'object') {
    const a = en as Record<string, unknown>;
    const b = other as Record<string, unknown>;
    for (const key of Object.keys(a))
      if (key in b) compare(a[key], b[key], `${path}.${key}`, problems);
      else problems.push(`${path}.${key}: missing`);
    for (const key of Object.keys(b))
      if (!(key in a)) problems.push(`${path}.${key}: not in English`);
  }
}

function strings(value: unknown, path: string, out: [string, string][] = []) {
  if (typeof value === 'string') out.push([path, value]);
  else if (value && typeof value === 'object')
    for (const [key, child] of Object.entries(value)) strings(child, `${path}.${key}`, out);
  return out;
}

/** A short name for a catalogue in failure messages: its first English keys. */
const label = (catalogue: { en: unknown }) =>
  `{${Object.keys(catalogue.en as object)
    .slice(0, 3)
    .join(', ')}, …}`;

describe('copy catalogues', () => {
  const catalogues = declaredCatalogues();

  it('loads every copy module and finds their catalogues', () => {
    expect(Object.keys(modules).length).toBeGreaterThan(15);
    expect(catalogues.length).toBeGreaterThanOrEqual(Object.keys(modules).length);
  });

  it('gives every language the same keys as English', () => {
    const problems = catalogues.flatMap((catalogue) =>
      languages.flatMap((language) => {
        const found: Problem[] = [];
        compare(catalogue.en, catalogue[language], language, found);
        return found.map((problem) => `${label(catalogue)} ${problem}`);
      }),
    );
    expect(problems).toEqual([]);
  });

  it('uses no banned terms from the copy glossary', () => {
    const problems = catalogues.flatMap((catalogue) =>
      languages.flatMap((language) =>
        strings(catalogue[language], language).flatMap(([path, text]) =>
          findBannedTerms(text).map((match) => `${label(catalogue)} ${path}: "${match[0]}"`),
        ),
      ),
    );
    expect(problems).toEqual([]);
  });
});
