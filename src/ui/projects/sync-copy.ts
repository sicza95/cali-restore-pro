import { defineCopy } from '../../platform/i18n/define';
export const syncCopy = defineCopy({
  en: {
    title: 'Cloud sync',
    disabled: 'Sync is off for this project.',
    enable: 'Enable editor sync',
    pending: 'Saved on this device · waiting to sync',
    saved: 'Cloud copy saved',
    conflict: 'Sync paused · review the copies',
    unavailable: 'Sync unavailable. Check hosting, connection and project keys.',
    staging: 'Could not queue this edit. The local copy is saved.',
    review: 'Review sync conflict',
    local: 'This device',
    cloud: 'Cloud copy',
    noHead: 'There is no cloud copy.',
    archived: 'Archived',
    keepLocal: 'Publish this device’s copy',
    binChanged:
      'This device’s copy is older than a change made in the Bin. Use the cloud copy to continue syncing.',
    keepCloud: 'Use the cloud copy',
  },
  hu: {
    title: 'Felhőszinkronizálás',
    disabled: 'A projekt szinkronizálása ki van kapcsolva.',
    enable: 'Szerkesztő szinkronizálásának bekapcsolása',
    pending: 'Eszközre mentve · szinkronizálásra vár',
    saved: 'Felhőbe mentve',
    conflict: 'Szinkronizálás szünetel · ellenőrizze a másolatokat',
    unavailable:
      'A szinkronizálás nem elérhető. Ellenőrizze a tárhelyet, a kapcsolatot és a projektkulcsokat.',
    staging: 'A módosítás nem került a várólistára. A helyi másolat mentve van.',
    review: 'Szinkronizálási ütközés ellenőrzése',
    local: 'Ezen az eszközön',
    cloud: 'Felhőmásolat',
    noHead: 'Nincs felhőmásolat.',
    archived: 'Archiválva',
    keepLocal: 'Az eszközön lévő másolat közzététele',
    binChanged:
      'Az eszközön lévő másolat régebbi, mint a Kukában végzett módosítás. A szinkronizálás folytatásához használd a felhőmásolatot.',
    keepCloud: 'Felhőmásolat használata',
  },
});
