// One writer at a time across processes. The lock is the folder <home>/.lock
// holding an `owner` file of "<pid>:<nonce>". It is taken by renaming a
// ready-made folder into place, so it never exists without an owner. A lock
// whose process is gone is moved aside to a unique tombstone and only removed
// when the tombstone still holds the owner seen as dead; a holder releases the
// lock only while it still holds its own nonce. Reentrant within a process.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

export const LOCK_TIMEOUT_MS = 30000;
const LOCK_DIR = '.lock';
// A lock folder with no owner file (an older or interrupted writer) counts as
// stale once it is this old.
const OWNERLESS_STALE_MS = 10000;
const NAP_MS = 50;
const HELD = new Map();
const NAP = new Int32Array(new SharedArrayBuffer(4));

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function readText(path) {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return null;
  }
}

/** The owner text of a lock folder: "<pid>:<nonce>", a bare pid from older versions, or null. */
function ownerOf(dir) {
  return readText(join(dir, 'owner')) ?? readText(join(dir, 'pid'));
}

function pidOf(owner) {
  const pid = Number(String(owner ?? '').split(':')[0]);
  return Number.isInteger(pid) && pid > 0 ? pid : 0;
}

function isStale(dir, owner) {
  const pid = pidOf(owner);
  if (pid) return !processAlive(pid);
  try {
    return Date.now() - statSync(dir).mtimeMs > OWNERLESS_STALE_MS;
  } catch {
    return false; // gone already: just try again
  }
}

const freshName = (home, tag) => join(home, `${LOCK_DIR}-${tag}-${process.pid}-${randomBytes(6).toString('hex')}`);

/** Take the lock if it is free. Returns true when this call now holds it. */
function tryTake(home, dir, owner) {
  const staging = freshName(home, 'new');
  mkdirSync(staging, { mode: 0o700 });
  writeFileSync(join(staging, 'owner'), owner, { mode: 0o600 });
  try {
    renameSync(staging, dir);
    return ownerOf(dir) === owner;
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    if (['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES', 'EBUSY'].includes(error.code)) return false;
    throw new Error(`lock library ${dir}: ${error.message}`);
  }
}

/**
 * Move a dead lock aside. Only the process whose tombstone holds the owner it
 * saw as dead removes it; anything else goes back in place.
 */
function clearStale(home, dir, observed) {
  const tomb = freshName(home, 'stale');
  try {
    renameSync(dir, tomb);
  } catch {
    return; // someone else moved or released it first
  }
  if (ownerOf(tomb) === observed) {
    rmSync(tomb, { recursive: true, force: true });
    return;
  }
  try {
    renameSync(tomb, dir); // a live lock taken meanwhile: put it back
  } catch {
    // The slot was retaken too. The moved lock's owner releases by nonce and
    // will find its lock gone, which is safe; drop the moved folder.
    rmSync(tomb, { recursive: true, force: true });
  }
}

function release(home, dir, owner) {
  if (ownerOf(dir) !== owner) return; // no longer ours: leave it
  const tomb = freshName(home, 'done');
  try {
    renameSync(dir, tomb);
  } catch {
    return;
  }
  if (ownerOf(tomb) === owner) {
    rmSync(tomb, { recursive: true, force: true });
  } else {
    try {
      renameSync(tomb, dir);
    } catch {
      rmSync(tomb, { recursive: true, force: true });
    }
  }
}

export function lockBusyError(dir, owner) {
  const error = new Error(`library is busy: ${dir} held by pid ${pidOf(owner) || 'unknown'}. Try again, or remove that folder if no concept-explainer is running`);
  error.code = 'LIBRARY_BUSY';
  return error;
}

/**
 * Run `fn` while holding <home>/.lock. Waits up to `timeoutMs` for another
 * writer (0 means do not wait), then throws an error with code LIBRARY_BUSY.
 * @template T
 * @param {string} home
 * @param {() => T} fn
 * @returns {T}
 */
export function withLock(home, fn, timeoutMs = LOCK_TIMEOUT_MS) {
  const key = resolve(home);
  if (HELD.has(key)) {
    HELD.set(key, HELD.get(key) + 1);
    try {
      return fn();
    } finally {
      HELD.set(key, HELD.get(key) - 1);
    }
  }
  const dir = join(home, LOCK_DIR);
  const owner = `${process.pid}:${randomBytes(8).toString('hex')}`;
  const deadline = Date.now() + timeoutMs;
  while (!tryTake(home, dir, owner)) {
    const seen = ownerOf(dir);
    if (existsSync(dir) && isStale(dir, seen)) {
      clearStale(home, dir, seen);
      continue;
    }
    if (Date.now() >= deadline) throw lockBusyError(dir, seen);
    Atomics.wait(NAP, 0, 0, NAP_MS);
  }
  HELD.set(key, 1);
  try {
    return fn();
  } finally {
    HELD.delete(key);
    release(home, dir, owner);
  }
}

/** True while this process holds the lock for `home`. */
export function holdsLock(home) {
  return HELD.has(resolve(home));
}
