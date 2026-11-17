import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startLibraryServer, TOKEN_HEADER } from '../scripts/lib/serve.mjs';
import { publishExplainer, readConfig } from '../scripts/lib/library.mjs';

const example = JSON.parse(readFileSync(new URL('../examples/taskflow.explainer.json', import.meta.url), 'utf8'));
let home;
let outside;
let served;

before(async () => {
  home = mkdtempSync(join(tmpdir(), 'rx-serve-'));
  outside = mkdtempSync(join(tmpdir(), 'rx-outside-'));
  writeFileSync(join(outside, 'secret.txt'), 'do not serve');
  publishExplainer(example, { home });
  symlinkSync(join(outside, 'secret.txt'), join(home, 'link.txt'));
  served = await startLibraryServer({ home, port: 0, quiet: true });
});

after(() => served.close());

// The server may answer and close before an oversized upload finishes, so a
// write error after the response arrived still resolves with that response.
function send({ method = 'GET', path = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    let answered = null;
    const req = request({ host: '127.0.0.1', port: served.port, method, path, headers: { host: `127.0.0.1:${served.port}`, ...headers } }, (res) => {
      let data = '';
      answered = { status: res.statusCode, headers: res.headers, body: '' };
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ ...answered, body: data }));
      res.on('error', () => resolve(answered));
    });
    req.on('error', (error) => (answered ? resolve(answered) : reject(error)));
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const origin = () => `http://127.0.0.1:${served.port}`;
const save = (body, headers = {}) => send({
  method: 'POST', path: '/api/config', body: typeof body === 'string' ? body : JSON.stringify(body),
  headers: { origin: origin(), 'content-type': 'application/json', [TOKEN_HEADER]: served.token, ...headers },
});

test('binds to 127.0.0.1 on a random port with a fresh token, and prints a URL with it in the fragment', () => {
  assert.ok(served.port > 0);
  assert.match(served.token, /^[0-9a-f]{48}$/);
  assert.equal(served.url, `http://127.0.0.1:${served.port}/index.html#token=${served.token}`);
  assert.equal(served.server.address().address, '127.0.0.1');
});

test('serves files from the library with safe headers, and folders by their index.html', async () => {
  const hub = await send({ path: '/index.html' });
  assert.equal(hub.status, 200);
  assert.match(hub.headers['content-type'], /text\/html/);
  assert.equal(hub.headers['x-content-type-options'], 'nosniff');
  assert.equal(hub.headers['cache-control'], 'no-store');
  assert.equal((await send({ path: '/' })).status, 200);
  assert.equal((await send({ path: '/explainers/acme-taskflow/' })).status, 200);
  assert.equal((await send({ path: '/explainers/' })).status, 404, 'no directory listing');
});

test('path traversal and links out of the library are refused', async () => {
  for (const path of ['/../../etc/passwd', '/%2e%2e/%2e%2e/etc/passwd', '/explainers/..%2f..%2f..%2fetc/passwd', '/link.txt', '/%00', '/%E0%A4%A']) {
    const res = await send({ path });
    assert.ok([400, 403, 404].includes(res.status), `${path} gave ${res.status}`);
    assert.doesNotMatch(res.body, /do not serve|root:/);
  }
});

test('only the hub, the kit, explainer pages and fonts are served; data files never', async () => {
  writeFileSync(join(home, 'config.json'), JSON.stringify({ instructions: 'private house notes' }));
  writeFileSync(join(home, 'index.html.tmp-123-abcd'), 'half written');
  writeFileSync(join(home, 'library.json.corrupt-2026'), '{}');
  for (const path of ['/config.json', '/library.json', '/explainers/acme-taskflow/explainer.json', '/index.html.tmp-123-abcd',
    '/library.json.corrupt-2026', '/.lock/pid', '/.serve/x', '/explainers/acme-taskflow/explainer.json.replaced-1', '/explainers/ACME/index.html',
    '/fonts/../config.json', '/fonts/x.js', '/kit.html/']) {
    const res = await send({ path });
    assert.equal(res.status, 404, `${path} gave ${res.status}`);
    assert.doesNotMatch(res.body, /private house notes|"explainers"|half written/);
  }
  for (const path of ['/', '/index.html', '/kit.html', '/explainers/acme-taskflow/', '/explainers/acme-taskflow/index.html']) {
    assert.equal((await send({ path })).status, 200, path);
  }
});

