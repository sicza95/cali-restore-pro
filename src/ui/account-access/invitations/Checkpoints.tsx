/* eslint-disable solid/reactivity -- The invitation and request paths are fixed for each mounted panel. */
import { createResource, createSignal, For, onCleanup, Show } from 'solid-js';
import { checkpointSamples } from '../../../platform/projects/checkpoint-samples';
import type { Checkpoint } from '../../../platform/projects/checkpoint-samples';
import {
  localSharingKey,
  openCheckpoint,
  sealCheckpoint,
  sharingFingerprint,
} from '../../../platform/projects/fixture-sharing';
import type { CheckpointEnvelope } from '../../../platform/projects/fixture-sharing';
import type { LocalVault } from '../../../platform/vault/vault';
import { invitationCopy } from './copy';
import type { InvitationModel, SentInvitation } from './types';

type Common = {
  model: InvitationModel;
  vault: LocalVault;
  project: string;
  invitation: string;
};

export function Checkpoints(props: Common & { owner?: { path: string; item: SentInvitation } }) {
  const c = () => invitationCopy[props.model.lang()];
  const [expanded, setExpanded] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const [opened, setOpened] = createSignal<Checkpoint>();
  const owner = props.owner;
  const path = (owner?.path ?? '/invitations/' + props.invitation) + '/checkpoints';
  const [list, { refetch }] = createResource(expanded, async () => {
    try {
      return await props.model.request<{ checkpointIds: string[] }>(path);
    } catch {
      return null;
    }
  });
  let vaultSignal: AbortSignal | undefined;
  let disposed = false;
  const clear = () => setOpened(undefined);
  onCleanup(() => {
    disposed = true;
    vaultSignal?.removeEventListener('abort', clear);
  });
  async function run(action: () => Promise<unknown>) {
    if (busy()) return;
    setBusy(true);
    setFailed(false);
    clear();
    try {
      await action();
      if (owner) await refetch();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  function context(sender: string, recipient: string) {
    return { project: props.project, invitation: props.invitation, sender, recipient };
  }
  async function verifiedKey(account: string, publicKey: string, code: string) {
    const fingerprint = await sharingFingerprint(publicKey);
    if (fingerprint !== code) throw new Error('Fingerprint mismatch');
    return localSharingKey(props.vault, { account, fingerprint });
  }

  return (
    <details
      class="scope-editor"
      onToggle={(event) => {
        setExpanded(event.currentTarget.open);
        clear();
      }}
    >
      <summary>{owner ? c().editCheckpoints : c().sharedCheckpoints}</summary>
      <Show when={expanded()}>
        <Show when={failed() || list() === null}>
          <p role="alert">{c().error}</p>
        </Show>
        <Show when={list.loading}>
          <p role="status">{c().loadingCheckpoints}</p>
        </Show>
        <Show when={list()}>
          {(current) => (
            <Show
              when={owner || current().checkpointIds.length}
              fallback={<p>{c().noCheckpoints}</p>}
            >
              <Show when={owner}>
                <p>{c().sampleOnly}</p>
              </Show>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const code = String(new FormData(event.currentTarget).get('fingerprint') ?? '')
                    .trim()
                    .toLowerCase();
                  const id = (event.submitter as HTMLButtonElement | null)?.value;
                  if (!id) return;
                  void run(async () => {
                    const account = props.model.account()!.id;
                    if (owner) {
                      const checkpoint = checkpointSamples.find((sample) => sample.id === id);
                      const recipientKey = owner.item.recipientKey;
                      if (!checkpoint || !recipientKey || current().checkpointIds.includes(id))
                        return;
                      const recipient = owner.item.recipientId;
                      const key = await verifiedKey(recipient, recipientKey, code);
                      const envelope = await sealCheckpoint(
                        key.pair,
                        recipientKey,
                        context(account, recipient),
                        checkpoint,
                      );
                      key.signal.throwIfAborted();
                      await props.model.request('/sharing-identity', { publicKey: key.publicKey });
                      key.signal.throwIfAborted();
                      await props.model.request(
                        path + '/' + id,
                        { ...envelope, recipientKey },
                        'PUT',
                      );
                    } else {
                      if (!current().checkpointIds.includes(id)) return;
                      const grant = await props.model.request<
                        CheckpointEnvelope & { senderId: string; senderKey: string }
                      >(path + '/' + id);
                      const key = await verifiedKey(grant.senderId, grant.senderKey, code);
                      const checkpoint = await openCheckpoint(
                        key.pair,
                        grant.senderKey,
                        grant,
                        context(grant.senderId, account),
                        id,
                      );
                      key.signal.throwIfAborted();
                      if (disposed || !expanded()) return;
                      vaultSignal?.removeEventListener('abort', clear);
                      vaultSignal = key.signal;
                      vaultSignal.addEventListener('abort', clear, { once: true });
                      setOpened(checkpoint);
                    }
                  });
                }}
              >
                <label>
                  {owner ? c().recipientCode : c().checkpointSenderCode}
                  <input name="fingerprint" required pattern="[a-fA-F0-9]{64}" spellcheck={false} />
                </label>
                <Show
                  when={owner}
                  fallback={
                    <For each={current().checkpointIds}>
                      {(id, index) => (
                        <button
                          data-control-id="sharing.checkpoint.open"
                          class="secondary"
                          value={id}
                          disabled={busy()}
                        >
                          {c().openCheckpoint} {index() + 1}
                        </button>
                      )}
                    </For>
                  }
                >
                  <For each={checkpointSamples}>
                    {(checkpoint) => (
                      <Show
                        when={current().checkpointIds.includes(checkpoint.id)}
                        fallback={
                          <button
                            data-control-id="sharing.checkpoint.grant"
                            class="secondary"
                            value={checkpoint.id}
                            disabled={busy() || !owner?.item.recipientKey}
                          >
                            {c().shareCheckpoint}: {checkpoint.title}
                          </button>
                        }
                      >
                        <button
                          data-control-id="sharing.checkpoint.revoke"
                          type="button"
                          class="secondary"
                          disabled={busy()}
                          onClick={() =>
                            void run(() =>
                              props.model.request(path + '/' + checkpoint.id, {}, 'DELETE'),
                            )
                          }
                        >
                          {c().removeCheckpoint}: {checkpoint.title}
                        </button>
                      </Show>
                    )}
                  </For>
                </Show>
              </form>
              <Show when={opened()}>
                {(checkpoint) => (
                  <section class="shared-project" aria-label={c().sharedCheckpoints}>
                    <h2>{checkpoint().title}</h2>
                    <p>{c().sampleOnly}</p>
                    <p>{checkpoint().description}</p>
                  </section>
                )}
              </Show>
            </Show>
          )}
        </Show>
      </Show>
    </details>
  );
}
