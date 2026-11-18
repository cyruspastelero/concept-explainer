import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notifyUser, openCommand, openLaunchFile, openPath } from '../scripts/lib/open.mjs';

const HOSTILE = 'C:\\Users\\a&calc^.exe|x\\index.html';

test('Windows opens with explorer.exe and never goes through cmd', () => {
  const { command, args } = openCommand('win32', HOSTILE);
  assert.equal(command, 'C:\\Windows\\System32\\explorer.exe');
  assert.deepEqual(args, [HOSTILE]);
  const calls = [];
  openPath(HOSTILE, { platform: 'win32', exec: (cmd, a) => calls.push([cmd, a]) });
  assert.deepEqual(calls, [['C:\\Windows\\System32\\explorer.exe', [HOSTILE]]]);
  assert.ok(calls.every(([cmd]) => !/cmd|powershell/i.test(cmd)));
});

test('explorer.exe exiting non-zero is not an error, but a missing program is', () => {
  const exitOne = () => { throw Object.assign(new Error('Command failed'), { status: 1 }); };
  assert.doesNotThrow(() => openPath('x.html', { platform: 'win32', exec: exitOne }));
  const missing = () => { throw Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }); };
  assert.throws(() => openPath('x.html', { platform: 'win32', exec: missing }), /open x\.html with C:\\Windows\\System32\\explorer\.exe/);
});

test('macOS and Linux use open and xdg-open, and report failures', () => {
  assert.equal(openCommand('darwin', 'a').command, 'open');
  assert.equal(openCommand('linux', 'a').command, 'xdg-open');
  const fail = () => { throw Object.assign(new Error('boom'), { status: 1 }); };
  assert.throws(() => openPath('a', { platform: 'linux', exec: fail }), /open a with xdg-open: boom/);
});

test('the path is made absolute first, so it can never read as an option', () => {
  const calls = [];
  openPath('-n --args evil.html', { platform: 'darwin', exec: (cmd, args) => calls.push(args) });
  assert.ok(calls[0][0].startsWith('/'), calls[0][0]);
  assert.ok(calls[0][0].endsWith('/-n --args evil.html'));
});

test('openLaunchFile opens only launch\'s redirect file, by absolute path, with no shell', () => {
  const calls = [];
  const exec = (command, args) => calls.push([command, ...args]);
  const file = '/home/u/.concept-explainer/.serve/open-0123456789abcdef.html';
  openLaunchFile(file, { platform: 'linux', exec, env: {} });
  assert.deepEqual(calls, [['xdg-open', file]]);
  for (const bad of ['relative/.serve/open-0123456789abcdef.html', '/tmp/evil.html', 'http://127.0.0.1:4747/index.html#pair=x', '/h/.serve/open-0123456789abcdef.html; rm -rf ~']) {
    assert.throws(() => openLaunchFile(bad, { platform: 'linux', exec, env: {} }), /refusing to open/, bad);
  }
  assert.equal(calls.length, 1);
});

test('Linux notification tools receive markup-safe paths', () => {
  const calls = [];
  notifyUser('bad path <dir>/file', {
    platform: 'linux',
    env: {},
    exec: (command, args) => { calls.push([command, args]); },
  });
  assert.deepEqual(calls[0], ['notify-send', ['Concept Explainer', 'bad path &lt;dir&gt;/file']]);
});
