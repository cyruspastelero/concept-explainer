// `concept-explainer launch`: what the installed app runs. Reuse the library
// server if one of ours is running, or start one detached (stopping itself
// when idle), then pair the browser with a one-time code and open the hub.
// Concurrent launches start one server. Contract: references/launcher.md.
import { spawn } from 'node:child_process';
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureHub, readConfig, resolveHome, writeConfig } from './library.mjs';
import { createPairCode, ensureServeDir, openFileOf, serveDir, sweepOpenFiles } from './pairing.mjs';

export { sweepOpenFiles };
import { readServerState, verifyServer } from './serve-state.mjs';
import { PORT_TAKEN, ensureServePort, portFree } from './serve-port.mjs';
import { openLaunchFile } from './open.mjs';

export const BIN_PATH = resolve(fileURLToPath(new URL('../../bin/concept-explainer.mjs', import.meta.url)));
export const LAUNCHER_IDLE_MINUTES = 30;
const LOG_CAP = 1024 * 1024;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/** The server server.json describes, only if it proves it is ours (see verifyServer). */
async function runningServer(home, port) {
  const state = readServerState(home);
  return state?.port === port ? verifyServer(home, port) : null;
}

const ownerFile = (dir) => join(dir, 'owner');
const lockOwner = (dir) => {
  try { return readFileSync(ownerFile(dir), 'utf8').trim(); } catch { return null; }
};
const lockPid = (owner) => Number(String(owner || '').split(':')[0]) || 0;
const freshLockPath = (parent, tag) => join(parent, `.start-lock-${tag}-${process.pid}-${randomBytes(8).toString('hex')}`);

function tryStartLock(dir, owner) {
  const parent = join(dir, '..');
  const staging = freshLockPath(parent, 'new');
  mkdirSync(staging, { mode: 0o700 });
  writeFileSync(ownerFile(staging), owner, { mode: 0o600 });
  try {
    renameSync(staging, dir);
    return lockOwner(dir) === owner;
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    if (['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES', 'EBUSY'].includes(error.code)) return false;
    throw new Error(`launch: cannot take ${dir}: ${error.message}`);
  }
}

function clearStaleStartLock(dir, observed) {
  const tomb = freshLockPath(join(dir, '..'), 'stale');
  try {
    renameSync(dir, tomb);
  } catch {
    return;
  }
  if (lockOwner(tomb) === observed) {
    rmSync(tomb, { recursive: true, force: true });
    return;
  }
  try {
    renameSync(tomb, dir);
  } catch {
    rmSync(tomb, { recursive: true, force: true });
  }
}

function releaseStartLock(dir, owner) {
  if (lockOwner(dir) !== owner) return;
  const tomb = freshLockPath(join(dir, '..'), 'done');
  try {
    renameSync(dir, tomb);
  } catch {
    return;
  }
  if (lockOwner(tomb) === owner) {
    rmSync(tomb, { recursive: true, force: true });
    return;
  }
  try {
    renameSync(tomb, dir);
  } catch {
    rmSync(tomb, { recursive: true, force: true });
  }
}

// One starter at a time, across processes. A staged directory carries its
// owner before the atomic rename, and a release only removes its own nonce.
async function withStartLock(home, timeoutMs, fn) {
  const dir = join(serveDir(home), 'start.lock');
  const deadline = Date.now() + timeoutMs * 2;
  const owner = `${process.pid}:${randomBytes(8).toString('hex')}`;
  for (;;) {
    if (tryStartLock(dir, owner)) break;
    const observed = lockOwner(dir);
    const pid = lockPid(observed);
    let age = 0;
    try { age = Date.now() - statSync(dir).mtimeMs; } catch { continue; }
    if ((pid && !processAlive(pid)) || (!pid && age > 10000)) {
      clearStaleStartLock(dir, observed);
      continue;
    }
    if (Date.now() > deadline) throw new Error(`launch: another launch holds ${dir} (pid ${pid || 'unknown'})`);
    await pause(50);
  }
  try {
    return await fn();
  } finally {
    releaseStartLock(dir, owner);
  }
}

// serve.log, private, capped at 1 MB with one rotation (serve.log.1).
function openLog(home) {
  const log = join(serveDir(home), 'serve.log');
  if (existsSync(log) && statSync(log).size > LOG_CAP) renameSync(log, `${log}.1`);
  const fd = openSync(log, 'a', 0o600);
  chmodSync(log, 0o600);
  return fd;
}

