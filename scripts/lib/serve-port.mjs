// The library's own port: picked at random once per user and kept in
// <home>/config.json (the home is 0700, so other local accounts cannot read
// it). The installed app and its service worker are tied to that origin. A
// fixed, well-known port would let any local program take it while our
// server is stopped and plant a service worker on our origin; a random port
// it cannot learn closes that. Contract: references/launcher.md.
import { createServer } from 'node:net';
import { randomInt } from 'node:crypto';
import { readConfig, writeConfig } from './library.mjs';

export const PORT_RANGE = Object.freeze({ min: 20000, max: 60999 });
const PICK_TRIES = 64;

/** True when nothing listens on 127.0.0.1:<port>. */
export function portFree(port) {
  return new Promise((done) => {
    const probe = createServer();
    probe.once('error', () => done(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => done(true)));
  });
}

/**
 * A random free port in PORT_RANGE.
 * @param {{ isFree?: (port: number) => Promise<boolean>, avoid?: number[], random?: (min: number, max: number) => number }} [options]
 */
export async function pickPort({ isFree = portFree, avoid = [], random = randomInt } = {}) {
  for (let i = 0; i < PICK_TRIES; i += 1) {
    const port = random(PORT_RANGE.min, PORT_RANGE.max + 1);
    if (!avoid.includes(port) && await isFree(port)) return port;
  }
  throw new Error(`serve: found no free port between ${PORT_RANGE.min} and ${PORT_RANGE.max} after ${PICK_TRIES} tries. Pass --port`);
}

/**
 * The stored servePort, or a new random one stored now.
 * @returns {Promise<{ port: number, created: boolean }>}
 */
export async function ensureServePort(home, options = {}) {
  const stored = readConfig(home).servePort;
  if (Number.isInteger(stored)) return { port: stored, created: false };
  const port = await pickPort(options);
  writeConfig(home, { servePort: port });
  return { port, created: true };
}

/** Pick and store a new random port, different from the current one. */
export async function newServePort(home, options = {}) {
  const current = readConfig(home).servePort;
  const port = await pickPort({ ...options, avoid: Number.isInteger(current) ? [current] : [] });
  writeConfig(home, { servePort: port });
  return { port, previous: Number.isInteger(current) ? current : null };
}

/** What to tell the user when the library's port is held by something that cannot prove it is ours. */
export const PORT_TAKEN = (port) => `Port ${port} is held by another program that cannot prove it is this library's server, `
  + 'so nothing was opened there. Close that program, or run `concept-explainer library serve --new-port` to pick a new '
  + 'random port. After a new port, reinstall the installed app from the browser, since the browser ties it to the old address.';

/** What a plain `library serve` says when it falls back to an unstored port. */
export const FELL_BACK = (port, target) => `Port ${port} is held by another program that cannot prove it is this library's server, `
  + `so this run serves on ${target} instead. The installed app only works on ${port}; `
  + 'run `concept-explainer library serve --new-port` to move the library to a new port for good.';

export const NEW_PORT_NOTE = (port) => `✔ the library now uses port ${port}. Reinstall the installed app from the browser: it is tied to the old address`;
