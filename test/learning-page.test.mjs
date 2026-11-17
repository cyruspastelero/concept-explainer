import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadChapters, walk } from './chapters-fake-dom.mjs';
import { bootPage } from './page-harness.mjs';
import { buildExplainer } from '../scripts/lib/build.mjs';

// The reader's controls (feedback.js), the Overview card and the hub's
// Insights view (hub-insights.js), on the fake DOM.

const SRC = (f) => readFileSync(new URL(`../template/js/${f}`, import.meta.url), 'utf8');
const CONTEXT = {
  key: 'acme-taskflow', slug: 'acme-taskflow', build: 'a'.repeat(64),
  sections: { flows: '11111111', 'flows/create-task': '22222222', 'flows/upgrade': '33333333', glossary: '44444444' },
};
const DATA = {
  meta: { title: 'Taskflow, explained' },
  flows: [{ id: 'create-task', title: 'Create a task' }, { id: 'upgrade', title: 'Upgrade a team' }],
};

function load({ protocol = 'file:', hostname = '', fetchImpl = null } = {}) {
  const env = loadChapters();
  const store = new Map();
  env.window.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
    key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; },
  };
  Object.assign(env.window.location, { protocol, hostname });
  env.window.setTimeout = (fn) => fn();
  env.ctx.fetch = fetchImpl || (() => Promise.reject(new Error('offline')));
  ['settings-defaults.js', 'share.js', 'settings.js', 'signals.js', 'feedback.js', 'hub-insights.js'].forEach((f) => vm.runInContext(SRC(f), env.ctx, { filename: f }));
  return { ...env, store };
}

const byClass = (root, cls) => walk(root).filter((el) => el.classList.contains(cls));

test('the control is a labelled radio group with one tab stop, arrows and a live status', () => {
  const env = load();
  const rec = env.ctx.sigStart(DATA, CONTEXT);
  const panel = env.ctx.fbChapterPanel('flows', DATA, rec);
  env.document.body.append(panel);
  const rows = byClass(panel, 'fb-row');
  assert.equal(rows.length, 2, 'the flow on show and the chapter');
  const [item, chapter] = rows;
  assert.match(item.textContent, /This flow: Create a task/, 'the first flow when the address names none');
  assert.match(chapter.textContent, /This chapter/);
  const group = walk(chapter).find((el) => el.getAttribute('role') === 'radiogroup');
  const label = env.document.body.querySelectorAll('.fb-q').find((el) => el.getAttribute('id') === group.getAttribute('aria-labelledby'));
  assert.ok(label && /Was this clear/.test(label.textContent), 'the group is named by its question');
  const radios = walk(group).filter((el) => el.getAttribute('role') === 'radio');
  assert.deepEqual(radios.map((r) => r.textContent), ['Clear', 'Explain more', 'Too basic']);
  assert.deepEqual(radios.map((r) => r.getAttribute('tabindex')), ['0', '-1', '-1'], 'one tab stop');
  radios[0].dispatch('keydown', { key: 'ArrowRight' });
  assert.equal(radios[1].getAttribute('aria-checked'), 'true', 'arrows move and choose');
  assert.equal(env.document.activeElement, radios[1]);
  assert.equal(radios[1].getAttribute('tabindex'), '0');
  const status = walk(chapter).find((el) => el.getAttribute('role') === 'status');
  assert.equal(status.getAttribute('aria-live'), 'polite');
  assert.match(status.textContent, /Saved in this browser/);
  const note = byClass(chapter, 'fb-note')[0];
  assert.equal(note.hidden, false, 'a note field after Explain more');
  const input = byClass(note, 'fb-note-input')[0];
  const labelFor = walk(note).find((el) => el.localName === 'label');
  assert.equal(labelFor.getAttribute('for'), input.getAttribute('id'));
  assert.equal(input.getAttribute('maxlength'), '140');
  input.value = 'Show the queue';
  input.dispatch('keydown', { key: 'Enter' });
  assert.equal(rec.voteOf('flows').note, 'Show the queue');
  radios[1].click();
  assert.equal(radios[1].getAttribute('aria-checked'), 'false', 'choosing the same vote again clears it');
  assert.equal(note.hidden, true);
});

test('the item row follows the flow on show; nothing is drawn where nothing is recorded', () => {
  const env = load();
  const rec = env.ctx.sigStart(DATA, CONTEXT);
  const panel = env.ctx.fbChapterPanel('flows', DATA, rec);
  env.window.location.hash = '#flows/upgrade/2';
  rec.check();
  assert.match(byClass(panel, 'fb-row')[0].textContent, /This flow: Upgrade a team/);
  byClass(panel, 'fb-choice')[2].click();
  assert.equal(rec.voteOf('flows/upgrade').now, 'basic');
  assert.equal(rec.voteOf('flows/create-task'), null);
  const hosted = load({ protocol: 'https:', hostname: 'example.github.io' });
  assert.equal(hosted.ctx.fbChapterPanel('flows', DATA, hosted.ctx.sigStart(DATA, CONTEXT)), null);
  env.store.set('concept-explainer:learning', 'off');
  assert.equal(env.ctx.fbChapterPanel('flows', DATA, rec), null, 'off: no control');
  assert.equal(env.ctx.fbChapterPanel('changes', DATA, rec), null, 'a chapter without a section key');
});

