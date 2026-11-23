import { defineCopy } from '../../platform/i18n/define';

export const cloudProjectsCopy = defineCopy({
  en: {
    receive: 'Open a synced project on this device',
    help: 'Projects synced from your other devices that aren’t on this one yet.',
    loading: 'Looking for synced projects…',
    none: 'Every synced project is already on this device.',
    failed: 'Synced projects couldn’t be loaded. Check your connection and try again.',
    open: 'Open on this device',
  },
  hu: {
    receive: 'Szinkronizált projekt megnyitása ezen az eszközön',
    help: 'A többi eszközéről szinkronizált projektek, amelyek még nincsenek ezen az eszközön.',
    loading: 'Szinkronizált projektek keresése…',
    none: 'Minden szinkronizált projekt megvan ezen az eszközön.',
    failed:
      'A szinkronizált projektek nem tölthetők be. Ellenőrizze a kapcsolatot, és próbálja újra.',
    open: 'Megnyitás ezen az eszközön',
  },
});
