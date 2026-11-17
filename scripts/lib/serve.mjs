// `library serve`: the library over http on 127.0.0.1, so Settings can save
// config.json and Share can export and import. Every API call needs a
// per-run token in a header; writes also need the right Origin; every
// request needs the right Host (DNS rebinding). Files are read only and never
// leave the library folder. node:http only. Contract: references/library.md.
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { readConfig, readManifest, rebuildLibrary, withLibraryLock, writeConfig } from './library.mjs';
import { appRoute } from './app-routes.mjs';
import { isDeviceToken, redeemPairCode, sweepOpenFiles } from './pairing.mjs';
import { MAX_BATCH_BYTES, parseSignalBatch } from './signals.mjs';
import { hubSummary, mergeSignals } from './insights.mjs';
import { APP_NAME, PAIR_HEADER, clearServerState, healthProof, writeServerState } from './serve-state.mjs';
import { MAX_BUNDLE_BYTES, applyImport, createBundle, parseBundle, planImport } from './bundle.mjs';
import { SLUG_PATTERN } from './library-model.mjs';
import { pageCspFrom } from './build.mjs';
import { today } from './dates.mjs';

export const HOST = '127.0.0.1';
export const TOKEN_HEADER = 'x-concept-explainer-token';
export const CONFIG_PATH = '/api/config';
export const EXPORT_PATH = '/api/export';
export const IMPORT_PATH = '/api/import';
export const PAIR_PATH = '/api/pair';
const VERSION = (() => {
  try {
    return JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
  } catch {
    return '0.0.0';
  }
})();
const MAX_CONFIG_BODY = 64 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

const SAFE_HEADERS = {
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cross-origin-resource-policy': 'same-origin',
};

function sendJson(res, status, body) {
  res.writeHead(status, { ...SAFE_HEADERS, 'content-type': TYPES['.json'] });
  res.end(JSON.stringify(body));
}

const fail = (res, status, error) => sendJson(res, status, { error });

// Writes never block the event loop on the library lock: each try takes it
// only if it is free (no Atomics.wait), and between tries the server keeps
// serving. After SERVE_LOCK_WAIT_MS the request gets 503 "library is busy".
export const SERVE_LOCK_WAIT_MS = 2000;
const SWEEP_MS = 30000;
const SERVE_LOCK_RETRY_MS = 50;
const BUSY = Symbol('busy');
const nap = (ms) => new Promise((done) => { setTimeout(done, ms); });

async function whenFree(res, home, fn, waitMs = SERVE_LOCK_WAIT_MS) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      return withLibraryLock(home, fn, 0);
    } catch (error) {
      if (error.code !== 'LIBRARY_BUSY') throw error;
      if (Date.now() >= deadline) {
        fail(res, 503, 'library is busy');
        return BUSY;
      }
    }
    await nap(SERVE_LOCK_RETRY_MS);
  }
}

function sameToken(given, token) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

// One origin only: localhost is redirected to 127.0.0.1 before anything else.
function allowedOrigins(port) {
  return [`http://${HOST}:${port}`];
}

// A file inside the library, or null. Symlinks out of the library count as outside.
// The only files a browser may read: the hub, the kit, each explainer's page
// and the fonts. Data (library.json, config.json, explainer.json), temp and
// backup files, dotfiles and anything else are not found, token or not.
const FONT_FILE = /^[A-Za-z0-9-]+\.woff2$|^OFL\.txt$/;

function allowedPath(decoded) {
  if (decoded === '/' || decoded === '/index.html') return 'index.html';
  if (decoded === '/kit.html') return 'kit.html';
  const page = decoded.match(/^\/explainers\/([^/]+)\/(?:index\.html)?$/);
  if (page && SLUG_PATTERN.test(page[1])) return join('explainers', page[1], 'index.html');
  const font = decoded.match(/^\/fonts\/([^/]+)$/);
  if (font && FONT_FILE.test(font[1])) return join('fonts', font[1]);
  return null;
}

function resolveFile(root, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return { status: 400 };
  }
  const relative = allowedPath(decoded);
  if (!relative) return { status: 404 };
  const target = resolve(root, relative);
  if (!target.startsWith(root + sep) || !existsSync(target)) return { status: 404 };
  const real = realpathSync(target);
  if (!real.startsWith(root + sep)) return { status: 403 };
  return statSync(real).isFile() ? { file: real } : { status: 404 };
}

const NON_PAGE_CSP = "default-src 'none'; frame-ancestors 'none'";

// The policy a page's build fixed (its meta tag), never recomputed from the
// file being served, plus frame-ancestors, which only works as a header.
export const pageCsp = (html) => `${pageCspFrom(html)}; frame-ancestors 'none'`;