test('Changed since last time lists what changed, why, and links to the section', () => {
  const env = load();
  const card = env.ctx.lrnChangedCard({
    changesSinceLast: {
      previousBuild: 'b'.repeat(64),
      items: [{ route: 'concepts/1', what: 'Added a worked case for the queue.', because: 'readers', addresses: ['f-0123456789ab'] }, { what: 'Renamed the worker.', because: 'source' }],
      kept: [{ flagId: 'f-ba9876543210', reason: 'Most readers here are new to queues.' }],
    },
  });
  assert.match(card.textContent, /Changed since last time/);
  assert.match(card.textContent, /Readers asked.*Added a worked case/);
  assert.ok(walk(card).some((el) => el.getAttribute('href') === '#concepts/1'));
  assert.match(card.textContent, /Kept as it was.*new to queues/);
  assert.equal(env.ctx.lrnChangedCard({}), null);
  assert.equal(env.ctx.lrnChangedCard({ changesSinceLast: { items: [] } }), null);
});

const SUMMARY = {
  updatedAt: '2026-11-18T10:00:00Z',
  totals: { explainMore: 2, weakQuiz: 1, terms: 1, refreshes: 1 },
  explainers: [{ slug: 'acme-taskflow', explainMore: 2, explainMoreVotes: 3, weakQuiz: 1, openFlags: 3, refresh: true }],
};
const DETAIL = {
  explainMore: [{ slug: 'acme-taskflow', title: 'Taskflow, explained', flagId: 'f-1', route: 'concepts/1', href: 'explainers/acme-taskflow/index.html#concepts/1', n: 3, notes: ['Show the queue.'], updatedAt: '2026-11-18' },
    { slug: 'acme-other', title: 'acme-other', withheld: true, flagId: 'f-2', route: 'flows/x', href: 'javascript:alert(1)', n: 1, notes: [] }],
  weakQuiz: [{ slug: 'acme-taskflow', title: 'Taskflow, explained', flagId: 'f-3', route: 'quiz/2', href: 'explainers/acme-taskflow/index.html#quiz/2', n: 4, firstWrong: 3, mostPicked: 0 }],
  terms: [{ term: 'Cursor', n: 5, explainers: 2 }],
  refreshes: [{ slug: 'acme-taskflow', title: 'Taskflow, explained', reasons: ['open flags'], openFlags: 3, command: 'concept-explainer insights acme-taskflow', prompt: 'Refresh the Taskflow explainer.' }],
};
const TITLES = new Map([['acme-taskflow', 'Taskflow, explained'], ['acme-other', 'Other']]);

test('hub Insights: counts at once; from file:// the command to run, never details', () => {
  const env = load();
  const view = env.ctx.insMount({ insights: SUMMARY }, {}, TITLES);
  view.refresh();
  const text = view.section.textContent;
  assert.match(text, /Explain more2sections/);
  assert.match(text, /2 sections to explain more \(3 votes\)/, 'every number says what it counts');
  assert.match(text, /Refresh due/);
  assert.match(text, /concept-explainer insights/);
  assert.doesNotMatch(text, /Show the queue/);
  assert.equal(env.ctx.insMount({ insights: null }, {}, TITLES), null, 'learning off: no view');
});

test('hub Insights: with a token, the detail lists, withheld titles as slugs, safe links only', async () => {
  const calls = [];
  const env = load({
    protocol: 'http:', hostname: '127.0.0.1',
    fetchImpl: (url, options) => { calls.push({ url, options }); return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ insights: DETAIL })) }); },
  });
  const view = env.ctx.insMount({ insights: SUMMARY }, { serve: { token: 'tok-123456' } }, TITLES);
  view.refresh();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls[0].url, '/api/insights');
  assert.equal(calls[0].options.headers['x-concept-explainer-token'], 'tok-123456');
  const text = view.section.textContent;
  assert.match(text, /3 votes/);
  assert.match(text, /Explain more2sections/, 'the tiles follow the live detail');
  assert.match(text, /Show the queue\./);
  assert.match(text, /Other/, 'a withheld title shows the slug name from the manifest');
  assert.match(text, /3 of 4 answers wrong on the first try\. Most picked wrong option: 1\./);
  assert.match(text, /Cursor5 lookups in 2 explainers/);
  const links = walk(view.section).filter((el) => el.localName === 'a').map((el) => el.getAttribute('href'));
  assert.ok(links.includes('explainers/acme-taskflow/index.html#concepts/1'));
  assert.ok(!links.some((href) => /javascript:/.test(href)), 'a link that is not into the library is dropped');
  const copies = walk(view.section).filter((el) => el.localName === 'button').map((el) => el.textContent);
  assert.ok(copies.includes('Copy the agent prompt') && copies.includes('Copy the command'));
});

test('a built page boots with the learning hooks, and a hosted copy shows no control', () => {
  const data = JSON.parse(readFileSync(new URL('../examples/taskflow.explainer.json', import.meta.url), 'utf8'));
  const withChanges = { ...data, changesSinceLast: { previousBuild: 'c'.repeat(64), items: [{ what: 'Split the create-task flow in two.', because: 'source' }] } };
  const page = bootPage(buildExplainer(withChanges, { context: { slug: 'acme-taskflow' } }));
  const overview = page.route('');
  assert.match(overview.section.textContent, /Changed since last time/);
  const flows = page.route('flows');
  assert.equal(flows.view, 'flows');
  assert.equal(page.document.body.querySelectorAll('.fb-panel').length, 0, 'not file:// or the local library: nothing recorded, no control');
});