test('a wrong Host header is refused, against DNS rebinding', async () => {
  assert.equal((await send({ path: '/index.html', headers: { host: 'evil.example:80' } })).status, 403);
});

test('GET /api/config needs the token, since config can hold private instructions', async () => {
  assert.equal((await send({ path: '/api/config' })).status, 403);
  assert.equal((await send({ path: '/api/config', headers: { [TOKEN_HEADER]: 'wrong' } })).status, 403);
  const res = await send({ path: '/api/config', headers: { [TOKEN_HEADER]: served.token } });
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).config.style, 'clean');
});

test('served pages get the policy their build fixed, plus frame-ancestors', async () => {
  for (const path of ['/index.html', '/kit.html', '/explainers/acme-taskflow/index.html']) {
    const res = await send({ path });
    const meta = res.body.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
    assert.ok(meta, path);
    assert.equal(res.headers['content-security-policy'], `${meta[1]}; frame-ancestors 'none'`, path);
    assert.doesNotMatch(res.headers['content-security-policy'], /googleapis|https:/);
  }
});

test('a page changed after its build gains nothing: the policy is not recomputed', async () => {
  const page = join(home, 'explainers', 'acme-taskflow', 'index.html');
  const original = readFileSync(page, 'utf8');
  try {
    writeFileSync(page, original.replace('</body>', '<script>window.planted = 1</script></body>'));
    const csp = (await send({ path: '/explainers/acme-taskflow/index.html' })).headers['content-security-policy'];
    const planted = `'sha256-${createHash('sha256').update('window.planted = 1').digest('base64')}'`;
    assert.ok(!csp.includes(planted), 'the planted script is not allowed');
  } finally {
    writeFileSync(page, original);
  }
});

const auth = () => ({ [TOKEN_HEADER]: served.token });
const upload = (body, query = '', headers = {}) => send({
  method: 'POST', path: `/api/import${query}`, body,
  headers: { origin: origin(), 'content-type': 'application/json', ...auth(), ...headers },
});

test('GET /api/export needs the token and returns a data-only bundle', async () => {
  assert.equal((await send({ path: '/api/export' })).status, 403);
  assert.equal((await send({ path: '/api/export', headers: { [TOKEN_HEADER]: 'wrong' } })).status, 403);
  const res = await send({ path: '/api/export?type=repo', headers: auth() });
  assert.equal(res.status, 200, res.body);
  assert.match(res.headers['content-disposition'], /attachment; filename="explainers-.*\.explainers\.json"/);
  const bundle = JSON.parse(res.body);
  assert.equal(bundle.format, 'concept-explainer-bundle');
  assert.equal(bundle.explainers[0].slug, 'acme-taskflow');
  assert.doesNotMatch(res.body, /sourcePath|repoPath/);
  assert.equal(JSON.parse((await send({ path: '/api/export?slugs=acme-taskflow', headers: auth() })).body).explainers.length, 1);
  const missing = await send({ path: '/api/export?slugs=acme-taskflow,nope', headers: auth() });
  assert.equal(missing.status, 400);
  assert.match(JSON.parse(missing.body).error, /no explainer "nope"/);
  assert.equal((await send({ method: 'POST', path: '/api/export', headers: { origin: origin(), ...auth() } })).status, 405);
});

