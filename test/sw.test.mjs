import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// template/app/sw.js in node:vm, with in-memory caches and a fake network.
const SOURCE = readFileSync(new URL('../template/app/sw.js', import.meta.url), 'utf8');
const ORIGIN = 'http://127.0.0.1:41873';

class FakeCache {
  constructor() { this.map = new Map(); }

  key(req) { return new URL(typeof req === 'string' ? req : req.url, ORIGIN).href; }

  async put(req, res) { this.map.set(this.key(req), res); }

  async match(req, opts = {}) {
    const k = this.key(req);
    if (this.map.has(k)) return this.map.get(k);
    if (opts.ignoreSearch) {
      const bare = k.split('?')[0];
      for (const [key, value] of this.map) if (key.split('?')[0] === bare) return value;
    }
    return undefined;
  }

  async delete(req) { return this.map.delete(this.key(req)); }

  async keys() { return [...this.map.keys()].map((url) => new Request(url)); }

  paths() { return [...this.map.keys()].map((u) => new URL(u).pathname).sort(); }
}

class FakeCaches {
  constructor() { this.stores = new Map(); }

  async open(name) { if (!this.stores.has(name)) this.stores.set(name, new FakeCache()); return this.stores.get(name); }

  async keys() { return [...this.stores.keys()]; }

  async delete(name) { return this.stores.delete(name); }

  async match(req, opts) {
    for (const cache of this.stores.values()) {
      const hit = await cache.match(req, opts);
      if (hit) return hit;
    }
    return undefined;
  }
}

// Responses from the "server": { path: body } plus a pages list.
function network({ pages = [], updatedAt = '2026-11-18T00:00:00Z', online = true, status = {} } = {}) {
  const state = { online, pages, updatedAt, requests: [] };
  const fetchFn = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(new URL(input, ORIGIN), init);
    const url = new URL(request.url);
    state.requests.push(`${request.method} ${url.pathname}`);
    if (!state.online) throw new TypeError('Failed to fetch');
    if (url.pathname === '/api/pages') return Response.json({ updatedAt: state.updatedAt, pages: state.pages });
    const code = status[url.pathname] || 200;
    const res = new Response(`<p>${url.pathname}</p>`, { status: code, headers: { 'content-type': 'text/html' } });
    Object.defineProperty(res, 'type', { value: 'basic' });
    return res;
  };
  return { state, fetchFn };
}

