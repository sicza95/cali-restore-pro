import { createSignal, onCleanup, onMount } from 'solid-js';
import { editorSync } from '../../../platform/projects/editor-sync';
import type { LocalVault } from '../../../platform/vault/vault';

export function useEditorSync(vault: LocalVault, csrf: () => string) {
  const sync = editorSync(vault);
  const [state, setState] = createSignal<Awaited<ReturnType<typeof sync.status>>>();
  const [errors, setErrors] = createSignal<string[]>([]);
  const [unavailable, setUnavailable] = createSignal(false);
  let running: Promise<void> | undefined;
  let disposed = false;
  function refresh() {
    return (running ??= (async () => {
      try {
        const errors = await sync.stagePending();
        const state = await sync.status();
        if (!disposed) {
          setState(state);
          setErrors(errors);
          setUnavailable(false);
        }
      } catch {
        if (!disposed) setUnavailable(true);
      } finally {
        running = undefined;
      }
    })());
  }
  onMount(() => {
    const stop = sync.start(
      async () => {
        const token = csrf();
        if (!token) throw new Error('Session token unavailable');
        return token;
      },
      () => void refresh(),
    );
    const timer = window.setInterval(() => void refresh(), 1000);
    void refresh();
    onCleanup(() => {
      disposed = true;
      clearInterval(timer);
      stop();
    });
  });
  return { sync, refresh, state, errors, unavailable };
}
