import { createEffect, createResource, createSignal, For, Show } from 'solid-js';
import type { JSX } from 'solid-js';
import { useApp } from '../app-context/AppContext';
import { invitationCopy } from './copy';

import { managementCopy } from './management-copy';
import { ownerRemovalReason } from './owner-guards';
import type { ProjectOwner } from './types';
type HostingTransfer = { id: string; fromId: string; toId: string };

export function ProjectOwners(props: {
  projectPath: string;
  onRemoved: (ownerId: string) => void;
  onOwners?: (owners: ProjectOwner[]) => void;
  renderAccess?: (ownerId: string) => JSX.Element;
}) {
  const app = useApp();
  const c = () => invitationCopy[app.lang()];
  const m = () => managementCopy[app.lang()];
  const [busy, setBusy] = createSignal(false);
  const [failed, setFailed] = createSignal<
    'error' | 'hostingQuota' | 'hostingIneligible' | 'lastOwner' | 'hostOwner'
  >();
  const [data, { refetch }] = createResource(
    () => props.projectPath,
    async (path) => {
      try {
        return await app.request<{
          owners: ProjectOwner[];
          hostingTransfer: HostingTransfer | null;
        }>(path + '/owners');
      } catch {
        return undefined;
      }
    },
  );
  createEffect(() => props.onOwners?.(data()?.owners ?? []));
  const currentId = () => app.account()?.id;
  const currentHost = () => data()?.owners.some((owner) => owner.host && owner.id === currentId());
  const pendingRecipient = () =>
    data()?.owners.find((owner) => owner.id === data()?.hostingTransfer?.toId);
  async function change(path: string, body: object, done?: () => void) {
    if (busy()) return;
    setBusy(true);
    setFailed(undefined);
    try {
      await app.request(props.projectPath + path, body);
      await refetch();
      done?.();
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      setFailed(
        code === 'last_project_owner'
          ? 'lastOwner'
          : code === 'owner_is_project_host'
            ? 'hostOwner'
            : code === 'storage_quota_exceeded'
              ? 'hostingQuota'
              : code === 'not_permitted'
                ? 'hostingIneligible'
                : 'error',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label={c().owners}>
      <h2>{c().owners}</h2>
      <Show when={data.loading}>
        <p role="status">{c().loadingOwners}</p>
      </Show>
      <Show when={failed() || (!data.loading && !data())}>
        <p role="alert">
          {failed() === 'lastOwner'
            ? m().lastOwner
            : failed() === 'hostOwner'
              ? m().hostOwner
              : c()[(failed() as 'error' | 'hostingQuota' | 'hostingIneligible') ?? 'error']}
        </p>
      </Show>
      <Show when={pendingRecipient()}>
        {(recipient) => (
          <p role="status">
            {c().transferPending} {recipient().email}
          </p>
        )}
      </Show>
      <Show when={data()?.hostingTransfer?.toId === currentId() && data()?.hostingTransfer}>
        {(transfer) => (
          <button
            data-control-id="owners.host.accept"
            disabled={busy()}
            onClick={() => {
              if (window.confirm(c().acceptHostingConfirm))
                void change('/hosting-transfer/' + transfer().id + '/accept', {});
            }}
          >
            {c().acceptHosting}
          </button>
        )}
      </Show>
      <Show when={data() && currentId() && !data()?.owners.some((owner) => owner.host)}>
        <button
          data-control-id="owners.host.claim"
          disabled={busy()}
          onClick={() => {
            if (window.confirm(c().acceptHostingConfirm))
              void change('/hosting-transfer', { toId: currentId() });
          }}
        >
          {c().claimHosting}
        </button>
      </Show>
      <ul class="session-list">
        <For each={data()?.owners}>
          {(owner) => (
            <li>
              <strong>{owner.email}</strong>
              <Show
                when={owner.host}
                fallback={
                  <div class="owner-actions">
                    <Show when={currentHost() && owner.id !== pendingRecipient()?.id}>
                      <button
                        data-control-id="owners.host.offer"
                        disabled={busy()}
                        onClick={() => void change('/hosting-transfer', { toId: owner.id })}
                      >
                        {c().offerHosting}
                      </button>
                    </Show>
                  </div>
                }
              >
                <span>{c().hostOwner}</span>
              </Show>
              <button
                data-control-id="owners.remove"
                disabled={busy() || !!ownerRemovalReason(owner, data()?.owners.length ?? 0)}
                aria-describedby={
                  ownerRemovalReason(owner, data()?.owners.length ?? 0)
                    ? `owner-guard-${owner.id}`
                    : undefined
                }
                onClick={() => {
                  if (ownerRemovalReason(owner, data()?.owners.length ?? 0)) return;
                  if (window.confirm(c().removeOwnerConfirm))
                    void change('/owners/' + owner.id + '/remove', {}, () =>
                      props.onRemoved(owner.id),
                    );
                }}
              >
                {c().removeOwner}
              </button>
              <Show when={ownerRemovalReason(owner, data()?.owners.length ?? 0)}>
                {(reason) => (
                  <p class="field-help" id={`owner-guard-${owner.id}`}>
                    {m()[reason()]}
                  </p>
                )}
              </Show>
              {props.renderAccess?.(owner.id)}
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}
