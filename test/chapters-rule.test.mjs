import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PAGE_CHAPTER_ORDER, shownChapters } from '../scripts/lib/chapters.mjs';
import { CHAPTER_KEYS, TYPE_RULES } from '../scripts/lib/schema.mjs';
import { buildSearchIndex } from '../scripts/lib/search-index.mjs';

const load = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const taskflow = load('../examples/taskflow.explainer.json');
const pr = load('../examples/pr-cursor-paging.explainer.json');

test('meta.chapters wins, in its order, keeping only chapters with data', () => {
  const data = { ...taskflow, meta: { ...taskflow.meta, chapters: ['quiz', 'map', 'options'] } };
  assert.deepEqual(shownChapters(data), ['quiz', 'map'], 'options has no data');
});

test('without meta.chapters: the type order, then every other chapter with data', () => {
  const data = { ...taskflow, meta: { ...taskflow.meta, chapters: undefined } };
  const shown = shownChapters(data);
  const typeOrder = TYPE_RULES.repo.chapters.filter((k) => shown.includes(k));
  // code (a walkthrough) sits after flows; the rest follows the type order.
  assert.deepEqual(shown.filter((k) => k !== 'code').slice(0, typeOrder.length), typeOrder);
  const withPage = { ...pr, meta: { ...pr.meta, chapters: undefined } };
  assert.ok(shownChapters(withPage).includes('glossary'), 'a chapter outside the type order still shows when it has data');
});

test('a code walkthrough shows right after flows when the type order is used', () => {
  const data = { ...taskflow, meta: { ...taskflow.meta, chapters: undefined }, walkthroughs: [{ id: 'w', title: 'W', file: 'a.ts:1-5', code: 'a\nb\nc\nd\ne', lines: [], takeaway: 'T.' }] };
  const shown = shownChapters(data);
  assert.equal(shown[shown.indexOf('flows') + 1], 'code');
  const none = { ...data, walkthroughs: [] };
  assert.ok(!shownChapters(none).includes('code'));
});

test('the page chapter order covers every schema chapter key', () => {
  assert.deepEqual([...PAGE_CHAPTER_ORDER].sort(), [...CHAPTER_KEYS].sort());
});

test('the search index links only into chapters the page shows', () => {
  const data = { ...pr, meta: { ...pr.meta, chapters: ['context', 'diff', 'map'] } };
  const chapters = new Set(buildSearchIndex('x', data).map((e) => (e.href.split('#')[1] || '').split('/')[0]).filter(Boolean));
  assert.deepEqual([...chapters].filter((c) => !['context', 'diff', 'map'].includes(c)), [], 'nothing outside the shown chapters');
  assert.ok(chapters.has('diff') && chapters.has('map'));
  assert.ok(buildSearchIndex('x', data).some((e) => e.type === 'explainer'), 'the explainer itself is always there');
});
