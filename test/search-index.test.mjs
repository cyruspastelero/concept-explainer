import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSearchIndex, explainerHref, SEARCH_TYPES, TEXT_LIMIT } from '../scripts/lib/search-index.mjs';

const example = JSON.parse(readFileSync(new URL('../examples/taskflow.explainer.json', import.meta.url), 'utf8'));
const index = buildSearchIndex('acme-taskflow', example);
const ofType = (type) => index.filter((entry) => entry.type === type);
const PAGE = 'explainers/acme-taskflow/index.html';

test('explainerHref points at the page inside the library, relative to the hub', () => {
  assert.equal(explainerHref('acme-taskflow'), PAGE);
  assert.equal(explainerHref('acme-taskflow', 'flows/create-task/3'), `${PAGE}#flows/create-task/3`);
});

test('every entry has the documented shape and a known type', () => {
  assert.ok(index.length > 20);
  index.forEach((entry) => {
    assert.deepEqual(Object.keys(entry).filter((k) => !['date', 'kind', 'authorType'].includes(k)).sort(), ['href', 'slug', 'text', 'title', 'type']);
    assert.equal(entry.slug, 'acme-taskflow');
    assert.ok(SEARCH_TYPES.includes(entry.type), entry.type);
    assert.ok(entry.href.startsWith(PAGE), entry.href);
    assert.equal(typeof entry.title, 'string');
    assert.ok(entry.text.length <= TEXT_LIMIT);
  });
});

test('the explainer itself is one entry that opens the overview', () => {
  const [entry] = ofType('explainer');
  assert.equal(ofType('explainer').length, 1);
  assert.equal(entry.title, example.meta.title);
  assert.equal(entry.href, PAGE);
});

test('hrefs follow the deep-link contract for every type', () => {
  const first = (type) => ofType(type)[0];
  assert.equal(first('node').href, `${PAGE}#map/${example.nodes[0].id}`);
  assert.equal(first('flow').href, `${PAGE}#flows/${example.flows[0].id}`);
  assert.equal(first('step').href, `${PAGE}#flows/${example.flows[0].id}/1`);
  assert.equal(first('change').href, `${PAGE}#changes/${example.changes[0].id}`);
  assert.equal(first('entity').href, `${PAGE}#data/${encodeURIComponent(example.dataModel[0].name)}`);
  assert.equal(first('concept').href, `${PAGE}#concepts/0`);
  assert.equal(first('glossary').href, `${PAGE}#glossary/${encodeURIComponent(example.glossary[0].term)}`);
  assert.equal(first('file').href, `${PAGE}#tree/${encodeURIComponent(example.tree[0].path)}`);
  assert.equal(first('run').href, `${PAGE}#run`);
});

test('steps are numbered from 1 within their flow', () => {
  const flow = example.flows[1];
  const steps = ofType('step').filter((e) => e.href.includes(`#flows/${flow.id}/`));
  assert.equal(steps.length, flow.steps.length);
  assert.equal(steps.at(-1).href, `${PAGE}#flows/${flow.id}/${flow.steps.length}`);
});

test('counts match the data, one entry per item', () => {
  assert.equal(ofType('node').length, example.nodes.length);
  assert.equal(ofType('flow').length, example.flows.length);
  assert.equal(ofType('change').length, example.changes.length);
  assert.equal(ofType('concept').length, example.concepts.length);
  assert.equal(ofType('file').length, example.tree.length);
  assert.equal(ofType('run').length, example.runbook.length);
});

test('change entries carry date, kind and authorType for a merged timeline', () => {
  const entry = ofType('change')[0];
  assert.equal(entry.date, example.changes[0].date);
  assert.equal(entry.authorType, example.changes[0].authorType);
  assert.equal(entry.kind, example.changes[0].kind);
});

