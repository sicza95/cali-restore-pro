import { defineCopy } from '../../platform/i18n/define';

/** Hosted project deletion and the hosted project trash. */
export const lifecycleCopy = defineCopy({
  en: {
    unknownProject: (index: number) => `Deleted project ${index}`,
    deleteTitle: 'Delete hosted project',
    trashTitle: 'Hosted project trash',
    refresh: 'Refresh trash',
    empty: 'Trash is empty.',
    recover: 'Recover',
    confirmPurge: 'Skip live recovery and queue purge?',
    purge: 'Queue live purge',
    numbered: 'Projects that aren’t on this device are numbered.',
    deleteHelp:
      'The hosted project can be recovered for 30 days. Local copies and your exported backups remain available.',
    confirmDelete: 'I confirm deletion of the hosted project.',
    skipRecovery: 'Skip live recovery and queue purge',
    delete: 'Delete hosted project',
  },
  hu: {
    unknownProject: (index) => `Törölt projekt ${index}`,
    deleteTitle: 'Szerverprojekt törlése',
    trashTitle: 'Törölt szerverprojektek',
    refresh: 'Kuka frissítése',
    empty: 'A kuka üres.',
    recover: 'Helyreállítás',
    confirmPurge: 'Kihagyja a helyreállítási időszakot?',
    purge: 'Végleges törlés',
    numbered: 'Az ezen az eszközön nem tárolt projektek sorszámot kapnak.',
    deleteHelp:
      'A szerverprojekt 30 napig helyreállítható. A helyi másolatok és a saját exportált mentések megmaradnak.',
    confirmDelete: 'Megerősítem a szerverprojekt törlését.',
    skipRecovery: 'A helyreállítási időszak kihagyása',
    delete: 'Törlés',
  },
});
