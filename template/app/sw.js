// The app's service worker (references/launcher.md, "Service worker rules").
// It lets the library be read offline after the server stops:
// - Only GET, same origin, status 200 is cached, and never /api/*. Fetching
//   /api/pages for the page list is fine; its answer is never stored.
// - Pages and files go network first with a 3 s timeout, then the cache.
// - Install caches the hub, the kit, the manifest and the icons.
// - After each hub load, every page in /api/pages is cached (at most 200
//   pages and 100 MB) and pages no longer listed are dropped.
// - The cache is named after the pages' updatedAt; activate deletes the rest.
// The page shows the offline banner and disables writes itself (pwa.js).
const CACHE_PREFIX = 'concept-explainer-';
const CORE = ['/index.html', '/kit.html', '/manifest.webmanifest', '/app/icon-192.png', '/app/icon-512.png', '/app/maskable-512.png', '/app/icon.svg'];
const NETWORK_TIMEOUT_MS = 3000;
const MAX_PAGES = 200;
const MAX_BYTES = 100 * 1024 * 1024;
const PAGE_PATH = /^\/explainers\/[a-z0-9]+(?:-[a-z0-9]+)*\/index\.html$/;
const HUB_PATHS = new Set(['/', '/index.html']);

const sameOrigin = (url) => url.origin === self.location.origin;
const isApi = (url) => url.pathname === '/api' || url.pathname.startsWith('/api/');

/** Whether a request and its answer may be kept. */
function cacheable(request, response) {
  const url = new URL(request.url);
  return request.method === 'GET' && sameOrigin(url) && !isApi(url)
    && Boolean(response) && response.status === 200 && response.type === 'basic';
}

function cacheNameFor(updatedAt) {
  const stamp = String(updatedAt || 'none').replace(/[^0-9A-Za-z.:-]/g, '').slice(0, 40) || 'none';
  return `${CACHE_PREFIX}${stamp}`;
}

// The newest of our caches (there is one after activate).
async function currentCacheName() {
  const names = (await caches.keys()).filter((name) => name.startsWith(CACHE_PREFIX));
  return names.length ? names[names.length - 1] : cacheNameFor(null);
}

async function fetchPages() {
  const response = await fetch(new URL('/api/pages', self.location.origin).href, { cache: 'no-store' });
  if (!response.ok) throw new Error(`pages ${response.status}`);
  const body = await response.json();
  const pages = (Array.isArray(body && body.pages) ? body.pages : [])
    .map((page) => `/${String(page).replace(/^\/+/, '')}`)
    .filter((path) => PAGE_PATH.test(path))
    .slice(0, MAX_PAGES);
  return { updatedAt: body && body.updatedAt, pages };
}

// Put one fetched answer in the cache if it may be kept; returns its size.
async function store(cache, path) {
  const request = new Request(new URL(path, self.location.origin).href, { cache: 'no-cache' });
  const response = await fetch(request);
  if (!cacheable(request, response)) return 0;
  const size = Number(response.headers.get('content-length')) || (await response.clone().blob()).size;
  await cache.put(path, response);
  return size;
}

async function storeAll(cache, paths, budget = MAX_BYTES) {
  let used = 0;
  for (const path of paths) {
    if (used >= budget) break;
    try {
      used += await store(cache, path);
    } catch (error) {
      // One page that will not load does not stop the others.
    }
  }
  return used;
}

async function deleteOtherCaches(keep) {
  const names = await caches.keys();
  await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== keep).map((name) => caches.delete(name)));
}

/** Install: the core files, in a cache named after the current pages. */
async function installCore() {
  let name = cacheNameFor(null);
  try {
    name = cacheNameFor((await fetchPages()).updatedAt);
  } catch (error) {
    // No page list yet: the hub load after activation fills it in.
  }
  await storeAll(await caches.open(name), CORE);
}

/** After a hub load: cache the listed pages, drop the rest, and move to a new cache when the list changed. */
async function syncPages() {
  const { updatedAt, pages } = await fetchPages();
  const name = cacheNameFor(updatedAt);
  const cache = await caches.open(name);
  const listed = new Set(pages);
  const kept = await cache.keys();
  await Promise.all(kept.map((request) => {
    const path = new URL(request.url).pathname;
    return PAGE_PATH.test(path) && !listed.has(path) ? cache.delete(request) : null;
  }));
  const coreUsed = await storeAll(cache, CORE);
  await storeAll(cache, pages, MAX_BYTES - coreUsed);
  await deleteOtherCaches(name);
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); }),
  ]);
}

/** Network first (3 s), then the cache. */
async function networkFirst(request) {
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    if (cacheable(request, response)) {
      const copy = response.clone();
      currentCacheName().then((name) => caches.open(name)).then((cache) => cache.put(request, copy)).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(installCore().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(currentCacheName().then(deleteOtherCaches).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Writes, other origins and the API go straight to the network.
  if (request.method !== 'GET' || !sameOrigin(url) || isApi(url)) return;
  event.respondWith(networkFirst(request));
  if (request.mode === 'navigate' && HUB_PATHS.has(url.pathname)) event.waitUntil(syncPages().catch(() => {}));
});
