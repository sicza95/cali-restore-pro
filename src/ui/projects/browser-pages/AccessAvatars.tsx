import { createResource, For } from 'solid-js';
import type { BrowserItemDescriptor } from '../../../platform/projects/browser-contracts';
import { useApp } from '../../app-context/AppContext';
import { Icon } from '../../icon/Icon';
import type { ProjectOwner, SentInvitation } from '../../sharing/types';
import { browserCopy } from '../browser/browser-copy';
import { itemActionCopy } from '../browser/item-actions/copy';
import { pageCopy } from './copy';
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
        app.request<{ owners: ProjectOwner[] }>('/hosted-projects/' + id + '/owners'),
        app.request<{ invitations: SentInvitation[] }>('/hosted-projects/' + id + '/invitations'),
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
  const shared = () => [
    ...new Map(
      roster()?.shared.map((row) => [row.recipientId, { id: row.recipientId, name: row.email }]),
    ).values(),
  ];
  return (
    <>
      <h3>{pageCopy[props.ws.language].owners}</h3>
      <div
        class="project-access-avatars"
        role="group"
        aria-label={pageCopy[props.ws.language].owners}
      >
        <For each={owners()} fallback={<span>{browserCopy[props.ws.language].unknown}</span>}>
          {(person) => (
            <span
              class="project-person-avatar"
              title={person.name}
              aria-label={person.name}
              role="img"
            >
              <Icon name="account" size={20} />
            </span>
          )}
        </For>
      </div>
      <h3>{itemActionCopy[props.ws.language].shared}</h3>
      <div
        class="project-access-avatars"
        role="group"
        aria-label={itemActionCopy[props.ws.language].shared}
      >
        <For each={shared()}>
          {(person) => (
            <span
              class="project-person-avatar"
              title={person.name}
              aria-label={person.name}
              role="img"
            >
              <Icon name="account" size={20} />
            </span>
          )}
        </For>
      </div>
    </>
  );
}
