import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { buildExplainer } from '../scripts/lib/build.mjs';
import { shownChapters } from '../scripts/lib/chapters.mjs';

// The page shows the chapters the build embeds (context.chapters, from
// scripts/lib/chapters.mjs) and keeps no copy of the per-type orders.
const source = readFileSync(new URL('../template/js/app.js', import.meta.url), 'utf8');
const presetsDir = new URL('../presets/types/', import.meta.url);
const examples = ['taskflow', 'pr-cursor-paging', 'proposal-live-updates', 'concept-idempotency-keys'];
const load = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}.explainer.json`, import.meta.url), 'utf8'));
const contextOf = (html) => JSON.parse(html.match(/<script type="application\/json" id="explainer-context">([\s\S]*?)<\/script>/)[1]);

test('the page keeps no copy of the type chapter orders', () => {
  assert.doesNotMatch(source, /TYPE_CHAPTERS/);
  assert.match(source, /function chooseChapters\(data, context\)/);
  assert.match(source, /context && context\.chapters/);
});

test('every built explainer embeds the chapters the shared rule shows', () => {
  examples.forEach((name) => {
    const data = load(name);
    assert.deepEqual(contextOf(buildExplainer(data, { context: {} })).chapters, shownChapters(data), name);
  });
});

test('optional chapters are ones the shared rule places (the code walkthrough)', () => {
  readdirSync(presetsDir).filter((f) => f.endsWith('.json')).forEach((file) => {
    const preset = JSON.parse(readFileSync(new URL(file, presetsDir), 'utf8'));
    (preset.optionalChapters || []).forEach((key) => assert.equal(key, 'code', `presets/types/${file} optional chapter ${key}`));
  });
});

test('a page without embedded chapters still shows each chapter once', () => {
  // Older builds and saved pages: meta.chapters, else the table order, deduplicated.
  assert.match(source, /\[\.\.\.new Set\(order\)\]/);
});
