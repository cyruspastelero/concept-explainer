import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  forgetReader, hubSummary, insightsReport, markFlags, mergeSignals, readInsights, readReader, resetInsights,
} from '../scripts/lib/insights.mjs';
import { SIGNALS_FORMAT } from '../scripts/lib/signals.mjs';
import { buildHash, sectionsFor } from '../scripts/lib/sections.mjs';
import { publishExplainer, removeExplainer, writeConfig } from '../scripts/lib/library.mjs';

const load = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}.explainer.json`, import.meta.url), 'utf8'));
const taskflow = load('taskflow');
const concept = load('concept-idempotency-keys');
const pr = load('pr-cursor-paging');
const S = sectionsFor(taskflow);
let ids = 0;
const nextId = () => (ids += 1).toString(16).padStart(32, '0');

function library(...items) {
  const home = join(mkdtempSync(join(tmpdir(), 'rx-insights-')), 'home');
  items.forEach((data) => publishExplainer(data, { home }));
  return home;
}

// One batch for one explainer; `parts` are sections, quiz and lookups.
function batch(key, data, parts = {}, batchId = nextId()) {
  return {
    format: SIGNALS_FORMAT, version: 1, batchId, date: '2026-11-18',
    explainers: [{ key, build: buildHash(data), sections: parts.sections || {}, quiz: parts.quiz || {}, lookups: { glossary: {}, hints: {}, ...(parts.lookups || {}) } }],
  };
}
const seen = (route, extra = {}) => ({ fp: S[route], views: 1, finished: 1, time: '30s-2m', ...extra });
const vote = (route, to, from = null, note) => seen(route, { vote: { from, to }, ...(note ? { note } : {}) });

test('views, finishes and time buckets add up across batches', () => {
  const home = library(taskflow);
  mergeSignals(home, batch('acme-taskflow', taskflow, { sections: { map: seen('map') } }));
  mergeSignals(home, batch('acme-taskflow', taskflow, { sections: { map: seen('map', { time: '>10m' }) } }));
  const map = readInsights(home, 'acme-taskflow').sections.map;
  assert.equal(map.views, 2);
  assert.equal(map.finished, 2);
  assert.deepEqual(map.time, { '<30s': 0, '30s-2m': 1, '2-10m': 0, '>10m': 1 });
  assert.equal(map.fp, S.map);
});

test('a vote that moves is counted once, and notes are kept, newest first, up to 20', () => {
  const home = library(taskflow);
  mergeSignals(home, batch('acme-taskflow', taskflow, { sections: { 'concepts/1': vote('concepts/1', 'clear') } }));
  mergeSignals(home, batch('acme-taskflow', taskflow, { sections: { 'concepts/1': vote('concepts/1', 'more', 'clear', 'Why a postbox?') } }));
  const section = readInsights(home, 'acme-taskflow').sections['concepts/1'];
  assert.deepEqual(section.votes, { clear: 0, more: 1, basic: 0 });
  assert.equal(section.notes[0].text, 'Why a postbox?');
  for (let i = 0; i < 25; i += 1) mergeSignals(home, batch('acme-taskflow', taskflow, { sections: { 'concepts/1': vote('concepts/1', 'more', null, `n${i}`) } }));
  const notes = readInsights(home, 'acme-taskflow').sections['concepts/1'].notes;
  assert.equal(notes.length, 20);
  assert.equal(notes[0].text, 'n24');
});

test('unknown explainers, routes and stale fingerprints are dropped and counted', () => {
  const home = library(taskflow);
  const result = mergeSignals(home, {
    ...batch('acme-taskflow', taskflow, { sections: { map: seen('map'), 'flows/ghost': { fp: '00000000', views: 1, finished: 0, time: '<30s' }, 'concepts/0': { fp: 'ffffffff', views: 1, finished: 0, time: '<30s' } } }),
    explainers: [
      ...batch('acme-taskflow', taskflow, { sections: { map: seen('map'), 'flows/ghost': { fp: '00000000', views: 1, finished: 0, time: '<30s' }, 'concepts/0': { fp: 'ffffffff', views: 1, finished: 0, time: '<30s' } } }).explainers,
      { key: 'nobody|Nothing', build: 'c'.repeat(64), sections: {}, quiz: {}, lookups: { glossary: {}, hints: {} } },
    ],
  });
  assert.deepEqual(result.dropped, { explainers: 1, sections: 2, quiz: 0, lookups: 0, notes: 0 });
  assert.deepEqual(Object.keys(readInsights(home, 'acme-taskflow').sections), ['map']);
});

test('an explainer is found by slug or by repo|title', () => {
  const home = library(taskflow);
  mergeSignals(home, batch('acme/taskflow|Taskflow, explained', taskflow, { sections: { map: seen('map') } }));
  assert.equal(readInsights(home, 'acme-taskflow').sections.map.views, 1);
});

test('a repeated batch id is acknowledged and ignored', () => {
  const home = library(taskflow);
  const b = batch('acme-taskflow', taskflow, { sections: { map: seen('map') } });
  assert.equal(mergeSignals(home, b).duplicate, false);
  assert.equal(mergeSignals(home, b).duplicate, true);
  assert.equal(readInsights(home, 'acme-taskflow').sections.map.views, 1);
});

test('explicit votes flag at n = 1, each flag with its n and a stable id', () => {
  const home = library(taskflow);
  mergeSignals(home, batch('acme-taskflow', taskflow, { sections: { 'concepts/1': vote('concepts/1', 'more', null, 'lost me'), 'flows/create-task': { fp: S['flows/create-task'], views: 1, finished: 1, time: '<30s', vote: { from: null, to: 'basic' } } } }));
  const { flags } = readInsights(home, 'acme-taskflow');
  const more = flags.find((f) => f.kind === 'more');
  assert.equal(more.route, 'concepts/1');
  assert.equal(more.fp, S['concepts/1']);
  assert.equal(more.evidence.n, 1);
  assert.deepEqual(more.evidence.notes, ['lost me']);
  assert.equal(more.state, 'open');
  assert.match(more.id, /^f-[0-9a-f]{12}$/);
  assert.ok(flags.some((f) => f.kind === 'basic' && f.route === 'flows/create-task'));
  mergeSignals(home, batch('acme-taskflow', taskflow, { sections: { 'concepts/1': vote('concepts/1', 'clear', 'more') } }));
  assert.ok(!readInsights(home, 'acme-taskflow').flags.some((f) => f.kind === 'more'), 'a moved vote drops its open flag');
});

test('a quiz item flags only with at least 3 answers and half of them wrong first', () => {
  const home = library(taskflow);
  const q = (firstWrong, wrong) => ({ quiz: { 1: { fp: S['quiz/1'], answers: 1, firstWrong, misses: firstWrong, wrong } } });
  mergeSignals(home, batch('acme-taskflow', taskflow, q(1, [2])));
  mergeSignals(home, batch('acme-taskflow', taskflow, q(1, [2])));
  assert.ok(!readInsights(home, 'acme-taskflow').flags.some((f) => f.kind === 'quiz'), 'n = 2 is not enough');
  mergeSignals(home, batch('acme-taskflow', taskflow, q(0, [])));
  const flag = readInsights(home, 'acme-taskflow').flags.find((f) => f.kind === 'quiz');
  assert.equal(flag.route, 'quiz/1');
  assert.deepEqual(flag.evidence, { n: 3, firstWrong: 2, mostPicked: 2 });
});

test('terms looked up 3+ times across 2+ explainers become struggles and term flags', () => {
  const withTerm = (data, term) => ({ ...data, glossary: [...(data.glossary || []), { term, definition: 'A shared idea.' }] });
  const a = withTerm(taskflow, 'Idempotent');
  const home = library(a, concept);
  mergeSignals(home, batch('acme-taskflow', a, { sections: { map: { ...seen('map'), fp: sectionsFor(a).map } }, lookups: { glossary: { Idempotent: 2 } } }));
  mergeSignals(home, batch('idempotency-keys', concept, { lookups: { glossary: { idempotent: 1 } } }));
  const reader = readReader(home);
  assert.deepEqual(reader.struggles.map((s) => [s.term.toLowerCase(), s.n, s.explainers]), [['idempotent', 3, 2]]);
  const flag = readInsights(home, 'acme-taskflow').flags.find((f) => f.kind === 'term');
  assert.equal(flag.route, `glossary/${encodeURIComponent('Idempotent')}`);
  assert.equal(flag.evidence.n, 3);
});

test('a term defined in 3 viewed explainers and never opened counts as known; depth is only a hint', () => {
  const g = (data) => ({ ...data, glossary: [{ term: 'Cache', definition: 'Kept copy.' }, ...(data.glossary || []).filter((x) => x.term !== 'Cache')] });
  const items = [g(taskflow), g(concept), g(pr)];
  const home = library(...items);
  const slugs = ['acme-taskflow', 'idempotency-keys', 'acme-taskflow-pr-512'];
  items.forEach((data, i) => {
    const firstRoute = Object.keys(sectionsFor(data))[0];
    mergeSignals(home, batch(slugs[i], data, { sections: { [firstRoute]: { fp: sectionsFor(data)[firstRoute], views: 1, finished: 0, time: '<30s', vote: { from: null, to: 'basic' } } } }));
  });
  const reader = readReader(home);
  assert.deepEqual(reader.knows.map((k) => k.term), ['Cache']);
  assert.equal(reader.depthHint, null, 'fewer than 6 votes give no hint');
});

test('insights files are private, and reset, forget-reader and library remove delete them', () => {
  const home = library(taskflow, concept);
  mergeSignals(home, batch('acme-taskflow', taskflow, { sections: { map: seen('map') }, lookups: { glossary: { Cursor: 1 } } }));
  mergeSignals(home, batch('idempotency-keys', concept, { lookups: { glossary: { Cursor: 2 } } }));
  const file = join(home, 'insights', 'acme-taskflow.json');
  assert.equal(statSync(join(home, 'insights')).mode & 0o777, 0o700);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.ok(existsSync(join(home, 'insights', '_reader.json')));
  forgetReader(home);
  assert.ok(!existsSync(join(home, 'insights', '_reader.json')));
  assert.deepEqual(readInsights(home, 'acme-taskflow').lookups.glossary, {}, 'the lookups that fed it go too');
  assert.equal(readInsights(home, 'acme-taskflow').sections.map.views, 1, 'section counts stay');
  resetInsights(home, { slug: 'idempotency-keys' });
  assert.equal(readInsights(home, 'idempotency-keys'), null);
  removeExplainer('acme-taskflow', { home });
  assert.ok(!existsSync(file), 'library remove deletes the insights');
  mergeSignals(home, batch('idempotency-keys', concept, { lookups: { glossary: { Cursor: 1 } } }));
  resetInsights(home, { all: true });
  assert.ok(!existsSync(join(home, 'insights')));
});

test('with learning off, nothing new is recorded', () => {
  const home = library(taskflow);
  writeConfig(home, { learning: false });
  assert.throws(() => mergeSignals(home, batch('acme-taskflow', taskflow, { sections: { map: seen('map') } })), /learning is off/);
  assert.equal(readInsights(home, 'acme-taskflow'), null);
});

test('a build marks the flags it addressed or kept, and they stay through later batches', () => {
  const home = library(taskflow);
  mergeSignals(home, batch('acme-taskflow', taskflow, { sections: { 'concepts/1': vote('concepts/1', 'more'), map: vote('map', 'basic') } }));
  const flags = readInsights(home, 'acme-taskflow').flags;
  const more = flags.find((f) => f.kind === 'more');
  const basic = flags.find((f) => f.kind === 'basic');
  const next = { ...taskflow, changesSinceLast: { items: [{ route: 'concepts/1', what: 'Added a step.', because: 'readers', addresses: [more.id] }], kept: [{ flagId: basic.id, reason: 'Most readers are new here.' }] } };
  markFlags(home, 'acme-taskflow', next);
  const after = readInsights(home, 'acme-taskflow').flags;
  assert.equal(after.find((f) => f.id === more.id).state, 'addressed');
  assert.equal(after.find((f) => f.id === more.id).addressedIn, buildHash(next));
  assert.equal(after.find((f) => f.id === basic.id).state, 'kept');
  assert.equal(after.find((f) => f.id === basic.id).reason, 'Most readers are new here.');
});

test('the hub summary and the agent report carry counts and short notes, never raw reader files', () => {
  const home = library(taskflow);
  mergeSignals(home, batch('acme-taskflow', taskflow, { sections: { 'concepts/1': vote('concepts/1', 'more', null, 'x'.repeat(140)) } }));
  const summary = hubSummary(home);
  assert.equal(summary.explainMore[0].slug, 'acme-taskflow');
  assert.equal(summary.explainMore[0].href, 'explainers/acme-taskflow/index.html#concepts/1');
  assert.equal(summary.explainMore[0].n, 1);
  assert.ok(summary.explainMore[0].notes.every((n) => n.length <= 140));
  assert.deepEqual(Object.keys(summary).sort(), ['explainMore', 'refreshes', 'terms', 'updatedAt', 'weakQuiz']);
  assert.ok(summary.refreshes.some((r) => r.slug === 'acme-taskflow' && r.reasons.includes('open flags')));
  const report = insightsReport(home, { slug: 'acme-taskflow' });
  assert.equal(report.untrusted, true);
  assert.equal(report.explainers[0].flags[0].kind, 'more');
  assert.equal(insightsReport(home, { subject: 'acme/taskflow' }).explainers.length, 1);
  assert.deepEqual(insightsReport(home, { subject: 'nobody' }).explainers, []);
});
