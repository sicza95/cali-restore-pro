import { createResource, For } from 'solid-js';
import type { BrowserItemDescriptor } from '../../../platform/projects/browser-contracts';
import { useApp } from '../../app-context/AppContext';
import { Icon } from '../../icon/Icon';
import type { ProjectOwner, SentInvitation } from '../../sharing/types';
import { browserCopy } from '../browser/browser-copy';
import { itemActionCopy } from '../browser/item-actions/copy';
import type { Workspace } from './types';

export function AccessAvatars(props: {
  ws: Workspace;
  item: BrowserItemDescriptor;
  hosted: boolean;
}) {
  const app = useApp();
  const [roster] = createResource(
    () => (props.hosted && props.item.access !== 'directory' ? props.item.projectId : undefined),
    async (id) => {
      const [owners, invitations] = await Promise.all([
        app
          .request<{ owners: ProjectOwner[] }>('/hosted-projects/' + id + '/owners')
          .catch(() => ({ owners: [] })),
        app
          .request<{ invitations: SentInvitation[] }>('/hosted-projects/' + id + '/invitations')
          .catch(() => ({ invitations: [] })),
      ]);
      return {
        owners: owners.owners,
        shared: invitations.invitations.filter((row) => row.state === 'active'),
      };
    },
  );
  const owners = () =>
    roster()?.owners.map((row) => ({ id: row.id, name: row.email })) ??
    (props.item.owners.length
      ? props.item.owners
      : !props.hosted && app.account()
        ? [{ id: app.account()!.id, name: app.account()!.email }]
        : []);
  const people = () => {
    const c = itemActionCopy[props.ws.language];
    const ownerRows = owners().map((person) => ({ ...person, role: c.owner }));
    const ids = new Set(ownerRows.map((person) => person.id));
    const shared = (roster()?.shared ?? [])
      .filter((person) => !ids.has(person.recipientId))
      .map((person) => ({
        id: person.recipientId,
        name: person.email,
        role: person.coOwner ? c.owner : person.groupName || c.member,
      }));
    return [...ownerRows, ...new Map(shared.map((person) => [person.id, person])).values()];
  };
  return (
    <>
      <h3>{itemActionCopy[props.ws.language].people}</h3>
      <div
        class="project-access-avatars"
        role="group"
        aria-label={itemActionCopy[props.ws.language].people}
      >
        <For each={people()} fallback={<span>{browserCopy[props.ws.language].unknown}</span>}>
          {(person) => (
            <div class="project-access-person">
              <span
                class="project-person-avatar"
                title={person.name}
                aria-label={person.name}
                role="img"
              >
                <Icon name="account" size={20} />
              </span>
              <span class="project-access-role">{person.role}</span>
            </div>
          )}
        </For>
      </div>
    </>
  );
}
