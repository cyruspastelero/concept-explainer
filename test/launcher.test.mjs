import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  BUNDLE_ID, POWERSHELL_SCRIPT, desktopExec, hasOtherLoginAccounts, installLauncher, shQuote, uninstallLauncher, windowsSystemPath,
} from '../scripts/lib/launcher.mjs';
import { readConfig } from '../scripts/lib/library.mjs';

// Paths with every character that breaks naive quoting.
const TRICKY = "it's $HOME 100% \"real\" `x`";

function setup({ safe = process.platform === 'win32' } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'rx-launcher-')));
  const odd = join(root, safe ? 'plain-folder' : TRICKY);
  mkdirSync(odd, { recursive: true });
  const home = join(odd, 'home');
  const binPath = join(odd, 'bin', 'concept-explainer.mjs');
  mkdirSync(join(odd, 'bin'), { recursive: true });
  writeFileSync(binPath, '// stand-in bin\n');
  // A fake node that writes its argv, one per line, so quoting is checked for real.
  const argsOut = join(root, 'args.txt');
  const nodePath = join(odd, 'node');
  writeFileSync(nodePath, `#!/bin/sh\nfor a in "$@"; do printf '%s\\n' "$a"; done > '${argsOut.replace(/'/g, "'\\''")}'\n`);
  chmodSync(nodePath, 0o755);
  return { root, home, binPath, nodePath, argsOut, target: join(root, 'target dir') };
}

const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

test('shQuote and desktopExec quote every hostile character', () => {
  assert.equal(shQuote("a'b"), "'a'\\''b'");
  const exec = desktopExec(['/a b/node', '/x/$y%z"q`w\\v', 'launch']);
  assert.equal(exec, '"/a b/node" "/x/\\\\$y%%z\\\\"q\\\\`w\\\\\\\\v" "launch"');
  assert.throws(() => desktopExec(['/a\nb']), /control character/);
});

test('macOS: an app bundle with our bundle id, a 0755 script that passes paths exactly', { skip: process.platform === 'win32' }, () => {
  const s = setup();
  const commands = [];
  const result = installLauncher({
    home: s.home, platform: 'darwin', targetDir: s.target, nodePath: s.nodePath, binPath: s.binPath,
    run: (command, args) => commands.push({ command, args }),
  });
  const app = join(s.target, 'Concept Explainer.app');
  const plist = readFileSync(join(app, 'Contents', 'Info.plist'), 'utf8');
  assert.match(plist, new RegExp(`<key>CFBundleIdentifier</key>\\s*<string>${BUNDLE_ID.replace(/\./g, '\\.')}</string>`));
  assert.match(plist, /<key>LSUIElement<\/key>\s*<true\/>/);
  assert.match(plist, /<key>CFBundleExecutable<\/key>\s*<string>concept-explainer<\/string>/);
  if (process.platform === 'darwin') execFileSync('plutil', ['-lint', join(app, 'Contents', 'Info.plist')]);
  const script = join(app, 'Contents', 'MacOS', 'concept-explainer');
  assert.equal(statSync(script).mode & 0o777, 0o755);
  execFileSync('sh', ['-n', script]);
  execFileSync(script);
  assert.deepEqual(readFileSync(s.argsOut, 'utf8').trimEnd().split('\n'), [s.binPath, 'launch', '--home', s.home]);
  assert.match(result.warnings.join(' '), /icon/, 'a failed icon is a warning, not an error');
  assert.ok(!existsSync(join(app, 'Contents', 'Resources', 'AppIcon.icns')));
  const iconutil = commands.find(({ command }) => command === 'iconutil');
  assert.ok(iconutil);
  assert.ok(!existsSync(dirname(iconutil.args[4])), 'temporary icon folder is cleaned up');
});

