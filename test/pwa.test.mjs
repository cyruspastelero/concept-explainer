import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// template/js/pwa.js in node:vm: the app shell only on http://127.0.0.1,
// the #pair= hand-off, the device token and the offline fallback.
const SOURCE = readFileSync(new URL('../template/js/pwa.js', import.meta.url), 'utf8');
const CODE = `${'a'.repeat(16)}.${'b'.repeat(64)}`;
const TOKEN = 'c'.repeat(64);

function page(href, { fetchFn, storage = new Map() } = {}) {
  const url = new URL(href);
  const head = [];
  const registered = [];
  const replaced = [];
  const location = {
    get protocol() { return url.protocol; }, get hostname() { return url.hostname; },
    get pathname() { return url.pathname; }, get search() { return url.search; }, get hash() { return url.hash; },
    set hash(v) { url.hash = v; },
  };
  const el = (tag, attrs = {}) => ({ tag, attrs, children: [], append(...c) { this.children.push(...c); }, prepend(...c) { this.children.unshift(...c); } });
  const document = {
    head: { querySelector: (sel) => head.find((n) => sel.includes('manifest') && n.attrs.rel === 'manifest') || null, append: (n) => head.push(n) },
    documentElement: { dataset: {} },
    getElementById: () => null,
    querySelectorAll: () => [],
    body: el('body'),
  };
  const window = {
    location,
    history: { state: null, replaceState: (_, __, next) => { replaced.push(next); url.hash = ''; } },
    navigator: { serviceWorker: { register: (path, opts) => { registered.push([path, opts]); return Promise.resolve(); } } },
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k),
    },
    setTimeout, clearTimeout,
  };
  const calls = [];
  const fetchStub = fetchFn || (async () => ({ ok: true, json: async () => ({}) }));
  const ctx = vm.createContext({
    window, document, console, Promise, JSON,
    fetch: (u, o) => { calls.push([u, o]); return fetchStub(u, o); },
    h: (tag, attrs, ...children) => ({ ...el(tag, attrs), children }),
  });
  vm.runInContext(`${SOURCE}\n;this.api = { startPage, deferBoot, deviceToken, forgetDeviceToken, isServedOrigin, PWA, needsServer };`, ctx);
  return { api: ctx.api, head, registered, replaced, calls, storage, url, document };
}

const settle = () => new Promise((r) => setTimeout(r, 20));

test('from file:// nothing happens: no manifest, no worker, no fetch, the hash is left alone', async () => {
  const p = page(`file:///Users/x/explainers/a/index.html#pair=${CODE}`);
  let started = 0;
  p.api.startPage(() => { started += 1; });
  await settle();
  assert.equal(started, 1, 'the page starts at once');
  assert.equal(p.head.length, 0);
  assert.equal(p.registered.length, 0);
  assert.equal(p.calls.length, 0);
  assert.equal(p.replaced.length, 0);
  assert.equal(p.api.isServedOrigin(), false);
});

test('another http host is not the app either', async () => {
  for (const href of ['http://localhost:41873/index.html', 'https://127.0.0.1:41873/index.html', 'http://example.com/index.html']) {
    const p = page(href);
    p.api.startPage(() => {});
    await settle();
    assert.equal(p.head.length, 0, href);
    assert.equal(p.registered.length, 0, href);
  }
});

test('served on 127.0.0.1: the manifest link and the worker at scope /', async () => {
  const p = page('http://127.0.0.1:41873/index.html');
  p.api.startPage(() => {});
  await settle();
  assert.equal(p.head[0].attrs.rel, 'manifest');
  assert.equal(p.head[0].attrs.href, '/manifest.webmanifest');
  assert.deepEqual(JSON.parse(JSON.stringify(p.registered)), [['/sw.js', { scope: '/' }]]);
});

test('#pair= is cleared before the page starts, posted once with the pair header, and the token kept', async () => {
  let started = 0;
  const p = page(`http://127.0.0.1:41873/index.html#pair=${CODE}`, {
    fetchFn: async (u) => (u === '/api/pair' ? { ok: true, json: async () => ({ token: TOKEN }) } : { ok: true }),
  });
  p.api.startPage(() => {
    started += 1;
    assert.equal(p.url.hash, '', 'the code is gone from the address before anything reads it');
  });
  assert.deepEqual(p.replaced, ['/index.html'], 'replaceState runs at once');
  await settle();
  assert.equal(started, 1);
  const pair = p.calls.find(([u]) => u === '/api/pair');
  assert.equal(pair[1].method, 'POST');
  assert.equal(pair[1].headers['x-concept-explainer-pair'], '1');
  assert.deepEqual(JSON.parse(pair[1].body), { code: CODE });
  assert.equal(p.storage.get('concept-explainer:device'), TOKEN);
  assert.equal(p.api.deviceToken(), TOKEN);
});

test('a refused code (403) leaves the page unpaired and still starts it', async () => {
  let started = 0;
  const p = page(`http://127.0.0.1:41873/index.html#pair=${CODE}`, { fetchFn: async (u) => (u === '/api/pair' ? { ok: false, status: 403, json: async () => ({ error: 'used' }) } : { ok: true }) });
  p.api.startPage(() => { started += 1; });
  await settle();
  assert.equal(started, 1);
  assert.equal(p.api.deviceToken(), null);
});

test('a malformed pair hash is ignored and never posted', async () => {
  const p = page('http://127.0.0.1:41873/index.html#pair=nothex');
  p.api.startPage(() => {});
  await settle();
  assert.ok(!p.calls.some(([u]) => u === '/api/pair'));
});

test('deferBoot runs the boot once, synchronously when there is nothing to pair', () => {
  const p = page('file:///x/index.html');
  let runs = 0;
  const boot = () => { if (p.api.deferBoot(boot)) return; runs += 1; };
  boot();
  assert.equal(runs, 1);
});

test('a stored token that is not 64 hex is ignored; forget removes it', () => {
  const storage = new Map([['concept-explainer:device', 'short']]);
  const p = page('http://127.0.0.1:41873/index.html', { storage });
  assert.equal(p.api.deviceToken(), null);
  storage.set('concept-explainer:device', TOKEN);
  assert.equal(p.api.deviceToken(), TOKEN);
  p.api.forgetDeviceToken();
  assert.equal(p.api.deviceToken(), null);
});

test('when the server does not answer, the page reads offline and server controls are off', async () => {
  const p = page('http://127.0.0.1:41873/index.html', { fetchFn: async (u) => { if (u === '/api/pages') throw new TypeError('offline'); return { ok: true }; } });
  p.api.startPage(() => {});
  await settle();
  assert.ok(p.calls.some(([url]) => url === '/api/pages'), 'the uncached page-list endpoint checks whether the server is online');
  assert.equal(p.api.PWA.offline, true);
  assert.equal(p.document.documentElement.dataset.offline, 'true');
  assert.match(JSON.stringify(p.document.body.children), /Reading offline\. Start Concept Explainer to save settings or import\./);
  const button = { disabled: false, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  p.api.needsServer(button);
  assert.equal(button.disabled, true);
});

test('saved pages and bundles never carry the manifest, the worker or a token', () => {
  const share = readFileSync(new URL('../template/js/share.js', import.meta.url), 'utf8');
  assert.match(share, /link\[rel\]:not\(\[rel="manifest"\]\)/, 'Save as page skips the manifest link');
  const kept = share.match(/const kept = (\{[^\n]*\});/)[1];
  assert.doesNotMatch(kept, /serve|token|device/);
  assert.doesNotMatch(share, /function bundleOf[^}]*token/);
});
