/* eslint-disable solid/reactivity -- The parent keys this panel by project ID. */
import { createSignal, For, Show } from 'solid-js';
import {
  localSharingKey,
  sealProjectSnapshot,
  sealScope,
  sharingFingerprint,
} from '../../../platform/projects/fixture-sharing';
import type { LocalVault } from '../../../platform/vault/vault';
import type { SharedProject } from '../../../platform/projects/shared-project';
import { publishOriginals } from '../../../platform/projects/shared-originals';
import { optionalScopes } from '../../../platform/projects/sharing-scopes';
import { invitationCopy } from './copy';
import type { InvitationModel, SentInvitation } from './types';
import { useInvitations } from './useInvitations';
import { SharingFingerprint } from './SharingFingerprint';
import { ProjectOwners } from './ProjectOwners';
import { Checkpoints } from './Checkpoints';
import { EditScopes } from './EditScopes';
import './styles.css';

export function ProjectInvitations(props: {
  projectId: string;
  project: SharedProject;
  originalIds?: string[];
  canHost?: boolean;
  onLeave?: () => void;
  model: InvitationModel;
  vault: LocalVault;
}) {
  const c = () => invitationCopy[props.model.lang()];
  const projectPath = '/hosted-projects/' + props.projectId;
  const path = projectPath + '/invitations';
  const [open, setOpen] = createSignal(false);
  return (
    <details class="invitation-panel" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary data-control-id="project.collaboration">{c().heading}</summary>
      <Show when={open()}>
        <InvitationControls
          model={props.model}
          path={path}
          projectPath={projectPath}
          projectId={props.projectId}
          project={props.project}
          originalIds={props.originalIds}
          vault={props.vault}
          canHost={props.canHost}
          onLeave={props.onLeave}
        />
      </Show>
    </details>
  );
}

function InvitationControls(props: {
  model: InvitationModel;
  path: string;
  projectPath: string;
  projectId: string;
  project: SharedProject;
  originalIds?: string[];
  canHost?: boolean;
  onLeave?: () => void;
  vault: LocalVault;
}) {
  const c = () => invitationCopy[props.model.lang()];
  const sent = useInvitations<SentInvitation>(props.model, props.path);
  return (
    <>
      <Show
        when={sent.failed() || (sent.error() && (sent.error() !== 'not_found' || !props.canHost))}
      >
        <p role="alert">{c().error}</p>
      </Show>
      <Show when={sent.loading()}>
        <p role="status">{c().loading}</p>
      </Show>
      <Show when={sent.error() === 'not_found' && props.canHost}>
        <p>{c().hostHelp}</p>
        <button
          class="secondary"
          disabled={sent.busy()}
          data-control-id="project.host"
          onClick={() => void sent.run(() => props.model.request(props.projectPath, {}, 'PUT'))}
        >
          {c().enable}
        </button>
      </Show>
      <Show when={!sent.error() && !sent.loading()}>
        <ProjectOwners
          model={props.model}
          projectPath={props.projectPath}
          onRemoved={(id) => {
            if (id === props.model.account()?.id && props.onLeave) props.onLeave();
            else void sent.refetch();
          }}
        />
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
            const fields = new FormData(form);
            const email = String(fields.get('email') ?? '');
            const coOwner = fields.has('coOwner');
            const estimateScope = fields.get('estimateScope');
            const shareHistory = fields.has('shareHistory');
            void sent
              .run(() =>
                props.model.request(props.path, { email, coOwner, estimateScope, shareHistory }),
              )
              .then((ok) => {
                if (ok) form.reset();
              });
          }}
        >
          <label>
            {c().recipient}
            <input type="email" name="email" required maxLength={254} disabled={sent.busy()} />
          </label>
          <label>
            {c().estimateScope}
            <select name="estimateScope" disabled={sent.busy()}>
              <option value="none">{c().noEstimate}</option>
              <option value="estimate-summary">{c()['estimate-summary']}</option>
              <option value="estimate-full">{c()['estimate-full']}</option>
            </select>
          </label>
          <label class="confirmation">
            <input type="checkbox" name="shareHistory" disabled={sent.busy()} />
            {c().includeHistory}
          </label>
          <label class="confirmation">
            <input type="checkbox" name="coOwner" disabled={sent.busy()} />
            {c().inviteCoOwner}
          </label>
          <button disabled={sent.busy()}>{c().issue}</button>
        </form>
        <ul class="session-list">
          <For each={sent.rows()} fallback={<li>{c().empty}</li>}>
            {(item) => (
              <li>
                <strong>
                  {item.email}
                  {item.coOwner ? ' · ' + c().coOwner : ''}
                </strong>
                <span>{c()[item.state]}</span>
                <p>
                  {[c().assessment, ...optionalScopes(item).map((scope) => c()[scope])].join(' · ')}
                </p>
                <Show when={item.state === 'active'}>
                  <Checkpoints
                    invitation={item.id}
                    project={props.projectId}
                    owner={{ item, path: props.path + '/' + item.id }}
                    model={props.model}
                    vault={props.vault}
                  />
                  <EditScopes
                    item={item}
                    project={props.projectId}
                    path={props.path + '/' + item.id + '/scopes'}
                    model={props.model}
                    vault={props.vault}
                    busy={sent.busy()}
                    run={sent.run}
                  />
                </Show>
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
                <Show when={item.state === 'active' && !item.coOwner}>
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
                <Show when={item.sourceIds?.length}>
                  <p>{c().rotationNeeded}</p>
                </Show>
                <Show
                  when={
                    item.recipientKey &&
                    (item.state === 'accepted' || !!item.sourceIds?.length) &&
                    (!item.sourceIds?.length || props.canHost) &&
                    item.recipientKey
                  }
                >
                  {(recipientKey) => (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        const fields = new FormData(event.currentTarget);
                        const code = String(fields.get('fingerprint') ?? '')
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
                          const sourceIds =
                            item.sourceIds ??
                            (fields.has('originals') ? (props.originalIds ?? []) : []);
                          const originalEpoch = sent.originalEpoch();
                          const originals = sourceIds.length
                            ? await publishOriginals(
                                props.vault,
                                props.projectId,
                                sourceIds,
                                originalEpoch,
                                props.model.csrf(),
                                key.signal,
                              )
                            : [];
                          const context = {
                            project: props.projectId,
                            invitation: item.id,
                            sender,
                            recipient: item.recipientId,
                          };
                          const grant = await sealProjectSnapshot(
                            key.pair,
                            recipientKey(),
                            context,
                            project,
                            originals,
                          );
                          const scopes = item.sourceIds?.length
                            ? []
                            : await Promise.all(
                                optionalScopes(item).map((scope) =>
                                  sealScope(key.pair, recipientKey(), context, scope),
                                ),
                              );
                          key.signal.throwIfAborted();
                          await props.model.request('/sharing-identity', {
                            publicKey: key.publicKey,
                          });
                          key.signal.throwIfAborted();
                          const action = item.sourceIds?.length ? '/rotate-originals' : '/activate';
                          await props.model.request(props.path + '/' + item.id + action, {
                            ...grant,
                            recipientKey: recipientKey(),
                            fileIds: originals.map((original) => original.id),
                            sourceIds,
                            originalEpoch,
                            scopes,
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
                      <Show when={!item.sourceIds?.length && props.originalIds?.length}>
                        <label class="confirmation">
                          <input type="checkbox" name="originals" disabled={sent.busy()} />
                          {c().includeOriginals}
                        </label>
                      </Show>
                      <button disabled={sent.busy()}>
                        {item.sourceIds?.length ? c().rotate : c().activate}
                      </button>
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
