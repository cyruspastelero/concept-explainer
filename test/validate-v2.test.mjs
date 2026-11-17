import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateExplainer } from '../scripts/lib/validate.mjs';
import { VISUAL_KINDS } from '../scripts/lib/schema.mjs';

const fixtureRepo = fileURLToPath(new URL('./fixtures/mini-app', import.meta.url));
const example = JSON.parse(readFileSync(new URL('../examples/taskflow.explainer.json', import.meta.url), 'utf8'));

const errorsOf = (data, options) => validateExplainer(data, options).errors;
const warningsOf = (data, options) => validateExplainer(data, options).warnings;
const has = (list, path, text = '') => list.some((m) => m.startsWith(path) && m.includes(text));

const VALID_VISUALS = {
  layers: { items: [{ label: 'App' }, { label: 'Transport', detail: 'TCP' }, { label: 'Network' }] },
  cycle: { items: [{ label: 'Red' }, { label: 'Green' }, { label: 'Refactor' }] },
  state: {
    states: [{ id: 'open', label: 'Open' }, { id: 'closed', label: 'Closed' }],
    transitions: [{ from: 'open', to: 'closed', label: 'Close' }, { from: 'closed', to: 'open', label: 'Reopen' }],
  },
  compare: { columns: ['REST', 'GraphQL'], rows: [{ label: 'Caching', values: [true, 'partial'] }, { label: 'Typed', values: [false, true] }] },
  hierarchy: { nodes: [{ id: 'root', label: 'App' }, { id: 'a', label: 'Auth', parent: 'root' }, { id: 'b', label: 'Billing', parent: 'root' }] },
  beforeAfter: { before: { items: ['One server'] }, after: { items: ['Two servers', { label: 'A load balancer', detail: 'Round robin' }] }, notes: ['Sessions move to Redis.'] },
  quadrant: { axes: { x: 'Effort', y: 'Impact' }, points: [{ label: 'Cache', x: 0.2, y: 0.8 }, { label: 'Rewrite', x: 1, y: 0 }] },
  funnel: { items: [{ label: 'Visits', value: 1000 }, { label: 'Sign ups', value: 120 }] },
  venn: { sets: [{ id: 'a', label: 'Fast' }, { id: 'b', label: 'Cheap' }], items: [{ label: 'Redis', in: ['a', 'b'] }, { label: 'S3', in: ['b'] }] },
};

const diagram = (kind, extra = {}) => ({ id: `d-${kind}`, kind, title: `A ${kind}`, caption: 'One sentence.', ...VALID_VISUALS[kind], ...extra });

function concept() {
  return {
    schemaVersion: 2,
    meta: { type: 'concept', title: 'OAuth, explained', summary: 'How apps act for you.', source: { kind: 'url', ref: 'RFC 6749', url: 'https://www.rfc-editor.org/rfc/rfc6749' } },
    concepts: [
      { title: 'Tokens, not passwords', body: 'The app gets a token.', parts: [{ label: 'Access token' }, { label: 'Refresh token', detail: 'Lives longer.' }], visual: { kind: 'cycle', ...VALID_VISUALS.cycle } },
    ],
  };
}

function pr() {
  return {
    schemaVersion: 2,
    meta: { type: 'pr', title: 'PR 12, explained', summary: 'Adds a route.', status: 'merged', source: { kind: 'pr', ref: '#12' } },
    context: { problem: 'Tasks could not be listed.', goals: ['List tasks'], nonGoals: ['Paging'] },
    layers: [{ id: 'api', label: 'API', color: 'green' }],
    nodes: [{ id: 'router', label: 'Router', layer: 'api', kind: 'api', files: ['src/routes/tasks.js'], status: 'changed' }],
    diff: [
      { path: 'src/routes/tasks.js', status: 'modified', summary: 'Adds the list route.', nodes: ['router'], lines: '+12 -3', key: true },
      { path: 'src/old.js', status: 'removed', summary: 'Drops the old handler.', lines: '+0 -40' },
    ],
  };
}

function proposal(status = 'accepted') {
  return {
    schemaVersion: 2,
    meta: { type: 'proposal', title: 'Move to queues', summary: 'Send email from a worker.', status },
    context: { problem: 'Requests wait on email.', goals: ['Fast requests'], nonGoals: [] },
    options: [
      { title: 'Queue', summary: 'A worker sends it.', pros: ['Fast'], cons: ['More parts'], chosen: true, why: 'Keeps requests fast.' },
      { title: 'Inline', summary: 'Send in the request.', pros: ['Simple'], cons: ['Slow'] },
    ],
  };
}

