import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildHash, explainerKey, sectionsFor } from '../scripts/lib/sections.mjs';

const load = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}.explainer.json`, import.meta.url), 'utf8'));
const taskflow = load('taskflow');
const pr = load('pr-cursor-paging');
const concept = load('concept-idempotency-keys');

test('every chapter with data and every item gets a route, as in the page deep links', () => {
  const sections = sectionsFor(taskflow);
  ['map', 'flows', 'changes', 'tree', 'data', 'concepts', 'quiz', 'glossary', 'run'].forEach((key) => assert.ok(sections[key], key));
  taskflow.flows.forEach((f) => assert.ok(sections[`flows/${f.id}`], f.id));
  taskflow.concepts.forEach((_, i) => assert.ok(sections[`concepts/${i}`], `concepts/${i}`));
  taskflow.quiz.forEach((_, i) => assert.ok(sections[`quiz/${i + 1}`], `quiz/${i + 1}, counted from 1 like #quiz/<n>`));
  Object.values(sections).forEach((fp) => assert.match(fp, /^[0-9a-f]{8}$/));
  const prSections = sectionsFor(pr);
  ['context', 'diff', 'risks', 'rollout'].forEach((key) => assert.ok(prSections[key], key));
  assert.ok(prSections[`diff/${encodeURIComponent('packages/core/src/tasks/cursor.ts')}`], 'diff paths are one encoded segment');
  const conceptSections = sectionsFor(concept);
  concept.diagrams.forEach((d) => assert.ok(conceptSections[`visuals/${encodeURIComponent(d.id)}`]));
  assert.ok(conceptSections.visuals);
});

test('code walkthroughs get code/<id> routes', () => {
  const data = { ...taskflow, walkthroughs: [{ id: 'create task', title: 'Creating a task', code: 'x()', takeaway: 'T.' }] };
  assert.ok(sectionsFor(data)[`code/${encodeURIComponent('create task')}`]);
  assert.ok(sectionsFor(data).code);
});

test('a rewritten item gets a new fingerprint; untouched items keep theirs', () => {
  const before = sectionsFor(taskflow);
  const changed = structuredClone(taskflow);
  changed.concepts[1].body = 'A different explanation.';
  const after = sectionsFor(changed);
  assert.notEqual(after['concepts/1'], before['concepts/1']);
  assert.equal(after['concepts/0'], before['concepts/0']);
  assert.equal(after[`flows/${taskflow.flows[0].id}`], before[`flows/${taskflow.flows[0].id}`]);
  const reordered = structuredClone(taskflow);
  reordered.concepts.reverse();
  assert.notEqual(sectionsFor(reordered)['concepts/0'], before['concepts/0'], 'a reordered item does not inherit');
});

test('the build hash is the full sha256 of the data, and the key is the slug or repo|title', () => {
  assert.match(buildHash(taskflow), /^[0-9a-f]{64}$/);
  assert.equal(buildHash(taskflow), buildHash(structuredClone(taskflow)));
  assert.notEqual(buildHash(taskflow), buildHash({ ...taskflow, meta: { ...taskflow.meta, title: 'x' } }));
  assert.equal(explainerKey(taskflow, 'acme-taskflow'), 'acme-taskflow');
  assert.equal(explainerKey(taskflow), 'acme/taskflow|Taskflow, explained');
  assert.equal(explainerKey({ meta: { title: 'Solo' } }), '|Solo');
});
