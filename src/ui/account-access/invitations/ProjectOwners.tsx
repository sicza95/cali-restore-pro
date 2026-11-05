import { createResource, createSignal, For, Show } from 'solid-js';
import { invitationCopy } from './copy';
import type { InvitationModel } from './types';

type Owner = { id: string; email: string; host: boolean };

export function ProjectOwners(props: {
  model: InvitationModel;
  projectPath: string;
  onRemoved: (ownerId: string) => void;
}) {
  const c = () => invitationCopy[props.model.lang()];
  const [busy, setBusy] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const [data] = createResource(
    () => props.projectPath,
    async (path) => {
      try {
        return await props.model.request<{ owners: Owner[] }>(path + '/owners');
      } catch {
        return undefined;
      }
    },
  );
  return (
    <section aria-label={c().owners}>
      <h2>{c().owners}</h2>
      <Show when={data.loading}>
        <p role="status">{c().loadingOwners}</p>
      </Show>
      <Show when={failed() || (!data.loading && !data())}>
        <p role="alert">{c().error}</p>
      </Show>
      <ul class="session-list">
        <For each={data()?.owners}>
          {(owner) => (
            <li>
              <strong>{owner.email}</strong>
              <Show
                when={owner.host}
                fallback={
                  <button
                    class="secondary"
                    disabled={busy()}
                    onClick={async () => {
                      if (busy() || !window.confirm(c().removeOwnerConfirm)) return;
                      setBusy(true);
                      setFailed(false);
                      try {
                        await props.model.request(
                          props.projectPath + '/owners/' + owner.id + '/remove',
                          {},
                        );
                        props.onRemoved(owner.id);
                      } catch {
                        setFailed(true);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {c().removeOwner}
                  </button>
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