test('the repo example (no meta.type) still passes clean, read as a repo', () => {
  assert.deepEqual(validateExplainer(example), { errors: [], warnings: [] });
});

test('valid concept, pr and proposal fixtures pass with no errors', () => {
  assert.deepEqual(errorsOf(concept()), []);
  assert.deepEqual(errorsOf(pr()), []);
  assert.deepEqual(errorsOf(proposal()), []);
});

test('schema v2 files must say their type, and the type must be known', () => {
  const missing = concept();
  delete missing.meta.type;
  assert.ok(has(errorsOf(missing), 'meta.type', 'required'));
  const unknown = concept();
  unknown.meta.type = 'essay';
  assert.ok(has(errorsOf(unknown), 'meta.type', '"essay"'));
});

test('each type requires its own objects', () => {
  const cases = [
    ['pr', ['context', 'diff']], ['change', ['context', 'diff']], ['proposal', ['context', 'options']],
    ['migration', ['context', 'options']], ['incident', ['context', 'timeline']], ['concept', ['concepts']],
  ];
  cases.forEach(([type, needs]) => {
    const errors = errorsOf({ schemaVersion: 2, meta: { type, title: 'T', summary: 'S.' } });
    needs.forEach((key) => assert.ok(has(errors, key, `a ${type} explainer needs`), `${type} needs ${key}: ${errors.join(' | ')}`));
    assert.ok(!has(errors, 'nodes'), `${type} does not need nodes`);
  });
  assert.ok(has(errorsOf({ meta: { title: 'T', summary: 'S.' } }), 'nodes'));
});

test('meta.source, status and tags are checked', () => {
  const data = concept();
  data.meta.source = { kind: 'tweet', ref: '', url: 'javascript:alert(1)' };
  data.meta.status = 'shipped';
  data.meta.tags = Array.from({ length: 9 }, (_, i) => `t${i}`);
  const { errors, warnings } = validateExplainer(data);
  assert.ok(has(errors, 'meta.source.kind', '"tweet"'));
  assert.ok(has(errors, 'meta.source.ref'));
  assert.ok(has(errors, 'meta.source.url', 'http'));
  assert.ok(has(errors, 'meta.status', '"shipped"'));
  assert.ok(has(warnings, 'meta.tags', '8'));
});

test('a decided proposal has exactly one chosen option, an open one has none', () => {
  const none = proposal('accepted');
  delete none.options[0].chosen;
  assert.ok(has(errorsOf(none), 'options', 'exactly one'));
  const two = proposal('done');
  two.options[1].chosen = true;
  assert.ok(has(errorsOf(two), 'options', 'exactly one'));
  assert.ok(has(errorsOf(proposal('proposed')), 'options', 'not chosen yet'));
  const open = proposal('draft');
  delete open.options[0].chosen;
  assert.deepEqual(errorsOf(open), []);
  const single = proposal();
  single.options = [single.options[0]];
  assert.ok(has(warningsOf(single), 'options', '2'));
});

test('diff entries check status, nodes, line counts and key files', () => {
  const data = pr();
  data.diff[0] = { ...data.diff[0], status: 'tweaked', nodes: ['ghost'], lines: 'twelve' };
  data.diff.push(...Array.from({ length: 4 }, (_, i) => ({ path: `k${i}.js`, status: 'added', summary: 'New.', key: true })));
  const { errors, warnings } = validateExplainer(data);
  assert.ok(has(errors, 'diff[0].status', '"tweaked"'));
  assert.ok(has(errors, 'diff[0].nodes[0]', '"ghost"'));
  assert.ok(has(errors, 'diff[0].lines', '+12 -3'));
  assert.ok(has(warnings, 'diff', 'key'));
});

test('risks, rollout, timeline and context are checked', () => {
  const data = {
    schemaVersion: 2,
    meta: { type: 'incident', title: 'Outage', summary: 'Login was down.' },
    context: { problem: '', goals: 'not a list' },
    timeline: [{ at: '2026-11-01T10:02:00Z', label: 'Alert fires', kind: 'detect' }, { at: '', label: 'x', kind: 'panic' }],
    risks: [{ risk: 'It recurs', impact: 'huge', mitigation: '' }],
    rollout: [{ label: 'Add alert', done: 'yes' }],
  };
  const errors = errorsOf(data);
  assert.ok(has(errors, 'context.problem'));
  assert.ok(has(errors, 'context.goals', 'list'));
  assert.ok(has(errors, 'timeline[1].at'));
  assert.ok(has(errors, 'timeline[1].kind', '"panic"'));
  assert.ok(has(errors, 'risks[0].impact', '"huge"'));
  assert.ok(has(errors, 'risks[0].mitigation'));
  assert.ok(has(errors, 'rollout[0].done', 'true or false'));
});

