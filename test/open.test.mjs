import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openCommand, openPath } from '../scripts/lib/open.mjs';

const HOSTILE = 'C:\\Users\\a&calc^.exe|x\\index.html';

test('Windows opens with explorer.exe and never goes through cmd', () => {
  const { command, args } = openCommand('win32', HOSTILE);
  assert.equal(command, 'explorer.exe');
  assert.deepEqual(args, [HOSTILE]);
  const calls = [];
  openPath(HOSTILE, { platform: 'win32', exec: (cmd, a) => calls.push([cmd, a]) });
  assert.deepEqual(calls, [['explorer.exe', [HOSTILE]]]);
  assert.ok(calls.every(([cmd]) => !/cmd|powershell/i.test(cmd)));
});

test('explorer.exe exiting non-zero is not an error, but a missing program is', () => {
  const exitOne = () => { throw Object.assign(new Error('Command failed'), { status: 1 }); };
  assert.doesNotThrow(() => openPath('x.html', { platform: 'win32', exec: exitOne }));
  const missing = () => { throw Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }); };
  assert.throws(() => openPath('x.html', { platform: 'win32', exec: missing }), /open x\.html with explorer\.exe/);
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
