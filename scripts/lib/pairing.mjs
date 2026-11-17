// Pairing: how a page opened by `launch` (or the installed app) earns the
// right to write. A one-time code travels in the URL fragment; the page
// trades it once for a device token. Only sha256 hashes are stored, under
// <home>/.serve, which library serve never serves. Contract: references/launcher.md.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureHome, readConfig, withLibraryLock, writeAtomic } from './library.mjs';

export const PAIR_TTL_MS = 120000;
const DAY_MS = 24 * 60 * 60 * 1000;
const CODE = /^([0-9a-f]{16})\.([0-9a-f]{64})$/;
const REFUSED = 'pair: code is unknown, used or expired';
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

export function serveDir(home) {
  return join(home, '.serve');
}

/** The private redirect file `launch` opens for the code with this id (see launch.mjs). */
export const openFileFor = (home, id) => join(serveDir(home), `open-${id}.html`);
/** The pair record of a code id, which exists until the code is used. */
export const pairRecordFor = (home, id) => join(serveDir(home), 'pair', `${id}.json`);

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
  // The launcher's redirect file holds this code; once it is tried, the file has done its job.
  rmSync(openFileFor(home, match[1]), { force: true });
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
  const at = now();
  withLibraryLock(home, () => {
    const device = { hash: sha256(token), createdAt: new Date(at).toISOString(), expiresAt: at + lifetime(home) };
    writeDevices(home, [...liveDevices(home, at), device]);
  });
  return token;
}

// How long a device token lives without use: deviceTokenDays (default 30).
const lifetime = (home) => readConfig(home).deviceTokenDays * DAY_MS;
// Records from before expiry existed count from when they were made.
const expiryOf = (d, home) => (Number.isFinite(d.expiresAt) ? d.expiresAt : Date.parse(d.createdAt || '') + lifetime(home));
const liveDevices = (home, at) => readDevices(home).filter((d) => expiryOf(d, home) > at);
const writeDevices = (home, devices) => writeAtomic(join(serveDir(home), 'devices.json'), `${JSON.stringify(devices, null, 2)}\n`);

/**
 * True when `token` belongs to a paired device that has not expired. Each use
 * pushes the expiry out again (written at most once a day, and skipped when
 * the library is busy, so a check never waits). A broken devices file trusts nobody.
 */
export function isDeviceToken(home, token, { now = Date.now } = {}) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return false;
  const hash = Buffer.from(sha256(token));
  const at = now();
  const found = readDevices(home).find((d) => {
    const known = Buffer.from(d.hash);
    return known.length === hash.length && timingSafeEqual(known, hash) && expiryOf(d, home) > at;
  });
  if (!found) return false;
  if (at + lifetime(home) - expiryOf(found, home) >= DAY_MS) refresh(home, found.hash, at);
  return true;
}

function refresh(home, hash, at) {
  try {
    withLibraryLock(home, () => {
      writeDevices(home, liveDevices(home, at).map((d) => (d.hash === hash ? { ...d, expiresAt: at + lifetime(home), lastUsedAt: new Date(at).toISOString() } : d)));
    }, 0);
  } catch (error) {
    if (error.code !== 'LIBRARY_BUSY') throw error;
  }
}

/** Revoke every device and every pending code. */
export function forgetDevices(home) {
  ensureServeDir(home);
  withLibraryLock(home, () => writeAtomic(join(serveDir(home), 'devices.json'), '[]\n'));
  const pairDir = join(serveDir(home), 'pair');
  if (existsSync(pairDir)) readdirSync(pairDir).forEach((f) => rmSync(join(pairDir, f), { force: true }));
  sweepOpenFiles(home); // their codes are gone, so their redirect files go too
}

const OPEN_FILE = /^open-([0-9a-f]{16})\.html$/;

/**
 * Remove redirect files that have done their job: their code was used (the
 * pair record is gone), has expired, or the file is older than a code lives.
 * The server removes a file as soon as its code is tried; this catches the rest.
 */
export function sweepOpenFiles(home, { now = Date.now } = {}) {
  const dir = serveDir(home);
  if (!existsSync(dir)) return;
  readdirSync(dir).forEach((name) => {
    const match = name.match(OPEN_FILE);
    if (!match) return;
    const file = join(dir, name);
    let expiresAt = 0;
    try {
      expiresAt = JSON.parse(readFileSync(pairRecordFor(home, match[1]), 'utf8')).expiresAt;
    } catch {
      expiresAt = 0;
    }
    let born = 0;
    try { born = statSync(file).mtimeMs; } catch { return; }
    if (!(expiresAt > now()) || now() - born > PAIR_TTL_MS) rmSync(file, { force: true });
  });
}
