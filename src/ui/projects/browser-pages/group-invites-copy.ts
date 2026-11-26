import { defineCopy } from '../../../platform/i18n/define';

export const copy = defineCopy({
  en: {
    help: 'Invite the current members of an organization group to this project. Invitations are individual; later group membership changes do not change project access.',
    invite: 'Invite group members',
    empty: 'No organization groups are available.',
    done: (count: number) => `${count} invitations created.`,
    failed: 'Some invitations could not be created. Retry to invite the remaining members.',
  },
  hu: {
    help: 'A szervezeti csoport jelenlegi tagjainak meghívása a projektbe. A meghívások egyéniek; a későbbi csoporttagság-változások nem módosítják a projekt hozzáférését.',
    invite: 'Csoporttagok meghívása',
    empty: 'Nincsenek elérhető szervezeti csoportok.',
    done: (count: number) => `${count} meghívás létrehozva.`,
    failed: 'Néhány meghívás nem sikerült. Próbáld újra a fennmaradó tagok meghívását.',
  },
});
