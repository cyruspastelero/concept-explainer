import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { launch, sweepOpenFiles } from '../scripts/lib/launch.mjs';
import { readServerState, verifyServer, PAIR_HEADER } from '../scripts/lib/serve-state.mjs';
import { createPairCode, isDeviceToken, redeemPairCode, forgetDevices, PAIR_TTL_MS } from '../scripts/lib/pairing.mjs';
import { publishExplainer, writeConfig } from '../scripts/lib/library.mjs';

const example = JSON.parse(readFileSync(new URL('../examples/taskflow.explainer.json', import.meta.url), 'utf8'));
const DAY = 24 * 60 * 60 * 1000;
const freePort = () => new Promise((done) => {
  const s = createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => done(port)); });
});
function library() {
  const home = join(mkdtempSync(join(tmpdir(), 'rx-launch-open-')), 'home');
  publishExplainer(example, { home });
  return home;
}
// Stop only the server this test's temp home started, and only once it proves
// it is that home's (a planted server.json may name any pid, even this one).
async function stop(home) {
  const state = readServerState(home);
  if (!state || state.pid === process.pid || !(await verifyServer(home, state.port))) return;
  try { process.kill(state.pid); } catch { /* gone */ }
}
const openFiles = (home) => readdirSync(join(home, '.serve')).filter((f) => /^open-.*\.html$/.test(f));
const codeIn = (html) => html.match(/#pair=([0-9a-f]{16}\.[0-9a-f]{64})/)[1];
function post(port, path, body, headers) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method: 'POST', path, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('launch opens a private redirect file: the opener argument never holds the pairing code', async () => {
  const home = library();
  const port = await freePort();
  const args = [];
  try {
    const result = await launch({ home, port, opener: (target) => args.push(target) });
    assert.equal(args.length, 1);
    const [file] = args;
    assert.match(file, /[\\/]\.serve[\\/]open-[0-9a-f]{16}\.html$/);
    assert.doesNotMatch(file, /[0-9a-f]{64}/, 'no secret in argv');
    assert.doesNotMatch(JSON.stringify(result), /#pair=|[0-9a-f]{16}\.[0-9a-f]{64}/, 'no code in what launch returns (and the CLI prints)');
    if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600);
    const html = readFileSync(file, 'utf8');
    const code = codeIn(html);
    assert.match(html, new RegExp(`location\\.replace\\("http://127\\.0\\.0\\.1:${port}/index\\.html#pair=${code.replace('.', '\\.')}"\\)`));
    assert.match(html, /<meta name="referrer" content="no-referrer">/);
    // The hub page redeems the code from the file's redirect; that removes the file.
    const res = await post(port, '/api/pair', JSON.stringify({ code }), {
      origin: `http://127.0.0.1:${port}`, 'content-type': 'application/json', [PAIR_HEADER]: '1', 'sec-fetch-site': 'same-origin',
    });
    assert.equal(res.status, 200, res.body);
    assert.ok(isDeviceToken(home, JSON.parse(res.body).token));
    assert.deepEqual(openFiles(home), [], 'the server deleted the redirect file once the code was used');
  } finally {
    await stop(home);
  }
});

test('stale redirect files are swept: by launch, and once their code expires or is gone', () => {
  const home = library();
  const live = createPairCode(home);
  const liveId = live.split('.')[0];
  writeFileSync(join(home, '.serve', `open-${liveId}.html`), 'x', { mode: 0o600 });
  writeFileSync(join(home, '.serve', 'open-0123456789abcdef.html'), 'x', { mode: 0o600 }); // no pair record left
  const old = join(home, '.serve', `open-${createPairCode(home).split('.')[0]}.html`);
  writeFileSync(old, 'x', { mode: 0o600 });
  const past = (Date.now() - PAIR_TTL_MS - 5000) / 1000;
  utimesSync(old, past, past);
  sweepOpenFiles(home);
  assert.deepEqual(openFiles(home), [`open-${liveId}.html`]);
  sweepOpenFiles(home, { now: () => Date.now() + PAIR_TTL_MS + 1000 });
  assert.deepEqual(openFiles(home), [], 'after the code expires, its file goes too');
});

test('redeeming, even with a wrong secret, removes the redirect file of that code', () => {
  const home = library();
  const code = createPairCode(home);
  const [id] = code.split('.');
  writeFileSync(join(home, '.serve', `open-${id}.html`), 'x', { mode: 0o600 });
  assert.throws(() => redeemPairCode(home, `${id}.${'0'.repeat(64)}`));
  assert.ok(!existsSync(join(home, '.serve', `open-${id}.html`)));
});

test('device tokens expire after deviceTokenDays, are refreshed on use, and forget-devices revokes them', () => {
  const home = library();
  writeConfig(home, { deviceTokenDays: 10 });
  let clock = Date.parse('2026-11-18T00:00:00Z');
  const now = () => clock;
  const token = redeemPairCode(home, createPairCode(home, { now }), { now });
  assert.ok(isDeviceToken(home, token, { now }));
  clock += 9 * DAY;
  assert.ok(isDeviceToken(home, token, { now }), 'used on day 9: still good, and refreshed');
  clock += 9 * DAY;
  assert.ok(isDeviceToken(home, token, { now }), 'day 18 is within 10 days of the last use');
  clock += 11 * DAY;
  assert.equal(isDeviceToken(home, token, { now }), false, 'unused for 11 days: expired');
  const fresh = redeemPairCode(home, createPairCode(home, { now }), { now });
  assert.ok(isDeviceToken(home, fresh, { now }));
  forgetDevices(home);
  assert.equal(isDeviceToken(home, fresh, { now }), false);
});

test('deviceTokenDays is a whole number of days from 1 to 365, 30 by default', async () => {
  const { CONFIG_DEFAULTS, validateConfig } = await import('../scripts/lib/config.mjs');
  assert.equal(CONFIG_DEFAULTS.deviceTokenDays, 30);
  assert.deepEqual(validateConfig({ ...CONFIG_DEFAULTS, deviceTokenDays: 365 }).errors, []);
  assert.match(validateConfig({ ...CONFIG_DEFAULTS, deviceTokenDays: 0 }).errors.join(), /deviceTokenDays/);
  assert.match(validateConfig({ ...CONFIG_DEFAULTS, deviceTokenDays: 1.5 }).errors.join(), /deviceTokenDays/);
});
