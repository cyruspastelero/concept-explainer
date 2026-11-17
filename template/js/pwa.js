// The installable app: only when a page is served by `library serve` on
// http://127.0.0.1 (references/launcher.md, "Page contract"). From file://
// nothing here runs: no manifest link, no worker, no pairing, no token.
const DEVICE_KEY = 'concept-explainer:device';
const PAIR_HASH = /^#pair=([0-9a-f]{16}\.[0-9a-f]{64})$/;
const DEVICE_TOKEN = /^[0-9a-f]{64}$/;
const HEALTH_TIMEOUT_MS = 2500;
const OFFLINE_TEXT = 'Reading offline. Start Concept Explainer to save settings or import.';
const PWA = { offline: false };

/** True only on the app's own origin. */
function isServedOrigin() {
  return window.location.protocol === 'http:' && window.location.hostname === '127.0.0.1';
}

// ---------- Device token (localStorage, in try/catch) ----------
function deviceToken() {
  try {
    const token = window.localStorage.getItem(DEVICE_KEY);
    return token && DEVICE_TOKEN.test(token) ? token : null;
  } catch (error) {
    return null;
  }
}

function storeDeviceToken(token) {
  try {
    window.localStorage.setItem(DEVICE_KEY, token);
    return true;
  } catch (error) {
    return false;
  }
}

function forgetDeviceToken() {
  try {
    window.localStorage.removeItem(DEVICE_KEY);
  } catch (error) {
    // Nothing stored, nothing to forget.
  }
}

// ---------- Manifest and worker ----------
// The link and the worker exist only in the live page: Save as page leaves
// out link[rel="manifest"], and bundles carry data only.
function installAppShell() {
  if (!isServedOrigin()) return false;
  if (!document.head.querySelector('link[rel="manifest"]')) {
    document.head.append(h('link', { rel: 'manifest', href: '/manifest.webmanifest' }));
  }
  if (window.navigator.serviceWorker) {
    window.navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // The page works the same without the worker; only offline reading is lost.
    });
  }
  return true;
}

// ---------- Pairing ----------
// The launcher lands on index.html#pair=<code>. Take the code and clear the
// hash before the router or anything else can read it.
function takePairCode() {
  if (!isServedOrigin()) return null;
  const match = window.location.hash.match(PAIR_HASH);
  if (!match) return null;
  try {
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
  } catch (error) {
    window.location.hash = '';
  }
  return match[1];
}

/** POST the code once. Resolves to true when this browser is now paired. */
function pairDevice(code) {
  return fetch('/api/pair', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-concept-explainer-pair': '1' },
    body: JSON.stringify({ code }),
  }).then((response) => (response.ok ? response.json() : null))
    .then((body) => Boolean(body && typeof body.token === 'string' && DEVICE_TOKEN.test(body.token) && storeDeviceToken(body.token)))
    .catch(() => false);
}

/**
 * Boot entry points call this first: true means it took over and will call
 * start again once pairing is settled (synchronously when there is nothing
 * to pair, so file:// pages boot exactly as before).
 */
function deferBoot(start) {
  if (PWA.booting) return false;
  PWA.booting = true;
  startPage(start);
  return true;
}

/**
 * Run start() once any pairing hand-off is done. A wrong or used code leaves
 * the page unpaired; it still starts.
 */
function startPage(start) {
  installAppShell();
  const code = takePairCode();
  if (!code) {
    watchServer();
    start();
    return;
  }
  pairDevice(code).then(() => { watchServer(); start(); });
}

// ---------- Offline ----------
// The worker never caches /api/*, so a failed health check means the server
// is stopped: say so once, and switch off everything that writes.
function watchServer() {
  if (!isServedOrigin()) return;
  const controller = 'AbortController' in window ? new AbortController() : null;
  const timer = controller ? window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS) : null;
  fetch('/api/health', { cache: 'no-store', signal: controller ? controller.signal : undefined })
    .then((response) => { if (!response.ok) throw new Error(`health ${response.status}`); })
    .catch(() => markOffline())
    .finally(() => { if (timer) window.clearTimeout(timer); });
}

function markOffline() {
  PWA.offline = true;
  document.documentElement.dataset.offline = 'true';
  disableServerControls(document);
  if (document.getElementById('offline-banner')) return;
  const banner = h('p', { class: 'offline-banner', id: 'offline-banner', role: 'status' }, OFFLINE_TEXT);
  const main = document.getElementById('main');
  if (main) main.prepend(banner); else document.body.prepend(banner);
}

// Controls that need the server carry data-needs-server.
function disableServerControls(root) {
  if (!PWA.offline) return;
  root.querySelectorAll('[data-needs-server]').forEach((el) => {
    el.disabled = true;
    el.setAttribute('aria-disabled', 'true');
  });
}

/** Mark a control as needing the server; disabled at once while offline. */
function needsServer(el) {
  el.setAttribute('data-needs-server', '');
  if (PWA.offline) {
    el.disabled = true;
    el.setAttribute('aria-disabled', 'true');
  }
  return el;
}

// ---------- Settings: this browser ----------
function pairedRow() {
  if (!isServedOrigin() || !deviceToken()) return null;
  const status = h('p', { class: 'settings-status', role: 'status', 'aria-live': 'polite' });
  const forget = h('button', { class: 'btn', type: 'button' }, 'Forget');
  const row = h('div', { class: 'setting-row is-wide share-row' },
    h('span', { class: 'setting-label' }, 'This browser is paired'),
    h('p', { class: 'setting-hint' }, 'It can save settings and import while Concept Explainer runs. Forget removes the key from this browser only.'),
    h('div', { class: 'btn-row' }, forget), status);
  forget.addEventListener('click', () => {
    forgetDeviceToken();
    status.textContent = 'Forgotten. Open the app again to pair this browser.';
    forget.disabled = true;
  });
  return row;
}
