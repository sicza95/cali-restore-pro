import { createSignal } from 'solid-js';
import type { App } from '../ui/app-context/AppContext';
import type { Account, Language } from '../ui/account-access/types';
import type { SavedProject } from '../platform/projects/types';
import type { SentInvitation } from '../ui/sharing/types';

export const accessAccount: Account = {
  id: 'host',
  email: 'anna@example.test',
  state: 'active',
  role: 'user',
};
export const accessProject: SavedProject = {
  version: 2,
  id: 'chapel',
  name: 'Chapel conservation',
  revision: 1,
  archived: false,
  updatedAt: 0,
  settings: { version: 1, currency: 'HUF', units: 'metric' },
  objects: [],
};

/** In-memory story server only; mutations never reach an account or a real project. */
export function accessStoryApp(language: Language, conflict = false, lastOwner = false) {
  const [lang] = createSignal(language);
  let visibility = { visibility: 'private', version: 1, name: accessProject.name };
  let conflictOnce = conflict;
  let owners = [
    { id: 'host', email: 'anna@example.test', host: true },
    ...(lastOwner
      ? []
      : [{ id: 'owner', email: 'very.long.coowner.address@example.test', host: false }]),
  ];
  let invitations: SentInvitation[] = [
    {
      id: 'owner-invite',
      recipientId: 'owner',
      email: 'very.long.coowner.address@example.test',
      coOwner: true,
      state: 'active',
      estimateScope: 'none',
      shareHistory: false,
    },
    {
      id: 'reader',
      recipientId: 'reader',
      email: 'reader@example.test',
      coOwner: false,
      state: 'active',
      estimateScope: 'estimate-summary',
      shareHistory: false,
    },
    {
      id: 'pending',
      recipientId: 'pending',
      email: 'pending@example.test',
      coOwner: false,
      state: 'pending',
      estimateScope: 'none',
      shareHistory: false,
    },
  ];
  const request = async <T>(path: string, body?: object): Promise<T> => {
    const fields = body as Record<string, unknown> | undefined;
    let result: unknown = {};
    if (path.endsWith('/visibility')) {
      if (fields) {
        if (conflictOnce) {
          conflictOnce = false;
          visibility = { ...visibility, visibility: 'listed', version: 2 };
          throw new Error('visibility_conflict');
        }
        if (fields.version !== visibility.version) throw new Error('visibility_conflict');
        visibility = {
          visibility: String(fields.visibility),
          version: visibility.version + 1,
          name: String(fields.name),
        };
      }
      result = { ...visibility };
    } else if (path.endsWith('/owners')) result = { owners, hostingTransfer: null };
    else if (path.endsWith('/remove')) {
      const id = path.split('/').at(-2);
      owners = owners.filter((owner) => owner.id !== id);
      invitations = invitations.filter((invitation) => invitation.recipientId !== id);
    } else if (path.endsWith('/cancel') || path.endsWith('/revoke')) {
      const id = path.split('/').at(-2);
      invitations = invitations.filter((invitation) => invitation.id !== id);
    } else if (path.endsWith('/scopes')) {
      const id = path.split('/').at(-2);
      invitations = invitations.map((invitation) =>
        invitation.id === id ? { ...invitation, ...(fields?.next as object) } : invitation,
      );
    } else if (path.endsWith('/invitations')) {
      if (fields)
        invitations = [
          ...invitations,
          {
            id: 'new',
            recipientId: 'new',
            email: String(fields.email),
            coOwner: !!fields.coOwner,
            state: 'pending',
            estimateScope: 'none',
            shareHistory: false,
          },
        ];
      result = { invitations: [...invitations] };
    }
    return result as T;
  };
  return { lang, account: () => accessAccount, request, csrf: () => '' } as App;
}