function serveFile(root, url, req, res) {
  const found = resolveFile(root, url.pathname);
  if (!found.file) return fail(res, found.status, found.status === 404 ? 'not found' : 'not allowed');
  const ext = extname(found.file).toLowerCase();
  const body = readFileSync(found.file);
  const csp = ext === '.html' ? pageCsp(body.toString('utf8')) : NON_PAGE_CSP;
  res.writeHead(200, { ...SAFE_HEADERS, 'content-security-policy': csp, 'content-type': TYPES[ext] || 'application/octet-stream' });
  return res.end(req.method === 'HEAD' ? undefined : body);
}

const TOO_LARGE = Symbol('too large');
const ABORTED = Symbol('aborted');

// Reads a request body up to `max` bytes. Stops reading the moment the cap is
// passed, and settles on errors, aborts and early closes, so nothing hangs.
function readBody(req, max) {
  return new Promise((done) => {
    let size = 0;
    let settled = false;
    const chunks = [];
    const finish = (value) => {
      if (settled) return;
      settled = true;
      done(value);
    };
    const onData = (chunk) => {
      size += chunk.length;
      if (size > max) {
        req.pause();
        req.removeListener('data', onData);
        finish(TOO_LARGE);
      } else {
        chunks.push(chunk);
      }
    };
    req.on('data', onData);
    req.on('end', () => finish(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => finish(ABORTED));
    req.on('aborted', () => finish(ABORTED));
    req.on('close', () => finish(req.complete ? Buffer.concat(chunks).toString('utf8') : ABORTED));
  });
}

// After a 413, discard a little more of the upload before closing. A socket
// closed with unread data is reset, and on Windows the reset throws away the
// 413 before the client reads it. Bounded, so an endless upload still ends.
const DRAIN_MAX_BYTES = 1024 * 1024;
const DRAIN_MS = 1000;

function drainThenClose(req) {
  let extra = 0;
  const stop = () => {
    clearTimeout(timer);
    req.removeListener('data', onData);
    req.destroy();
  };
  const onData = (chunk) => {
    extra += chunk.length;
    if (extra > DRAIN_MAX_BYTES) stop();
  };
  const timer = setTimeout(stop, DRAIN_MS);
  req.on('data', onData);
  req.once('end', stop);
  req.resume();
}

// The per-run token, or a paired device's token.
const hasToken = (state, req) => sameToken(req.headers[TOKEN_HEADER], state.token) || isDeviceToken(state.home, req.headers[TOKEN_HEADER]);

// Every write: right origin, right token, JSON, under the size cap.
// Returns the body text, or null once it has replied with the refusal.
// Pairing has no token yet: it proves itself with the pair header and a
// same-origin fetch instead.
async function writeBody(state, req, res, max, { pairing = false } = {}) {
  const refuse = (status, error) => {
    fail(res, status, error);
    return null;
  };
  if (!allowedOrigins(state.port).includes(req.headers.origin)) return refuse(403, 'wrong origin');
  if (pairing) {
    if (req.headers[PAIR_HEADER] !== '1') return refuse(403, `missing ${PAIR_HEADER}: 1`);
    if (req.headers['sec-fetch-site'] !== 'same-origin') return refuse(403, 'pairing must be a same-origin fetch');
  } else if (!hasToken(state, req)) {
    return refuse(403, 'wrong or missing token');
  }
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return refuse(415, 'send application/json');
  const raw = await readBody(req, max);
  if (raw === ABORTED) {
    req.destroy();
    return null;
  }
  if (raw === TOO_LARGE) {
    // Answer, then drop the connection instead of reading the rest.
    res.writeHead(413, { ...SAFE_HEADERS, connection: 'close', 'content-type': TYPES['.json'] });
    res.end(JSON.stringify({ error: `body over ${max} bytes` }));
    drainThenClose(req);
    return null;
  }
  return raw;
}

async function pairDevice(state, req, res) {
  const raw = await writeBody(state, req, res, 1024, { pairing: true });
  if (raw === null) return undefined;
  let code;
  try {
    ({ code } = JSON.parse(raw));
  } catch {
    return fail(res, 400, 'body is not JSON');
  }
  // Redeem under the library lock without blocking: a busy library answers
  // 503 before the one-time code is used up.
  let token;
  try {
    token = await whenFree(res, state.home, () => redeemPairCode(state.home, code, { now: state.now }), state.lockWaitMs);
  } catch (error) {
    return fail(res, 403, error.message);
  }
  if (token === BUSY) return undefined;
  return sendJson(res, 200, { token });
}

// Reader signals from a page: a batch merged into the library's memory.
async function receiveSignals(state, req, res) {
  const raw = await writeBody(state, req, res, MAX_BATCH_BYTES);
  if (raw === null) return undefined;
  if (readConfig(state.home).learning === false) return fail(res, 403, 'learning is off');
  let batch;
  try {
    batch = parseSignalBatch(raw);
  } catch (error) {
    return fail(res, 400, error.message);
  }
  // Merged under the library lock without blocking the server; a busy library is 503, so the sender keeps the batch and retries.
  const result = await whenFree(res, state.home, () => mergeSignals(state.home, batch), state.lockWaitMs);
  if (result === BUSY) return undefined;
  return sendJson(res, 200, { ok: true, ...result });
}

// The pages a service worker may keep for offline reading, and nothing else.
function pageList(state, res) {
  const { manifest } = readManifest(state.home);
  return sendJson(res, 200, { updatedAt: manifest.updatedAt, pages: manifest.explainers.map((e) => `explainers/${e.slug}/index.html`) });
}

function serveApp(route, req, res) {
  res.writeHead(200, { ...SAFE_HEADERS, 'content-security-policy': route.csp, 'content-type': route.type });
  return res.end(req.method === 'HEAD' ? undefined : route.body);
}

function exportBundle(state, url, res) {
  const list = (name) => (url.searchParams.get(name) || '').split(',').map((s) => s.trim()).filter(Boolean);
  const one = (name) => url.searchParams.get(name) || undefined;
  let result;
  try {
    result = createBundle(state.home, { slugs: list('slugs'), type: one('type'), tag: one('tag'), stack: one('stack'), search: one('search') });
  } catch (error) {
    return fail(res, 400, error.message);
  }
  const name = `explainers-${today()}.explainers.json`;
  res.writeHead(200, { ...SAFE_HEADERS, 'content-type': TYPES['.json'], 'content-disposition': `attachment; filename="${name}"` });
  return res.end(JSON.stringify(result.bundle, null, 2));
}

async function importBundle(state, url, req, res) {
  const raw = await writeBody(state, req, res, MAX_BUNDLE_BYTES);
  if (raw === null) return undefined;
  const options = { onConflict: url.searchParams.get('onConflict') || undefined };
  let bundle;
  let plan;
  try {
    bundle = parseBundle(raw);
    plan = planImport(state.home, bundle, options);
  } catch (error) {
    return fail(res, 400, error.message);
  }
  // ?dryRun=1 plans only. Without it the import plans again under the lock and writes.
  if (url.searchParams.get('dryRun') === '1') return sendJson(res, 200, { summary: plan.summary });
  const summary = await whenFree(res, state.home, () => applyImport(state.home, bundle, options), state.lockWaitMs);
  if (summary === BUSY) return undefined;
  return sendJson(res, 200, { summary });
}

async function saveConfig(state, req, res) {
  const { home } = state;
  const raw = await writeBody(state, req, res, MAX_CONFIG_BODY);
  if (raw === null) return undefined;
  let changes;
  try {
    changes = JSON.parse(raw);
  } catch {
    return fail(res, 400, 'body is not JSON');
  }
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return fail(res, 400, 'body must be a JSON object of settings');
  let config;
  const saved = await whenFree(res, home, () => {
    try {
      config = writeConfig(home, changes);
    } catch (error) {
      return error;
    }
    rebuildLibrary({ home });
    return null;
  }, state.lockWaitMs);
  if (saved === BUSY) return undefined;
  if (saved) return fail(res, 400, saved.message);
  return sendJson(res, 200, { config });
}

function handler(state) {
  return (req, res) => {
    const { port } = state;
    state.lastActivity = state.now();
    // No CORS, ever: a preflight is refused before anything else.
    if (req.method === 'OPTIONS') return fail(res, 405, 'no cross-origin requests');
    if (req.headers.host === `localhost:${port}`) {
      res.writeHead(308, { ...SAFE_HEADERS, location: `http://${HOST}:${port}${req.url.startsWith('/') ? req.url : '/'}` });
      return res.end();
    }
    if (req.headers.host !== `${HOST}:${port}`) return fail(res, 403, 'wrong host');
    let url;
    try {
      url = new URL(req.url, `http://${HOST}:${port}`);
    } catch {
      return fail(res, 400, 'bad url');
    }
    const failed = (error) => fail(res, 500, `${url.pathname} failed: ${error.message}`);
    if (url.pathname === '/api/health') {
      if (req.method !== 'GET') return fail(res, 405, 'use GET');
      // With ?nonce=, prove this is the server server.json describes (see verifyServer).
      const nonce = url.searchParams.get('nonce');
      const proof = nonce && /^[0-9a-f]{32}$/.test(nonce) ? { proof: healthProof(state.secret, nonce) } : {};
      return sendJson(res, 200, { app: APP_NAME, version: VERSION, instance: state.instance, ...proof });
    }
    if (url.pathname === '/api/pages') return req.method === 'GET' ? pageList(state, res) : fail(res, 405, 'use GET');
    if (url.pathname === '/api/signals') return req.method === 'POST' ? receiveSignals(state, req, res).catch(failed) : fail(res, 405, 'use POST');
    if (url.pathname === '/api/insights') {
      if (req.method !== 'GET') return fail(res, 405, 'use GET');
      if (!hasToken(state, req)) return fail(res, 403, 'wrong or missing token');
      if (readConfig(state.home).learning === false) return fail(res, 403, 'learning is off');
      return sendJson(res, 200, { insights: hubSummary(state.home) });
    }
    if (url.pathname === PAIR_PATH) return req.method === 'POST' ? pairDevice(state, req, res).catch(failed) : fail(res, 405, 'use POST');
    if (url.pathname === CONFIG_PATH) {
      if (req.method === 'GET') return hasToken(state, req) ? sendJson(res, 200, { config: readConfig(state.home) }) : fail(res, 403, 'wrong or missing token');
      if (req.method === 'POST') return saveConfig(state, req, res).catch(failed);
      return fail(res, 405, 'use GET or POST');
    }
    if (url.pathname === EXPORT_PATH) {
      if (req.method !== 'GET') return fail(res, 405, 'use GET');
      return hasToken(state, req) ? exportBundle(state, url, res) : fail(res, 403, 'wrong or missing token');
    }
    if (url.pathname === IMPORT_PATH) {
      if (req.method !== 'POST') return fail(res, 405, 'use POST');
      return importBundle(state, url, req, res).catch(failed);
    }
    if (url.pathname.startsWith('/api/')) return fail(res, 404, 'not found');
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'read only');
    const app = appRoute(url.pathname);
    if (app) return serveApp(app, req, res);
    return serveFile(state.root, url, req, res);
  };
}

