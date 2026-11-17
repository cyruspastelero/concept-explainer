// `install --launcher` / `uninstall --launcher`: an app icon that runs
// `concept-explainer launch`. GUI apps get no shell PATH, so the absolute node
// and CLI paths are baked in at install time. Every file written is recorded
// with its sha256 in <home>/.serve/launcher.json; uninstall removes only
// those, and only while unchanged. No shell is ever involved in writing them.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, rmdirSync, writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureServeDir, serveDir } from './pairing.mjs';
import { readServerState, verifyServer } from './serve-state.mjs';
import { writeAtomic } from './library.mjs';
import { BIN_PATH } from './launch.mjs';

export const BUNDLE_ID = 'io.github.cyvid7-darus10.concept-explainer';
export const APP_NAME = 'Concept Explainer';
const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'app');
const VERSION_MANAGERS = /[\\/](\.?mise|\.nvm|\.fnm|fnm|\.volta|\.asdf|\.nodenv|n[\\/]versions)[\\/]/;
const CONTROL = /[\u0000-\u001f\u007f]/;

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** One argument for /bin/sh, single-quoted. */
export function shQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

/**
 * An Exec= value per the Desktop Entry spec: each argument double-quoted with
 * " ` $ \ escaped, % doubled, then backslashes escaped again for the string.
 */
export function desktopExec(args) {
  return args.map((arg) => {
    if (CONTROL.test(arg)) throw new Error(`install --launcher: a path contains a control character: ${JSON.stringify(arg)}`);
    const quoted = `"${String(arg).replace(/(["`$\\])/g, '\\$1').replace(/%/g, '%%')}"`;
    return quoted.replace(/\\/g, '\\\\');
  }).join(' ');
}

// The PowerShell that makes the shortcut. Constant: every path arrives in an
// environment variable, so nothing from a path is ever parsed as code.
export const POWERSHELL_SCRIPT = [
  '$ErrorActionPreference = "Stop"',
  '$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:CE_LNK)',
  '$s.TargetPath = $env:CE_NODE',
  '$s.Arguments = $env:CE_ARGS',
  '$s.IconLocation = $env:CE_ICON',
  '$s.WindowStyle = 7',
  '$s.Save()',
].join('; ');

