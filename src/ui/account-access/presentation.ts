import type { Language } from './types';

export function storedLanguage(): Language {
  try {
    return localStorage.getItem('cr-language') === 'hu' ? 'hu' : 'en';
  } catch {
    return 'en';
  }
}

export function applyLanguage(language: Language) {
  document.documentElement.lang = language;
}
