import type { Language } from './language';

/**
 * The shape every language must have to match the English entry `T`: the same keys, a string for
 * each string, a function with the same parameters for each function, and the same shape for
 * nested objects and arrays. A literal union such as `'en' | 'hu'` stays a union.
 */
export type Translation<T> = T extends string
  ? string extends T
    ? string
    : T
  : T extends (...args: infer A) => unknown
    ? (...args: A) => string
    : T extends object
      ? { [K in keyof T]: Translation<T[K]> }
      : T;

/** A catalogue: one entry per language, all shaped like the English one. */
export type Catalogue<T> = { [L in Language]: Translation<T> };

const catalogues: Catalogue<unknown>[] = [];

/** Every catalogue declared so far, for the parity test. */
export function declaredCatalogues(): readonly Catalogue<unknown>[] {
  return catalogues;
}

/**
 * Declares a copy catalogue. Hungarian must have exactly the English keys: a missing or extra key
 * is a type error, so `npm run check` fails. Returns the object itself, so `copy[language].key`
 * reads as before.
 */
export function defineCopy<T extends object>(copy: {
  en: T;
  hu: NoInfer<Translation<T>>;
}): Catalogue<T> {
  catalogues.push(copy as Catalogue<unknown>);
  return copy as Catalogue<T>;
}

/** Declares a catalogue from `[english, hungarian]` pairs. */
export function defineCopyPairs<K extends string>(
  pairs: Record<K, readonly [string, string]>,
): Catalogue<Record<K, string>> {
  const pick = (index: 0 | 1) =>
    Object.fromEntries(
      Object.entries<readonly [string, string]>(pairs).map(([key, pair]) => [key, pair[index]]),
    ) as Record<K, string>;
  const copy = { en: pick(0), hu: pick(1) };
  catalogues.push(copy);
  return copy as Catalogue<Record<K, string>>;
}
