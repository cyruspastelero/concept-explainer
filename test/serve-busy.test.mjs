import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startLibraryServer, TOKEN_HEADER } from '../scripts/lib/serve.mjs';
import { publishExplainer } from '../scripts/lib/library.mjs';
import { BUNDLE_FORMAT } from '../scripts/lib/bundle.mjs';

// A file:// URL, not a path: on Windows an import of "D:\\..." is refused.
const LIBRARY = new URL('../scripts/lib/library.mjs', import.meta.url).href;
const example = JSON.parse(readFileSync(new URL('../examples/concept-idempotency-keys.explainer.json', import.meta.url), 'utf8'));
const taskflow = JSON.parse(readFileSync(new URL('../examples/taskflow.explainer.json', import.meta.url), 'utf8'));
const pause = (ms) => new Promise((done) => { setTimeout(done, ms); });

// Another process takes the library lock and holds it for `ms`.
async function holdLock(home, ms) {
  const code = `
    import { withLibraryLock } from ${JSON.stringify(LIBRARY)};
    const nap = new Int32Array(new SharedArrayBuffer(4));
    withLibraryLock(${JSON.stringify(home)}, () => { console.log('held'); Atomics.wait(nap, 0, 0, ${ms}); });`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const exited = new Promise((done) => child.on('exit', done));
  // Fail, never hang, when the child dies before it holds the lock.
  await new Promise((done, fail) => {
    child.stdout.once('data', done);
    child.once('exit', (status) => fail(new Error(`lock holder exited (${status}) before taking the lock: ${stderr}`)));
  });
  return { exited };
}

function send(port, { method = 'GET', path, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data, at: Date.now() }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

test('a write while another process holds the lock gets 503, and the server keeps serving meanwhile', async () => {
  const home = mkdtempSync(join(tmpdir(), 'rx-serve-busy-'));
  publishExplainer(taskflow, { home });
  const served = await startLibraryServer({ home, port: 0, lockWaitMs: 400 });
  try {
    const { exited } = await holdLock(home, 1500);
    const writeHeaders = { origin: `http://127.0.0.1:${served.port}`, 'content-type': 'application/json', [TOKEN_HEADER]: served.token };
    const bundle = JSON.stringify({ format: BUNDLE_FORMAT, version: 1, exportedAt: 't', explainers: [{ slug: 'k', data: example }] });
    const started = Date.now();
    const importing = send(served.port, { method: 'POST', path: '/api/import', headers: writeHeaders, body: bundle });
    const saving = send(served.port, { method: 'POST', path: '/api/config', headers: writeHeaders, body: JSON.stringify({ style: 'playful' }) });
    await pause(100);
    const page = await send(served.port, { path: '/index.html' });
    const [imported, saved] = await Promise.all([importing, saving]);
    assert.equal(page.status, 200);
    assert.ok(page.at < imported.at, 'a page is served while the write waits for the lock');
    assert.equal(imported.status, 503);
    assert.deepEqual(JSON.parse(imported.body), { error: 'library is busy' });
    assert.equal(saved.status, 503);
    assert.ok(imported.at - started < 1400, 'the write gives up after the short wait, not the CLI timeout');
    await exited;
    const retried = await send(served.port, { method: 'POST', path: '/api/import', headers: writeHeaders, body: bundle });
    assert.equal(retried.status, 200);
    assert.equal(JSON.parse(retried.body).summary.added.length, 1);
  } finally {
    await served.close();
  }
});
