import { parseLanguage } from '../../platform/i18n/language';
import type { Language } from './types';

export function storedLanguage(): Language {
  try {
    return parseLanguage(localStorage.getItem('cr-language'));
  } catch {
    return 'en';
  }
}

export function applyLanguage(language: Language) {
  document.documentElement.lang = language;
}
