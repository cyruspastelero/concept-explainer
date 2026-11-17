import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadChapters } from './chapters-fake-dom.mjs';
import { parseSignalBatch } from '../scripts/lib/signals.mjs';

// The page's signal recorder (template/js/signals.js) in node:vm: where it
// records, what it records (counts and buckets only), and that pending
// deltas leave only after the library acknowledged them.

const CONTEXT = {
  key: 'acme-taskflow', slug: 'acme-taskflow', build: 'a'.repeat(64),
  sections: { flows: '11111111', 'flows/create-task': '22222222', concepts: '33333333', 'concepts/0': '44444444', glossary: '55555555', 'quiz/1': '66666666', 'quiz/2': '77777777' },
};
const DATA = {
  meta: { title: 'Taskflow, explained', repo: 'acme/taskflow' },
  glossary: [{ term: 'Job', definition: 'Work done later.' }],
  quiz: [{ question: 'Q1', options: ['a', 'b', 'c'], answer: 1 }, { question: 'Q2', options: ['a', 'b'], answer: 0 }],
};

function load({ protocol = 'file:', hostname = '', learning = null, fetchImpl = null } = {}) {
  const env = loadChapters();
  const store = new Map(learning ? [['concept-explainer:learning', learning]] : []);
  env.window.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
    key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; },
  };
  Object.assign(env.window.location, { protocol, hostname });
  env.window.setTimeout = (fn) => fn();
  const clock = { now: 1_000_000 };
  env.ctx.Date = class extends Date { static now() { return clock.now; } };
  env.ctx.fetch = fetchImpl || (() => Promise.reject(new Error('no network in this test')));
  vm.runInContext(`function serveApi() { return '/api/signals'; }\nfunction quizStoreKey(meta) { return 'concept-explainer:quiz:' + meta.title; }\n${readFileSync(new URL('../template/js/signals.js', import.meta.url), 'utf8')}`, env.ctx);
  return { ...env, store, clock };
}

const visit = (env, rec, hash, ms) => {
  env.window.location.hash = hash;
  rec.check();
  env.clock.now += ms;
};

test('records nothing on other origins, and nothing while the Reading toggle is off', () => {
  ['https:|example.com', 'http:|localhost', 'http:|192.168.1.4', 'https:|127.0.0.1'].forEach((pair) => {
    const [protocol, hostname] = pair.split('|');
    assert.equal(load({ protocol, hostname }).ctx.sigStart(DATA, CONTEXT), null, pair);
  });
  assert.ok(load({ protocol: 'file:' }).ctx.sigStart(DATA, CONTEXT), 'file:// records');
  assert.ok(load({ protocol: 'http:', hostname: '127.0.0.1' }).ctx.sigStart(DATA, CONTEXT), 'the local library records, on any port');
  const off = load({ learning: 'off' });
  const rec = off.ctx.sigStart(DATA, CONTEXT);
  visit(off, rec, '#flows/create-task/2', 40_000);
  assert.equal(rec.vote('flows', 'more', 'x'), false);
  assert.equal(rec.summary().batch, null);
  assert.ok(![...off.store.keys()].some((k) => k.startsWith('concept-explainer:signals:')), 'nothing written');
});

test('views, time buckets, lookups and votes become a batch the library accepts', () => {
  const env = load();
  const rec = env.ctx.sigStart(DATA, CONTEXT);
  visit(env, rec, '#flows/create-task/1', 45_000);
  visit(env, rec, '#flows/create-task/3', 10_000);
  visit(env, rec, '#glossary/Job', 5_000);
  visit(env, rec, '#glossary/Nope', 5_000);
  visit(env, rec, '#concepts/0', 700_000);
  visit(env, rec, '#overview', 0);
  rec.vote('flows/create-task', 'more', 'Show the\nqueue ‮please');
  const { batch } = rec.summary();
  const parsed = parseSignalBatch(JSON.stringify(batch));
  const ex = parsed.explainers[0];
  assert.deepEqual(Object.keys(ex.sections).sort(), ['concepts', 'concepts/0', 'flows', 'flows/create-task', 'glossary']);
  assert.equal(ex.sections['flows/create-task'].views, 1, 'a step change inside one flow is one visit');
  assert.equal(ex.sections['flows/create-task'].time, '30s-2m');
  assert.equal(ex.sections['concepts/0'].time, '>10m');
  assert.deepEqual(ex.sections['flows/create-task'].vote, { from: null, to: 'more' });
  assert.equal(ex.sections['flows/create-task'].note, 'Show the queue please', 'one line, hidden characters gone');
  assert.deepEqual(ex.lookups.glossary, { Job: 1 }, 'only terms in this glossary');
  const text = JSON.stringify(batch);
  assert.doesNotMatch(text, /file:|http|Mozilla|userAgent|"url"/, 'no urls or identifiers');
  assert.match(batch.batchId, /^[0-9a-f]{32}$/);
});

