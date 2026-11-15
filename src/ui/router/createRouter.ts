import { createSignal, onCleanup } from 'solid-js';
import { parseRoute, routeKey } from './routes';
import type { AppRoute } from './types';

/** Reads and strips an email link token (`#token=…`) so it never stays in history. */
function takeLinkToken() {
  const token = new URLSearchParams(location.hash.slice(1)).get('token') ?? '';
  if (token) {
    document.getElementById('app')?.setAttribute('data-auth-link', '');
    history.replaceState(null, '', location.pathname + location.search);
  }
  return token;
}

/**
 * The app's one view of the URL. `entry` is the route the page loaded with; `route()` follows
 * in-app navigation and back/forward. Account destinations are still full page loads.
 */
export function createRouter() {
  const entry = parseRoute(location.pathname);
  const linkToken = takeLinkToken();
  const [route, setRoute] = createSignal<AppRoute>(entry, {
    equals: (previous, next) => routeKey(previous) === routeKey(next),
  });
  const sync = () => setRoute(parseRoute(location.pathname));
  const navigate = (href: string) => {
    if (href === location.pathname) return;
    history.pushState(null, '', href);
    sync();
  };
  window.addEventListener('popstate', sync);
  onCleanup(() => window.removeEventListener('popstate', sync));
  return { entry, linkToken, route, navigate };
}

export type Router = ReturnType<typeof createRouter>;