function loadWorker(net) {
  const listeners = {};
  const caches = new FakeCaches();
  const self = {
    location: new URL(ORIGIN),
    addEventListener: (name, fn) => { listeners[name] = fn; },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const ctx = vm.createContext({ self, caches, fetch: net.fetchFn, Request, Response, URL, setTimeout, clearTimeout, Promise, console });
  vm.runInContext(SOURCE, ctx, { filename: 'sw.js' });
  const run = async (name, event = {}) => {
    const waits = [];
    let responded;
    listeners[name]({ ...event, waitUntil: (p) => waits.push(p), respondWith: (p) => { responded = p; } });
    const response = responded ? await responded : undefined;
    await Promise.all(waits);
    return response;
  };
  const get = (path, mode = 'no-cors') => run('fetch', { request: Object.assign(new Request(`${ORIGIN}${path}`), {}), mode, navigate: mode === 'navigate' });
  const navigate = (path) => {
    const request = new Request(`${ORIGIN}${path}`);
    Object.defineProperty(request, 'mode', { value: 'navigate' });
    return run('fetch', { request });
  };
  return { caches, run, get, navigate };
}

const PAGES = ['explainers/acme-taskflow/index.html', 'explainers/pr-512/index.html'];

test('install caches the hub, kit, manifest and icons under the pages updatedAt', async () => {
  const net = network({ pages: PAGES });
  const sw = loadWorker(net);
  await sw.run('install');
  const names = await sw.caches.keys();
  assert.deepEqual(names, ['concept-explainer-2026-11-18T00:00:00Z']);
  const cache = sw.caches.stores.get(names[0]);
  assert.deepEqual(cache.paths(), ['/app/icon-192.png', '/app/icon-512.png', '/app/icon.svg', '/app/maskable-512.png', '/index.html', '/kit.html', '/manifest.webmanifest']);
});

test('a hub load caches every listed page, and never an /api answer', async () => {
  const net = network({ pages: PAGES });
  const sw = loadWorker(net);
  await sw.run('install');
  await sw.navigate('/index.html');
  const cache = sw.caches.stores.get('concept-explainer-2026-11-18T00:00:00Z');
  for (const page of PAGES) assert.ok(cache.paths().includes(`/${page}`), page);
  assert.ok(net.state.requests.includes('GET /api/pages'), 'the list is fetched');
  assert.ok(!cache.paths().some((p) => p.startsWith('/api/')), 'no /api/* in the cache');
});

test('the API, writes and other origins are never handled by the worker', async () => {
  const net = network();
  const sw = loadWorker(net);
  for (const request of [
    new Request(`${ORIGIN}/api/config`), new Request(`${ORIGIN}/api/pages`), new Request(`${ORIGIN}/api/health`),
    new Request(`${ORIGIN}/index.html`, { method: 'POST', body: '{}' }), new Request('https://example.com/x.js'),
  ]) {
    assert.equal(await sw.run('fetch', { request }), undefined, `${request.method} ${request.url} passes through`);
  }
  for (const cache of sw.caches.stores.values()) assert.equal(cache.paths().length, 0);
});

test('only status 200 is kept', async () => {
  const net = network({ status: { '/explainers/gone/index.html': 404 } });
  const sw = loadWorker(net);
  await sw.get('/explainers/gone/index.html');
  await new Promise((r) => setTimeout(r, 10));
  for (const cache of sw.caches.stores.values()) assert.ok(!cache.paths().includes('/explainers/gone/index.html'));
});

test('offline, pages come from the cache; uncached pages still fail', async () => {
  const net = network({ pages: PAGES });
  const sw = loadWorker(net);
  await sw.run('install');
  await sw.navigate('/index.html');
  net.state.online = false;
  const page = await sw.get('/explainers/acme-taskflow/index.html');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /acme-taskflow/);
  const hub = await sw.get('/index.html?x=1');
  assert.equal(hub.status, 200, 'a query string still finds the hub');
  await assert.rejects(sw.get('/explainers/never-seen/index.html'));
});

test('a new pages list moves to a new cache, drops removed pages and deletes the old cache', async () => {
  const net = network({ pages: PAGES });
  const sw = loadWorker(net);
  await sw.run('install');
  await sw.navigate('/index.html');
  net.state.pages = [PAGES[0]];
  net.state.updatedAt = '2026-11-19T00:00:00Z';
  await sw.navigate('/index.html');
  assert.deepEqual(await sw.caches.keys(), ['concept-explainer-2026-11-19T00:00:00Z'], 'the old cache is gone');
  const cache = sw.caches.stores.get('concept-explainer-2026-11-19T00:00:00Z');
  assert.ok(cache.paths().includes(`/${PAGES[0]}`));
  assert.ok(!cache.paths().includes(`/${PAGES[1]}`), 'a page no longer listed is dropped');
});

test('activate deletes caches from older versions and nothing else', async () => {
  const net = network();
  const sw = loadWorker(net);
  await sw.caches.open('concept-explainer-2026-01-01T00:00:00Z');
  await sw.caches.open('concept-explainer-2026-11-18T00:00:00Z');
  await sw.caches.open('someone-elses-cache');
  await sw.run('activate');
  assert.deepEqual(await sw.caches.keys(), ['concept-explainer-2026-11-18T00:00:00Z', 'someone-elses-cache']);
});

test('the page list is capped and only explainer pages are taken', async () => {
  const many = Array.from({ length: 230 }, (_, i) => `explainers/page-${i}/index.html`);
  const net = network({ pages: [...many, '../config.json', 'library.json', 'explainers/a/../../x/index.html'] });
  const sw = loadWorker(net);
  await sw.run('install');
  await sw.navigate('/index.html');
  const cache = [...sw.caches.stores.values()][0];
  const pages = cache.paths().filter((p) => p.startsWith('/explainers/'));
  assert.equal(pages.length, 200);
  assert.ok(!cache.paths().some((p) => /config|library\.json|\.\./.test(p)));
});
