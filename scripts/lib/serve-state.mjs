// Who is serving the library: <home>/.serve/server.json, the health check
// that proves it, and picking a port. The installed app is tied to one
// origin: a random port picked once per user (serve-port.mjs). A busy port
// held by us is reused; one held by anything else is never taken over.
import { request } from 'node:http';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { writeAtomic } from './library.mjs';
import { ensureServeDir, serveDir } from './pairing.mjs';
import { FELL_BACK, PORT_TAKEN, pickPort } from './serve-port.mjs';

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

/** The proof a server gives for a nonce: HMAC-SHA256 of the nonce with its secret. */
export const healthProof = (secret, nonce) => createHmac('sha256', secret).update(nonce).digest('hex');

/**
 * GET /api/health?nonce=<nonce> on 127.0.0.1:port. Resolves to `{ proof }`, or
 * null. Without a nonce the server answers 404 like any unknown path, so a
 * nonce is always sent (a fresh one when none is given).
 */
export function fetchHealth(port, { timeoutMs = 1000, nonce = randomBytes(16).toString('hex') } = {}) {
  const path = `/api/health?nonce=${nonce}`;
  return new Promise((done) => {
    const req = request({ host: '127.0.0.1', port, path, headers: { host: `127.0.0.1:${port}` }, timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { if (body.length < 4096) body += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          done(res.statusCode === 200 && parsed && typeof parsed.proof === 'string' ? parsed : null);
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

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/**
 * Prove that the server on `port` is the one this home started: its pid
 * lives and it answers a fresh nonce with the HMAC of the secret only
 * server.json (0600) holds, which is per instance. Anything else, even
 * a perfect fingerprint, is an impostor and never gets a pairing code.
 * @returns {Promise<object|null>} the server state when proven
 */
export async function verifyServer(home, port) {
  const state = readServerState(home);
  if (!state || state.port !== port || typeof state.secret !== 'string' || !processAlive(state.pid)) return null;
  const nonce = randomBytes(16).toString('hex');
  const health = await fetchHealth(port, { nonce });
  if (!health) return null;
  const given = Buffer.from(health.proof);
  const expected = Buffer.from(healthProof(state.secret, nonce));
  return given.length === expected.length && timingSafeEqual(given, expected) ? state : null;
}

/**
 * Serve on `port`, or reuse our own server already there. When something
 * else holds it: with `fallback` (a plain browser run), serve on a random
 * port for this run only; without it, refuse with advice.
 * @param {{ home: string, port: number, fallback?: boolean } & object} options
 * @returns {Promise<{ reused: boolean, fellBack: boolean, port: number, instance: string, warning?: string, close: () => Promise<void> }>}
 */
export async function startOrReuse({ port, fallback = false, ...options }) {
  const { startLibraryServer } = await import('./serve.mjs');
  const tryPort = async (p) => {
    try {
      return await startLibraryServer({ ...options, writeState: true, port: p });
    } catch (error) {
      if (!/EADDRINUSE/.test(error.message)) throw error;
      return null;
    }
  };
  const first = await tryPort(port);
  if (first) return { ...first, reused: false, fellBack: false };
  const ours = await verifyServer(options.home, port);
  if (ours) return { reused: true, fellBack: false, port, instance: ours.instance, close: async () => {} };
  if (!fallback) throw new Error(`serve: ${PORT_TAKEN(port)}`);
  const next = await tryPort(await pickPort({ avoid: [port] }));
  if (!next) throw new Error(`serve: ${PORT_TAKEN(port)}`);
  return { ...next, reused: false, fellBack: true, warning: FELL_BACK(port, next.port) };
}
