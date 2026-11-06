/* global self, caches, fetch, URL */

function start(version, shell, files) {
  const prefix = 'calirestore-offline-shell-';
  const cacheName = prefix + version;
  const assets = new Set(files.filter((file) => file.startsWith('/assets/')));

  self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll([shell, ...assets])));
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      (async () => {
        for (const key of await caches.keys()) {
          if (key.startsWith(prefix) && key !== cacheName) await caches.delete(key);
        }
        await self.clients.claim();
      })(),
    );
  });

  self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;
    const offlinePage = request.mode === 'navigate' && url.pathname === '/offline-originals';
    if (!offlinePage && !assets.has(url.pathname)) return;
    event.respondWith(
      (async () => {
        const cache = await caches.open(cacheName);
        return (await cache.match(offlinePage ? shell : url.pathname)) ?? fetch(request);
      })(),
    );
  });
}

// The production build supplies the version and static asset list.
void start;
