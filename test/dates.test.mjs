import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../bin/concept-explainer.mjs', import.meta.url));
const DATES = fileURLToPath(new URL('../scripts/lib/dates.mjs', import.meta.url));

// The zone is fixed per process, so each check runs in a child with TZ set.
function inZone(tz, expr) {
  const code = `import { localDay } from ${JSON.stringify(DATES)}; console.log(JSON.stringify(${expr}));`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('a UTC timestamp shows as the calendar day where the user is', () => {
  // 20:30 UTC on the 17th is already the 18th in Manila (UTC+8) and still the 17th in Los Angeles.
  assert.equal(inZone('Asia/Manila', 'localDay("2026-11-17T20:30:00.000Z")'), '2026-11-18');
  assert.equal(inZone('America/Los_Angeles', 'localDay("2026-11-17T20:30:00.000Z")'), '2026-11-17');
  // 03:00 UTC on the 18th is still the 17th in Los Angeles (UTC-8).
  assert.equal(inZone('America/Los_Angeles', 'localDay("2026-11-18T03:00:00.000Z")'), '2026-11-17');
});

test('a date-only string stays the same calendar day in every zone', () => {
  for (const tz of ['Asia/Manila', 'America/Los_Angeles', 'UTC']) {
    assert.equal(inZone(tz, 'localDay("2026-11-18")'), '2026-11-18', tz);
  }
});

test('a missing or broken date shows as an empty or unchanged label, never Invalid Date', () => {
  assert.equal(inZone('Asia/Manila', 'localDay("")'), '');
  assert.equal(inZone('Asia/Manila', 'localDay(undefined)'), '');
  assert.equal(inZone('Asia/Manila', 'localDay("soon")'), 'soon');
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
