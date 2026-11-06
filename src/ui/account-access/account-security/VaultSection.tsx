import { createSignal, onCleanup, onMount, Show, untrack } from 'solid-js';
import { newCode } from '../../../platform/vault/crypto';
import { LocalVault } from '../../../platform/vault/vault';
import type { Language } from '../types';
import { vaultEntryControls } from './entry-controls';
import { vaultCopy } from './vault-copy';
import { download, readFile } from './vault-files';
import './vault.css';

export function VaultSection(props: {
  account: string;
  language: Language;
  unlockOnly?: string;
  entry?: 'unlock' | 'approve';
  setupLink?: { href: string; text: string };
  workspace?: (vault: LocalVault) => import('solid-js').JSX.Element;
}) {
  const c = () => vaultCopy[props.language];
  const manage = () => !props.workspace && !props.entry;
  const [status, setStatus] = createSignal<{ exists: boolean; remembered: boolean }>();
  const [text, setText] = createSignal<string>();
  const [saved, setSaved] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal(false);
  const [forgot, setForgot] = createSignal(false);
  const [remember, setRemember] = createSignal(false);
  const [recovery, setRecovery] = createSignal('');
  const [pairing, setPairing] = createSignal('');
  const [ack, setAck] = createSignal(false);
  const [discard, setDiscard] = createSignal(false);
  let generation = 0;
  let panel: HTMLDivElement | undefined;
  const refresh = async () => setStatus(await vault.status());
  const invalidate = () => {
    generation++;
    panel?.querySelectorAll('form').forEach((form) => form.reset());
    setText(undefined);
    setSaved('');
    setRecovery('');
    setPairing('');
    setAck(false);
    setDiscard(false);
    setRemember(false);
    setBusy(false);
  };
  const externalLock = () => {
    invalidate();
    void refresh().catch(() => setFailure(true));
  };
  const vault = new LocalVault(
    untrack(() => props.account),
    externalLock,
  );
  const lock = () => {
    vault.lock();
    externalLock();
  };
  const hide = () => {
    vault.lock(false);
    invalidate();
  };
  const sessionEnd = () => {
    vault.lock(false);
    externalLock();
  };
  onMount(() => {
    window.addEventListener('pagehide', hide);
    window.addEventListener('calirestore-session-end', sessionEnd);
    void refresh().catch(() => setFailure(true));
  });
  onCleanup(() => {
    generation++;
    window.removeEventListener('pagehide', hide);
    window.removeEventListener('calirestore-session-end', sessionEnd);
    vault.close();
  });
  const loadText = (value: string) => {
    setSaved(value);
    setText(value);
    setRecovery('');
    setPairing('');
    setAck(false);
  };
  const run = async <T,>(task: () => Promise<T>, done?: (value: T) => void) => {
    if (busy()) return;
    const current = generation;
    setBusy(true);
    setFailure(false);
    setForgot(false);
    try {
      const result = await task();
      if (current !== generation) return;
      done?.(result);
      await refresh();
    } catch {
      if (current === generation) setFailure(true);
    } finally {
      if (current === generation) setBusy(false);
    }
  };
  const formAction =
    <T,>(task: (event: SubmitEvent) => Promise<T>, done?: (value: T) => void) =>
    (event: SubmitEvent) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      void run(() => task(event), done).finally(() => form.reset());
    };
  const secret = (event: SubmitEvent) =>
    String(new FormData(event.currentTarget as HTMLFormElement).get('key') ?? '');
  const keyField = (label: string) => (
    <label>
      {label}
      <input name="key" type="password" autocomplete="off" required maxLength={64} />
    </label>
  );
  const fileField = () => (
    <label>
      {c().file}
      <input name="file" type="file" accept=".json,application/json" required />
    </label>
  );
  const generate = () => {
    setAck(false);
    setRecovery(newCode());
  };
  return (
    <section
      class="account-section"
      classList={{ 'project-vault-open': !!props.workspace && text() !== undefined }}
      aria-label={c().heading}
    >
      <div>
        <h2>{c().heading}</h2>
        <p>{props.unlockOnly ?? (props.workspace ? c().projectHelp : c().help)}</p>
      </div>
      <div
        class="account-panel vault-panel"
        ref={(element) => {
          panel = element;
        }}
      >
        <p role="status">
          {busy()
            ? c().working
            : status()
              ? text() !== undefined
                ? c().unlocked
                : status()?.exists
                  ? c().locked
                  : c().empty
              : ''}
        </p>
        <Show when={status() && !status()?.exists && props.setupLink}>
          {(link) => (
            <a class="vault-setup-link" href={link().href}>
              {link().text}
            </a>
          )}
        </Show>
        <Show when={failure()}>
          <p role="alert">{c().failed}</p>
        </Show>
        <Show when={forgot()}>
          <p role="status">{c().forgetDone}</p>
        </Show>
        <Show when={!props.unlockOnly && !props.entry && status() && !status()?.exists}>
          <label class="confirmation">
            <input
              type="checkbox"
              checked={remember()}
              disabled={busy()}
              onChange={(e) => setRemember(e.currentTarget.checked)}
            />
            {c().remember}
          </label>
          <Show
            when={recovery()}
            fallback={
              <button disabled={busy()} onClick={generate}>
                {c().create}
              </button>
            }
          >
            <label>
              {c().key}
              <input readOnly value={recovery()} aria-describedby="vault-key-help" />
            </label>
            <p id="vault-key-help">{c().keyHelp}</p>
            <label class="confirmation">
              <input
                type="checkbox"
                checked={ack()}
                disabled={busy()}
                onChange={(e) => setAck(e.currentTarget.checked)}
              />
              {c().savedKey}
            </label>
            <Show when={!pairing()}>
              <button
                disabled={!ack() || busy()}
                onClick={() =>
                  void run(
                    () => vault.create(recovery(), remember()),
                    () => loadText(''),
                  )
                }
              >
                {c().create}
              </button>
            </Show>
          </Show>
          <details>
            <summary>{c().restore}</summary>
            <form
              onSubmit={formAction(async (e) => {
                const code = secret(e);
                const optedIn = untrack(remember);
                const current = generation;
                const file = await readFile(e);
                if (current !== generation) throw new Error('Vault locked');
                return vault.restore(file, code, optedIn);
              }, loadText)}
            >
              {keyField(c().key)}
              {fileField()}
              <button disabled={busy()}>{c().restore}</button>
            </form>
          </details>
          <details>
            <summary>{c().request}</summary>
            <Show
              when={pairing()}
              fallback={
                <button
                  class="secondary"
                  disabled={busy()}
                  onClick={() => {
                    setPairing(vault.requestTransfer());
                    generate();
                  }}
                >
                  {c().request}
                </button>
              }
            >
              <label>
                {c().pairing}
                <input readOnly value={pairing()} aria-describedby="vault-pairing-help" />
              </label>
              <p id="vault-pairing-help">{c().pairingHelp}</p>
              <form
                onSubmit={formAction(async (e) => {
                  if (!untrack(ack)) throw new Error('Recovery key not saved');
                  const code = untrack(recovery);
                  const optedIn = untrack(remember);
                  const current = generation;
                  const file = await readFile(e);
                  if (current !== generation) throw new Error('Vault locked');
                  return vault.acceptTransfer(file, code, optedIn);
                }, loadText)}
              >
                {fileField()}
                <button disabled={busy() || !ack()}>{c().accept}</button>
              </form>
            </Show>
          </details>
        </Show>
        <Show when={status()?.exists && text() === undefined}>
          <Show when={status()?.remembered}>
            <button
              data-control-id={vaultEntryControls.remembered.id}
              disabled={busy()}
              onClick={() => void run(() => vault.unlock(), loadText)}
            >
              {c().remembered}
            </button>
          </Show>
          <form onSubmit={formAction((e) => vault.unlock(secret(e)), loadText)}>
            {keyField(c().key)}
            <button data-control-id={vaultEntryControls.recovery.id} disabled={busy()}>
              {c().unlock}
            </button>
          </form>
        </Show>
        <Show when={text() !== undefined && (props.workspace || props.entry)}>
          <button class="secondary" data-control-id={vaultEntryControls.lock.id} onClick={lock}>
            {c().lock}
          </button>
        </Show>
        <Show when={text() !== undefined && manage()}>
          <label>
            {c().text}
            <textarea
              value={text()}
              maxLength={65536}
              disabled={busy()}
              onInput={(e) => setText(e.currentTarget.value)}
            />
          </label>
          <p role="status">{text() === saved() ? c().saved : c().unsaved}</p>
          <button
            disabled={busy() || text() === saved()}
            onClick={() => {
              const value = text() ?? '';
              void run(
                () => vault.save(value),
                () => setSaved(value),
              );
            }}
          >
            {c().save}
          </button>
          <button
            class="secondary"
            data-control-id={vaultEntryControls.lock.id}
            disabled={busy()}
            onClick={lock}
          >
            {c().lock}
          </button>
          <label class="confirmation">
            <input
              type="checkbox"
              checked={!!status()?.remembered}
              disabled={busy()}
              onChange={(e) => {
                const value = e.currentTarget.checked;
                e.currentTarget.checked = !!status()?.remembered;
                void run(() => vault.trust(value));
              }}
            />
            {c().remember}
          </label>
          <button
            class="secondary"
            disabled={busy()}
            onClick={() =>
              void run(
                async () => vault.backup(),
                (file) => download(file, 'calirestore-recovery.json'),
              )
            }
          >
            {c().backup}
          </button>
        </Show>
        <Show when={text() !== undefined && (manage() || props.entry === 'approve')}>
          <details>
            <summary>{c().approve}</summary>
            <form
              onSubmit={formAction(
                (e) => vault.approveTransfer(secret(e)),
                (file) => download(file, 'calirestore-device-approval.json'),
              )}
            >
              {keyField(c().pairing)}
              <button data-control-id={vaultEntryControls.approve.id} disabled={busy()}>
                {c().approve}
              </button>
            </form>
          </details>
        </Show>
        <Show when={status()?.exists && manage()}>
          <details>
            <summary>{c().forget}</summary>
            <label class="confirmation">
              <input
                type="checkbox"
                checked={discard()}
                disabled={busy()}
                onChange={(e) => setDiscard(e.currentTarget.checked)}
              />
              {c().discard}
            </label>
            <button
              class="secondary"
              disabled={busy() || !discard()}
              onClick={() =>
                void run(
                  () => vault.forget(discard()),
                  () => {
                    invalidate();
                    setForgot(true);
                  },
                )
              }
            >
              {c().forget}
            </button>
          </details>
        </Show>
      </div>
      <Show when={text() !== undefined && props.workspace}>
        {(workspace) => workspace()(vault)}
      </Show>
    </section>
  );
}