test('pending deltas leave only after a 200; a 503 keeps the same batch to resend', async () => {
  const answers = [503, 200];
  const sent = [];
  const env = load({
    protocol: 'http:', hostname: '127.0.0.1',
    fetchImpl: (url, options) => {
      sent.push({ url, options });
      const status = answers.shift();
      return Promise.resolve({ status, text: () => Promise.resolve(status === 200 ? '{"ok":true,"duplicate":false}' : '{"error":"library is busy"}') });
    },
  });
  const rec = env.ctx.sigStart(DATA, { ...CONTEXT, serve: { token: 't0k3n-abcdef' } });
  rec.vote('concepts/0', 'basic');
  const first = await rec.send();
  assert.equal(first.ok, false);
  assert.match(first.message, /busy/);
  const keptId = rec.state().batchId;
  assert.ok(rec.summary().batch, 'still pending after 503');
  const second = await rec.send();
  assert.equal(second.ok, true);
  assert.equal(JSON.parse(sent[1].options.body).batchId, keptId, 'the same batch id is sent again');
  assert.equal(sent[1].options.headers['x-concept-explainer-token'], 't0k3n-abcdef');
  assert.equal(rec.summary().batch, null, 'cleared after 200');
  assert.notEqual(rec.state().batchId, keptId, 'a new batch starts');
  rec.vote('concepts/0', 'clear');
  assert.deepEqual(JSON.parse(JSON.stringify(rec.summary().batch.explainers[0].sections['concepts/0'].vote)), { from: 'basic', to: 'clear' }, 'a changed vote counts once');
});

test('from file:// nothing is sent; the batch is there to download', async () => {
  let called = false;
  const env = load({ fetchImpl: () => { called = true; return Promise.reject(new Error('x')); } });
  const rec = env.ctx.sigStart(DATA, CONTEXT);
  rec.vote('flows', 'clear');
  const out = await rec.send();
  assert.equal(out.ok, false);
  assert.equal(called, false);
  assert.equal(rec.fileName(), 'acme-taskflow.signals.json');
  assert.ok(rec.summary().batch);
});

test('quiz answers count once per resolved question, with first-try wrongs and wrong picks', () => {
  const env = load();
  const state0 = env.ctx.sigFresh(CONTEXT.build);
  const saved = { answers: [{ tries: [0, 2, 1], status: 'missed' }, { tries: [0], status: 'right' }] };
  const once = env.ctx.sigQuiz(state0, saved, DATA.quiz);
  const twice = env.ctx.sigQuiz(once, saved, DATA.quiz);
  assert.deepEqual(JSON.parse(JSON.stringify(twice.pending.quiz)), {
    1: { answers: 1, firstWrong: 1, misses: 2, wrong: [0, 2] },
    2: { answers: 1, firstWrong: 0, misses: 0, wrong: [] },
  });
  const reset = env.ctx.sigQuiz(twice, { answers: [] }, DATA.quiz);
  const again = env.ctx.sigQuiz(reset, saved, DATA.quiz);
  assert.equal(again.pending.quiz[1].answers, 2, 'a reset quiz counts again');
  const batch = env.ctx.sigBatch(again, CONTEXT, '2026-11-18');
  assert.doesNotThrow(() => parseSignalBatch(JSON.stringify(batch)));
});

test('the store stays under 32 KB and a new build keeps only votes whose section is unchanged', () => {
  const env = load();
  let state = env.ctx.sigFresh(CONTEXT.build);
  for (let i = 0; i < 2000; i += 1) state = env.ctx.sigLookup(state, 'hints', `A long hint label number ${i} with words`);
  const capped = env.ctx.sigCap(state);
  assert.ok(JSON.stringify(capped).length <= 32 * 1024);
  assert.ok(Object.keys(capped.pending.hints).includes('A long hint label number 1999 with words'), 'the newest counters stay');
  const rec = env.ctx.sigStart(DATA, CONTEXT);
  rec.vote('flows', 'more');
  rec.vote('concepts', 'clear');
  const rebuilt = { ...CONTEXT, build: 'b'.repeat(64), sections: { ...CONTEXT.sections, concepts: '99999999' } };
  const next = env.ctx.sigLoad(rebuilt);
  assert.deepEqual(Object.keys(next.votes), ['flows']);
  assert.deepEqual(JSON.parse(JSON.stringify(next.pending)), { sections: {}, quiz: {}, glossary: {}, hints: {} });
});

test('Delete what this browser recorded removes every signals key, nothing else', () => {
  const env = load();
  env.store.set('concept-explainer:theme', 'dark');
  const rec = env.ctx.sigStart(DATA, CONTEXT);
  rec.vote('flows', 'more');
  env.store.set('concept-explainer:signals:other', '{}');
  assert.equal(rec.forget(), 2);
  assert.deepEqual([...env.store.keys()], ['concept-explainer:theme']);
});
