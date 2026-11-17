import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { createServer as createHttp } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch } from '../scripts/lib/launch.mjs';
import { fetchHealth, readServerState, verifyServer } from '../scripts/lib/serve-state.mjs';
import { publishExplainer } from '../scripts/lib/library.mjs';

const example = JSON.parse(readFileSync(new URL('../examples/taskflow.explainer.json', import.meta.url), 'utf8'));

function freePort() {
  return new Promise((done) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => done(port)); });
  });
}

function library() {
  const home = join(mkdtempSync(join(tmpdir(), 'rx-launch-')), 'home');
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

test('launch starts one detached server, waits for health, pairs and opens the hub', async () => {
  const home = library();
  const port = await freePort();
  const opened = [];
  try {
    const first = await launch({ home, port, opener: (url) => opened.push(url) });
    assert.equal(first.started, true);
    const state = readServerState(home);
    assert.equal(state.port, port);
    assert.notEqual(state.pid, process.pid, 'the server runs in its own process');
    assert.equal(state.idleMinutes, 30, 'a launched server stops when idle');
    assert.equal((await fetchHealth(port)).instance, state.instance);
    // The opener gets launch's private redirect file; the code is inside it, not in argv.
    assert.match(readFileSync(opened[0], 'utf8'), new RegExp(`http://127\\.0\\.0\\.1:${port}/index\\.html#pair=[0-9a-f]{16}\\.[0-9a-f]{64}`));
    const second = await launch({ home, port, opener: (url) => opened.push(url) });
    assert.equal(second.started, false, 'a running server is reused');
    assert.equal(readServerState(home).instance, state.instance);
    assert.notEqual(opened[1], opened[0], 'every launch gets a fresh code');
    const log = join(home, '.serve', 'serve.log');
    assert.ok(existsSync(log));
    assert.equal(statSync(log).mode & 0o777, 0o600);
  } finally {
    await stop(home);
  }
});

test('two launches at once start one server', async () => {
  const home = library();
  const port = await freePort();
  try {
    const [a, b] = await Promise.all([launch({ home, port, opener: () => {} }), launch({ home, port, opener: () => {} })]);
    assert.equal([a, b].filter((r) => r.started).length, 1);
    assert.equal(a.port, b.port);
  } finally {
    await stop(home);
  }
});

test('a start lock left by a dead process is cleared', async () => {
  const home = library();
  const port = await freePort();
  mkdirSync(join(home, '.serve', 'start.lock'), { recursive: true });
  writeFileSync(join(home, '.serve', 'start.lock', 'pid'), '2147483646');
  try {
    const result = await launch({ home, port, opener: () => {} });
    assert.equal(result.started, true);
    assert.ok(!existsSync(join(home, '.serve', 'start.lock')));
  } finally {
    await stop(home);
  }
});

test('a stale server.json (dead pid) is not trusted, and a foreign server on our port is refused, not worked around', async () => {
  const home = library();
  const port = await freePort();
  mkdirSync(join(home, '.serve'), { recursive: true });
  writeFileSync(join(home, '.serve', 'server.json'), JSON.stringify({ pid: 2147483646, port, instance: 'old', version: '0', startedAt: 't' }));
  const foreign = createHttp((req, res) => { res.writeHead(200); res.end('{"app":"not-us"}'); });
  await new Promise((r) => foreign.listen(port, '127.0.0.1', r));
  const opened = [];
  try {
    await assert.rejects(launch({ home, port, opener: (f) => opened.push(f) }), /cannot prove it is this library's server[\s\S]*library serve --new-port[\s\S]*reinstall the installed app/);
    assert.deepEqual(opened, [], 'nothing was opened');
  } finally {
    foreign.close();
    await stop(home);
  }
});

test('an impostor answering our fingerprint on the app port gets no pairing code', async () => {
  const home = library();
  const port = await freePort();
  const seen = [];
  const impostor = createHttp((req, res) => {
    seen.push(req.url);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ app: 'concept-explainer', version: '0.3.0', instance: 'fake', proof: 'f'.repeat(64) }));
  });
  await new Promise((r) => impostor.listen(port, '127.0.0.1', r));
  // Even a server.json pointing at that port (say, a crashed real server) proves nothing without the secret.
  mkdirSync(join(home, '.serve'), { recursive: true });
  writeFileSync(join(home, '.serve', 'server.json'), JSON.stringify({ pid: process.pid, port, instance: 'fake', secret: 'b'.repeat(64), version: '0', startedAt: 't' }));
  const opened = [];
  try {
    await assert.rejects(launch({ home, port, opener: (f) => opened.push(f) }), /library serve --new-port/);
    assert.deepEqual(opened, []);
    assert.ok(seen.every((u) => !/pair/.test(u)), 'nothing secret reached the impostor');
  } finally {
    impostor.close();
    await stop(home);
  }
});

test('the first launch picks a random port from 20000 to 60999 and keeps it in config.json', async () => {
  const { readConfig } = await import('../scripts/lib/library.mjs');
  const home = library();
  assert.equal(readConfig(home).servePort, null, 'no port until one is needed');
  try {
    const first = await launch({ home, opener: () => {} });
    assert.ok(first.port >= 20000 && first.port <= 60999, String(first.port));
    assert.equal(readConfig(home).servePort, first.port);
    const again = await launch({ home, opener: () => {} });
    assert.equal(again.port, first.port, 'the same origin every time');
  } finally {
    await stop(home);
  }
});
