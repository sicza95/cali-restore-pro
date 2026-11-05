/* eslint-disable solid/reactivity -- The invitation is fixed for this mounted row. */
import { createSignal, Show } from 'solid-js';
import {
  localSharingKey,
  sealScope,
  sharingFingerprint,
} from '../../../platform/projects/fixture-sharing';
import { optionalScopes } from '../../../platform/projects/sharing-scopes';
import type { EstimateScope } from '../../../platform/projects/sharing-scopes';
import type { LocalVault } from '../../../platform/vault/vault';
import { invitationCopy } from './copy';
import type { InvitationModel, SentInvitation } from './types';

export function EditScopes(props: {
  item: SentInvitation;
  project: string;
  path: string;
  model: InvitationModel;
  vault: LocalVault;
  busy: boolean;
  run: (action: () => Promise<unknown>) => Promise<boolean>;
}) {
  const c = () => invitationCopy[props.model.lang()];
  const previous = {
    estimateScope: props.item.estimateScope,
    shareHistory: props.item.shareHistory,
  };
  const [estimateScope, setEstimate] = createSignal(previous.estimateScope);
  const [shareHistory, setHistory] = createSignal(previous.shareHistory);
  const [open, setOpen] = createSignal(false);
  const next = () => ({ estimateScope: estimateScope(), shareHistory: shareHistory() });
  const additions = () =>
    optionalScopes(next()).filter((scope) => !optionalScopes(previous).includes(scope));
  return (
    <details class="scope-editor" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{c().editScopes}</summary>
      <Show when={open()}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const code = String(new FormData(event.currentTarget).get('fingerprint') ?? '')
              .trim()
              .toLowerCase();
            const desired = next();
            const added = additions();
            void props.run(async () => {
              if (!added.length)
                return props.model.request(props.path, { previous, next: desired });
              const recipientKey = props.item.recipientKey;
              if (!recipientKey) throw new Error('Recipient unavailable');
              const fingerprint = await sharingFingerprint(recipientKey);
              if (fingerprint !== code) throw new Error('Fingerprint mismatch');
              const key = await localSharingKey(props.vault, {
                account: props.item.recipientId,
                fingerprint,
              });
              const context = {
                project: props.project,
                invitation: props.item.id,
                sender: props.model.account()!.id,
                recipient: props.item.recipientId,
              };
              const grants = await Promise.all(
                added.map((scope) => sealScope(key.pair, recipientKey, context, scope)),
              );
              key.signal.throwIfAborted();
              await props.model.request('/sharing-identity', { publicKey: key.publicKey });
              key.signal.throwIfAborted();
              return props.model.request(props.path, {
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
          <Show when={additions().length}>
            <label>
              {c().recipientCode}
              <input name="fingerprint" required pattern="[a-fA-F0-9]{64}" spellcheck={false} />
            </label>
          </Show>
          <button
            disabled={
              props.busy ||
              (estimateScope() === previous.estimateScope &&
                shareHistory() === previous.shareHistory) ||
              (!!additions().length && !props.item.recipientKey)
            }
          >
            {c().saveScopes}
          </button>
        </form>
      </Show>
    </details>
  );
}
