import { defineCopy } from '../../../platform/i18n/define';
const en = {
  heading: 'Local content vault',
  working: 'Opening…',
  failed: 'The work saved in this browser can’t be opened. It was saved by an older version.',
  reset: 'Erase this browser’s saved work and start again',
};

export const vaultCopy = defineCopy({
  en,
  hu: {
    heading: 'Helyi tartalomtár',
    working: 'Megnyitás…',
    failed: 'Az ebben a böngészőben mentett munka nem nyitható meg. Egy korábbi verzió mentette.',
    reset: 'A böngészőben mentett munka törlése és újrakezdés',
  },
});
export type VaultCopy = (typeof vaultCopy)['en'];
