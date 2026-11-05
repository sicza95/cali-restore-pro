/* eslint-disable solid/reactivity -- The parent keys this panel by project ID. */
import { createSignal, For, Show } from 'solid-js';
import {
  localSharingKey,
  sealProjectSnapshot,
  sharingFingerprint,
} from '../../../platform/projects/fixture-sharing';
import type { LocalVault } from '../../../platform/vault/vault';
import type { SavedProject } from '../../../platform/projects/types';
import { invitationCopy } from './copy';
import type { InvitationModel, SentInvitation } from './types';
import { useInvitations } from './useInvitations';
import { SharingFingerprint } from './SharingFingerprint';
import './styles.css';

export function ProjectInvitations(props: {
  projectId: string;
  project: SavedProject;
  model: InvitationModel;
  vault: LocalVault;
}) {
  const c = () => invitationCopy[props.model.lang()];
  const projectPath = '/hosted-projects/' + props.projectId;
  const path = projectPath + '/invitations';
  const [open, setOpen] = createSignal(false);
  return (
    <details class="invitation-panel" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{c().heading}</summary>
      <Show when={open()}>
        <InvitationControls
          model={props.model}
          path={path}
          projectPath={projectPath}
          project={props.project}
          vault={props.vault}
        />
      </Show>
    </details>
  );
}

function InvitationControls(props: {
  model: InvitationModel;
  path: string;
  projectPath: string;
  project: SavedProject;
  vault: LocalVault;
}) {
  const c = () => invitationCopy[props.model.lang()];
  const sent = useInvitations<SentInvitation>(props.model, props.path);
  return (
    <>
      <Show when={sent.failed() || (sent.error() && sent.error() !== 'not_found')}>
        <p role="alert">{c().error}</p>
      </Show>
      <Show when={sent.loading()}>
        <p role="status">{c().loading}</p>
      </Show>
      <Show when={sent.error() === 'not_found'}>
        <p>{c().hostHelp}</p>
        <button
          class="secondary"
          disabled={sent.busy()}
          onClick={() => void sent.run(() => props.model.request(props.projectPath, {}, 'PUT'))}
        >
          {c().enable}
        </button>
      </Show>
      <Show when={!sent.error() && !sent.loading()}>
        <SharingFingerprint
          model={props.model}
          vault={props.vault}
          busy={sent.busy()}
          run={sent.run}
        />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const email = String(new FormData(form).get('email') ?? '');
            void sent
              .run(() => props.model.request(props.path, { email }))
              .then((ok) => {
                if (ok) form.reset();
              });
          }}
        >
          <label>
            {c().recipient}
            <input type="email" name="email" required maxLength={254} disabled={sent.busy()} />
          </label>
          <button disabled={sent.busy()}>{c().issue}</button>
        </form>
        <ul class="session-list">
          <For each={sent.rows()} fallback={<li>{c().empty}</li>}>
            {(item) => (
              <li>
                <strong>{item.email}</strong>
                <span>{c()[item.state]}</span>
                <Show when={item.state === 'pending' || item.state === 'accepted'}>
                  <button
                    class="secondary"
                    disabled={sent.busy()}
                    onClick={() =>
                      void sent.run(() =>
                        props.model.request(props.path + '/' + item.id + '/cancel', {}),
                      )
                    }
                  >
                    {c().cancel}
                  </button>
                </Show>
                <Show when={item.state === 'active'}>
                  <button
                    class="secondary"
                    disabled={sent.busy()}
                    onClick={() => {
                      if (window.confirm(c().revokeConfirm))
                        void sent.run(() =>
                          props.model.request(props.path + '/' + item.id + '/revoke', {}),
                        );
                    }}
                  >
                    {c().revoke}
                  </button>
                </Show>
                <Show when={item.recipientKey}>
                  {(recipientKey) => (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        const code = String(
                          new FormData(event.currentTarget).get('fingerprint') ?? '',
                        )
                          .trim()
                          .toLowerCase();
                        void sent.run(async () => {
                          const fingerprint = await sharingFingerprint(recipientKey());
                          if (code !== fingerprint) throw new Error('Fingerprint mismatch');
                          const sender = props.model.account()!.id;
                          const key = await localSharingKey(props.vault, {
                            account: item.recipientId,
                            fingerprint,
                          });
                          const project = props.project;
                          const grant = await sealProjectSnapshot(
                            key.pair,
                            recipientKey(),
                            {
                              project: project.id,
                              invitation: item.id,
                              sender,
                              recipient: item.recipientId,
                            },
                            project,
                          );
                          key.signal.throwIfAborted();
                          await props.model.request('/sharing-identity', {
                            publicKey: key.publicKey,
                          });
                          key.signal.throwIfAborted();
                          await props.model.request(props.path + '/' + item.id + '/activate', {
                            ...grant,
                            recipientKey: recipientKey(),
                          });
                        });
                      }}
                    >
                      <p>{c().scope}</p>
                      <label>
                        {c().recipientCode}
                        <input
                          name="fingerprint"
                          required
                          pattern="[a-fA-F0-9]{64}"
                          spellcheck={false}
                        />
                      </label>
                      <button disabled={sent.busy()}>{c().activate}</button>
                    </form>
                  )}
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <button
        class="secondary"
        disabled={sent.loading() || sent.busy()}
        onClick={() => void sent.refetch()}
      >
        {c().refresh}
      </button>
    </>
  );
}
