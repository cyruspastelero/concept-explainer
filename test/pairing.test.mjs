import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PAIR_TTL_MS, createPairCode, forgetDevices, isDeviceToken, redeemPairCode, serveDir,
} from '../scripts/lib/pairing.mjs';

const freshHome = () => join(mkdtempSync(join(tmpdir(), 'rx-pair-')), 'home');
const mode = (path) => statSync(path).mode & 0o777;

test('a pairing code is stored only as a hash, in a private folder, and expires in 120 s', () => {
  const home = freshHome();
  const code = createPairCode(home, { now: () => 1000 });
  assert.match(code, /^[0-9a-f]{16}\.[0-9a-f]{64}$/);
  const [id, secret] = code.split('.');
  const file = join(serveDir(home), 'pair', `${id}.json`);
  const stored = readFileSync(file, 'utf8');
  assert.doesNotMatch(stored, new RegExp(secret));
  assert.equal(JSON.parse(stored).expiresAt, 1000 + PAIR_TTL_MS);
  assert.equal(PAIR_TTL_MS, 120000);
  assert.equal(mode(serveDir(home)), 0o700);
  assert.equal(mode(join(serveDir(home), 'pair')), 0o700);
  assert.equal(mode(file), 0o600);
});

test('a code works once and returns a device token stored only as its hash', () => {
  const home = freshHome();
  const code = createPairCode(home);
  const token = redeemPairCode(home, code);
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(isDeviceToken(home, token), true);
  assert.equal(isDeviceToken(home, 'f'.repeat(64)), false);
  assert.doesNotMatch(readFileSync(join(serveDir(home), 'devices.json'), 'utf8'), new RegExp(token));
  assert.equal(mode(join(serveDir(home), 'devices.json')), 0o600);
  assert.throws(() => redeemPairCode(home, code), /pair: code is unknown, used or expired/);
  assert.deepEqual(readdirSync(join(serveDir(home), 'pair')), [], 'used codes are deleted');
});

test('expired, wrong and malformed codes are refused, and a wrong guess burns the code', () => {
  const home = freshHome();
  let clock = 0;
  const expired = createPairCode(home, { now: () => clock });
  clock = PAIR_TTL_MS + 1;
  assert.throws(() => redeemPairCode(home, expired, { now: () => clock }), /unknown, used or expired/);
  const real = createPairCode(home);
  const [id] = real.split('.');
  assert.throws(() => redeemPairCode(home, `${id}.${'0'.repeat(64)}`), /unknown, used or expired/);
  assert.throws(() => redeemPairCode(home, real), /unknown, used or expired/, 'one wrong guess deletes the code');
  ['', 'nope', '../../x.y', `${'a'.repeat(16)}.${'z'.repeat(64)}`, null].forEach((bad) => {
    assert.throws(() => redeemPairCode(home, bad), /unknown, used or expired/);
  });
});

test('forgetting devices revokes every token and pending code', () => {
  const home = freshHome();
  const token = redeemPairCode(home, createPairCode(home));
  createPairCode(home);
  forgetDevices(home);
  assert.equal(isDeviceToken(home, token), false);
  assert.deepEqual(readdirSync(join(serveDir(home), 'pair')), []);
  assert.ok(existsSync(join(serveDir(home), 'devices.json')));
});

test('a broken devices file trusts nobody', async () => {
  const home = freshHome();
  const token = redeemPairCode(home, createPairCode(home));
  (await import('node:fs')).writeFileSync(join(serveDir(home), 'devices.json'), '{ broken');
  assert.equal(isDeviceToken(home, token), false);
});
