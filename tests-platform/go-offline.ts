import type { BrowserContext, Page } from '@playwright/test';

// Playwright's `context.setOffline` only behaves like an offline browser in Chromium (#101, #51).
// WebKit's fails every Blob read; Firefox's fails worker scripts that the service worker has
// cached. So Chromium keeps it, and the other engines cut the network with a route and report
// `navigator.onLine` plus the online/offline events themselves, as a real offline browser does.
// Firefox aborts every request. WebKit aborts only `/api/` requests: its routes catch the cached
// worker scripts before the service worker can serve them. Requests matching `keep` (mocks that
// the test registered earlier) fall through to those mocks, as they do under Chromium's offline
// emulation.
const flag = '__calirestoreTestOffline';

export async function offlineSwitch(
  context: BrowserContext,
  browserName: string,
  keep: RegExp = /(?!)/,
) {
  if (browserName === 'chromium')
    return Object.assign((offline: boolean) => context.setOffline(offline), {
      sync: async () => {},
    });
  await context.addInitScript((key) => {
    if (sessionStorage.getItem(key) !== '1') return;
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  }, flag);
  const scope = browserName === 'webkit' ? '**/api/**' : '**';
  const cut = (route: import('@playwright/test').Route) =>
    keep.test(route.request().url()) ? route.fallback() : route.abort('internetdisconnected');
  let current = false;
  const sync = async (page: Page) => {
    if (!page.url().startsWith('http')) return;
    await page.evaluate(
      ([key, off]) => {
        if (off) sessionStorage.setItem(key, '1');
        else sessionStorage.removeItem(key);
        Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => !off });
        window.dispatchEvent(new Event(off ? 'offline' : 'online'));
      },
      [flag, current] as const,
    );
  };
  const set = async (offline: boolean) => {
    current = offline;
    if (offline) await context.route(scope, cut);
    else await context.unroute(scope, cut);
    await Promise.all(context.pages().map(sync));
  };
  return Object.assign(set, { sync });
}
