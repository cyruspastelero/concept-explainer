import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishExplainer, rebuildLibrary, writeConfig, withLibraryLock, libraryPaths } from '../scripts/lib/library.mjs';

const example = JSON.parse(readFileSync(new URL('../examples/taskflow.explainer.json', import.meta.url), 'utf8'));
const mode = (path) => statSync(path).mode & 0o777;
const freshHome = () => join(mkdtempSync(join(tmpdir(), 'rx-safe-')), 'home');
// Windows has no POSIX permission bits; its user profile folder keeps files private.
const posixModes = { skip: process.platform === 'win32' && 'no POSIX file modes on Windows' };

test('the library is private: folders 0700, files 0600', posixModes, () => {
  const home = freshHome();
  const { pagePath } = publishExplainer(example, { home });
  writeConfig(home, { audience: 'expert' });
  assert.equal(mode(home), 0o700);
  assert.equal(mode(join(home, 'explainers')), 0o700);
  [libraryPaths(home).manifest, libraryPaths(home).config, libraryPaths(home).hub, pagePath, join(home, 'explainers', 'acme-taskflow', 'explainer.json')]
    .forEach((file) => assert.equal(mode(file), 0o600, file));
});

test('an existing home made with looser permissions is tightened on write', posixModes, () => {
  const home = freshHome();
  mkdirSync(home, { mode: 0o755 });
  publishExplainer(example, { home });
  assert.equal(mode(home), 0o700);
});

test('writes wait for the library lock, and a live holder makes them fail clearly', async () => {
  const home = freshHome();
  publishExplainer(example, { home });
  const holder = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 5000)']);
  try {
    mkdirSync(join(home, '.lock'));
    writeFileSync(join(home, '.lock', 'pid'), String(holder.pid));
    assert.throws(() => publishExplainer(example, { home, lockTimeoutMs: 300 }), /library is busy: .* held by pid \d+/);
    assert.throws(() => writeConfig(home, { audience: 'expert' }, { lockTimeoutMs: 300 }), /library is busy/);
  } finally {
    holder.kill();
  }
});

test('a lock left by a dead process is cleared, and the lock is released after each write', () => {
  const home = freshHome();
  publishExplainer(example, { home });
  mkdirSync(join(home, '.lock'));
  writeFileSync(join(home, '.lock', 'pid'), '2147483646');
  publishExplainer(example, { home, lockTimeoutMs: 300 });
  assert.ok(!existsSync(join(home, '.lock')));
  rebuildLibrary({ home });
  assert.ok(!existsSync(join(home, '.lock')));
});

test('the lock is reentrant within one process', () => {
  const home = freshHome();
  const result = withLibraryLock(home, () => withLibraryLock(home, () => publishExplainer(example, { home }).slug));
  assert.equal(result, 'acme-taskflow');
  assert.ok(!existsSync(join(home, '.lock')));
});
