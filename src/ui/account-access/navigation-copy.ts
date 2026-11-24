import { checkpointCopy } from '../editor/checkpoint-review/copy';
import { pinCopy } from '../sharing/pin-copy';
import { settingsCopy } from '../settings/settings-copy';
import { accountCopy as copy } from './copy';
import type { Language } from './types';
import { defineCopy } from '../../platform/i18n/define';

const navigationCopy = defineCopy({
  en: {
    notFound: 'Page not found',
    menu: 'Menu',
    closeMenu: 'Close menu',
    breadcrumbs: 'Breadcrumbs',
    project: 'Project',
    surface: 'Surface',
    language: 'App language',
    languageHelp: 'Changes the interface language. Report language is set separately.',
    backToProjects: 'Back to projects',
    retryAccess: 'Retry account access',
    themeToDark: 'Switch to dark mode',
    themeToLight: 'Switch to light mode',
  },
  hu: {
    notFound: 'Az oldal nem található',
    menu: 'Menü',
    closeMenu: 'Menü bezárása',
    breadcrumbs: 'Navigációs útvonal',
    project: 'Projekt',
    surface: 'Felület',
    language: 'Az alkalmazás nyelve',
    languageHelp: 'A kezelőfelület nyelve. A jelentések nyelve külön állítható be.',
    backToProjects: 'Vissza a projektekhez',
    retryAccess: 'Fiókhozzáférés újrapróbálása',
    themeToDark: 'Váltás sötét módra',
    themeToLight: 'Váltás világos módra',
  },
});

export function navigationText(language: Language) {
  return {
    ...copy[language],
    ...settingsCopy[language],
    ...navigationCopy[language],
    offline: pinCopy[language].heading,
    libraries: checkpointCopy[language].libraries,
  };
}