test('node status and before/after flow pairs are checked', () => {
  const data = pr();
  data.nodes[0].status = 'moved';
  data.flows = [
    { id: 'a', title: 'Before', variant: 'before', steps: [{ from: 'router', to: 'router', label: 'Old way', file: 'x:1' }] },
    { id: 'b', title: 'Lonely', variant: 'after', pair: 'p2', steps: [{ from: 'router', to: 'router', label: 'New way', file: 'x:1' }] },
    { id: 'c', title: 'Odd', variant: 'sideways', pair: 'p3', steps: [{ from: 'router', to: 'router', label: 'Odd way', file: 'x:1' }] },
  ];
  const { errors, warnings } = validateExplainer(data);
  assert.ok(has(errors, 'nodes[0].status', '"moved"'));
  assert.ok(has(errors, 'flows[0].pair', 'needs a pair'));
  assert.ok(has(warnings, 'flows[1].pair', 'no "before"'));
  assert.ok(has(errors, 'flows[2].variant', '"sideways"'));
});

test('concept parts must number 2 to 6, each with a label', () => {
  const few = concept();
  few.concepts[0].parts = [{ label: 'Only one' }];
  assert.ok(has(errorsOf(few), 'concepts[0].parts', '2 to 6'));
  const many = concept();
  many.concepts[0].parts = Array.from({ length: 7 }, (_, i) => ({ label: `P${i}` }));
  assert.ok(has(errorsOf(many), 'concepts[0].parts', '2 to 6'));
  const blank = concept();
  blank.concepts[0].parts[1] = { detail: 'no label' };
  assert.ok(has(errorsOf(blank), 'concepts[0].parts[1].label'));
});

test('every visual kind has a valid shape that passes', () => {
  VISUAL_KINDS.forEach((kind) => {
    const data = { ...concept(), diagrams: [diagram(kind)] };
    assert.deepEqual(errorsOf(data), [], kind);
  });
  assert.deepEqual(Object.keys(VALID_VISUALS).sort(), [...VISUAL_KINDS].sort());
});

test('broken visual shapes are errors, one per kind', () => {
  const broken = {
    layers: { items: [{ label: 'Only' }] },
    cycle: { items: [{ label: 'A' }, { detail: 'no label' }, { label: 'C' }] },
    state: { transitions: [{ from: 'open', to: 'ghost', label: 'Go' }] },
    compare: { rows: [{ label: 'Caching', values: [true] }] },
    hierarchy: { nodes: [{ id: 'a', label: 'A', parent: 'b' }, { id: 'b', label: 'B', parent: 'a' }] },
    beforeAfter: { after: undefined },
    quadrant: { points: [{ label: 'Off the chart', x: 1.5, y: -0.1 }] },
    funnel: { items: [{ label: 'One', value: 'many' }, { label: 'Two' }] },
    venn: { sets: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }, { id: 'd', label: 'D' }] },
  };
  const expected = {
    layers: 'items', cycle: 'items[1].label', state: 'transitions[0].to', compare: 'rows[0].values', hierarchy: 'nodes',
    beforeAfter: 'after', quadrant: 'points[0]', funnel: 'items[0].value', venn: 'sets',
  };
  VISUAL_KINDS.forEach((kind) => {
    const errors = errorsOf({ ...concept(), diagrams: [diagram(kind, broken[kind])] });
    assert.ok(has(errors, `diagrams[0].${expected[kind]}`), `${kind}: ${errors.join(' | ')}`);
  });
});

test('venn items must point at known sets, and quadrant axes are named', () => {
  const venn = diagram('venn', { items: [{ label: 'Ghost', in: ['z'] }, { label: 'Nowhere', in: [] }] });
  const quadrant = diagram('quadrant', { axes: { x: 'Effort' } });
  const errors = errorsOf({ ...concept(), diagrams: [venn, quadrant] });
  assert.ok(has(errors, 'diagrams[0].items[0].in[0]', '"z"'));
  assert.ok(has(errors, 'diagrams[0].items[1].in', 'at least one'));
  assert.ok(has(errors, 'diagrams[1].axes.y'));
});

