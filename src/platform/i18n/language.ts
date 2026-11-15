/** The app's languages. English is the fallback for anything unknown. */
export const languages = ['en', 'hu'] as const;
export type Language = (typeof languages)[number];

/** Each language's own name, shown in language pickers. Not translated on purpose. */
export const languageNames: Record<Language, string> = { en: 'English', hu: 'Magyar' };

export function isLanguage(value: unknown): value is Language {
  return languages.includes(value as Language);
}

/** A stored or selected value as a language; anything else is English. */
export function parseLanguage(value: unknown): Language {
  return isLanguage(value) ? value : 'en';
}
