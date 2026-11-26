import { projectAssetIds } from '../../platform/projects/browser/assets';
import { createSignal, onCleanup, onMount } from 'solid-js';
import { cloudProjects } from '../../platform/projects/cloud-projects';
import { editorSync } from '../../platform/projects/editor-sync';
import { itemStatus as browserStatus } from '../../platform/projects/browser/status';
import type { SavedProject } from '../../platform/projects/types';
import type { LocalVault } from '../../platform/vault/vault';

export function useEditorSync(vault: LocalVault, csrf: () => string) {
  const sync = editorSync(vault);
  const cloud = cloudProjects(vault);
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
  /** The browser's storage state of a local project; children show the same document status. */
  function itemStatus(project: SavedProject) {
    return browserStatus({
      projectId: project.id,
      localRevision: project.revision,
      sync: state(),
      stagingErrors: errors(),
      unavailable: unavailable(),
    });
  }
  async function initialSync(project: SavedProject) {
    const token = csrf();
    if (!token) throw new Error('Session token unavailable');
    for (const id of projectAssetIds(project))
      await vault.files().upload({ project: project.id, id }, { csrf: token });
    const base = (await sync.status()).checkpoints.find((base) => base.project === project.id);
    if (!base) await sync.enable(project.id);
    else if (base.paused) await sync.setPaused(project.id, false);
    await sync.stagePending();
    await vault.revisions().retry(token);
    await refresh();
  }
  return { sync, cloud, refresh, initialSync, state, statusKey, itemStatus, unavailable };
}
