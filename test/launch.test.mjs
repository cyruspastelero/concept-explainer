import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { createServer as createHttp } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch } from '../scripts/lib/launch.mjs';
import { fetchHealth, readServerState } from '../scripts/lib/serve-state.mjs';
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

function stop(home) {
  const state = readServerState(home);
  if (state) try { process.kill(state.pid); } catch { /* gone */ }
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
    assert.match(opened[0], new RegExp(`^http://127\\.0\\.0\\.1:${port}/index\\.html#pair=[0-9a-f]{16}\\.[0-9a-f]{64}$`));
    const second = await launch({ home, port, opener: (url) => opened.push(url) });
    assert.equal(second.started, false, 'a running server is reused');
    assert.equal(readServerState(home).instance, state.instance);
    assert.notEqual(opened[1], opened[0], 'every launch gets a fresh code');
    const log = join(home, '.serve', 'serve.log');
    assert.ok(existsSync(log));
    assert.equal(statSync(log).mode & 0o777, 0o600);
  } finally {
    stop(home);
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
    stop(home);
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
    stop(home);
  }
});

test('a stale server.json (dead pid) is not trusted, and a foreign server is never taken over', async () => {
  const home = library();
  const port = await freePort();
  mkdirSync(join(home, '.serve'), { recursive: true });
  writeFileSync(join(home, '.serve', 'server.json'), JSON.stringify({ pid: 2147483646, port, instance: 'old', version: '0', startedAt: 't' }));
  const foreign = createHttp((req, res) => { res.writeHead(200); res.end('{"app":"not-us"}'); });
  await new Promise((r) => foreign.listen(port, '127.0.0.1', r));
  const fallback = await freePort();
  try {
    const result = await launch({ home, port, fallbackPorts: [fallback], opener: () => {} });
    assert.equal(result.started, true);
    assert.equal(result.port, fallback);
    assert.match(result.warning, /installed app/);
  } finally {
    foreign.close();
    stop(home);
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
  const fallback = await freePort();
  const opened = [];
  try {
    const result = await launch({ home, port, fallbackPorts: [fallback], opener: (url) => opened.push(url) });
    assert.equal(result.port, fallback);
    assert.match(result.warning, /installed app only works on/);
    assert.ok(opened[0].startsWith(`http://127.0.0.1:${fallback}/`));
    assert.ok(seen.every((u) => !/pair/.test(u)), 'nothing secret reached the impostor');
  } finally {
    impostor.close();
    stop(home);
  }
});
