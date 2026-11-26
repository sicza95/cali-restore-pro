import { createEffect, createSignal, on, untrack } from 'solid-js';
import type { Accessor } from 'solid-js';
import type { BrowserItemKind } from '../../../platform/projects/browser-contracts';
import type { BrowserSort, BrowserView } from './types';

type Preferences = { view: BrowserView; sort: BrowserSort; inspectorOpen: boolean };
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Optional UI-only hook. Components remain controlled; this never reads project data. */
export function useBrowserPreferences(
  level: Accessor<BrowserItemKind>,
  options?: { storage?: PreferenceStorage; portrait?: boolean },
) {
  let storage = options?.storage;
  try {
    storage ??= globalThis.localStorage;
  } catch {
    /* Session-only UI when storage is denied. */
  }
  const defaults = (): Preferences => ({
    view: 'grid',
    sort: { field: 'name', direction: 'asc' },
    inspectorOpen: !(
      options?.portrait ??
      globalThis.matchMedia?.('(orientation: portrait)').matches ??
      false
    ),
  });
  const read = (kind: BrowserItemKind): Preferences => {
    const fallback = defaults();
    try {
      const value = JSON.parse(storage?.getItem(`calirestore.browser.${kind}`) ?? 'null');
      if (
        !value ||
        !['grid', 'list'].includes(value.view) ||
        !['name', 'created', 'modified'].includes(value.sort?.field) ||
        !['asc', 'desc'].includes(value.sort?.direction) ||
        typeof value.inspectorOpen !== 'boolean'
      )
        return fallback;
      return {
        view: value.view,
        sort: { field: value.sort.field, direction: value.sort.direction },
        inspectorOpen: value.inspectorOpen,
      };
    } catch {
      return fallback;
    }
  };
  const [preferences, setPreferences] = createSignal(untrack(() => read(level())));
  createEffect(on(level, (kind) => setPreferences(read(kind)), { defer: true }));
  const update = (change: Partial<Preferences>) => {
    const next = { ...preferences(), ...change };
    setPreferences(next);
    try {
      storage?.setItem(`calirestore.browser.${level()}`, JSON.stringify(next));
    } catch {
      /* Keep the current session usable. */
    }
  };
  return {
    view: () => preferences().view,
    sort: () => preferences().sort,
    inspectorOpen: () => preferences().inspectorOpen,
    setView: (view: BrowserView) => update({ view }),
    setSort: (sort: BrowserSort) => update({ sort }),
    setInspectorOpen: (inspectorOpen: boolean) => update({ inspectorOpen }),
  };
}
