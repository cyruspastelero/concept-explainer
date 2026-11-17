// `concept-explainer launch`: what the installed app runs. Reuse the library
// server if one of ours is running, or start one detached (stopping itself
// when idle), then pair the browser with a one-time code and open the hub.
// Concurrent launches start one server. Contract: references/launcher.md.
import { spawn } from 'node:child_process';
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureHub, readConfig, resolveHome } from './library.mjs';
import { createPairCode, ensureServeDir, openFileFor, serveDir, sweepOpenFiles } from './pairing.mjs';

export { sweepOpenFiles };
import { FALLBACK_PORTS, TAKEN_WARNING, readServerState, verifyServer } from './serve-state.mjs';
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
async function runningServer(home) {
  const state = readServerState(home);
  return state ? verifyServer(home, state.port) : null;
}

function portFree(port) {
  return new Promise((done) => {
    const probe = createServer();
    probe.once('error', () => done(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => done(true)));
  });
}

// One starter at a time, across processes: an atomic mkdir holding our pid.
async function withStartLock(home, timeoutMs, fn) {
  const dir = join(serveDir(home), 'start.lock');
  const deadline = Date.now() + timeoutMs * 2;
  for (;;) {
    try {
      mkdirSync(dir, { mode: 0o700 });
      writeFileSync(join(dir, 'pid'), String(process.pid), { mode: 0o600 });
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw new Error(`launch: cannot take ${dir}: ${error.message}`);
    }
    let pid = 0;
    try { pid = Number(readFileSync(join(dir, 'pid'), 'utf8')); } catch { pid = 0; }
    const age = existsSync(dir) ? Date.now() - statSync(dir).mtimeMs : Infinity;
    if ((pid && !processAlive(pid)) || (!pid && age > 10000)) {
      rmSync(dir, { recursive: true, force: true });
      continue;
    }
    if (Date.now() > deadline) throw new Error(`launch: another launch holds ${dir} (pid ${pid || 'unknown'})`);
    await pause(50);
  }
  try {
    return await fn();
  } finally {
    rmSync(dir, { recursive: true, force: true });
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
    const child = spawn(nodePath, [binPath, 'library', 'serve', '--port', String(port), '--idle', String(idleMinutes)], {
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
  const file = openFileFor(home, code.split('.')[0]);
  writeFileSync(file, html, { flag: 'wx', mode: 0o600 });
  chmodSync(file, 0o600);
  return file;
}

/**
 * @param {{ home?: string, port?: number, fallbackPorts?: number[], idleMinutes?: number, opener?: (file: string) => unknown,
 *   nodePath?: string, binPath?: string, timeoutMs?: number }} [options]
 * @returns {Promise<{ url: string, port: number, started: boolean, warning?: string }>} url is the hub, with no code
 */
export async function launch(options = {}) {
  const home = options.home || resolveHome();
  const config = readConfig(home);
  const port = options.port ?? config.servePort;
  const idleMinutes = options.idleMinutes ?? config.serveIdleMinutes ?? LAUNCHER_IDLE_MINUTES;
  const timeoutMs = options.timeoutMs ?? 5000;
  ensureServeDir(home);
  sweepOpenFiles(home);
  ensureHub({ home });
  let running = await runningServer(home);
  let started = false;
  let warning;
  if (!running) {
    await withStartLock(home, timeoutMs, async () => {
      running = await runningServer(home);
      if (running) return;
      let target = port;
      if (!(await portFree(port))) {
        // Taken. Only a server proven to be ours is reused (runningServer said no),
        // so whatever holds the port gets nothing from us.
        const free = [];
        for (const p of options.fallbackPorts ?? FALLBACK_PORTS) if (await portFree(p)) { free.push(p); break; }
        if (!free.length) throw new Error(`launch: port ${port} and every fallback port are busy`);
        [target] = free;
        warning = TAKEN_WARNING(port, target);
      }
      spawnServer({ home, port: target, idleMinutes, nodePath: options.nodePath || process.execPath, binPath: options.binPath || BIN_PATH });
      started = true;
      running = await waitForServer(home, target, timeoutMs);
    });
  }
  // The code goes into a private file the browser opens; it is never printed,
  // returned or passed on a command line.
  const file = writeOpenFile(home, running.port, createPairCode(home));
  await (options.opener || openLaunchFile)(file);
  return { url: `http://127.0.0.1:${running.port}/index.html`, port: running.port, started, ...(warning ? { warning } : {}) };
}