function spawnServer({ home, port, idleMinutes, nodePath, binPath }) {
  const fd = openLog(home);
  try {
    const child = spawn(nodePath, [binPath, 'library', 'serve', '--idle', String(idleMinutes)], {
      detached: true,
      stdio: ['ignore', fd, fd],
      // LAUNCHED marks the server as the launcher's, so uninstall --launcher may stop it.
      env: { ...process.env, CONCEPT_EXPLAINER_HOME: home, CONCEPT_EXPLAINER_LAUNCHED: '1' },
      windowsHide: true,
    });
    child.unref();
    return child.pid;
  } finally {
    closeSync(fd);
  }
}

async function waitForServer(home, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const proven = await verifyServer(home, port);
    if (proven) return proven;
    await pause(100);
  }
  throw new Error(`launch: the library server did not answer within ${Math.round(timeoutMs / 1000)} s. See ${join(serveDir(home), 'serve.log')}`);
}

const htmlAttr = (text) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * Write the private page the browser opens: it sends the browser on to the
 * hub with the pairing code in the fragment. Opening this file, not the URL,
 * keeps the code out of the opener's argv, where other local users could
 * read it (ps). 0600, created with 'wx'.
 */
function writeOpenFile(home, port, code) {
  const target = `http://127.0.0.1:${port}/index.html#pair=${code}`;
  const script = `location.replace(${JSON.stringify(target)});`;
  const hash = createHash('sha256').update(script).digest('base64');
  const html = [
    '<!doctype html>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash}'">`,
    '<meta name="referrer" content="no-referrer">',
    `<meta http-equiv="refresh" content="0; url=${htmlAttr(target)}">`,
    '<title>Opening Concept Explainer</title>',
    `<script>${script}</script>`,
    '',
  ].join('\n');
  const file = openFileOf(home, code);
  if (!file) throw new Error('launch: pairing code has no redirect file');
  writeFileSync(file, html, { flag: 'wx', mode: 0o600 });
  chmodSync(file, 0o600);
  return file;
}

/**
 * @param {{ home?: string, port?: number, idleMinutes?: number, opener?: (file: string) => unknown,
 *   nodePath?: string, binPath?: string, timeoutMs?: number }} [options]
 * @returns {Promise<{ url: string, port: number, started: boolean }>} url is the hub, with no code
 */
export async function launch(options = {}) {
  const home = options.home || resolveHome();
  const config = readConfig(home);
  // The port lives in the private config, never in the server's command line.
  const port = options.port ?? (await ensureServePort(home)).port;
  if (options.port !== undefined && config.servePort !== port) writeConfig(home, { servePort: port });
  const idleMinutes = options.idleMinutes ?? config.serveIdleMinutes ?? LAUNCHER_IDLE_MINUTES;
  const timeoutMs = options.timeoutMs ?? 5000;
  ensureServeDir(home);
  sweepOpenFiles(home);
  ensureHub({ home });
  let running = await runningServer(home, port);
  const state = readServerState(home);
  if (!running && state && state.port !== port && await verifyServer(home, state.port)) {
    throw new Error(`launch: the library server is running on port ${state.port}, not its configured port ${port}`);
  }
  let started = false;
  if (!running) {
    await withStartLock(home, timeoutMs, async () => {
      running = await runningServer(home, port);
      if (running) return;
      const current = readServerState(home);
      if (current && current.port !== port && await verifyServer(home, current.port)) {
        throw new Error(`launch: the library server is running on port ${current.port}, not its configured port ${port}`);
      }
      // Taken by something that is not our proven server: the installed app
      // must not move (its origin is this port), and nothing goes to that program.
      if (!(await portFree(port))) throw new Error(`launch: ${PORT_TAKEN(port)}`);
      spawnServer({ home, port, idleMinutes, nodePath: options.nodePath || process.execPath, binPath: options.binPath || BIN_PATH });
      started = true;
      running = await waitForServer(home, port, timeoutMs);
    });
  }
  // The code goes into a private file the browser opens; it is never printed,
  // returned or passed on a command line.
  const file = writeOpenFile(home, running.port, createPairCode(home));
  await (options.opener || openLaunchFile)(file);
  return { url: `http://127.0.0.1:${running.port}/index.html`, port: running.port, started };
}
