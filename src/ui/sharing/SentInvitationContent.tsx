import { Show } from 'solid-js';
import { useApp } from '../app-context/AppContext';
import { scopeContent } from '../../platform/estimates/scopes';
import {
  localSharingKey,
  sealProjectSnapshot,
  sealScope,
  sharingFingerprint,
} from '../../platform/projects/fixture-sharing';
import type { LocalVault } from '../../platform/vault/vault';
import type { SharedProject } from '../../platform/projects/shared-project';
import { publishOriginals } from '../../platform/projects/shared-originals';
import { optionalScopes } from '../../platform/projects/sharing-scopes';
import { invitationCopy } from './copy';
import { managementCopy } from './management-copy';
import type { SentInvitation } from './types';
import type { useInvitations } from './useInvitations';
import { Checkpoints } from './Checkpoints';
import { EditScopes } from './EditScopes';
export function SentInvitationContent(props: {
  item: SentInvitation;
  identity?: boolean;
  projectId: string;
  project: SharedProject;
  originalIds?: string[];
  canHost?: boolean;
  path: string;
  vault: LocalVault;
  sent: ReturnType<typeof useInvitations<SentInvitation>>;
}) {
  const app = useApp();
  const c = () => invitationCopy[app.lang()];
  return (
    <>
      <Show when={props.identity !== false}>
        <strong>
          {props.item.email}
          {' · ' + (props.item.coOwner ? c().coOwner : managementCopy[app.lang()].recipient)}
        </strong>
      </Show>
      <span>{c()[props.item.state]}</span>
      <p>
        {[c().assessment, ...optionalScopes(props.item).map((scope) => c()[scope])].join(' · ')}
      </p>
      <Show when={props.item.state === 'active'}>
        <Checkpoints
          invitation={props.item.id}
          project={props.projectId}
          owner={{ item: props.item, path: props.path + '/' + props.item.id }}
          vault={props.vault}
        />
        <EditScopes
          item={props.item}
          project={props.projectId}
          path={props.path + '/' + props.item.id + '/scopes'}
          vault={props.vault}
          busy={props.sent.busy()}
          run={props.sent.run}
        />
      </Show>
      <Show when={props.item.state === 'pending' || props.item.state === 'accepted'}>
        <button
          data-control-id="sharing.cancel"
          disabled={props.sent.busy()}
          onClick={() =>
            void props.sent.run(() => app.request(props.path + '/' + props.item.id + '/cancel', {}))
          }
        >
          {c().cancel}
        </button>
      </Show>
      <Show when={props.item.state === 'pending'}>
        <button
          type="button"
          data-control-id="sharing.resend"
          aria-describedby={`resend-help-${props.item.id}`}
          disabled
        >
          {c().resend}
        </button>
        <p class="field-help" id={`resend-help-${props.item.id}`}>
          {c().resendUnavailable}
        </p>
      </Show>
      <Show when={props.item.state === 'active' && !props.item.coOwner}>
        <button
          data-control-id="sharing.revoke"
          disabled={props.sent.busy()}
          onClick={() => {
            if (window.confirm(c().revokeConfirm))
              void props.sent.run(() =>
                app.request(props.path + '/' + props.item.id + '/revoke', {}),
              );
          }}
        >
          {c().revoke}
        </button>
      </Show>
      <Show when={props.item.sourceIds?.length}>
        <p>{c().rotationNeeded}</p>
        <Show when={!props.canHost}>
          <p>{managementCopy[app.lang()].hostOriginals}</p>
        </Show>
      </Show>
      <Show
        when={
          props.item.recipientKey &&
          (props.item.state === 'accepted' || !!props.item.sourceIds?.length) &&
          (!props.item.sourceIds?.length || props.canHost) &&
          props.item.recipientKey
        }
      >
        {(recipientKey) => (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const fields = new FormData(event.currentTarget);
              void props.sent.run(async () => {
                const fingerprint = await sharingFingerprint(recipientKey());
                const sender = app.account()!.id;
                const key = await localSharingKey(props.vault, {
                  account: props.item.recipientId,
                  fingerprint,
                });
                const project = props.project;
                const sourceIds =
                  props.item.sourceIds ??
                  (fields.has('originals') ? (props.originalIds ?? []) : []);
                const originalEpoch = props.sent.originalEpoch();
                const originals = sourceIds.length
                  ? await publishOriginals(
                      props.vault,
                      props.projectId,
                      sourceIds,
                      originalEpoch,
                      app.csrf(),
                      key.signal,
                    )
                  : [];
                const vault = props.vault;
                const projectId = props.projectId;
                const context = {
                  project: projectId,
                  invitation: props.item.id,
                  sender,
                  recipient: props.item.recipientId,
                };
                const grant = await sealProjectSnapshot(
                  key.pair,
                  recipientKey(),
                  context,
                  project,
                  originals,
                );
                const scopes = props.item.sourceIds?.length
                  ? []
                  : await Promise.all(
                      optionalScopes(props.item).map(async (scope) =>
                        sealScope(
                          key.pair,
                          recipientKey(),
                          context,
                          scope,
                          await scopeContent(vault, projectId, scope, project.revision),
                        ),
                      ),
                    );
                key.signal.throwIfAborted();
                await app.request('/sharing-identity', {
                  publicKey: key.publicKey,
                });
                key.signal.throwIfAborted();
                const action = props.item.sourceIds?.length ? '/rotate-originals' : '/activate';
                await app.request(props.path + '/' + props.item.id + action, {
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
            <Show when={!props.item.sourceIds?.length && props.originalIds?.length}>
              <label class="confirmation">
                <input
                  data-control-id="sharing.originals"
                  type="checkbox"
                  name="originals"
                  disabled={props.sent.busy()}
                />
                {c().includeOriginals}
              </label>
            </Show>
            <button
              data-control-id={props.item.sourceIds?.length ? 'sharing.rotate' : 'sharing.activate'}
              disabled={props.sent.busy()}
            >
              {props.item.sourceIds?.length ? c().rotate : c().activate}
            </button>
          </form>
        )}
      </Show>
    </>
  );
}
