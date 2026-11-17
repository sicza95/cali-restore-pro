import { createSignal, onCleanup } from 'solid-js';
import { followLink, parseRoute, routeKey } from './routes';
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
 * in-app navigation and back/forward, including account and standalone offline pages.
 */
export function createRouter() {
  const entry = parseRoute(location.pathname);
  const [linkToken, setLinkToken] = createSignal(takeLinkToken());
  const [href, setHref] = createSignal(location.pathname + location.search + location.hash);
  const [route, setRoute] = createSignal<AppRoute>(entry, {
    equals: (previous, next) => routeKey(previous) === routeKey(next),
  });
  const sync = () => {
    document.getElementById('app')?.removeAttribute('data-auth-link');
    setLinkToken(takeLinkToken());
    setHref(location.pathname + location.search + location.hash);
    setRoute(parseRoute(location.pathname));
  };
  const navigate = (href: string) => {
    const url = new URL(href, location.href);
    if (url.origin !== location.origin) return;
    if (url.href === location.href) return;
    history.pushState(null, '', url.pathname + url.search + url.hash);
    sync();
    if (url.hash && !url.hash.startsWith('#token='))
      requestAnimationFrame(() => document.getElementById(url.hash.slice(1))?.scrollIntoView());
  };
  // Fragment navigation can emit popstate followed by hashchange. The first event has already
  // consumed and stripped the token; do not let its duplicate discard that page's token.
  const hashChange = () => {
    if (location.pathname + location.search + location.hash !== href()) sync();
  };
  // Delegate within the app so inline account, vault and recovery links share the route table.
  const click = (event: MouseEvent) => {
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (anchor instanceof HTMLAnchorElement && document.getElementById('app')?.contains(anchor))
      followLink(event, navigate, anchor);
  };
  document.addEventListener('click', click);
  window.addEventListener('popstate', sync);
  window.addEventListener('hashchange', hashChange);
  onCleanup(() => {
    document.removeEventListener('click', click);
    window.removeEventListener('popstate', sync);
    window.removeEventListener('hashchange', hashChange);
  });
  return { entry, linkToken, href, route, navigate };
}

export type Router = ReturnType<typeof createRouter>;
