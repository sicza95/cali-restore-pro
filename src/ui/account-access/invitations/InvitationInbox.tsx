/* eslint-disable solid/reactivity -- The account and vault are fixed for the mounted inbox, and commands run on user input. */
import { createSignal, For, Show } from 'solid-js';
import {
  localSharingKey,
  openSharedContent,
  openScope,
  sharingFingerprint,
} from '../../../platform/projects/fixture-sharing';
import type { ScopeEnvelope, SharingEnvelope } from '../../../platform/projects/fixture-sharing';
import { optionalScopes } from '../../../platform/projects/sharing-scopes';
import type { OptionalScope } from '../../../platform/projects/sharing-scopes';
import type { SharedProject } from '../../../platform/projects/shared-project';
import type { SharedOriginal } from '../../../platform/projects/shared-originals';
import type { LocalVault } from '../../../platform/vault/vault';
import { SharedEstimateProjection } from '../project-review/SharedEstimateProjection';
import { estimateCopy } from '../project-review/estimate-copy';
import { invitationCopy } from './copy';
import type { InboxInvitation, InvitationModel } from './types';
import { useInvitations } from './useInvitations';
import { SharingFingerprint } from './SharingFingerprint';
import { ProjectInvitations } from './ProjectInvitations';
import { Checkpoints } from './Checkpoints';
import { SharedOriginals } from './SharedOriginals';
import { OfflineOriginals, useOfflineOriginals } from './OfflineOriginals';
import './styles.css';

export function InvitationInbox(props: { model: InvitationModel; vault: LocalVault }) {
  const c = () => invitationCopy[props.model.lang()];
  const inbox = useInvitations<InboxInvitation>(props.model, '/invitations');
  const offline = useOfflineOriginals(props.vault.originalPins());
  const [opened, setOpened] = createSignal<{
    id: string;
    project?: SharedProject;
    originals: SharedOriginal[];
    sender: string;
    locked: AbortSignal;
    scope?: { id: OptionalScope; rows: string[] };
  }>();
  return (
    <section class="invitation-panel" aria-label={c().heading}>
      <OfflineOriginals model={offline} language={props.model.lang()} />
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
              <p>
                {[c().assessment, ...optionalScopes(item).map((scope) => c()[scope])].join(' · ')}
              </p>
              <Show when={item.coOwner}>
                <span>{c().coOwner}</span>
              </Show>
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
                <Checkpoints
                  project={item.projectId}
                  invitation={item.id}
                  model={props.model}
                  vault={props.vault}
                />
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const code = String(new FormData(event.currentTarget).get('fingerprint') ?? '')
                      .trim()
                      .toLowerCase();
                    const selected = optionalScopes(item).find(
                      (scope) => scope === (event.submitter as HTMLButtonElement | null)?.value,
                    );
                    setOpened(undefined);
                    void inbox.run(async () => {
                      const grant = await props.model.request<
                        (SharingEnvelope | ScopeEnvelope) & { senderId: string; senderKey: string }
                      >(
                        '/invitations/' + item.id + (selected ? '/scopes/' + selected : '/content'),
                      );
                      const fingerprint = await sharingFingerprint(grant.senderKey);
                      if (code !== fingerprint) throw new Error('Fingerprint mismatch');
                      const key = await localSharingKey(props.vault, {
                        account: grant.senderId,
                        fingerprint,
                      });
                      const context = {
                        project: item.projectId,
                        invitation: item.id,
                        sender: grant.senderId,
                        recipient: props.model.account()!.id,
                      };
                      const scoped =
                        selected && 'scope' in grant
                          ? {
                              id: selected,
                              rows: await openScope(
                                key.pair,
                                grant.senderKey,
                                grant,
                                context,
                                selected,
                              ),
                            }
                          : undefined;
                      if (selected && !scoped) throw new Error('Missing scope');
                      const content =
                        !selected && 'format' in grant
                          ? await openSharedContent(key.pair, grant.senderKey, grant, context)
                          : undefined;
                      if (!selected && !('format' in grant)) throw new Error('Missing assessment');
                      key.signal.throwIfAborted();
                      setOpened({
                        id: item.id,
                        project: content?.project,
                        originals: content?.originals ?? [],
                        sender: grant.senderId,
                        locked: key.signal,
                        scope: scoped,
                      });
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
                      disabled={inbox.loading() || inbox.busy()}
                    />
                  </label>
                  <button disabled={inbox.loading() || inbox.busy()}>{c().open}</button>
                  <For each={optionalScopes(item)}>
                    {(scope) => (
                      <button
                        class="secondary"
                        value={scope}
                        disabled={inbox.loading() || inbox.busy()}
                      >
                        {c()[scope]}
                      </button>
                    )}
                  </For>
                </form>
                <Show when={opened()?.id === item.id && opened()}>
                  {(result) => (
                    <Show
                      when={result().project}
                      fallback={
                        <Show when={result().scope} fallback={<p role="status">{c().sample}</p>}>
                          {(scope) => (
                            <section class="shared-project" aria-label={c()[scope().id]}>
                              <h2>{c()[scope().id]}</h2>
                              <p>{c().sampleOnly}</p>
                              <Show
                                when={scope().id !== 'history'}
                                fallback={
                                  <ul>
                                    <For each={scope().rows}>{(row) => <li>{row}</li>}</For>
                                  </ul>
                                }
                              >
                                <SharedEstimateProjection
                                  scope={scope().id as 'estimate-full' | 'estimate-summary'}
                                  rows={scope().rows}
                                  language={props.model.lang()}
                                />
                              </Show>
                            </section>
                          )}
                        </Show>
                      }
                    >
                      {(project) => (
                        <section class="shared-project" aria-label={c().snapshot}>
                          <h2>{project().name}</h2>
                          <p>
                            {c().snapshot} · {c().revision} {project().revision}
                          </p>
                          <p>{estimateCopy[props.model.lang()].assessmentOnly}</p>
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
                          <Show when={result().originals.length}>
                            <SharedOriginals
                              files={result().originals}
                              invitation={item.id}
                              project={item.projectId}
                              sender={result().sender}
                              locked={result().locked}
                              offline={offline}
                              language={props.model.lang()}
                            />
                          </Show>
                          <Show when={item.coOwner}>
                            <ProjectInvitations
                              projectId={item.projectId}
                              project={project()}
                              model={props.model}
                              vault={props.vault}
                              onLeave={() => {
                                setOpened(undefined);
                                void inbox.refetch();
                              }}
                            />
                          </Show>
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
