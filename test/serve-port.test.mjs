import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PORT_RANGE, ensureServePort, newServePort, pickPort } from '../scripts/lib/serve-port.mjs';
import { readConfig } from '../scripts/lib/library.mjs';
import { notifyUser } from '../scripts/lib/open.mjs';
import { parseConfigValue, validateConfig, CONFIG_DEFAULTS } from '../scripts/lib/config.mjs';

const home = () => join(mkdtempSync(join(tmpdir(), 'rx-port-')), 'home');

test('a picked port is random, free and in 20000 to 60999; busy ones are skipped', async () => {
  assert.deepEqual(PORT_RANGE, { min: 20000, max: 60999 });
  const seq = [30000, 30001, 45000];
  const port = await pickPort({ random: () => seq.shift(), isFree: async (p) => p === 45000 });
  assert.equal(port, 45000);
  await assert.rejects(pickPort({ random: () => 30000, isFree: async () => false }), /no free port/);
  const real = await pickPort();
  assert.ok(real >= 20000 && real <= 60999);
});

test('the port is picked once and kept in config.json; --new-port picks a different one and keeps it', async () => {
  const h = home();
  const first = await ensureServePort(h);
  assert.equal(first.created, true);
  assert.equal(JSON.parse(readFileSync(join(h, 'config.json'), 'utf8')).servePort, first.port);
  assert.deepEqual(await ensureServePort(h), { port: first.port, created: false });
  const moved = await newServePort(h);
  assert.equal(moved.previous, first.port);
  assert.notEqual(moved.port, first.port);
  assert.equal(readConfig(h).servePort, moved.port);
});

test('servePort is null by default (pick one), a port from 1024 to 65535, or none', () => {
  assert.equal(CONFIG_DEFAULTS.servePort, null);
  assert.deepEqual(validateConfig({ ...CONFIG_DEFAULTS, servePort: null }).errors, []);
  assert.deepEqual(validateConfig({ ...CONFIG_DEFAULTS, servePort: 41234 }).errors, []);
  assert.equal(parseConfigValue('servePort', 'none'), null);
});

test('a desktop notice carries the message as an argument or in the environment, never inside a script', () => {
  const calls = [];
  const exec = (command, args, options) => calls.push({ command, args, env: options.env.CE_MESSAGE });
  const message = 'Port 1 is held"; do shell script "rm -rf ~" --';
  assert.equal(notifyUser(message, { platform: 'darwin', exec, env: {} }), true);
  assert.equal(calls[0].args[calls[0].args.length - 1], message);
  assert.ok(calls[0].args.slice(0, -1).every((a) => !a.includes('rm -rf')), 'the script never contains the message');
  notifyUser(message, { platform: 'win32', exec, env: {} });
  assert.equal(calls[1].env, message);
  assert.ok(!calls[1].args.join(' ').includes('rm -rf'));
  const failing = () => { throw new Error('missing'); };
  assert.equal(notifyUser('x', { platform: 'linux', exec: failing, env: {} }), false);
});