const xml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function infoPlist(version) {
  const entries = {
    CFBundleIdentifier: BUNDLE_ID, CFBundleName: APP_NAME, CFBundleDisplayName: APP_NAME, CFBundleExecutable: 'concept-explainer',
    CFBundleIconFile: 'AppIcon', CFBundlePackageType: 'APPL', CFBundleShortVersionString: version, CFBundleVersion: version,
  };
  const body = Object.entries(entries).map(([k, v]) => `  <key>${k}</key>\n  <string>${xml(v)}</string>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${body}
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
`;
}

function macScript({ nodePath, binPath, home }) {
  return `#!/bin/sh
# Written by concept-explainer install --launcher. Reinstall rather than edit.
NODE=${shQuote(nodePath)}
BIN=${shQuote(binPath)}
HOME_DIR=${shQuote(home)}
if [ ! -x "$NODE" ] || [ ! -f "$BIN" ]; then
  /usr/bin/osascript -e 'display alert "Concept Explainer" message "Node or Concept Explainer has moved. Run concept-explainer install --launcher again."' >/dev/null 2>&1
  exit 1
fi
exec "$NODE" "$BIN" launch --home "$HOME_DIR"
`;
}

function desktopEntry({ nodePath, binPath, home }) {
  return `[Desktop Entry]
Type=Application
Name=${APP_NAME}
Comment=Your library of explainers
Exec=${desktopExec([nodePath, binPath, 'launch', '--home', home])}
Icon=concept-explainer
Terminal=false
Categories=Development;Documentation;
`;
}

function bundleIdOf(appDir) {
  try {
    const plist = readFileSync(join(appDir, 'Contents', 'Info.plist'), 'utf8');
    return (plist.match(/<key>CFBundleIdentifier<\/key>\s*<string>([^<]*)<\/string>/) || [])[1] || null;
  } catch {
    return null;
  }
}

function readRecord(home) {
  try {
    return JSON.parse(readFileSync(join(serveDir(home), 'launcher.json'), 'utf8'));
  } catch {
    return null;
  }
}

// Decide what happens to each target before writing anything.
function checkTargets(files, record, force) {
  const ours = new Map((record ? record.files : []).map((f) => [f.path, f.sha256]));
  return files.map((file) => {
    if (!existsSync(file.path)) return { ...file, action: 'write' };
    const current = sha256(readFileSync(file.path));
    if (ours.get(file.path) === current) return { ...file, action: current === sha256(file.content) ? 'same' : 'write' };
    if (!force) throw new Error(`install --launcher: ${file.path} exists and was not written by this launcher. Rerun with --force to replace it (a .bak is kept)`);
    return { ...file, action: 'backup' };
  });
}

function makeIcns(png, out, run) {
  const work = mkdtempSync(join(tmpdir(), 'ce-icon-'));
  const set = join(work, 'AppIcon.iconset');
  mkdirSync(set);
  try {
    [16, 32, 128, 256, 512].forEach((size) => {
      run('sips', ['-z', String(size), String(size), png, '--out', join(set, `icon_${size}x${size}.png`)], { stdio: 'ignore' });
      run('sips', ['-z', String(size * 2), String(size * 2), png, '--out', join(set, `icon_${size}x${size}@2x.png`)], { stdio: 'ignore' });
    });
    run('iconutil', ['-c', 'icns', set, '-o', out], { stdio: 'ignore' });
    return existsSync(out) ? readFileSync(out) : null;
  } catch {
    return null;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function plan({ platform, targetDir, homeDir, env, paths, version, run, warnings }) {
  if (platform === 'darwin') {
    const app = join(targetDir || join(homeDir, 'Applications'), `${APP_NAME}.app`);
    if (existsSync(app) && bundleIdOf(app) && bundleIdOf(app) !== BUNDLE_ID) throw new Error(`install --launcher: ${app} is not this launcher's app (bundle id ${bundleIdOf(app)})`);
    const icns = makeIcns(join(ASSETS, 'icon-1024.png'), join(mkdtempSync(join(tmpdir(), 'ce-icns-')), 'AppIcon.icns'), run);
    if (!icns) warnings.push('could not make the app icon (sips or iconutil failed); the app works without one');
    return {
      app,
      files: [
        { path: join(app, 'Contents', 'Info.plist'), content: infoPlist(version), mode: 0o644 },
        { path: join(app, 'Contents', 'MacOS', 'concept-explainer'), content: macScript(paths), mode: 0o755 },
        ...(icns ? [{ path: join(app, 'Contents', 'Resources', 'AppIcon.icns'), content: icns, mode: 0o644 }] : []),
      ],
    };
  }
  if (platform === 'linux') {
    const data = targetDir || env.XDG_DATA_HOME || join(homeDir, '.local', 'share');
    return {
      applications: join(data, 'applications'),
      files: [
        { path: join(data, 'applications', 'concept-explainer.desktop'), content: desktopEntry(paths), mode: 0o644 },
        { path: join(data, 'icons', 'hicolor', '512x512', 'apps', 'concept-explainer.png'), content: readFileSync(join(ASSETS, 'icon-512.png')), mode: 0o644 },
      ],
    };
  }
  if (platform === 'win32') {
    const menu = targetDir || join(env.APPDATA || join(homeDir, 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    const local = env.LOCALAPPDATA || join(homeDir, 'AppData', 'Local');
    return {
      lnk: join(menu, `${APP_NAME}.lnk`),
      files: [{ path: join(local, 'concept-explainer', 'icon.ico'), content: readFileSync(join(ASSETS, 'icon.ico')), mode: 0o644 }],
    };
  }
  throw new Error(`install --launcher: ${platform} is not supported (macOS, Linux and Windows are)`);
}

function writeFiles(targets) {
  targets.forEach((t) => {
    if (t.action === 'same') return;
    mkdirSync(dirname(t.path), { recursive: true });
    if (t.action === 'backup') renameSync(t.path, existsSync(`${t.path}.bak`) ? `${t.path}.bak-${Date.now()}` : `${t.path}.bak`);
    writeFileSync(t.path, t.content);
    chmodSync(t.path, t.mode);
  });
}

/**
 * @param {{ home: string, platform?: string, targetDir?: string, nodePath?: string, binPath?: string, force?: boolean,
 *   run?: Function, env?: object, homeDir?: string, version?: string }} options
 * @returns {{ files: string[], warnings: string[] }}
 */
export function installLauncher(options) {
  const {
    home, platform = process.platform, targetDir, force = false, run = execFileSync, env = process.env, homeDir = homedir(), version = '0.0.0',
  } = options;
  const nodePath = realpathSync(resolve(options.nodePath || process.execPath));
  const binPath = realpathSync(resolve(options.binPath || BIN_PATH));
  const paths = { nodePath, binPath, home: resolve(home) };
  [nodePath, binPath, paths.home].forEach((p) => {
    if (CONTROL.test(p)) throw new Error(`install --launcher: a path contains a control character: ${JSON.stringify(p)}`);
  });
  const warnings = [];
  if (VERSION_MANAGERS.test(nodePath)) {
    warnings.push(`node is in a version manager folder (${nodePath}); an upgrade there breaks the launcher. Pass --node <a stable node path> to avoid that`);
  }
  const layout = plan({ platform, targetDir, homeDir, env, paths, version, run, warnings });
  const record = readRecord(home);
  const targets = checkTargets(layout.files, record, force);
  if (platform === 'win32') {
    // Make the shortcut first: if PowerShell fails, nothing is written or recorded.
    writeFiles(targets);
    mkdirSync(dirname(layout.lnk), { recursive: true });
    try {
      run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', POWERSHELL_SCRIPT], {
        stdio: 'ignore',
        windowsHide: true,
        env: { ...env, CE_LNK: layout.lnk, CE_NODE: nodePath, CE_ARGS: `"${binPath}" launch --home "${paths.home}"`, CE_ICON: layout.files[0].path },
      });
    } catch (error) {
      throw new Error(`install --launcher: PowerShell could not create the shortcut: ${error.message}. Nothing else was tried`);
    }
  } else {
    writeFiles(targets);
  }
  if (platform === 'linux') {
    try {
      run('update-desktop-database', [layout.applications], { stdio: 'ignore' });
    } catch {
      // Optional: most desktops pick the file up without it.
    }
  }
  const written = [...layout.files.map((f) => f.path), ...(layout.lnk ? [layout.lnk] : [])];
  ensureServeDir(home);
  writeAtomic(join(serveDir(home), 'launcher.json'), `${JSON.stringify({
    version: 1, platform, nodePath, binPath, ...(layout.app ? { app: layout.app, bundleId: BUNDLE_ID } : {}),
    installedAt: new Date().toISOString(),
    files: written.map((path) => ({ path, sha256: existsSync(path) ? sha256(readFileSync(path)) : null })),
  }, null, 2)}\n`);
  return { files: written, warnings };
}

function removeEmptyDirs(dir, stopAt) {
  for (let d = dir; d.startsWith(stopAt) && d !== dirname(stopAt); d = dirname(d)) {
    try {
      if (readdirSync(d).length) return;
      rmdirSync(d);
    } catch {
      return;
    }
  }
}

/**
 * Remove what install wrote, when unchanged, and stop a server the launcher started.
 * @returns {{ removed: string[], kept: string[], stopped: boolean }}
 */
export async function uninstallLauncherAsync({ home }) {
  const result = uninstallLauncher({ home });
  const state = readServerState(home);
  if (state && state.launched && (await verifyServer(home, state.port))) {
    process.kill(state.pid, 'SIGTERM');
    return { ...result, stopped: true };
  }
  return { ...result, stopped: false };
}

export function uninstallLauncher({ home }) {
  const record = readRecord(home);
  if (!record) throw new Error('uninstall --launcher: no launcher is installed for this library');
  const removed = [];
  const kept = [];
  record.files.forEach(({ path, sha256: hash }) => {
    if (!existsSync(path)) return;
    if (hash === null || hash === sha256(readFileSync(path))) {
      rmSync(path);
      removed.push(path);
    } else {
      kept.push(path);
    }
  });
  if (record.app) {
    ['Resources', 'MacOS'].forEach((d) => removeEmptyDirs(join(record.app, 'Contents', d), record.app));
  }
  rmSync(join(serveDir(home), 'launcher.json'), { force: true });
  return { removed, kept, stopped: false };
}
