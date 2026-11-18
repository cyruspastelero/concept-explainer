// The installable app's files: a fixed map from URL to a file in this
// package. Never built from the request path, so nothing else can be read.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const APP_ROUTES = Object.freeze({
  '/manifest.webmanifest': { file: join(ROOT, 'template', 'app', 'manifest.webmanifest'), type: 'application/manifest+json' },
  '/sw.js': { file: join(ROOT, 'template', 'app', 'sw.js'), type: 'text/javascript; charset=utf-8' },
  '/app/icon-192.png': { file: join(ROOT, 'assets', 'app', 'icon-192.png'), type: 'image/png' },
  '/app/icon-512.png': { file: join(ROOT, 'assets', 'app', 'icon-512.png'), type: 'image/png' },
  '/app/maskable-512.png': { file: join(ROOT, 'assets', 'app', 'maskable-512.png'), type: 'image/png' },
  '/app/icon.svg': { file: join(ROOT, 'assets', 'app', 'icon.svg'), type: 'image/svg+xml' },
});

// A service worker's own policy comes from its response: it may only fetch
// this server. Other app files need none beyond default-src 'none'.
const SW_CSP = "default-src 'none'; connect-src 'self'";
const FILE_CSP = "default-src 'none'; frame-ancestors 'none'";

// With pwa off, /sw.js is this instead: it clears the app's caches and
// unregisters itself, so a worker installed earlier (ours, or one planted on
// this origin) is removed at the browser's next update check against us.
export const UNREGISTER_SW = `// Concept Explainer: the installable app is off for this library.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
    .then(() => self.registration.unregister())
    .then(() => self.clients.matchAll({ type: 'window' }))
    .then((clients) => clients.forEach((client) => client.navigate(client.url))));
});
`;

/**
 * The app file for an exact path, or null. With `pwa: false` there is no
 * manifest (the browser offers no install) and /sw.js unregisters itself.
 */
export function appRoute(pathname, { pwa = true } = {}) {
  const route = Object.prototype.hasOwnProperty.call(APP_ROUTES, pathname) ? APP_ROUTES[pathname] : null;
  if (!route) return null;
  if (!pwa && pathname === '/manifest.webmanifest') return null;
  if (!pwa && pathname === '/sw.js') return { ...route, body: Buffer.from(UNREGISTER_SW), csp: SW_CSP };
  return { ...route, body: readFileSync(route.file), csp: pathname === '/sw.js' ? SW_CSP : FILE_CSP };
}
