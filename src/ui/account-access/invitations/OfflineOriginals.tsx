import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import type { LocalVault } from '../../../platform/vault/vault';
import type { Language } from '../types';

export const pinCopy = {
  en: {
    heading: 'Offline originals',
    pin: 'Make available offline',
    ready: 'Available offline',
    open: 'Save a copy',
    remove: 'Remove offline copy',
    cancel: 'Cancel pin',
    progress: 'Saving encrypted original',
    checking: 'Checking access to offline originals…',
    revoked: 'Removed offline copies you can no longer access.',
    failed: 'Could not complete the offline originals action. Try again.',
  },
  hu: {
    heading: 'Offline eredeti fájlok',
    pin: 'Elérhetővé tétel offline',
    ready: 'Offline elérhető',
    open: 'Másolat mentése',
    remove: 'Offline másolat eltávolítása',
    cancel: 'Mentés megszakítása',
    progress: 'Titkosított eredeti mentése',
    checking: 'Offline eredetik hozzáférésének ellenőrzése…',
    revoked: 'A már nem hozzáférhető offline másolatokat eltávolítottuk.',
    failed: 'A művelet nem fejeződött be. Próbálja újra.',
  },
};

export function saveOriginal({ name, blob }: { name: string; blob: Blob }) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type Pins = ReturnType<LocalVault['originalPins']>;
type Rows = Awaited<ReturnType<Pins['list']>>;

export function useOfflineOriginals(pins: Pins) {
  const [rows, setRows] = createSignal<Rows>([]);
  const [online, setOnline] = createSignal(navigator.onLine);
  const [checking, setChecking] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const [revoked, setRevoked] = createSignal(false);
  const lifetime = new AbortController();
  const refresh = async () => setRows(await pins.list());
  let pending = false;

  async function reconnect() {
    setOnline(navigator.onLine);
    if (checking()) {
      pending = true;
      return;
    }
    setChecking(true);
    setFailed(false);
    try {
      do {
        pending = false;
        if (online()) {
          const { incomplete, removed } = await pins.reconcile(lifetime.signal);
          setFailed(incomplete);
          if (removed) setRevoked(true);
        }
        await refresh();
      } while (pending && !lifetime.signal.aborted);
    } catch {
      if (!lifetime.signal.aborted) setFailed(true);
    } finally {
      setChecking(false);
    }
  }

  onMount(() => {
    window.addEventListener('online', reconnect);
    window.addEventListener('offline', reconnect);
    void reconnect();
  });
  onCleanup(() => {
    lifetime.abort();
    window.removeEventListener('online', reconnect);
    window.removeEventListener('offline', reconnect);
  });
  return { pins, rows, online, checking, failed, revoked, refresh, signal: lifetime.signal };
}

export function OfflineOriginals(props: {
  model: ReturnType<typeof useOfflineOriginals>;
  language: Language;
}) {
  const c = () => pinCopy[props.language];
  const [busy, setBusy] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  async function run(row: Rows[number], remove: boolean) {
    const { pins, signal, refresh } = props.model;
    setBusy(true);
    setFailed(false);
    try {
      if (remove) await pins.unpin(row);
      else {
        const original = await pins.open(row, signal);
        signal.throwIfAborted();
        saveOriginal(original);
      }
    } catch {
      if (!signal.aborted) setFailed(true);
    } finally {
      await refresh().catch(() => setFailed(true));
      setBusy(false);
    }
  }

  return (
    <Show
      when={
        props.model.rows().length ||
        props.model.checking() ||
        props.model.failed() ||
        props.model.revoked() ||
        failed()
      }
    >
      <section aria-label={c().heading}>
        <h3>{c().heading}</h3>
        <Show when={props.model.checking()}>
          <p role="status">{c().checking}</p>
        </Show>
        <Show when={props.model.revoked()}>
          <p role="status">{c().revoked}</p>
        </Show>
        <Show when={props.model.failed() || failed()}>
          <p role="alert">{c().failed}</p>
        </Show>
        <ul class="session-list">
          <For each={props.model.rows()}>
            {(row) => (
              <li>
                <span>{row.name}</span>
                <div class="original-actions">
                  <button
                    class="secondary"
                    disabled={busy() || props.model.checking()}
                    onClick={() => void run(row, false)}
                  >
                    {c().open}
                  </button>
                  <button
                    class="secondary"
                    disabled={busy() || props.model.checking()}
                    onClick={() => void run(row, true)}
                  >
                    {c().remove}
                  </button>
                </div>
              </li>
            )}
          </For>
        </ul>
      </section>
    </Show>
  );
}
