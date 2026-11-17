// Pairing: how a page opened by `launch` (or the installed app) earns the
// right to write. A one-time code travels in the URL fragment; the page
// trades it once for a device token. Only sha256 hashes are stored, under
// <home>/.serve, which library serve never serves. Contract: references/launcher.md.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureHome, withLibraryLock, writeAtomic } from './library.mjs';

export const PAIR_TTL_MS = 120000;
const CODE = /^([0-9a-f]{16})\.([0-9a-f]{64})$/;
const REFUSED = 'pair: code is unknown, used or expired';
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

export function serveDir(home) {
  return join(home, '.serve');
}

/** <home>/.serve and its pair/ folder, private (0700). */
export function ensureServeDir(home) {
  ensureHome(home);
  [serveDir(home), join(serveDir(home), 'pair')].forEach((dir) => {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
  });
  return serveDir(home);
}

/**
 * A fresh one-time code, valid for 120 s. Give it to the page as #pair=<code>.
 * @returns {string} "<16 hex id>.<64 hex secret>"
 */
export function createPairCode(home, { now = Date.now } = {}) {
  ensureServeDir(home);
  const id = randomBytes(8).toString('hex');
  const secret = randomBytes(32).toString('hex');
  const record = { hash: sha256(secret), expiresAt: now() + PAIR_TTL_MS };
  writeFileSync(join(serveDir(home), 'pair', `${id}.json`), JSON.stringify(record), { flag: 'wx', mode: 0o600 });
  return `${id}.${secret}`;
}

function readDevices(home) {
  try {
    const devices = JSON.parse(readFileSync(join(serveDir(home), 'devices.json'), 'utf8'));
    return Array.isArray(devices) ? devices.filter((d) => d && typeof d.hash === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Trade a code for a device token. The code file is deleted before it is
 * checked, so a code works once and a wrong guess burns it.
 * @returns {string} 64 hex characters; the caller gives it to the page once
 */
export function redeemPairCode(home, code, { now = Date.now } = {}) {
  const match = typeof code === 'string' ? code.match(CODE) : null;
  if (!match) throw new Error(REFUSED);
  const file = join(serveDir(home), 'pair', `${match[1]}.json`);
  let record;
  try {
    record = JSON.parse(readFileSync(file, 'utf8'));
    rmSync(file);
  } catch {
    throw new Error(REFUSED);
  }
  const given = Buffer.from(sha256(match[2]));
  const expected = Buffer.from(String(record.hash || ''));
  if (now() > record.expiresAt || given.length !== expected.length || !timingSafeEqual(given, expected)) throw new Error(REFUSED);
  const token = randomBytes(32).toString('hex');
  withLibraryLock(home, () => {
    const devices = [...readDevices(home), { hash: sha256(token), createdAt: new Date(now()).toISOString() }];
    writeAtomic(join(serveDir(home), 'devices.json'), `${JSON.stringify(devices, null, 2)}\n`);
  });
  return token;
}

/** True when `token` belongs to a paired device. A broken devices file trusts nobody. */
export function isDeviceToken(home, token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return false;
  const hash = Buffer.from(sha256(token));
  return readDevices(home).some((d) => {
    const known = Buffer.from(d.hash);
    return known.length === hash.length && timingSafeEqual(known, hash);
  });
}

/** Revoke every device and every pending code. */
export function forgetDevices(home) {
  ensureServeDir(home);
  withLibraryLock(home, () => writeAtomic(join(serveDir(home), 'devices.json'), '[]\n'));
  const pairDir = join(serveDir(home), 'pair');
  if (existsSync(pairDir)) readdirSync(pairDir).forEach((f) => rmSync(join(pairDir, f), { force: true }));
}