test('POST /api/import plans with ?dryRun=1, applies without it, and checks token, origin and size', async () => {
  const bundle = (await send({ path: '/api/export', headers: auth() })).body;
  const dry = await upload(bundle, '?dryRun=1');
  assert.equal(dry.status, 200, dry.body);
  const plan = JSON.parse(dry.body).summary;
  assert.equal(plan.dryRun, true);
  assert.deepEqual(Object.keys(plan).sort(), ['added', 'dryRun', 'rejected', 'replaced', 'skipped']);
  assert.equal(plan.added[0].slug, 'acme-taskflow-2');
  assert.ok(!existsSync(join(home, 'explainers', 'acme-taskflow-2')), 'dry run wrote nothing');
  const skip = JSON.parse((await upload(bundle, '?dryRun=1&onConflict=skip')).body).summary;
  assert.equal(skip.skipped.length, 1);
  const applied = await upload(bundle);
  assert.equal(applied.status, 200, applied.body);
  assert.equal(JSON.parse(applied.body).summary.dryRun, false);
  assert.ok(existsSync(join(home, 'explainers', 'acme-taskflow-2', 'index.html')));
  assert.match(readFileSync(join(home, 'index.html'), 'utf8'), /acme-taskflow-2/, 'the hub was rebuilt');
  assert.equal((await upload(bundle, '?dryRun=1', { [TOKEN_HEADER]: 'wrong' })).status, 403);
  assert.equal((await upload(bundle, '?dryRun=1', { origin: 'https://evil.example' })).status, 403);
  assert.equal((await upload(bundle, '?dryRun=1', { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await upload('{ nope')).status, 400);
  assert.match(JSON.parse((await upload('{"format":"zip"}')).body).error, /not a concept-explainer bundle/);
  assert.equal((await upload(bundle, '?dryRun=1&onConflict=merge')).status, 400);
  assert.equal((await upload('x'.repeat(10 * 1024 * 1024 + 10))).status, 413);
  const hostile = JSON.stringify({ format: 'concept-explainer-bundle', version: 1, explainers: [{ slug: '../../x', data: { __proto__: { polluted: 1 } } }] });
  const rejected = JSON.parse((await upload(hostile, '?dryRun=1')).body).summary;
  assert.equal(rejected.rejected.length, 1);
  assert.equal(({}).polluted, undefined);
});

test('an upload over the cap is refused early and the connection closed; aborted uploads do no harm', async () => {
  const big = await send({
    method: 'POST', path: '/api/config', body: 'x'.repeat(200 * 1024),
    headers: { origin: origin(), 'content-type': 'application/json', [TOKEN_HEADER]: served.token },
  });
  assert.equal(big.status, 413);
  assert.equal(big.headers.connection, 'close');
  await new Promise((done) => {
    const req = request({ host: '127.0.0.1', port: served.port, method: 'POST', path: '/api/config',
      headers: { host: `127.0.0.1:${served.port}`, origin: origin(), 'content-type': 'application/json', [TOKEN_HEADER]: served.token, 'content-length': '1000' } });
    req.on('error', () => done());
    req.write('{"audience":');
    setTimeout(() => { req.destroy(); done(); }, 50);
  });
  assert.equal((await send({ path: '/index.html' })).status, 200, 'the server still answers');
  assert.equal(readConfig(home).audience === 'kids', false);
});

test('only GET, HEAD and the API methods are allowed', async () => {
  assert.equal((await send({ method: 'POST', path: '/index.html', headers: { origin: origin(), [TOKEN_HEADER]: served.token } })).status, 405);
  assert.equal((await send({ method: 'DELETE', path: '/api/config' })).status, 405);
  assert.equal((await send({ method: 'PUT', path: '/library.json' })).status, 405);
  assert.equal((await send({ path: '/api/other' })).status, 404);
});

test('fonts are served from the library with their type', async () => {
  const font = await send({ path: '/fonts/geist-latin.woff2' });
  assert.equal(font.status, 200);
  assert.equal(font.headers['content-type'], 'font/woff2');
  assert.equal((await send({ path: '/fonts/OFL.txt' })).status, 200);
  assert.equal((await send({ path: '/fonts/fonts.json' })).status, 404);
});
