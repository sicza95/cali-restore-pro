import { createSignal, onCleanup, onMount } from 'solid-js';
import { revisionKeyTransfer } from '../../../platform/projects/revision-key-transfer';
import { editorSync } from '../../../platform/projects/editor-sync';
import type { SavedProject } from '../../../platform/projects/types';
import type { LocalVault } from '../../../platform/vault/vault';

export function useEditorSync(vault: LocalVault, csrf: () => string) {
  const sync = editorSync(vault);
  const transfer = revisionKeyTransfer(vault, csrf);
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
  function statusKey(project: SavedProject) {
    const base = state()?.checkpoints.find((row) => row.project === project.id);
    if (!base) return 'disabled';
    const draft = state()?.drafts.find((row) => row.project === project.id);
    if (draft?.blocked) return 'conflict';
    if (errors().includes(project.id)) return 'staging';
    return draft || project.revision > base.localRevision ? 'pending' : 'saved';
  }
  return { sync, transfer, refresh, state, statusKey, unavailable };
}
