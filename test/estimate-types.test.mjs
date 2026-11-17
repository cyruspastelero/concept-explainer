import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PRICING, estimateRun, formatEstimate, usageFor } from '../scripts/lib/estimate.mjs';
import { measureDiff, measureSource } from '../scripts/lib/estimate-input.mjs';
import { EXPLAINER_TYPES } from '../scripts/lib/schema.mjs';

const MODELS = ['fable-5.2', 'opus-5.5', 'sonnet-5.5', 'haiku-5.5'];

test('prices are the current family, with a source and a checked date', () => {
  assert.deepEqual(Object.keys(PRICING.models), MODELS);
  assert.equal(PRICING.source, 'https://claude.com/platform/api');
  assert.match(PRICING.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(PRICING.models['fable-5.2'], { label: 'Fable 5.2', input: 8, output: 40, cacheRead: 0.2 });
  assert.equal(PRICING.models['opus-5.5'].input, 4);
});

test('every type estimates every model with low-to-high cost and time ranges', () => {
  EXPLAINER_TYPES.forEach((type) => {
    const run = estimateRun({ type });
    assert.equal(run.type, type);
    assert.deepEqual(run.rows.map((r) => r.model), MODELS, type);
    run.rows.forEach((row) => {
      assert.ok(row.cost.low > 0 && row.cost.low < row.cost.high, `${type} ${row.model} cost`);
      assert.ok(row.minutes.low > 0 && row.minutes.low < row.minutes.high, `${type} ${row.model} time`);
      assert.ok(row.tokensIn > row.tokensOut, `${type} ${row.model} tokens`);
    });
    assert.ok(MODELS.includes(run.recommended.model), type);
    assert.ok(run.recommended.reason.length > 10);
    assert.ok(run.assumptions.length > 20);
  });
});

test('bigger inputs never cost less or take less time', () => {
  const cost = (run) => run.rows.find((r) => r.model === 'sonnet-5.5');
  const pairs = [
    [{ type: 'repo', measure: { size: 'small' } }, { type: 'repo', measure: { size: 'large' } }],
    [{ type: 'pr', measure: { lines: 50, files: 2 } }, { type: 'pr', measure: { lines: 3000, files: 60 } }],
    [{ type: 'concept', measure: { words: 500 } }, { type: 'concept', measure: { words: 40000 } }],
    [{ type: 'migration', measure: { size: 'small', words: 500 } }, { type: 'migration', measure: { size: 'large', words: 5000 } }],
  ];
  pairs.forEach(([a, b]) => {
    assert.ok(cost(estimateRun(b)).cost.low > cost(estimateRun(a)).cost.low, a.type);
    assert.ok(cost(estimateRun(b)).minutes.high > cost(estimateRun(a)).minutes.high, a.type);
  });
});

test('an estimate without a measured input says what it assumed', () => {
  assert.match(estimateRun({ type: 'pr' }).input, /assumed/);
  assert.match(estimateRun({ type: 'pr', measure: { lines: 120, files: 4 } }).input, /120 changed lines in 4 files/);
  assert.match(estimateRun({ type: 'proposal', measure: { words: 2400 } }).input, /2,400 words/);
});

test('Haiku switches to its long-context price for big runs', () => {
  const usage = usageFor('repo', { size: 'large' });
  const run = estimateRun({ type: 'repo', measure: { size: 'large' } });
  const haiku = run.rows.find((r) => r.model === 'haiku-5.5');
  const rate = PRICING.models['haiku-5.5'].longContext;
  const mid = usage.fresh * rate.input + usage.cacheRead * rate.cacheRead + usage.output * rate.output;
  assert.ok(usage.peakContext > rate.above);
  assert.ok(haiku.cost.low < mid && mid < haiku.cost.high);
});

test('the recommendation follows the size of the job', () => {
  assert.equal(estimateRun({ type: 'repo', measure: { size: 'large' } }).recommended.model, 'opus-5.5');
  assert.equal(estimateRun({ type: 'change', measure: { lines: 40, files: 2 } }).recommended.model, 'haiku-5.5');
  assert.equal(estimateRun({ type: 'pr', measure: { lines: 300, files: 8 } }).recommended.model, 'sonnet-5.5');
});

test('unknown types are refused', () => {
  assert.throws(() => estimateRun({ type: 'essay' }), /unknown type "essay"/);
});

test('the text table shows models, ranges, the recommendation and the price date', () => {
  const text = formatEstimate(estimateRun({ type: 'pr', measure: { lines: 300, files: 8 } }));
  MODELS.forEach((m) => assert.match(text, new RegExp(PRICING.models[m].label.replace('.', '\\.'))));
  assert.match(text, /\$\d[\d.]* to \$\d/);
  assert.match(text, /\d+ to \d+ min/);
  assert.match(text, /Recommended: Sonnet 5\.5/);
  assert.match(text, new RegExp(`checked ${PRICING.checkedAt}`));
});

test('measureSource counts words in a file or a folder of text files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rx-est-'));
  writeFileSync(join(dir, 'a.md'), 'one two three four');
  mkdirSync(join(dir, 'sub'));
  writeFileSync(join(dir, 'sub', 'b.txt'), 'five six');
  writeFileSync(join(dir, 'logo.png'), Buffer.from([0, 1, 2, 3]));
  mkdirSync(join(dir, 'node_modules'));
  writeFileSync(join(dir, 'node_modules', 'x.md'), 'skip me please');
  assert.deepEqual(measureSource(join(dir, 'a.md')), { words: 4, files: 1 });
  assert.deepEqual(measureSource(dir), { words: 6, files: 2 });
  assert.throws(() => measureSource(join(dir, 'missing')), /estimate: source .* not found/);
});

test('measureDiff counts changed lines and files between two refs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rx-est-git-'));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'T');
  writeFileSync(join(dir, 'a.js'), 'a\n');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  writeFileSync(join(dir, 'a.js'), 'a\nb\nc\n');
  writeFileSync(join(dir, 'b.js'), 'x\n');
  git('add', '.');
  git('commit', '-q', '-m', 'more');
  assert.deepEqual(measureDiff(dir, { base: 'HEAD~1' }), { lines: 3, files: 2 });
});
