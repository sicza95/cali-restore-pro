import { createSignal, onCleanup, onMount, Show, untrack } from 'solid-js';
import type { JSX } from 'solid-js';
import { LocalVault } from '../../../platform/vault/vault';
import type { Language } from '../../account-access/types';
import { vaultCopy } from './vault-copy';
import './vault.css';

/**
 * Opens this account's local vault with no key screen (encryption is off, see aead.ts) and shows
 * the workspace that needs it.
 */
export function VaultSection(props: {
  account: string;
  language: Language;
  workspace: (vault: LocalVault) => JSX.Element;
}) {
  const c = () => vaultCopy[props.language];
  const [open, setOpen] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal(false);
  let generation = 0;
  const vault = new LocalVault(
    untrack(() => props.account),
    () => {
      setOpen(false);
      void start();
    },
  );
  const run = async (task: () => Promise<unknown>) => {
    const current = ++generation;
    setBusy(true);
    setFailure(false);
    try {
      await task();
      if (current === generation) setOpen(true);
    } catch {
      if (current === generation) setFailure(true);
    } finally {
      if (current === generation) setBusy(false);
    }
  };
  const start = () => run(() => vault.openWithoutKey());
  const reset = () =>
    run(async () => {
      await vault.forget(true);
      await vault.openWithoutKey();
    });
  const sessionEnd = () => {
    generation++;
    vault.lock(false);
    setOpen(false);
  };
  onMount(() => {
    window.addEventListener('calirestore-session-end', sessionEnd);
    void start();
  });
  onCleanup(() => {
    generation++;
    window.removeEventListener('calirestore-session-end', sessionEnd);
    vault.close();
  });
  return (
    <section class="account-section project-vault-open" aria-label={c().heading}>
      <div>
        <h2>{c().heading}</h2>
      </div>
      <Show when={!open()}>
        <div class="account-panel vault-panel">
          <Show when={busy()}>
            <p role="status">{c().working}</p>
          </Show>
          <Show when={failure()}>
            <p role="alert">{c().failed}</p>
            <button data-control-id="vault.reset" disabled={busy()} onClick={() => void reset()}>
              {c().reset}
            </button>
          </Show>
        </div>
      </Show>
      <Show when={open()}>{props.workspace(vault)}</Show>
    </section>
  );
}