test('diagrams need ids, a known kind, a title and a caption', () => {
  const data = { ...concept(), diagrams: [diagram('cycle'), { ...diagram('cycle'), title: '', caption: '' }, { id: 'x', kind: 'pie', title: 'Pie', caption: 'A pie.' }] };
  const errors = errorsOf(data);
  assert.ok(has(errors, 'diagrams[1].id', 'duplicate'));
  assert.ok(has(errors, 'diagrams[1].title'));
  assert.ok(has(errors, 'diagrams[1].caption'));
  assert.ok(has(errors, 'diagrams[2].kind', '"pie"'));
});

test('a concept visual needs a known kind and a valid shape, no id or title', () => {
  const data = concept();
  data.concepts[0].visual = { kind: 'venn', sets: [{ id: 'a', label: 'A' }] };
  assert.ok(has(errorsOf(data), 'concepts[0].visual.sets'));
  data.concepts[0].visual = { kind: 'spiral' };
  assert.ok(has(errorsOf(data), 'concepts[0].visual.kind'));
});

test('prose rules and the url allowlist reach the new fields', () => {
  const data = proposal();
  data.context.problem = 'Requests wait on email — slow.';
  data.options[0].summary = 'Uses a <b>queue</b>.';
  data.options[1].url = 'javascript:alert(1)';
  const { errors, warnings } = validateExplainer(data);
  assert.ok(has(warnings, 'context.problem', 'dash'));
  assert.ok(has(errors, 'options[0].summary', 'markup'));
  assert.ok(has(errors, 'options[1].url', 'http'));
});

test('--repo checks files only for types that cite code, and skips removed diff files', () => {
  assert.deepEqual(errorsOf(pr(), { repoRoot: fixtureRepo }), [], 'removed file is not looked for');
  const missing = pr();
  missing.diff[0].path = 'src/nope.js';
  assert.ok(errorsOf(missing, { repoRoot: fixtureRepo }).some((e) => e.includes('src/nope.js')));
  const idea = concept();
  idea.concepts[0].file = 'not/in/repo.js';
  const result = validateExplainer(idea, { repoRoot: fixtureRepo });
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some((w) => w.includes('--repo') && w.includes('concept')));
});

test('v2 analogies must say where they break, in a second sentence', () => {
  const data = concept();
  data.concepts[0].analogy = 'A token is like a coat check ticket.';
  assert.ok(has(warningsOf(data), 'concepts[0].analogy', 'where it breaks'));
  data.concepts[0].analogy = 'A token is like a coat check ticket: whoever holds it gets the coat. Unlike a ticket, a token can be copied.';
  assert.ok(!has(warningsOf(data), 'concepts[0].analogy'));
  const v1 = structuredClone(example);
  v1.concepts[1].analogy = 'One sentence only.';
  assert.ok(!has(warningsOf(v1), 'concepts[1].analogy'), 'v1 files keep their old rules');
});

test('v2 captions state the takeaway, not a label', () => {
  const data = { ...concept(), diagrams: [diagram('cycle', { caption: 'Token lifecycle' })] };
  assert.ok(has(warningsOf(data), 'diagrams[0].caption', 'takeaway'));
  data.diagrams[0].caption = 'Each refresh issues a new token and kills the old one.';
  assert.ok(!has(warningsOf(data), 'diagrams[0].caption'));
});

test('v2 quiz explanations also say why the tempting wrong answer is wrong', () => {
  const data = concept();
  data.quiz = [{ question: 'The refresh token expired. What happens?', options: ['Sign in again', 'Nothing'], answer: 0, explain: 'The session cannot renew.' }];
  assert.ok(has(warningsOf(data), 'quiz[0].explain', 'tempting'));
  data.quiz[0].explain = 'The session cannot renew. Nothing is wrong because the access token also expires soon.';
  assert.ok(!has(warningsOf(data), 'quiz[0].explain'));
});

test('types that do not cite code are not asked for file citations', () => {
  const data = proposal();
  data.layers = [{ id: 'app', label: 'App', color: 'blue' }];
  data.nodes = [{ id: 'queue', label: 'Queue', layer: 'app', kind: 'queue', status: 'added' }];
  data.flows = [{ id: 'f', title: 'Send', steps: [{ from: 'queue', to: 'queue', label: 'Sends email', kind: 'internal' }] }];
  const warnings = warningsOf(data);
  assert.ok(!warnings.some((w) => w.includes('cites no files')), warnings.join(' | '));
  assert.ok(!warnings.some((w) => w.includes('no file cited')), warnings.join(' | '));
  assert.ok(warningsOf(pr()).length >= 0);
  const prData = pr();
  prData.nodes[0].files = [];
  assert.ok(has(warningsOf(prData), 'nodes[0].files', 'cites no files'));
});
