import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installLauncher, uninstallLauncherAsync } from '../scripts/lib/launcher.mjs';
import { fetchHealth, readServerState, verifyServer } from '../scripts/lib/serve-state.mjs';
import { publishExplainer, writeConfig } from '../scripts/lib/library.mjs';

// A real click: install the macOS app into a temp folder (never ~/Applications),
// run the bundle's own executable as Finder would, and follow it to an open hub.
const example = JSON.parse(readFileSync(new URL('../examples/taskflow.explainer.json', import.meta.url), 'utf8'));

const freePort = () => new Promise((done) => {
  const s = createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => done(port)); });
});

const get = (port, path, headers = {}, method = 'GET', body) => new Promise((resolve, reject) => {
  const req = request({ host: '127.0.0.1', port, path, method, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
    let data = '';
    res.on('data', (c) => { data += c; });
    res.on('end', () => resolve({ status: res.statusCode, body: data }));
  });
  req.on('error', reject);
  if (body) req.write(body);
  req.end();
});

test('clicking the installed macOS app starts the server, pairs and opens the hub', { skip: process.platform !== 'darwin', timeout: 60000 }, async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'rx-click-')));
  const home = join(root, 'library home');
  publishExplainer(example, { home });
  const port = await freePort();
  writeConfig(home, { servePort: port });
  const result = installLauncher({ home, platform: 'darwin', targetDir: join(root, 'Applications'), version: '0.3.0' });
  const app = join(root, 'Applications', 'Concept Explainer.app');
  assert.ok(existsSync(join(app, 'Contents', 'Resources', 'AppIcon.icns')), `icon: ${result.warnings.join(' ')}`);
  const opened = join(root, 'opened.txt');
  const opener = join(root, 'opener.sh');
  writeFileSync(opener, `#!/bin/sh\nprintf '%s' "$1" > '${opened}'\n`);
  chmodSync(opener, 0o755);
  try {
    execFileSync(join(app, 'Contents', 'MacOS', 'concept-explainer'), { env: { ...process.env, CONCEPT_EXPLAINER_OPENER: opener }, timeout: 20000 });
    const file = readFileSync(opened, 'utf8');
    assert.match(file, /[\\/]\.serve[\\/]open-[0-9a-f]{16}\.html$/, 'the browser is handed a private file, never a URL with the code');
    const match = readFileSync(file, 'utf8').match(new RegExp(`"http://127\\.0\\.0\\.1:${port}/index\\.html#pair=([0-9a-f]{16}\\.[0-9a-f]{64})"`));
    assert.ok(match, file);
    const state = readServerState(home);
    assert.equal(state.launched, true);
    assert.equal(state.idleMinutes, 30);
    assert.ok(await verifyServer(home, port), 'the server proves it is ours');
    const hub = await get(port, '/index.html');
    assert.equal(hub.status, 200);
    assert.match(hub.body, /Explainer library/);
    const paired = await get(port, '/api/pair', {
      origin: `http://127.0.0.1:${port}`, 'content-type': 'application/json', 'x-concept-explainer-pair': '1', 'sec-fetch-site': 'same-origin',
    }, 'POST', JSON.stringify({ code: match[1] }));
    assert.equal(paired.status, 200, paired.body);
    const { token } = JSON.parse(paired.body);
    assert.equal((await get(port, '/api/config', { 'x-concept-explainer-token': token })).status, 200, 'the paired page can read settings');
  } finally {
    const removed = await uninstallLauncherAsync({ home });
    assert.equal(removed.stopped, true, 'uninstall stops the server the launcher started');
    for (let i = 0; i < 50 && await fetchHealth(port, { timeoutMs: 200 }); i += 1) await new Promise((r) => setTimeout(r, 100));
    assert.equal(await fetchHealth(port, { timeoutMs: 200 }), null);
    assert.ok(!existsSync(app), 'the app bundle is gone');
  }
});
