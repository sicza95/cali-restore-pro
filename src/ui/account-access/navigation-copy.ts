import { checkpointCopy } from '../editor/checkpoint-review/copy';
import { pinCopy } from './invitations/OfflineOriginals';
import { settingsCopy } from './settings/constants';
import { copy } from './constants';
import type { Language } from './types';

const navigationCopy = {
  en: {
    unlock: 'Unlock vault',
    'devices/approve': 'Approve a device',
    notFound: 'Page not found',
    menu: 'Menu',
    language: 'App language',
    languageHelp: 'Changes the interface language. Report language is set separately.',
    unlockHelp: 'Unlock the vault for this page. Projects and Invitations unlock separately.',
    approvalHelp: 'Unlock this vault and enter the pairing code from the device requesting access.',
    vaultSetup: 'Set up or restore a vault in Account security.',
    backToProjects: 'Back to projects',
    retryAccess: 'Retry account access',
  },
  hu: {
    unlock: 'Tartalomtár feloldása',
    'devices/approve': 'Eszköz jóváhagyása',
    notFound: 'Az oldal nem található',
    menu: 'Menü',
    language: 'Az alkalmazás nyelve',
    languageHelp: 'A kezelőfelület nyelve. A jelentések nyelve külön állítható be.',
    unlockHelp:
      'Oldja fel a tárat ezen az oldalon. A Projektek és a Meghívók külön feloldást igényelnek.',
    approvalHelp: 'Oldja fel a tárat, majd adja meg a hozzáférést kérő eszköz párosítási kódját.',
    vaultSetup: 'A Fiókbiztonság oldalon beállíthatja vagy visszaállíthatja a tartalomtárat.',
    backToProjects: 'Vissza a projektekhez',
    retryAccess: 'Fiókhozzáférés újrapróbálása',
  },
};

export function navigationText(language: Language) {
  return {
    ...copy[language],
    ...settingsCopy[language],
    ...navigationCopy[language],
    offline: pinCopy[language].heading,
    libraries: checkpointCopy[language].libraries,
  };
}
