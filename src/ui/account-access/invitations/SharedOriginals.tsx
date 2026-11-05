import { createSignal, For, onCleanup, Show } from 'solid-js';
import { openSharedOriginal } from '../../../platform/projects/shared-originals';
import type { SharedOriginal } from '../../../platform/projects/shared-originals';
import type { Language } from '../types';
import { invitationCopy } from './copy';

export function SharedOriginals(props: {
  files: SharedOriginal[];
  invitation: string;
  project: string;
  sender: string;
  locked: AbortSignal;
  language: Language;
}) {
  const c = () => invitationCopy[props.language];
  const [busy, setBusy] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
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
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (!signal.aborted) setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={c().originals}>
      <h3>{c().originals}</h3>
      <Show when={busy()}>
        <p role="status">{c().downloadingOriginal}</p>
      </Show>
      <Show when={failed()}>
        <p role="alert">{c().error}</p>
      </Show>
      <ul class="session-list">
        <For each={props.files}>
          {(file) => (
            <li>
              <span>{file.name}</span>
              <button class="secondary" disabled={busy()} onClick={() => void download(file)}>
                {c().downloadOriginal}
              </button>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}
