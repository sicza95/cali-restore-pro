import { createContext, createSignal, untrack, useContext } from 'solid-js';
import type { JSX } from 'solid-js';
import { createAccountAccess } from '../account-access/createAccountAccess';
import { createRouter } from '../router/createRouter';

/**
 * Display names of records the URL points at (projects, surfaces), keyed by ID. They are local
 * vault data, so the screen that loads them publishes them for the shell's breadcrumbs and title.
 */
function createNames() {
  const [names, setNames] = createSignal<Readonly<Record<string, string>>>({});
  const publish = (entries: Record<string, string>) => {
    const current = names();
    if (Object.entries(entries).some(([id, name]) => current[id] !== name))
      setNames({ ...current, ...entries });
  };
  return { names, publishNames: publish };
}

/** Account session, language, requests, the router and record names, shared by every screen. */
export function createApp() {
  const router = createRouter();
  return { ...createAccountAccess(router), ...createNames(), router };
}

export type App = ReturnType<typeof createApp>;

const AppContext = createContext<App>();

/** Creates the app once for its subtree; `value` lets a host such as a story supply its own. */
export function AppProvider(props: { value?: App; children: JSX.Element }) {
  const app = untrack(() => props.value) ?? createApp();
  return <AppContext.Provider value={app}>{props.children}</AppContext.Provider>;
}

/** The app context. Screens call this instead of taking a `model` prop. */
export function useApp(): App {
  const app = useContext(AppContext);
  if (!app) throw new Error('useApp() needs an <AppProvider> above it.');
  return app;
}
