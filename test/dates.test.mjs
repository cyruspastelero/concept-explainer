import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localDay, today, userTimeZone } from '../scripts/lib/dates.mjs';

const CLI = fileURLToPath(new URL('../bin/concept-explainer.mjs', import.meta.url));

// The zone is injected, not taken from TZ: Node on Windows ignores TZ.
const day = (value, timeZone) => localDay(value, { timeZone });

test('a UTC timestamp shows as the calendar day where the user is', () => {
  // 20:30 UTC on the 17th is already the 18th in Manila (UTC+8) and still the 17th in Los Angeles.
  assert.equal(day('2026-11-17T20:30:00.000Z', 'Asia/Manila'), '2026-11-18');
  assert.equal(day('2026-11-17T20:30:00.000Z', 'America/Los_Angeles'), '2026-11-17');
  // 03:00 UTC on the 18th is still the 17th in Los Angeles (UTC-8).
  assert.equal(day('2026-11-18T03:00:00.000Z', 'America/Los_Angeles'), '2026-11-17');
});

test('a date-only string stays the same calendar day in every zone', () => {
  for (const tz of ['Asia/Manila', 'America/Los_Angeles', 'UTC', 'Pacific/Kiritimati']) {
    assert.equal(day('2026-11-18', tz), '2026-11-18', tz);
  }
});

test('a missing or broken date shows as an empty or unchanged label, never Invalid Date', () => {
  assert.equal(day('', 'Asia/Manila'), '');
  assert.equal(day(undefined, 'Asia/Manila'), '');
  assert.equal(day('soon', 'Asia/Manila'), 'soon');
});

test('TZ names the zone on every platform when it is a real zone; anything else means the system zone', () => {
  assert.equal(userTimeZone({ TZ: 'Asia/Manila' }), 'Asia/Manila');
  assert.equal(userTimeZone({ TZ: 'Not/AZone' }), undefined);
  assert.equal(userTimeZone({}), undefined);
  assert.equal(today(new Date('2026-11-17T20:30:00Z'), { timeZone: 'Asia/Manila' }), '2026-11-18');
});

test('library list shows local publish days in Manila and Los Angeles', () => {
  const root = mkdtempSync(join(tmpdir(), 'rx-dates-'));
  const env = { ...process.env, CONCEPT_EXPLAINER_HOME: join(root, 'home'), REPO_EXPLAINER_HOME: '', CLAUDE_CONFIG_DIR: join(root, 'claude'), HOME: root };
  const file = join(root, 'taskflow.explainer.json');
  writeFileSync(file, readFileSync(new URL('../examples/taskflow.explainer.json', import.meta.url)));
  assert.equal(spawnSync(process.execPath, [CLI, 'library', 'add', file], { env, encoding: 'utf8' }).status, 0);
  const manifestPath = join(root, 'home', 'library.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const late = { ...manifest, explainers: manifest.explainers.map((e) => ({ ...e, publishedAt: '2026-11-17T20:30:00.000Z' })) };
  writeFileSync(manifestPath, JSON.stringify(late));
  const list = (tz) => spawnSync(process.execPath, [CLI, 'library', 'list'], { env: { ...env, TZ: tz }, encoding: 'utf8' }).stdout;
  assert.match(list('Asia/Manila'), /\(2026-11-18\)/);
  assert.match(list('America/Los_Angeles'), /\(2026-11-17\)/);
});
