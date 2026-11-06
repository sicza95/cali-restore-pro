import { createResource, createSignal, For, Show } from 'solid-js';
import { invitationCopy } from './copy';
import type { InvitationModel } from './types';

type Owner = { id: string; email: string; host: boolean };
type HostingTransfer = { id: string; fromId: string; toId: string };

export function ProjectOwners(props: {
  model: InvitationModel;
  projectPath: string;
  onRemoved: (ownerId: string) => void;
}) {
  const c = () => invitationCopy[props.model.lang()];
  const [busy, setBusy] = createSignal(false);
  const [failed, setFailed] = createSignal<'error' | 'hostingQuota' | 'hostingIneligible'>();
  const [data, { refetch }] = createResource(
    () => props.projectPath,
    async (path) => {
      try {
        return await props.model.request<{
          owners: Owner[];
          hostingTransfer: HostingTransfer | null;
        }>(path + '/owners');
      } catch {
        return undefined;
      }
    },
  );
  const currentId = () => props.model.account()?.id;
  const currentHost = () => data()?.owners.some((owner) => owner.host && owner.id === currentId());
  const pendingRecipient = () =>
    data()?.owners.find((owner) => owner.id === data()?.hostingTransfer?.toId);
  async function change(path: string, body: object, done?: () => void) {
    if (busy()) return;
    setBusy(true);
    setFailed(undefined);
    try {
      await props.model.request(props.projectPath + path, body);
      if (done) done();
      else await refetch();
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      setFailed(
        code === 'storage_quota_exceeded'
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
        <p role="alert">{c()[failed() ?? 'error']}</p>
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
                        class="secondary"
                        disabled={busy()}
                        onClick={() => void change('/hosting-transfer', { toId: owner.id })}
                      >
                        {c().offerHosting}
                      </button>
                    </Show>
                    <button
                      class="secondary"
                      disabled={busy()}
                      onClick={() => {
                        if (window.confirm(c().removeOwnerConfirm))
                          void change('/owners/' + owner.id + '/remove', {}, () =>
                            props.onRemoved(owner.id),
                          );
                      }}
                    >
                      {c().removeOwner}
                    </button>
                  </div>
                }
              >
                <span>{c().hostOwner}</span>
              </Show>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}
