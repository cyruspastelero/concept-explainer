// Pairing: how a page opened by `launch` (or the installed app) earns the
// right to write. A one-time code travels in the URL fragment; the page
// trades it once for a device token. Only sha256 hashes are stored, under
// <home>/.serve, which library serve never serves. Device tokens are
// session-scoped: each is tied to the server instance that issued it and dies
// when that server stops, so a token stolen while the server is down is
// worthless. Contract: references/launcher.md.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureHome, readConfig, withLibraryLock, writeAtomic } from './library.mjs';

export const PAIR_TTL_MS = 120000;
const DAY_MS = 24 * 60 * 60 * 1000;
const CODE = /^([0-9a-f]{16})\.([0-9a-f]{64})$/;
const OPEN_FILE = /^open-[0-9a-f]{16}\.html$/;
const REFUSED = 'pair: code is unknown, used or expired';
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

export function serveDir(home) {
  return join(home, '.serve');
}

const pairDir = (home) => join(serveDir(home), 'pair');
/** The pair record of a code id, which exists until the code is used or expires. */
export const pairRecordFor = (home, id) => join(pairDir(home), `${id}.json`);

/** <home>/.serve and its pair/ folder, private (0700). */
export function ensureServeDir(home) {
  ensureHome(home);
  [serveDir(home), pairDir(home)].forEach((dir) => {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
  });
  return serveDir(home);
}

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
};

/**
 * A fresh one-time code, valid for 120 s. Give it to the page as #pair=<code>.
 * The record also names the private redirect file `launch` writes for it. The
 * name is random and unrelated to the code id, so a path seen on a command line
 * says nothing about the code.
 * @returns {string} "<16 hex id>.<64 hex secret>"
 */
export function createPairCode(home, { now = Date.now } = {}) {
  ensureServeDir(home);
  const id = randomBytes(8).toString('hex');
  const secret = randomBytes(32).toString('hex');
  const record = { hash: sha256(secret), expiresAt: now() + PAIR_TTL_MS, open: `open-${randomBytes(8).toString('hex')}.html` };
  writeFileSync(pairRecordFor(home, id), JSON.stringify(record), { flag: 'wx', mode: 0o600 });
  return `${id}.${secret}`;
}

/** The redirect file path recorded for `code`, or null. */
export function openFileOf(home, code) {
  const match = typeof code === 'string' ? code.match(CODE) : null;
  const record = match && readJson(pairRecordFor(home, match[1]));
  return record && typeof record.open === 'string' && OPEN_FILE.test(record.open) ? join(serveDir(home), record.open) : null;
}

/**
 * Trade a code for a device token tied to the server `instance`. Only the
 * right secret uses up the code (and removes its redirect file): a wrong guess
 * changes nothing, so nobody can burn the user's code by knowing its id.
 * @returns {string} 64 hex characters; the caller gives it to the page once
 */
export function redeemPairCode(home, code, { now = Date.now, instance } = {}) {
  const match = typeof code === 'string' ? code.match(CODE) : null;
  if (!match) throw new Error(REFUSED);
  const file = pairRecordFor(home, match[1]);
  const record = readJson(file);
  if (!record) throw new Error(REFUSED);
  const given = Buffer.from(sha256(match[2]));
  const expected = Buffer.from(String(record.hash || ''));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new Error(REFUSED);
  rmSync(file, { force: true });
  if (typeof record.open === 'string' && OPEN_FILE.test(record.open)) rmSync(join(serveDir(home), record.open), { force: true });
  if (now() > record.expiresAt) throw new Error(REFUSED);
  const token = randomBytes(32).toString('hex');
  const at = now();
  withLibraryLock(home, () => {
    const device = { hash: sha256(token), createdAt: new Date(at).toISOString(), expiresAt: at + lifetime(home), instance: instance ?? null };
    writeDevices(home, [...liveDevices(home, at), device]);
  });
  return token;
}

function readDevices(home) {
  const devices = readJson(join(serveDir(home), 'devices.json'));
  return Array.isArray(devices) ? devices.filter((d) => d && typeof d.hash === 'string') : [];
}

// deviceTokenDays (default 30) is an upper bound; the session ends sooner.
const lifetime = (home) => readConfig(home).deviceTokenDays * DAY_MS;
const expiryOf = (d, home) => (Number.isFinite(d.expiresAt) ? d.expiresAt : Date.parse(d.createdAt || '') + lifetime(home));
const liveDevices = (home, at) => readDevices(home).filter((d) => expiryOf(d, home) > at);
const writeDevices = (home, devices) => writeAtomic(join(serveDir(home), 'devices.json'), `${JSON.stringify(devices, null, 2)}\n`);

/**
 * True when `token` belongs to a paired device of this server `instance` that
 * has not expired. Each use pushes the expiry out again (written at most once
 * a day, and skipped when the library is busy, so a check never waits).
 */
export function isDeviceToken(home, token, { now = Date.now, instance } = {}) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return false;
  const hash = Buffer.from(sha256(token));
  const at = now();
  const found = readDevices(home).find((d) => {
    const known = Buffer.from(d.hash);
    return known.length === hash.length && timingSafeEqual(known, hash) && expiryOf(d, home) > at && (d.instance ?? null) === (instance ?? null);
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

/**
 * End device sessions. `keep` given: revoke every token not issued by that
 * instance (a server starting: whatever ran before is over, crashed or not).
 * `end` given: revoke the tokens of that instance (a server stopping).
 */
export function endSessions(home, { keep, end } = {}) {
  if (!existsSync(join(serveDir(home), 'devices.json'))) return;
  withLibraryLock(home, () => {
    const devices = readDevices(home);
    const next = devices.filter((d) => (keep !== undefined ? (d.instance ?? null) === keep : (d.instance ?? null) !== end));
    if (next.length !== devices.length) writeDevices(home, next);
  });
}

/** Revoke every device and every pending code. */
export function forgetDevices(home) {
  ensureServeDir(home);
  withLibraryLock(home, () => writeAtomic(join(serveDir(home), 'devices.json'), '[]\n'));
  if (existsSync(pairDir(home))) readdirSync(pairDir(home)).forEach((f) => rmSync(join(pairDir(home), f), { force: true }));
  sweepOpenFiles(home); // their codes are gone, so their redirect files go too
}

/**
 * Remove what pairing left behind: expired pair records, and redirect files
 * no live record names or older than a code lives. A used code's file goes
 * at once (redeemPairCode); this catches the rest.
 */
export function sweepOpenFiles(home, { now = Date.now } = {}) {
  const dir = serveDir(home);
  if (!existsSync(dir)) return;
  const live = new Set();
  if (existsSync(pairDir(home))) {
    readdirSync(pairDir(home)).forEach((name) => {
      const path = join(pairDir(home), name);
      const record = readJson(path);
      if (!record || !(record.expiresAt > now())) { rmSync(path, { force: true }); return; }
      if (typeof record.open === 'string') live.add(record.open);
    });
  }
  readdirSync(dir).forEach((name) => {
    if (!OPEN_FILE.test(name)) return;
    const file = join(dir, name);
    let born = 0;
    try { born = statSync(file).mtimeMs; } catch { return; }
    if (!live.has(name) || now() - born > PAIR_TTL_MS) rmSync(file, { force: true });
  });
}
