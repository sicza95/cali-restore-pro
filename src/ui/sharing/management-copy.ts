import { defineCopy } from '../../platform/i18n/define';

export const managementCopy = defineCopy({
  en: {
    registeredOnly: 'Invite someone who already has an account.',
    lastOwner: 'The project must keep at least one owner.',
    hostOwner: 'Transfer hosting before removing this owner.',
    recipient: 'Snapshot recipient',
    recipientUnavailable:
      'This recipient must open their account before you can add shared content.',
    hostOriginals: 'Only the hosting owner can publish original files.',
  },
  hu: {
    registeredOnly: 'Olyan személyt hívj meg, akinek már van fiókja.',
    lastOwner: 'A projektnek legalább egy tulajdonosa kell maradjon.',
    hostOwner: 'Az eltávolítás előtt add át a szerveres tárolás felelősségét.',
    recipient: 'A projektmásolat címzettje',
    recipientUnavailable:
      'További tartalom megosztása előtt a címzettnek meg kell nyitnia a fiókját.',
    hostOriginals: 'Eredeti fájlokat csak a szerveres tárolásért felelős tulajdonos oszthat meg.',
  },
});
