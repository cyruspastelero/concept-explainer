import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TOKEN_HEADER, startLibraryServer } from '../scripts/lib/serve.mjs';
import { PAIR_HEADER, startOrReuse, readServerState } from '../scripts/lib/serve-state.mjs';
import { createPairCode, forgetDevices } from '../scripts/lib/pairing.mjs';
import { publishExplainer } from '../scripts/lib/library.mjs';

const example = JSON.parse(readFileSync(new URL('../examples/taskflow.explainer.json', import.meta.url), 'utf8'));
let home;
let served;

before(async () => {
  home = join(mkdtempSync(join(tmpdir(), 'rx-app-')), 'home');
  publishExplainer(example, { home });
  served = await startLibraryServer({ home, port: 0 });
});
after(() => served.close());

function send({ method = 'GET', path = '/', headers = {}, body, port = served.port } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const origin = () => `http://127.0.0.1:${served.port}`;
const pair = (code, headers = {}) => send({
  method: 'POST', path: '/api/pair', body: JSON.stringify({ code }),
  headers: { origin: origin(), 'content-type': 'application/json', [PAIR_HEADER]: '1', 'sec-fetch-site': 'same-origin', ...headers },
});

test('the web app manifest describes the installed app', async () => {
  const res = await send({ path: '/manifest.webmanifest' });
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'application/manifest+json');
  const manifest = JSON.parse(res.body);
  assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/index.html');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.name, 'Concept Explainer');
  assert.equal(manifest.short_name, 'Explainers');
  assert.equal(manifest.background_color, '#fafafa');
  assert.equal(manifest.theme_color, '#fafafa');
  for (const icon of manifest.icons) assert.equal((await send({ path: icon.src })).status, 200, icon.src);
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
});

test('the service worker and app icons come from a fixed map, nothing else', async () => {
  const sw = await send({ path: '/sw.js' });
  assert.equal(sw.status, 200);
  assert.match(sw.headers['content-type'], /text\/javascript/);
  assert.match(sw.headers['content-security-policy'], /default-src 'none'/);
  const types = { '/app/icon-192.png': 'image/png', '/app/icon-512.png': 'image/png', '/app/maskable-512.png': 'image/png', '/app/icon.svg': 'image/svg+xml' };
  for (const [path, type] of Object.entries(types)) {
    const res = await send({ path });
    assert.equal(res.status, 200, path);
    assert.equal(res.headers['content-type'], type, path);
  }
  for (const path of ['/app/icon.ico', '/app/../library.json', '/app/%2e%2e/config.json', '/template/app/sw.js', '/sw.js/x', '/.serve/devices.json', '/.serve/server.json']) {
    assert.equal((await send({ path })).status, 404, path);
  }
});

test('localhost is redirected to 127.0.0.1 so the app has one origin', async () => {
  const res = await send({ path: '/kit.html?x=1', headers: { host: `localhost:${served.port}` } });
  assert.equal(res.status, 308);
  assert.equal(res.headers.location, `http://127.0.0.1:${served.port}/kit.html?x=1`);
  assert.equal((await send({ headers: { host: 'evil.example' } })).status, 403);
});

