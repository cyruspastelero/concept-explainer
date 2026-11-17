import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validateExplainer } from '../scripts/lib/validate.mjs';
import { typeOf } from '../scripts/lib/validate-v2.mjs';

// Every bundled example is something agents imitate, so it must pass --strict.
const dir = new URL('../examples/', import.meta.url);
const examples = readdirSync(dir).filter((f) => f.endsWith('.explainer.json'));

test('every example passes with no errors and no warnings', () => {
  assert.ok(examples.length >= 4);
  examples.forEach((file) => {
    assert.deepEqual(validateExplainer(JSON.parse(readFileSync(new URL(file, dir), 'utf8'))), { errors: [], warnings: [] }, file);
  });
});

test('there is an example for repo, pr, proposal and concept', () => {
  const types = examples.map((file) => typeOf(JSON.parse(readFileSync(new URL(file, dir), 'utf8'))));
  ['repo', 'pr', 'proposal', 'concept'].forEach((type) => assert.ok(types.includes(type), type));
});

test('the new examples use several visual kinds and concept parts', () => {
  const kinds = new Set();
  examples.forEach((file) => {
    const data = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
    (data.diagrams || []).forEach((d) => kinds.add(d.kind));
    (data.concepts || []).forEach((c) => c.visual && kinds.add(c.visual.kind));
  });
  assert.ok(kinds.size >= 7, [...kinds].join(', '));
});
