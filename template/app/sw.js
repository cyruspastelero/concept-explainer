// TODO(template agent): the real service worker (spec section 8.1). This
// placeholder only installs and activates so the serve routes can be tested;
// it caches nothing and handles no fetch, so pages behave as without it.
//
// Contract the real one must keep:
// - Cache GET, same-origin, status 200 only. Never cache /api/* (fetching
//   /api/pages for the page list is fine), never anything but GET.
// - Pages network first with a 3 s timeout, then the cache.
// - Install caches /index.html, /kit.html, /manifest.webmanifest, /app/* icons.
// - After each hub load, cache every page listed by GET /api/pages
//   (cap 200 pages / 100 MB) and drop pages no longer listed.
// - Cache name carries the pages' updatedAt; delete old caches on activate.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