/**
 * Serve the library until closed, or until idle.
 * @param {{ home: string, port?: number, lockWaitMs?: number, idleMinutes?: number, now?: () => number, idleCheckMs?: number, writeState?: boolean }} options
 *   lockWaitMs: how long a write waits for the library lock before 503.
 *   idleMinutes: stop after this long with no request (0 = never). writeState: record
 *   <home>/.serve/server.json while running, for `launch`.
 * @returns {Promise<{ server, port, token, instance, url, close: () => Promise<void>, stopped: Promise<void> }>}
 */
export function startLibraryServer({
  home, port = 0, lockWaitMs = SERVE_LOCK_WAIT_MS, idleMinutes = 0, now = Date.now, idleCheckMs = 30000, writeState = false,
}) {
  const state = {
    home, root: realpathSync(home), token: randomBytes(24).toString('hex'), instance: randomBytes(12).toString('hex'), secret: randomBytes(32).toString('hex'),
    port: 0, now, lastActivity: now(), lockWaitMs,
  };
  const server = createServer(handler(state));
  let timer = null;
  let sweeper = null;
  let markStopped;
  const stopped = new Promise((r) => { markStopped = r; });
  const close = () => new Promise((closed) => {
    if (timer) clearInterval(timer);
    if (sweeper) clearInterval(sweeper);
    clearServerState(home, state.instance);
    if (!server.listening) { closed(); markStopped(); return; }
    server.close(() => { closed(); markStopped(); });
    server.closeIdleConnections?.();
  });
  return new Promise((done, reject) => {
    server.once('error', (error) => reject(new Error(`serve on ${HOST}:${port}: ${error.code || error.message}`)));
    server.listen(port, HOST, () => {
      state.port = server.address().port;
      if (writeState) {
        // launch's redirect files go once their code expires, even if never used.
        sweeper = setInterval(() => sweepOpenFiles(home), SWEEP_MS);
        sweeper.unref();
        writeServerState(home, {
          pid: process.pid, port: state.port, instance: state.instance, secret: state.secret, version: VERSION, startedAt: new Date(now()).toISOString(), idleMinutes,
          launched: process.env.CONCEPT_EXPLAINER_LAUNCHED === '1',
        });
      }
      if (idleMinutes > 0) {
        timer = setInterval(() => {
          if (state.now() - state.lastActivity >= idleMinutes * 60000) close();
        }, idleCheckMs);
        timer.unref();
      }
      done({
        server,
        port: state.port,
        token: state.token,
        instance: state.instance,
        url: `http://${HOST}:${state.port}/index.html#token=${state.token}`,
        close,
        stopped,
      });
    });
  });
}
