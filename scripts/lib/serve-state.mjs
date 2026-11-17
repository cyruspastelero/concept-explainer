// Who is serving the library: <home>/.serve/server.json, the health check
// that proves it, and picking a port. The installed app is tied to one
// origin, so the default port is fixed (4747); a busy port held by us is
// reused, one held by anything else is never taken over.
import { request } from 'node:http';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { writeAtomic } from './library.mjs';
import { ensureServeDir, serveDir } from './pairing.mjs';

export const DEFAULT_PORT = 4747;
export const FALLBACK_PORTS = Object.freeze(Array.from({ length: 10 }, (_, i) => 4748 + i));
export const PAIR_HEADER = 'x-concept-explainer-pair';
export const APP_NAME = 'concept-explainer';

const statePath = (home) => join(serveDir(home), 'server.json');

/** `{ pid, port, instance, version, startedAt, idleMinutes }`, or null. */
export function readServerState(home) {
  try {
    const state = JSON.parse(readFileSync(statePath(home), 'utf8'));
    return Number.isInteger(state.pid) && Number.isInteger(state.port) && typeof state.instance === 'string' ? state : null;
  } catch {
    return null;
  }
}

export function writeServerState(home, state) {
  ensureServeDir(home);
  writeAtomic(statePath(home), `${JSON.stringify(state, null, 2)}\n`);
}

/** Remove server.json, but only if it still describes this instance. */
export function clearServerState(home, instance) {
  const state = readServerState(home);
  if (state && state.instance === instance) rmSync(statePath(home), { force: true });
}

/** GET /api/health on 127.0.0.1:port. Resolves to the parsed body, or null. */
export function fetchHealth(port, { timeoutMs = 1000 } = {}) {
  return new Promise((done) => {
    const req = request({ host: '127.0.0.1', port, path: '/api/health', headers: { host: `127.0.0.1:${port}` }, timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { if (body.length < 4096) body += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          done(res.statusCode === 200 && parsed && parsed.app === APP_NAME ? parsed : null);
        } catch {
          done(null);
        }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => done(null));
    req.end();
  });
}

/**
 * Serve on `port`, reuse our own server already there, or move to the first
 * free fallback port when something else holds it.
 * @returns {Promise<{ reused: boolean, fellBack: boolean, port: number, instance: string, close: () => Promise<void> }>}
 */
export async function startOrReuse({ port = DEFAULT_PORT, fallbackPorts = FALLBACK_PORTS, ...options }) {
  const { startLibraryServer } = await import('./serve.mjs');
  const tryPort = async (p) => {
    try {
      return await startLibraryServer({ ...options, port: p });
    } catch (error) {
      if (!/EADDRINUSE/.test(error.message)) throw error;
      return null;
    }
  };
  const first = await tryPort(port);
  if (first) return { ...first, reused: false, fellBack: false };
  const health = await fetchHealth(port);
  if (health) return { reused: true, fellBack: false, port, instance: health.instance, close: async () => {} };
  for (const p of fallbackPorts) {
    const next = await tryPort(p);
    if (next) return { ...next, reused: false, fellBack: true };
  }
  throw new Error(`serve: port ${port} is used by another program and ${fallbackPorts.join(', ')} are busy. Pass --port`);
}