test('macOS: the script shows an alert and stops when node or the CLI moved', { skip: process.platform === 'win32' }, () => {
  const s = setup();
  installLauncher({ home: s.home, platform: 'darwin', targetDir: s.target, nodePath: s.nodePath, binPath: s.binPath, run: () => {} });
  const script = readFileSync(join(s.target, 'Concept Explainer.app', 'Contents', 'MacOS', 'concept-explainer'), 'utf8');
  assert.match(script, /if \[ ! -x "\$NODE" \] \|\| \[ ! -f "\$BIN" \]; then/);
  assert.match(script, /\/usr\/bin\/osascript -e 'display alert/);
  assert.match(script, /install --launcher/);
});

test('Linux: a desktop entry with spec quoting and a 512 px icon', () => {
  const s = setup();
  const calls = [];
  installLauncher({ home: s.home, platform: 'linux', targetDir: s.target, nodePath: s.nodePath, binPath: s.binPath, run: (cmd, args) => calls.push([cmd, args]) });
  const desktop = readFileSync(join(s.target, 'applications', 'concept-explainer.desktop'), 'utf8');
  assert.match(desktop, /^\[Desktop Entry\]\nType=Application\nName=Concept Explainer\n/);
  assert.ok(desktop.includes(`Exec=${desktopExec([s.nodePath, s.binPath, 'launch', '--home', s.home])}\n`));
  assert.match(desktop, /\nTerminal=false\n/);
  assert.ok(existsSync(join(s.target, 'icons', 'hicolor', '512x512', 'apps', 'concept-explainer.png')));
  assert.deepEqual(calls, [['update-desktop-database', [join(s.target, 'applications')]]]);
});

test('Windows: a Start Menu shortcut made by a constant PowerShell script, paths only in env', () => {
  const s = setup({ safe: true });
  const calls = [];
  installLauncher({
    home: s.home, platform: 'win32', targetDir: s.target, nodePath: s.nodePath, binPath: s.binPath,
    env: { LOCALAPPDATA: join(s.root, 'local') }, run: (cmd, args, opts) => calls.push({ cmd, args, env: opts.env }),
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, windowsSystemPath('powershell'));
  assert.deepEqual(calls[0].args, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', POWERSHELL_SCRIPT]);
  [s.nodePath, s.binPath, s.home].forEach((p) => assert.ok(!POWERSHELL_SCRIPT.includes(p)));
  assert.equal(calls[0].env.CE_LNK, join(s.target, 'Concept Explainer.lnk'));
  assert.equal(calls[0].env.CE_NODE, s.nodePath);
  assert.equal(calls[0].env.CE_ARGS, `"${s.binPath}" launch --home "${s.home}"`);
  assert.equal(calls[0].env.CE_ICON, join(s.root, 'local', 'concept-explainer', 'icon.ico'));
  assert.ok(existsSync(join(s.root, 'local', 'concept-explainer', 'icon.ico')));
});

test('Windows: if PowerShell fails, install stops, writes no .cmd and records nothing', () => {
  const s = setup({ safe: true });
  assert.throws(() => installLauncher({
    home: s.home, platform: 'win32', targetDir: s.target, nodePath: s.nodePath, binPath: s.binPath,
    env: { LOCALAPPDATA: join(s.root, 'local') }, run: () => { throw new Error('denied'); },
  }), /PowerShell could not create the shortcut: denied/);
  assert.ok(!existsSync(join(s.target, 'Concept Explainer.cmd')));
  assert.ok(!existsSync(join(s.home, '.serve', 'launcher.json')));
});

test('every written path and its hash are recorded, privately; installing again is a no-op', () => {
  const s = setup();
  installLauncher({ home: s.home, platform: 'linux', targetDir: s.target, nodePath: s.nodePath, binPath: s.binPath, run: () => {} });
  const recordPath = join(s.home, '.serve', 'launcher.json');
  if (process.platform !== 'win32') assert.equal(statSync(recordPath).mode & 0o777, 0o600);
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.equal(record.files.length, 2);
  record.files.forEach((f) => assert.equal(f.sha256, sha(f.path)));
  assert.equal(record.nodePath, s.nodePath);
  installLauncher({ home: s.home, platform: 'linux', targetDir: s.target, nodePath: s.nodePath, binPath: s.binPath, run: () => {} });
  assert.deepEqual(readdirSync(join(s.target, 'applications')), ['concept-explainer.desktop']);
});

test('a file we did not write is never replaced without --force, which keeps a .bak', () => {
  const s = setup();
  const desktop = join(s.target, 'applications', 'concept-explainer.desktop');
  mkdirSync(join(s.target, 'applications'), { recursive: true });
  writeFileSync(desktop, 'someone else\n');
  const opts = { home: s.home, platform: 'linux', targetDir: s.target, nodePath: s.nodePath, binPath: s.binPath, run: () => {} };
  assert.throws(() => installLauncher(opts), /was not written by this launcher.*--force/s);
  assert.equal(readFileSync(desktop, 'utf8'), 'someone else\n');
  installLauncher({ ...opts, force: true });
  assert.equal(readFileSync(`${desktop}.bak`, 'utf8'), 'someone else\n');
});

test('an app bundle with another bundle id is refused', { skip: process.platform === 'win32' }, () => {
  const s = setup();
  const contents = join(s.target, 'Concept Explainer.app', 'Contents');
  mkdirSync(contents, { recursive: true });
  writeFileSync(join(contents, 'Info.plist'), '<plist><dict><key>CFBundleIdentifier</key><string>com.other.app</string></dict></plist>');
  assert.throws(() => installLauncher({ home: s.home, platform: 'darwin', targetDir: s.target, nodePath: s.nodePath, binPath: s.binPath, run: () => {} }), /not this launcher's app/);
});

test('uninstall removes exactly the recorded files whose hash still matches', () => {
  const s = setup();
  installLauncher({ home: s.home, platform: 'linux', targetDir: s.target, nodePath: s.nodePath, binPath: s.binPath, run: () => {} });
  writeFileSync(join(s.target, 'applications', 'unrelated.desktop'), 'keep me');
  const icon = join(s.target, 'icons', 'hicolor', '512x512', 'apps', 'concept-explainer.png');
  writeFileSync(icon, 'edited by the user');
  const result = uninstallLauncher({ home: s.home });
  assert.ok(!existsSync(join(s.target, 'applications', 'concept-explainer.desktop')));
  assert.ok(existsSync(join(s.target, 'applications', 'unrelated.desktop')));
  assert.ok(existsSync(icon), 'a changed file is left');
  assert.ok(result.kept.includes(icon));
  assert.ok(!existsSync(join(s.home, '.serve', 'launcher.json')));
  assert.throws(() => uninstallLauncher({ home: s.home }), /no launcher is installed/);
});

test('uninstall keeps un-fingerprinted and unexpected recorded paths', () => {
  const s = setup();
  installLauncher({ home: s.home, platform: 'linux', targetDir: s.target, nodePath: s.nodePath, binPath: s.binPath, run: () => {} });
  const outside = join(s.root, 'not-ours.txt');
  writeFileSync(outside, 'keep');
  const unexpected = join(s.root, 'other.txt');
  writeFileSync(unexpected, 'also keep');
  const recordPath = join(s.home, '.serve', 'launcher.json');
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  record.files.push({ path: outside, sha256: null });
  record.files.push({ path: unexpected, sha256: 'a'.repeat(64) });
  writeFileSync(recordPath, JSON.stringify(record));
  const result = uninstallLauncher({ home: s.home });
  assert.ok(existsSync(outside), 'a path without a fingerprint is kept');
  assert.ok(result.kept.includes(outside));
  assert.ok(result.kept.includes(unexpected), 'a path outside the launcher folders is kept');
});

test('shared profiles default the PWA off; --pwa opts in and repeats the warning', () => {
  const s = setup();
  const accounts = join(s.root, 'accounts');
  mkdirSync(join(accounts, 'current'), { recursive: true });
  mkdirSync(join(accounts, 'other'), { recursive: true });
  const opts = {
    home: s.home, platform: 'darwin', targetDir: s.target, nodePath: s.nodePath, binPath: s.binPath,
    homeDir: join(accounts, 'current'), sharedMachine: true, run: () => {},
  };
  const off = installLauncher(opts);
  assert.equal(readConfig(s.home).pwa, false);
  assert.match(off.warnings.join(' '), /off.*--pwa/);
  const on = installLauncher({ ...opts, pwa: true, force: true });
  assert.equal(readConfig(s.home).pwa, true);
  assert.match(on.warnings.join(' '), /--pwa enables/);
});

test('other profile detection ignores the current account and system profiles', () => {
  const root = mkdtempSync(join(tmpdir(), 'rx-profiles-'));
  mkdirSync(join(root, 'current'));
  mkdirSync(join(root, 'Shared'));
  assert.equal(hasOtherLoginAccounts({ platform: 'darwin', homeDir: join(root, 'current'), roots: [root] }), false);
  mkdirSync(join(root, 'someone-else'));
  assert.equal(hasOtherLoginAccounts({ platform: 'darwin', homeDir: join(root, 'current'), roots: [root] }), true);
});

test('Windows refuses paths with shell and command separators', () => {
  const s = setup();
  const unsafe = join(s.root, 'unsafe&folder');
  mkdirSync(unsafe);
  assert.throws(() => installLauncher({
    home: s.home, platform: 'win32', targetDir: unsafe, nodePath: s.nodePath, binPath: s.binPath,
    env: { LOCALAPPDATA: join(s.root, 'local') }, run: () => {},
  }), /risky Windows character/);
});

test('a node from a version manager folder gets a warning that suggests --node', () => {
  const s = setup();
  const managed = join(s.root, '.local', 'share', 'mise', 'installs', 'node', '22.1.0', 'bin');
  mkdirSync(managed, { recursive: true });
  const node = join(managed, 'node');
  writeFileSync(node, '#!/bin/sh\n');
  chmodSync(node, 0o755);
  const result = installLauncher({ home: s.home, platform: 'linux', targetDir: s.target, nodePath: node, binPath: s.binPath, run: () => {} });
  assert.match(result.warnings.join(' '), /version manager.*--node/s);
});
