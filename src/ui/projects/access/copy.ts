import { defineCopy } from '../../../platform/i18n/define';

export const accessCopy = defineCopy({
  en: {
    access: 'Access',
    visibility: 'Visibility',
    private: 'Private',
    listed: 'Listed',
    listedHelp:
      'Organisation members can see the project name and owners. Only invited people can access shared content.',
    localOnly:
      'This project is private on this device. Enable hosting in project settings to manage access.',
    ownerOnly: 'Only project owners can manage visibility and members.',
    managedByOwners: 'Managed by project owners',
    members: 'Members and invitations',
    loading: 'Loading visibility…',
    saving: 'Saving visibility…',
    saved: 'Visibility saved.',
    conflict:
      'Another owner changed visibility. The latest setting has been loaded. Check it before trying again.',
    conflictReload: 'Another owner changed visibility. Reload the setting before trying again.',
    error: 'Could not load or save visibility. Try again.',
    reload: 'Reload visibility',
    projectWide: 'Project-wide access',
    inherited:
      'Objects and surfaces use the project’s access. Manage members and visibility at project level.',
    openProject: 'Open project access',
    unavailable: 'Open this project on this device to manage shared snapshots.',
    publishName: 'Update listed name',
    nameChanged: 'The directory still shows an earlier project name.',
  },
  hu: {
    access: 'Hozzáférés',
    visibility: 'Láthatóság',
    private: 'Privát',
    listed: 'Listázott',
    listedHelp:
      'A szervezet tagjai láthatják a projekt nevét és tulajdonosait. A megosztott tartalomhoz csak a meghívottak férhetnek hozzá.',
    localOnly:
      'Ez a projekt privát, csak ezen az eszközön található. A hozzáférés kezeléséhez engedélyezd a szerveres tárolást a projektbeállításokban.',
    ownerOnly: 'A láthatóságot és a tagokat csak a projekttulajdonosok kezelhetik.',
    managedByOwners: 'A projekttulajdonosok kezelik',
    members: 'Tagok és meghívók',
    loading: 'Láthatóság betöltése…',
    saving: 'Láthatóság mentése…',
    saved: 'Láthatóság mentve.',
    conflict:
      'Egy másik tulajdonos megváltoztatta a láthatóságot. Betöltöttük az aktuális beállítást. Ellenőrizd, mielőtt újra próbálkozol.',
    conflictReload:
      'Egy másik tulajdonos megváltoztatta a láthatóságot. Az újrapróbálkozás előtt töltsd be az aktuális beállítást.',
    error: 'A láthatóság betöltése vagy mentése sikertelen. Próbáld újra.',
    reload: 'Láthatóság újratöltése',
    projectWide: 'Projektszintű hozzáférés',
    inherited:
      'Az objektumok és felületek a projekt hozzáférési beállításait használják. A tagokat és a láthatóságot a projektnél kezelheted.',
    openProject: 'Projekt hozzáférésének megnyitása',
    unavailable: 'A projektmásolatok megosztásához nyisd meg a projektet ezen az eszközön.',
    publishName: 'Listázott név frissítése',
    nameChanged: 'A listában még a projekt korábbi neve szerepel.',
  },
});
