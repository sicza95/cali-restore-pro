import { defineCopy } from '../../../platform/i18n/define';

export const organisationDefaultsCopy = defineCopy({
  en: {
    title: 'Organisation defaults',
    restoration:
      'Default measurements, currency and report language for this organisation’s projects.',
    branding: 'Default name, contact details and appearance for this organisation’s reports.',
    readOnly: 'Only organisation admins can change these defaults.',
    saveFailed: 'These organisation defaults could not be saved.',
  },
  hu: {
    title: 'Szervezeti alapbeállítások',
    restoration:
      'A szervezet projektjeinek alapértelmezett mértékegységei, pénzneme és jelentésnyelve.',
    branding: 'A szervezet jelentéseinek alapértelmezett neve, elérhetőségei és megjelenése.',
    readOnly: 'Ezeket az alapbeállításokat csak a szervezet adminisztrátorai módosíthatják.',
    saveFailed: 'A szervezeti alapbeállításokat nem sikerült menteni.',
  },
});
