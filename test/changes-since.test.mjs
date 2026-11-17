import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateExplainer } from '../scripts/lib/validate.mjs';
import { mergeSignals, readInsights } from '../scripts/lib/insights.mjs';
import { SIGNALS_FORMAT } from '../scripts/lib/signals.mjs';
import { buildHash, sectionsFor } from '../scripts/lib/sections.mjs';

const EXAMPLE = fileURLToPath(new URL('../examples/taskflow.explainer.json', import.meta.url));
const CLI = fileURLToPath(new URL('../bin/concept-explainer.mjs', import.meta.url));
const taskflow = JSON.parse(readFileSync(EXAMPLE, 'utf8'));
const FLAG = { id: 'f-0123456789ab', route: 'concepts/1', fp: 'aaaaaaaa', kind: 'more', state: 'open', evidence: { n: 2, notes: [] } };
const OTHER = { ...FLAG, id: 'f-ba9876543210', route: 'map', kind: 'basic' };
const withSince = (since) => ({ ...taskflow, changesSinceLast: since });

test('a good changesSinceLast passes, and addressed or kept flags raise no warning', () => {
  const data = withSince({
    previousBuild: 'a'.repeat(64),
    items: [{ route: 'concepts/1', what: 'Added a step on the queue.', because: 'readers', addresses: [FLAG.id] }, { what: 'Renamed the worker.', because: 'source' }],
    kept: [{ flagId: OTHER.id, reason: 'Most readers here are new.' }],
  });
  assert.deepEqual(validateExplainer(data, { flags: [FLAG, OTHER] }), { errors: [], warnings: [] });
});

test('its shape is checked: up to 8 items, known routes, because, real flags', () => {
  const errorsFor = (since, flags = [FLAG]) => validateExplainer(withSince(since), { flags }).errors;
  const has = (errors, text) => errors.some((e) => e.includes(text));
  assert.ok(has(errorsFor({ items: Array.from({ length: 9 }, () => ({ what: 'x.', because: 'source' })) }), '8'));
  assert.ok(has(errorsFor({ items: [{ route: 'flows/ghost', what: 'x.', because: 'source' }] }), 'not a section'));
  assert.ok(has(errorsFor({ items: [{ what: 'x.', because: 'vibes' }] }), '"vibes"'));
  assert.ok(has(errorsFor({ items: [{ what: 'x.', because: 'readers' }] }), 'must name the reader flags'));
  assert.ok(has(errorsFor({ items: [{ what: 'x.', because: 'readers', addresses: ['f-ffffffffffff'] }] }), 'not a flag'));
  assert.ok(has(errorsFor({ items: [{ what: '', because: 'source' }] }), 'what'));
  assert.ok(has(errorsFor({ previousBuild: 'nope', items: [] }), 'previousBuild'));
  assert.ok(has(errorsFor({ items: [], kept: [{ flagId: FLAG.id, reason: '' }] }), 'reason'));
  assert.ok(has(validateExplainer(withSince({ items: [{ what: 'x.', because: 'readers', addresses: ['bad'] }] })).errors, 'flag id'));
});

test('every open flag neither addressed nor kept is a warning, so --strict fails', () => {
  const { errors, warnings } = validateExplainer(taskflow, { flags: [FLAG, { ...OTHER, state: 'addressed' }] });
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], new RegExp(`${FLAG.id}.*concepts/1.*n = 2`));
});

test('the CLI validates against the library\'s flags and build marks the addressed ones', () => {
  const root = mkdtempSync(join(tmpdir(), 'rx-since-'));
  const env = { ...process.env, HOME: root, CONCEPT_EXPLAINER_HOME: join(root, 'home'), CLAUDE_CONFIG_DIR: join(root, 'claude') };
  const data = join(root, 'taskflow.explainer.json');
  copyFileSync(EXAMPLE, data);
  const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { env, encoding: 'utf8' });
  assert.equal(run('build', data).status, 0);
  const route = 'concepts/1';
  mergeSignals(env.CONCEPT_EXPLAINER_HOME, {
    format: SIGNALS_FORMAT, version: 1, batchId: 'c'.repeat(32), date: '2026-11-18',
    explainers: [{ key: 'acme-taskflow', build: buildHash(taskflow), sections: { [route]: { fp: sectionsFor(taskflow)[route], vote: { from: null, to: 'more' }, views: 1, finished: 1, time: '<30s' } }, quiz: {}, lookups: { glossary: {}, hints: {} } }],
  });
  const flag = readInsights(env.CONCEPT_EXPLAINER_HOME, 'acme-taskflow').flags[0];
  const strict = run('validate', data, '--strict');
  assert.equal(strict.status, 1);
  assert.match(strict.stderr, new RegExp(flag.id));
  const next = { ...taskflow, changesSinceLast: { previousBuild: buildHash(taskflow), items: [{ route, what: 'Added a worked case.', because: 'readers', addresses: [flag.id] }] } };
  writeFileSync(data, JSON.stringify(next));
  const built = run('build', data, '--strict');
  assert.equal(built.status, 0, built.stderr);
  const after = readInsights(env.CONCEPT_EXPLAINER_HOME, 'acme-taskflow').flags.find((f) => f.id === flag.id);
  assert.equal(after.state, 'addressed');
  assert.equal(after.addressedIn, buildHash(next));
});
