import { createContext, untrack, useContext } from 'solid-js';
import type { JSX } from 'solid-js';
import { createAccountAccess } from '../account-access/createAccountAccess';
import { createRouter } from '../router/createRouter';

/** Account session, language, requests and the router, shared by every screen. */
export function createApp() {
  const router = createRouter();
  return { ...createAccountAccess(router), router };
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
