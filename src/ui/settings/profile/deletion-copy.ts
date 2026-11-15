import { defineCopy } from '../../../platform/i18n/define';

/** Account deletion, and the recovery deadlines shared with the deletion receipt. */
export const deletionCopy = defineCopy({
  en: {
    recoverUntil: 'Live recovery deadline',
    backupsExpire: 'Operational backups expire by',
    forceHelp:
      'Sole-owner projects are frozen until the recovery deadline. Existing collaborators can retrieve their already shared content during that window. Co-owners keep their projects and can take over hosting.',
    exportHelp:
      'Export an encrypted project backup for local and pending work. Account recovery lasts 30 days. Operational backups expire within 90 days of deletion.',
    recentPassword: 'Deletion requires a recent password confirmation.',
    confirmForce: 'I confirm forced deletion.',
    confirm: 'I resolved pending work and confirm deletion.',
    skipRecovery: 'Skip live recovery and queue purge',
    purge: 'Queue live purge',
    deleteForced: 'Force account deletion',
    delete: 'Delete account',
  },
  hu: {
    recoverUntil: 'Helyreállítási határidő',
    backupsExpire: 'Szervermentések lejárata legkésőbb',
    forceHelp:
      'A kizárólagos tulajdonú projektek befagyasztva maradnak a helyreállítási határidőig. A meglévő együttműködők addig csak a már megosztott tartalmat érhetik el. A társtulajdonosok megtartják projektjeiket, és átvehetik a szerveres tárolást.',
    exportHelp:
      'Mentse a helyi és függő munkát titkosított projektmentésbe. A fiók 30 napig állítható helyre. A szervermentések legkésőbb a törléstől számított 90. napon járnak le.',
    recentPassword: 'A törléshez friss jelszó-megerősítés szükséges.',
    confirmForce: 'Megerősítem a kényszerített törlést.',
    confirm: 'A függő munkát rendeztem, és megerősítem a törlést.',
    skipRecovery: 'A helyreállítási időszak kihagyása',
    purge: 'Végleges törlés indítása',
    deleteForced: 'Fiók kényszerített törlése',
    delete: 'Fiók törlése',
  },
});
