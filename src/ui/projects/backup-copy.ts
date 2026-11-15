import { defineCopy } from '../../platform/i18n/define';

export const backupCopy = defineCopy({
  en: {
    export: 'Export encrypted backup',
    prepare: 'Prepare backup',
    download: 'Download backup',
    keep: 'Save this key separately from the backup file. You need both to restore the project.',
    saved: 'I saved the backup key',
    key: 'Backup key',
    import: 'Import encrypted backup',
    file: 'Backup file',
    restore: 'Restore as a local copy',
    gap: 'Backups don’t include estimates or report drafts yet. This project has one, so it can’t be backed up for now. Keep it on this device.',
    exportFailed:
      'Backup could not be prepared. Check that all originals are available on this device and the backup fits within 512 MiB.',
    importFailed:
      'Restore failed. Check the backup key, try an intact backup file up to 512 MiB, and make sure this device has enough storage.',
    cancelled: 'Backup operation cancelled.',
  },
  hu: {
    export: 'Titkosított biztonsági mentés exportálása',
    prepare: 'Mentés előkészítése',
    download: 'Mentés letöltése',
    keep: 'A kulcsot a mentési fájltól külön tárolja. A projekt visszaállításához mindkettőre szükség van.',
    saved: 'Elmentettem a biztonsági mentés kulcsát',
    key: 'Biztonsági mentés kulcsa',
    import: 'Titkosított biztonsági mentés importálása',
    file: 'Biztonsági mentés fájlja',
    restore: 'Visszaállítás helyi másolatként',
    gap: 'A biztonsági mentés még nem tartalmazza a becsléseket és a jelentéspiszkozatokat. Ehhez a projekthez tartozik ilyen, ezért egyelőre nem menthető. Tartsa meg ezen az eszközön.',
    exportFailed:
      'Nem sikerült előkészíteni a mentést. Ellenőrizze, hogy minden eredeti fájl elérhető-e ezen az eszközön, és a mentés legfeljebb 512 MiB méretű-e.',
    importFailed:
      'A visszaállítás sikertelen. Ellenőrizze a mentési kulcsot, használjon sértetlen, legfeljebb 512 MiB-os mentést, és ellenőrizze a szabad tárhelyet.',
    cancelled: 'A biztonsági mentési művelet megszakadt.',
  },
});
