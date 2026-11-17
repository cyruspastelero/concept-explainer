import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withLibraryLock } from '../scripts/lib/library.mjs';

const LIBRARY = fileURLToPath(new URL('../scripts/lib/library.mjs', import.meta.url));
const freshHome = () => join(mkdtempSync(join(tmpdir(), 'rx-lock-')), 'home');

// A child that takes the lock, logs enter, holds it a moment, logs exit.
function holder(home, log, tag) {
  const code = `
    import { withLibraryLock } from ${JSON.stringify(LIBRARY)};
    import { appendFileSync } from 'node:fs';
    const nap = new Int32Array(new SharedArrayBuffer(4));
    withLibraryLock(${JSON.stringify(home)}, () => {
      appendFileSync(${JSON.stringify(log)}, 'enter ${tag}\\n');
      Atomics.wait(nap, 0, 0, 150);
      appendFileSync(${JSON.stringify(log)}, 'exit ${tag}\\n');
    }, 10000);`;
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (c) => { err += c; });
    child.on('exit', (status) => (status === 0 ? done() : fail(new Error(`child ${tag} failed: ${err}`))));
  });
}

test('two processes clearing the same dead lock never hold it at once', async () => {
  for (let round = 0; round < 3; round += 1) {
    const home = freshHome();
    mkdirSync(join(home, '.lock'), { recursive: true });
    writeFileSync(join(home, '.lock', 'owner'), '2147483646:deadbeefdeadbeef');
    const log = join(home, '..', 'log.txt');
    writeFileSync(log, '');
    await Promise.all([holder(home, log, 'a'), holder(home, log, 'b'), holder(home, log, 'c')]);
    const lines = readFileSync(log, 'utf8').trim().split('\n');
    assert.equal(lines.length, 6);
    for (let i = 0; i < lines.length; i += 2) {
      const tag = lines[i].split(' ')[1];
      assert.deepEqual([lines[i], lines[i + 1]], [`enter ${tag}`, `exit ${tag}`], `round ${round}: overlapping holders: ${lines.join(', ')}`);
    }
    assert.ok(!existsSync(join(home, '.lock')), 'the lock is released');
    assert.deepEqual(readdirSync(home).filter((f) => f.startsWith('.lock')), [], 'no tombstones left behind');
  }
});

test('a holder never removes a lock that is no longer its own', () => {
  const home = freshHome();
  withLibraryLock(home, () => {
    // Someone cleared ours by mistake and took the lock; our release must leave theirs.
    const owner = join(home, '.lock', 'owner');
    assert.match(readFileSync(owner, 'utf8'), new RegExp(`^${process.pid}:[0-9a-f]{16}$`));
    writeFileSync(owner, `${process.pid}:0123456789abcdef`);
  });
  assert.ok(existsSync(join(home, '.lock')), 'a lock holding another nonce stays');
});

test('an old lock in the pid-only format is still understood', () => {
  const home = freshHome();
  mkdirSync(join(home, '.lock'), { recursive: true });
  writeFileSync(join(home, '.lock', 'pid'), '2147483646');
  assert.equal(withLibraryLock(home, () => 'ran', 2000), 'ran');
});
