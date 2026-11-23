import { defineCopy } from '../../platform/i18n/define';

export const backupCopy = defineCopy({
  en: {
    export: 'Export backup',
    prepare: 'Prepare backup',
    download: 'Download backup',
    import: 'Import backup',
    file: 'Backup file',
    restore: 'Restore as a local copy',
    exportFailed:
      'Backup could not be prepared. Check that all originals are available on this device and the backup fits within 512 MiB.',
    importFailed:
      'Restore failed. Try an intact backup file up to 512 MiB, and make sure this device has enough storage.',
    cancelled: 'Backup operation cancelled.',
  },
  hu: {
    export: 'Biztonsági mentés exportálása',
    prepare: 'Mentés előkészítése',
    download: 'Mentés letöltése',
    import: 'Biztonsági mentés importálása',
    file: 'Biztonsági mentés fájlja',
    restore: 'Visszaállítás helyi másolatként',
    exportFailed:
      'Nem sikerült előkészíteni a mentést. Ellenőrizze, hogy minden eredeti fájl elérhető-e ezen az eszközön, és a mentés legfeljebb 512 MiB méretű-e.',
    importFailed:
      'A visszaállítás sikertelen. Használjon sértetlen, legfeljebb 512 MiB-os mentést, és ellenőrizze a szabad tárhelyet.',
    cancelled: 'A biztonsági mentési művelet megszakadt.',
  },
});
