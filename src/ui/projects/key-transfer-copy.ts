import { defineCopy } from '../../platform/i18n/define';

export const keyTransferCopy = defineCopy({
  en: {
    send: 'Share sync access with a device',
    recipient: 'Recipient owner account ID',
    create: 'Create transfer code',
    secret: 'Transfer code',
    private: 'Share this code privately with the receiving device. It expires after 15 minutes.',
    receive: 'Open a synced project on this device',
    account: 'Your owner account ID',
    open: 'Open synced project',
  },
  hu: {
    send: 'Szinkronizálási hozzáférés megosztása egy eszközzel',
    recipient: 'A fogadó tulajdonos fiókazonosítója',
    create: 'Átviteli kód létrehozása',
    secret: 'Átviteli kód',
    private: 'A kódot bizalmasan adja át a fogadó eszköznek. A kód 15 perc után lejár.',
    receive: 'Szinkronizált projekt megnyitása ezen az eszközön',
    account: 'Saját tulajdonosi fiókazonosító',
    open: 'Szinkronizált projekt megnyitása',
  },
});