test('health says who is serving, with no token', async () => {
  const res = await send({ path: '/api/health' });
  assert.equal(res.status, 200);
  const health = JSON.parse(res.body);
  assert.equal(health.app, 'concept-explainer');
  assert.equal(health.instance, served.instance);
  assert.match(health.version, /^\d+\.\d+\.\d+/);
  assert.doesNotMatch(res.body, /token|home|\/Users\//);
});

test('the page list for offline reading names only pages', async () => {
  const res = await send({ path: '/api/pages' });
  assert.equal(res.status, 200);
  const pages = JSON.parse(res.body);
  assert.deepEqual(pages.pages, ['explainers/acme-taskflow/index.html']);
  assert.match(pages.updatedAt, /^\d{4}-/);
  assert.doesNotMatch(res.body, /sourcePath|repoPath|config/);
});

test('pairing trades a code once for a device token that can write', async () => {
  const code = createPairCode(home);
  const res = await pair(code);
  assert.equal(res.status, 200, res.body);
  const { token } = JSON.parse(res.body);
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal((await pair(code)).status, 403, 'a code works once');
  const read = await send({ path: '/api/config', headers: { [TOKEN_HEADER]: token } });
  assert.equal(read.status, 200);
  forgetDevices(home);
  assert.equal((await send({ path: '/api/config', headers: { [TOKEN_HEADER]: token } })).status, 403, 'revoked');
});

test('pairing checks the pair header, origin, fetch site and JSON', async () => {
  assert.equal((await pair(createPairCode(home), { [PAIR_HEADER]: '' })).status, 403);
  assert.equal((await pair(createPairCode(home), { origin: 'https://evil.example' })).status, 403);
  assert.equal((await pair(createPairCode(home), { 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await pair(createPairCode(home), { 'sec-fetch-site': '' })).status, 403);
  assert.equal((await pair(createPairCode(home), { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await pair('not-a-code')).status, 403);
  const bad = await send({ method: 'POST', path: '/api/pair', body: '{ nope', headers: { origin: origin(), 'content-type': 'application/json', [PAIR_HEADER]: '1', 'sec-fetch-site': 'same-origin' } });
  assert.equal(bad.status, 400);
});

test('OPTIONS gets 405 with no CORS headers', async () => {
  for (const path of ['/api/config', '/api/pair', '/api/import', '/index.html']) {
    const res = await send({ method: 'OPTIONS', path, headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });
    assert.equal(res.status, 405, path);
    assert.ok(!Object.keys(res.headers).some((h) => h.startsWith('access-control-')), path);
  }
});

test('an idle server stops itself and removes its state file', async () => {
  const idleHome = join(mkdtempSync(join(tmpdir(), 'rx-idle-')), 'home');
  publishExplainer(example, { home: idleHome });
  let clock = 0;
  const s = await startLibraryServer({ home: idleHome, port: 0, idleMinutes: 1, now: () => clock, idleCheckMs: 10, writeState: true });
  assert.equal(readServerState(idleHome).port, s.port);
  clock = 30 * 1000;
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(s.server.listening, true, 'still running before a minute passes');
  await send({ path: '/api/health', port: s.port });
  clock = 30 * 1000 + 59 * 1000;
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(s.server.listening, true, 'activity resets the idle clock');
  clock = 30 * 1000 + 61 * 1000;
  await s.stopped;
  assert.equal(s.server.listening, false);
  assert.equal(readServerState(idleHome), null);
  assert.ok(!existsSync(join(idleHome, '.serve', 'server.json')));
});

test('a busy port is reused when it is ours, skipped when it is not', async () => {
  const ours = await startOrReuse({ home, port: 0 });
  try {
    const again = await startOrReuse({ home, port: ours.port });
    assert.equal(again.reused, true);
    assert.equal(again.port, ours.port);
    assert.equal(again.instance, ours.instance);
  } finally {
    await ours.close();
  }
  const foreign = createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"app":"something-else"}'); });
  await new Promise((r) => foreign.listen(0, '127.0.0.1', r));
  const taken = foreign.address().port;
  try {
    await assert.rejects(startOrReuse({ home, port: taken }), /cannot prove it is this library's server/, 'an explicit or installed port is never worked around');
    const moved = await startOrReuse({ home, port: taken, fallback: true });
    assert.equal(moved.reused, false);
    assert.notEqual(moved.port, taken);
    assert.ok(moved.port >= 20000 && moved.port <= 60999);
    assert.equal(moved.fellBack, true);
    assert.match(moved.warning, /this run serves on \d+ instead[\s\S]*--new-port/);
    await moved.close();
  } finally {
    foreign.close();
  }
});

test('health proves the server with an HMAC of a nonce; an impostor with our fingerprint is not reused', async () => {
  const { healthProof, verifyServer } = await import('../scripts/lib/serve-state.mjs');
  const ours = await startOrReuse({ home, port: 0 });
  try {
    const state = readServerState(home);
    assert.match(state.secret, /^[0-9a-f]{64}$/);
    const nonce = 'a'.repeat(32);
    const health = JSON.parse((await send({ path: `/api/health?nonce=${nonce}`, port: ours.port })).body);
    assert.equal(health.proof, healthProof(state.secret, nonce));
    assert.ok(await verifyServer(home, ours.port), 'a genuine server is proven');
  } finally {
    await ours.close();
  }
  const seen = [];
  const impostor = createServer((req, res) => {
    seen.push(req.url);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ app: 'concept-explainer', version: '9.9.9', instance: 'copied', proof: 'f'.repeat(64) }));
  });
  await new Promise((r) => impostor.listen(0, '127.0.0.1', r));
  const squatted = impostor.address().port;
  try {
    const moved = await startOrReuse({ home, port: squatted, fallback: true });
    assert.equal(moved.reused, false);
    assert.notEqual(moved.port, squatted);
    assert.match(moved.warning, /cannot prove it is this library's server/);
    assert.ok(seen.every((u) => !/pair|token/.test(u)), 'the impostor got nothing but a health probe');
    await moved.close();
  } finally {
    impostor.close();
  }
});