test('ids with spaces, slashes and hashes are URI-encoded as one segment', () => {
  const data = {
    meta: { title: 'X', summary: 'y' },
    tree: [{ path: 'src/a b/#x.js', note: 'n' }],
    glossary: [{ term: 'A/B test', definition: 'd' }],
  };
  const hrefs = buildSearchIndex('x', data).map((e) => e.href);
  assert.ok(hrefs.includes('explainers/x/index.html#tree/src%2Fa%20b%2F%23x.js'));
  assert.ok(hrefs.includes('explainers/x/index.html#glossary/A%2FB%20test'));
});

test('long text is clipped and whitespace collapsed', () => {
  const data = { meta: { title: 'X', summary: `a\n\n  b ${'word '.repeat(200)}` } };
  const [entry] = buildSearchIndex('x', data);
  assert.ok(entry.text.length <= TEXT_LIMIT);
  assert.ok(entry.text.startsWith('a b word'));
  assert.ok(entry.text.endsWith('…'));
});

test('duplicates collapse and items missing their id are skipped', () => {
  const data = {
    meta: { title: 'X', summary: 'y' },
    nodes: [{ id: 'api', label: 'API' }, { id: 'api', label: 'API' }, { label: 'no id' }],
    flows: [{ title: 'no id', steps: [{ label: 'a' }] }],
    glossary: [{ term: 'Same', definition: 'd' }, { term: 'Same', definition: 'd' }],
  };
  const types = buildSearchIndex('x', data).map((e) => e.type);
  assert.deepEqual(types, ['explainer', 'node', 'glossary']);
});

test('malformed data never throws', () => {
  assert.deepEqual(buildSearchIndex('x', {}).map((e) => e.type), ['explainer']);
  assert.doesNotThrow(() => buildSearchIndex('x', { meta: null, nodes: 'nope', flows: [null, { id: 'f', steps: null }] }));
});

const v2 = {
  schemaVersion: 2,
  meta: { type: 'pr', title: 'PR 7', summary: 'Adds paging.', status: 'merged' },
  context: { problem: 'Lists were slow.', goals: ['Fast lists'], nonGoals: [] },
  diff: [{ path: 'src/api/list.ts', status: 'modified', summary: 'Adds a cursor.' }],
  options: [{ title: 'Cursor', summary: 'Stable pages.' }, { title: 'Offset', summary: 'Simple.' }],
  risks: [{ risk: 'Old clients break', impact: 'medium', mitigation: 'Keep offset for a month.' }],
  rollout: [{ label: 'Ship behind a flag' }],
  timeline: [{ at: '10:02', label: 'Alert fires', kind: 'detect' }],
  diagrams: [{ id: 'paging model', kind: 'cycle', title: 'How a page loads', caption: 'Fetch, render, repeat.' }],
};

test('v2 chapters get their own entry types and deep links', () => {
  const entries = buildSearchIndex('x', v2);
  const href = (type) => entries.filter((e) => e.type === type).map((e) => e.href);
  const P = 'explainers/x/index.html';
  assert.deepEqual(href('diff'), [`${P}#diff/src%2Fapi%2Flist.ts`]);
  assert.deepEqual(href('option'), [`${P}#options/0`, `${P}#options/1`]);
  assert.deepEqual(href('risk'), [`${P}#risks/0`]);
  assert.deepEqual(href('rollout'), [`${P}#rollout/0`]);
  assert.deepEqual(href('event'), [`${P}#timeline/0`]);
  assert.deepEqual(href('visual'), [`${P}#visuals/paging%20model`]);
  ['diff', 'option', 'risk', 'rollout', 'event', 'visual'].forEach((t) => assert.ok(SEARCH_TYPES.includes(t)));
  assert.match(entries.find((e) => e.type === 'explainer').text, /Lists were slow/);
});

test('each quiz question gets an entry that opens it, counted from 1', () => {
  const entries = buildSearchIndex('acme-taskflow', example).filter((e) => e.type === 'question');
  assert.equal(entries.length, example.quiz.length);
  assert.equal(entries[0].href, `${PAGE}#quiz/1`);
  assert.equal(entries.at(-1).href, `${PAGE}#quiz/${example.quiz.length}`);
  assert.equal(entries[0].title, example.quiz[0].question);
  assert.ok(SEARCH_TYPES.includes('question'));
});
