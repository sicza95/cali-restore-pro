/* eslint-disable solid/reactivity -- The deferred command reads the current vault on user input. */
import { createSignal, Show } from 'solid-js';
import { useApp } from '../app-context/AppContext';
import { localSharingKey, sharingFingerprint } from '../../platform/projects/fixture-sharing';
import type { LocalVault } from '../../platform/vault/vault';
import { invitationCopy } from './copy';

export function SharingFingerprint(props: {
  vault: LocalVault;
  busy: boolean;
  run: (action: () => Promise<unknown>, refresh?: boolean) => Promise<boolean>;
}) {
  const app = useApp();
  const c = () => invitationCopy[app.lang()];
  const [code, setCode] = createSignal('');
  return (
    <div>
      <p>{c().identityHelp}</p>
      <button
        data-control-id="sharing.fingerprint"
        class="secondary"
        disabled={props.busy}
        onClick={() =>
          void props.run(async () => {
            const key = await localSharingKey(props.vault);
            const fingerprint = await sharingFingerprint(key.publicKey);
            key.signal.throwIfAborted();
            await app.request('/sharing-identity', { publicKey: key.publicKey });
            key.signal.throwIfAborted();
            setCode(fingerprint);
          }, false)
        }
      >
        {c().identity}
      </button>
      <Show when={code()}>
        <p role="status">
          <code>{code()}</code>
        </p>
      </Show>
    </div>
  );
}
