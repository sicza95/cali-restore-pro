/* eslint-disable solid/reactivity -- The account and vault are fixed for the mounted inbox, and commands run on user input. */
import { createSignal, For, Show } from 'solid-js';
import {
  localSharingKey,
  openSharedContent,
  sharingFingerprint,
} from '../../../platform/projects/fixture-sharing';
import type { SharingEnvelope } from '../../../platform/projects/fixture-sharing';
import type { SharedProject } from '../../../platform/projects/shared-project';
import type { LocalVault } from '../../../platform/vault/vault';
import { invitationCopy } from './copy';
import type { InboxInvitation, InvitationModel } from './types';
import { useInvitations } from './useInvitations';
import { SharingFingerprint } from './SharingFingerprint';
import './styles.css';

export function InvitationInbox(props: { model: InvitationModel; vault: LocalVault }) {
  const c = () => invitationCopy[props.model.lang()];
  const inbox = useInvitations<InboxInvitation>(props.model, '/invitations');
  const [opened, setOpened] = createSignal<{ id: string; project?: SharedProject }>();
  return (
    <section class="invitation-panel" aria-label={c().heading}>
      <SharingFingerprint
        model={props.model}
        vault={props.vault}
        busy={inbox.busy()}
        run={inbox.run}
      />
      <Show when={inbox.failed() || inbox.error()}>
        <p role="alert">{c().error}</p>
      </Show>
      <Show when={inbox.loading()}>
        <p role="status">{c().loading}</p>
      </Show>
      <ul class="session-list">
        <For each={inbox.rows()}>
          {(item) => (
            <li>
              <strong>
                {c().reference} {item.projectId}
              </strong>
              <span>{c()[item.state]}</span>
              <Show when={item.state === 'pending'}>
                <time dateTime={item.expiresAt}>
                  {new Intl.DateTimeFormat(props.model.lang(), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(item.expiresAt))}
                </time>
                <button
                  disabled={inbox.busy()}
                  onClick={() =>
                    void inbox.run(async () => {
                      const key = await localSharingKey(props.vault);
                      key.signal.throwIfAborted();
                      await props.model.request('/sharing-identity', { publicKey: key.publicKey });
                      key.signal.throwIfAborted();
                      await props.model.request('/invitations/' + item.id + '/accept', {});
                    })
                  }
                >
                  {c().accept}
                </button>
              </Show>
              <Show when={item.state === 'active'}>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const code = String(new FormData(event.currentTarget).get('fingerprint') ?? '')
                      .trim()
                      .toLowerCase();
                    setOpened(undefined);
                    void inbox.run(async () => {
                      const grant = await props.model.request<
                        SharingEnvelope & { senderId: string; senderKey: string }
                      >('/invitations/' + item.id + '/content');
                      const fingerprint = await sharingFingerprint(grant.senderKey);
                      if (code !== fingerprint) throw new Error('Fingerprint mismatch');
                      const key = await localSharingKey(props.vault, {
                        account: grant.senderId,
                        fingerprint,
                      });
                      const project = await openSharedContent(key.pair, grant.senderKey, grant, {
                        project: item.projectId,
                        invitation: item.id,
                        sender: grant.senderId,
                        recipient: props.model.account()!.id,
                      });
                      key.signal.throwIfAborted();
                      setOpened({ id: item.id, project });
                    }, false);
                  }}
                >
                  <label>
                    {c().senderCode}
                    <input
                      name="fingerprint"
                      required
                      pattern="[a-fA-F0-9]{64}"
                      spellcheck={false}
                    />
                  </label>
                  <button disabled={inbox.busy()}>{c().open}</button>
                </form>
                <Show when={opened()?.id === item.id && opened()}>
                  {(result) => (
                    <Show when={result().project} fallback={<p role="status">{c().sample}</p>}>
                      {(project) => (
                        <section class="shared-project" aria-label={c().snapshot}>
                          <h2>{project().name}</h2>
                          <p>
                            {c().snapshot} · {c().revision} {project().revision}
                          </p>
                          <For each={project().objects}>
                            {(object) => (
                              <div>
                                <h3>{object.name}</h3>
                                <ul>
                                  <For each={object.surfaces}>
                                    {(surface) => (
                                      <li>
                                        {surface.name} · {c()[surface.units]}
                                      </li>
                                    )}
                                  </For>
                                </ul>
                              </div>
                            )}
                          </For>
                        </section>
                      )}
                    </Show>
                  )}
                </Show>
              </Show>
            </li>
          )}
        </For>
      </ul>
      <Show when={!inbox.loading() && !inbox.error() && !inbox.rows().length}>
        <p>{c().empty}</p>
      </Show>
      <button
        class="secondary"
        disabled={inbox.loading() || inbox.busy()}
        onClick={() => {
          setOpened(undefined);
          void inbox.refetch();
        }}
      >
        {c().refresh}
      </button>
    </section>
  );
}
