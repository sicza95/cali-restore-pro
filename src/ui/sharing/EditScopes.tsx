import { createSignal, Show, untrack } from 'solid-js';
import { useApp } from '../app-context/AppContext';
import { scopeContent } from '../../platform/estimates/scopes';
import {
  localSharingKey,
  sealScope,
  sharingFingerprint,
} from '../../platform/projects/fixture-sharing';
import { optionalScopes } from '../../platform/projects/sharing-scopes';
import type { EstimateScope } from '../../platform/projects/sharing-scopes';
import type { LocalVault } from '../../platform/vault/vault';
import { invitationCopy } from './copy';
import { managementCopy } from './management-copy';
import type { SentInvitation } from './types';

export function EditScopes(props: {
  item: SentInvitation;
  project: string;
  path: string;
  vault: LocalVault;
  busy: boolean;
  run: (action: () => Promise<unknown>) => Promise<boolean>;
}) {
  const app = useApp();
  const c = () => invitationCopy[app.lang()];
  // The saved scopes this row started from; the form edits copies of them.
  const previous = untrack(() => ({
    estimateScope: props.item.estimateScope,
    shareHistory: props.item.shareHistory,
  }));
  const [estimateScope, setEstimate] = createSignal(previous.estimateScope);
  const [shareHistory, setHistory] = createSignal(previous.shareHistory);
  const [open, setOpen] = createSignal(false);
  const next = () => ({ estimateScope: estimateScope(), shareHistory: shareHistory() });
  const additions = () =>
    optionalScopes(next()).filter((scope) => !optionalScopes(previous).includes(scope));
  return (
    <details class="scope-editor" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary data-control-id="sharing.scopes.open">{c().editScopes}</summary>
      <Show when={open()}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const desired = next();
            const added = additions();
            void props.run(async () => {
              if (!added.length) return app.request(props.path, { previous, next: desired });
              const recipientKey = props.item.recipientKey;
              if (!recipientKey) throw new Error('Recipient unavailable');
              const fingerprint = await sharingFingerprint(recipientKey);
              const key = await localSharingKey(props.vault, {
                account: props.item.recipientId,
                fingerprint,
              });
              const vault = props.vault;
              const project = props.project;
              const context = {
                project,
                invitation: props.item.id,
                sender: app.account()!.id,
                recipient: props.item.recipientId,
              };
              const grants = await Promise.all(
                added.map(async (scope) =>
                  sealScope(
                    key.pair,
                    recipientKey,
                    context,
                    scope,
                    await scopeContent(vault, project, scope),
                  ),
                ),
              );
              key.signal.throwIfAborted();
              await app.request('/sharing-identity', { publicKey: key.publicKey });
              key.signal.throwIfAborted();
              return app.request(props.path, {
                previous,
                next: desired,
                recipientKey,
                grants,
              });
            });
          }}
        >
          <label>
            {c().estimateScope}
            <select
              value={estimateScope()}
              onChange={(event) => setEstimate(event.currentTarget.value as EstimateScope)}
              disabled={props.busy}
            >
              <option value="none">{c().noEstimate}</option>
              <option value="estimate-summary">{c()['estimate-summary']}</option>
              <option value="estimate-full">{c()['estimate-full']}</option>
            </select>
          </label>
          <label class="confirmation">
            <input
              type="checkbox"
              checked={shareHistory()}
              onChange={(event) => setHistory(event.currentTarget.checked)}
              disabled={props.busy}
            />
            {c().includeHistory}
          </label>
          <button
            data-control-id="sharing.scopes.apply"
            aria-describedby={
              additions().length && !props.item.recipientKey
                ? `scope-help-${props.item.id}`
                : undefined
            }
            disabled={
              props.busy ||
              (estimateScope() === previous.estimateScope &&
                shareHistory() === previous.shareHistory) ||
              (!!additions().length && !props.item.recipientKey)
            }
          >
            {c().saveScopes}
          </button>
          <Show when={additions().length && !props.item.recipientKey}>
            <p class="field-help" id={`scope-help-${props.item.id}`}>
              {managementCopy[app.lang()].recipientUnavailable}
            </p>
          </Show>
        </form>
      </Show>
    </details>
  );
}
