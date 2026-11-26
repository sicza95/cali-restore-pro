import type { HostedProjectVisibility, ProjectVisibility } from '../../../platform/api';
import type { projectVisibility } from '../../../platform/projects/visibility';

export type VisibilityState = {
  value?: HostedProjectVisibility;
  busy: boolean;
  notice?: 'loading' | 'saving' | 'saved' | 'error' | 'conflict' | 'conflictReload';
};

/** One selected project's lifetime; dispose prevents stale responses reaching a new selection. */
export function visibilityState(
  api: ReturnType<typeof projectVisibility>,
  publish: (state: VisibilityState) => void,
) {
  let state: VisibilityState = { busy: false };
  let disposed = false;
  const set = (next: VisibilityState) => {
    state = next;
    if (!disposed) publish(next);
  };
  async function reload(conflict = false) {
    set({ ...state, busy: true, notice: 'loading' });
    try {
      const value = await api.read();
      set({ value, busy: false, notice: conflict ? 'conflict' : undefined });
    } catch {
      // Clear the old version: a failed conflict reload must never enable another stale write.
      set({ busy: false, notice: conflict ? 'conflictReload' : 'error' });
    }
  }
  return {
    reload: async () => {
      if (!state.busy && !disposed) await reload(state.notice === 'conflictReload');
    },
    async save(visibility: ProjectVisibility, name: string) {
      if (!state.value || state.busy || disposed) return;
      const previous = state.value;
      set({ value: { ...previous, visibility }, busy: true, notice: 'saving' });
      try {
        const value = await api.write({ visibility, version: previous.version, name: name.trim() });
        set({ value, busy: false, notice: 'saved' });
      } catch (error) {
        if (disposed) return;
        if (error instanceof Error && error.message === 'visibility_conflict') await reload(true);
        else set({ value: previous, busy: false, notice: 'error' });
      }
    },
    dispose: () => {
      disposed = true;
    },
  };
}
