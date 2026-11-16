import { createContext, createMemo, createSignal, onCleanup, untrack, useContext } from 'solid-js';
import type { JSX } from 'solid-js';
import { createAccountAccess } from '../account-access/createAccountAccess';
import { createRouter } from '../router/createRouter';

/**
 * Display names of records the URL points at (projects, surfaces), keyed by ID, for the shell's
 * breadcrumbs and title. They are local vault data, so only a screen holding the unlocked vault
 * provides them, and they last only as long as that screen: when it unmounts (vault locked,
 * signed out, another account) the names leave the shell too.
 */
function createRecords() {
  type Source = () => Readonly<Record<string, string>>;
  const [sources, setSources] = createSignal<readonly Source[]>([]);
  const records = createMemo(() => Object.assign({}, ...sources().map((source) => source())));
  /** Call inside a component; the records go away when it is cleaned up. */
  const provide = (source: Source) => {
    setSources((list) => [...list, source]);
    onCleanup(() => setSources((list) => list.filter((entry) => entry !== source)));
  };
  return [records as () => Readonly<Record<string, string>>, provide] as const;
}

function createNames() {
  const [names, provideNames] = createRecords();
  /**
   * The name of the object a surface belongs to, keyed by surface ID. Objects have no page, so the
   * shell shows it as plain text in the trail. Same lifetime as `names`.
   */
  const [objectNames, provideObjectNames] = createRecords();
  return { names, provideNames, objectNames, provideObjectNames };
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
