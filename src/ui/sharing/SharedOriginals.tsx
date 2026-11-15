import { createSignal, For, onCleanup, Show } from 'solid-js';
import { openSharedOriginal } from '../../../platform/projects/shared-originals';
import type { SharedOriginal } from '../../../platform/projects/shared-originals';
import type { Language } from '../types';
import { invitationCopy } from './copy';
import { pinCopy, saveOriginal } from './OfflineOriginals';
import type { useOfflineOriginals } from './OfflineOriginals';

export function SharedOriginals(props: {
  files: SharedOriginal[];
  invitation: string;
  project: string;
  sender: string;
  locked: AbortSignal;
  offline: ReturnType<typeof useOfflineOriginals>;
  language: Language;
}) {
  const c = () => invitationCopy[props.language];
  const p = () => pinCopy[props.language];
  const [busy, setBusy] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const [pinning, setPinning] = createSignal<AbortController>();
  const [progress, setProgress] = createSignal(0);
  const lifetime = new AbortController();
  onCleanup(() => lifetime.abort());

  async function download(file: SharedOriginal) {
    if (busy()) return;
    setBusy(true);
    setFailed(false);
    const signal = AbortSignal.any([props.locked, lifetime.signal]);
    try {
      const { name, blob } = await openSharedOriginal(
        props.invitation,
        props.project,
        props.sender,
        file,
        signal,
      );
      signal.throwIfAborted();
      saveOriginal({ name, blob });
    } catch {
      if (!signal.aborted) setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function pin(file: SharedOriginal) {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, props.locked, lifetime.signal]);
    setProgress(0);
    setFailed(false);
    setPinning(controller);
    try {
      await props.offline.pins.pin(
        { invitation: props.invitation, project: props.project, sender: props.sender },
        file,
        { signal, progress: (done, total) => setProgress(done / total) },
      );
      await props.offline.refresh();
    } catch {
      if (!signal.aborted) setFailed(true);
    } finally {
      setPinning(undefined);
    }
  }

  return (
    <section aria-label={c().originals}>
      <h3>{c().originals}</h3>
      <Show when={busy()}>
        <p role="status">{c().downloadingOriginal}</p>
      </Show>
      <Show when={pinning()}>
        <progress aria-label={p().progress} max={1} value={progress()} />
        <button
          data-control-id="sharing.pin.cancel"
          class="secondary"
          onClick={() => pinning()?.abort()}
        >
          {p().cancel}
        </button>
      </Show>
      <Show when={failed()}>
        <p role="alert">{c().error}</p>
      </Show>
      <ul class="session-list">
        <For each={props.files}>
          {(file) => (
            <li>
              <span>{file.name}</span>
              <div class="original-actions">
                <button
                  data-control-id="sharing.original.download"
                  class="secondary"
                  disabled={busy() || !!pinning() || !props.offline.online()}
                  onClick={() => void download(file)}
                >
                  {c().downloadOriginal}
                </button>
                <Show
                  when={props.offline
                    .rows()
                    .some((row) => row.invitation === props.invitation && row.id === file.id)}
                  fallback={
                    <button
                      data-control-id="sharing.pin.start"
                      class="secondary"
                      disabled={
                        busy() || !!pinning() || !props.offline.online() || props.offline.checking()
                      }
                      onClick={() => void pin(file)}
                    >
                      {p().pin}
                    </button>
                  }
                >
                  <span>{p().ready}</span>
                </Show>
              </div>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}
