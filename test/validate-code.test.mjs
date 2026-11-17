import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateExplainer } from '../scripts/lib/validate.mjs';
import { CHAPTER_KEYS, TYPE_RULES } from '../scripts/lib/schema.mjs';
import { buildSearchIndex } from '../scripts/lib/search-index.mjs';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const SOURCE = Array.from({ length: 20 }, (_, i) => `const v${i + 1} = ${i + 1};`);

function base(walkthroughs, extra = {}) {
  return {
    schemaVersion: 2,
    meta: { type: 'concept', title: 'T', summary: 'S. Two.' },
    concepts: [{ title: 'Idea', body: 'Body.' }],
    glossary: [{ term: 'key', definition: 'A thing.' }],
    walkthroughs,
    ...extra,
  };
}

function walk(over = {}) {
  return {
    id: 'w', title: 'A walk', file: 'src/a.js:3-9', lang: 'js', why: 'It carries the idea.',
    code: SOURCE.slice(2, 9).join('\n'),
    steps: [{ lines: '3-4', note: 'Sets two values.' }, { lines: '6', note: 'Sets one more.', kind: 'gotcha' }],
    takeaway: 'Values are set in order.',
    ...over,
  };
}

const errorsOf = (data, opts) => validateExplainer(data, opts).errors.filter((e) => e.startsWith('walkthroughs'));
const warningsOf = (data, opts) => validateExplainer(data, opts).warnings.filter((e) => e.startsWith('walkthroughs'));

test('the code chapter exists and is optional for every type', () => {
  assert.ok(CHAPTER_KEYS.includes('code'));
  Object.values(TYPE_RULES).forEach((rule) => {
    assert.ok(!rule.chapters.includes('code'), 'never a default chapter');
    assert.ok(!rule.requires.includes('walkthroughs'));
    assert.deepEqual(rule.optional, ['code']);
  });
});

test('no walkthrough is never an error or a warning', () => {
  ['pr-cursor-paging', 'proposal-live-updates', 'concept-idempotency-keys', 'taskflow'].forEach((name) => {
    const data = read(`../examples/${name}.explainer.json`);
    delete data.walkthroughs;
    const { errors, warnings } = validateExplainer(data);
    assert.deepEqual([...errors, ...warnings].filter((m) => /walkthrough|code chapter/.test(m)), [], name);
  });
});

test('a well-formed walkthrough is clean', () => {
  const data = base([walk()]);
  assert.deepEqual(errorsOf(data), []);
  assert.deepEqual(warningsOf(data), []);
});

test('shape errors: id, file, code, steps, takeaway', () => {
  assert.match(errorsOf(base([walk({ id: '' })])).join(), /id/);
  assert.match(errorsOf(base([walk(), walk()])).join(), /duplicate id/);
  assert.match(errorsOf(base([walk({ file: 'src/a.js' })])).join(), /path:start-end/);
  assert.match(errorsOf(base([walk({ file: '../x.js:1-7' })])).join(), /inside the repo/);
  assert.match(errorsOf(base([walk({ code: '' })])).join(), /code/);
  assert.match(errorsOf(base([walk({ steps: [] })])).join(), /steps/);
  assert.match(errorsOf(base([walk({ takeaway: '' })])).join(), /takeaway/);
  assert.match(errorsOf(base([walk({ why: undefined })])).join(), /why/);
  assert.match(errorsOf(base([walk({ code: SOURCE.slice(2, 8).join('\n') })])).join(), /6 lines.*file range has 7/);
});

test('step lines must sit inside the snippet; order and overlap are warnings', () => {
  assert.match(errorsOf(base([walk({ steps: [{ lines: '2-4', note: 'x.' }, { lines: '6', note: 'y.' }] })])).join(), /outside 3-9/);
  assert.match(errorsOf(base([walk({ steps: [{ lines: 'four', note: 'x.' }, { lines: '6', note: 'y.' }] })])).join(), /"N" or "N-M"/);
  assert.match(warningsOf(base([walk({ steps: [{ lines: '6', note: 'x.' }, { lines: '3', note: 'y.' }] })])).join(), /reading order/);
  assert.match(warningsOf(base([walk({ steps: [{ lines: '3-6', note: 'x.' }, { lines: '5', note: 'y.' }] })])).join(), /overlap/);
  assert.match(errorsOf(base([walk({ steps: [{ lines: '3', note: 'x.', kind: 'magic' }, { lines: '6', note: 'y.' }] })])).join(), /kind/);
});

test('limits: lines, steps, walkthroughs, note length', () => {
  const long = SOURCE.concat(SOURCE, SOURCE);
  assert.match(warningsOf(base([walk({ file: 'src/a.js:1-45', code: long.slice(0, 45).join('\n') })])).join(), /45 lines/);
  assert.match(warningsOf(base([walk({ file: 'src/a.js:3-5', code: SOURCE.slice(2, 5).join('\n'), steps: [{ lines: '3', note: 'x.' }, { lines: '5', note: 'y.' }] })])).join(), /3 lines/);
  assert.match(warningsOf(base(Array.from({ length: 6 }, (_, i) => walk({ id: `w${i}` })))).join(), /6 walkthroughs/);
  assert.match(warningsOf(base([walk({ steps: [{ lines: '3', note: 'One. Two. Three.' }, { lines: '6', note: 'y.' }] })])).join(), /2 sentences/);
  assert.match(errorsOf(base([walk({ file: 'src/a.js:1-90', code: long.concat(long).slice(0, 90).join('\n') })])).join(), /90 lines/);
});

test('refs must point at real nodes, flow steps, concepts and terms', () => {
  const extra = {
    layers: [{ id: 'l', label: 'L', color: 'green' }],
    nodes: [{ id: 'api', label: 'API', layer: 'l', kind: 'api', summary: 'x', files: [] }, { id: 'db', label: 'DB', layer: 'l', kind: 'db', summary: 'x', files: [] }],
    flows: [{ id: 'f', title: 'F', steps: [{ from: 'api', to: 'db', label: 'a', kind: 'request' }, { from: 'db', to: 'api', label: 'b', kind: 'response' }, { from: 'api', to: 'db', label: 'c', kind: 'request' }] }],
  };
  const good = { node: 'api', flow: 'f', step: 2, concept: 0, glossary: 'key' };
  assert.deepEqual(errorsOf(base([walk({ steps: [{ lines: '3', note: 'x.', refs: good }, { lines: '6', note: 'y.' }] })], extra)), []);
  const bad = { node: 'nope', flow: 'zz', step: 9, concept: 4, glossary: 'missing' };
  const errors = errorsOf(base([walk({ steps: [{ lines: '3', note: 'x.', refs: bad }, { lines: '6', note: 'y.' }] })], extra)).join('\n');
  ['node', 'flow', 'concept', 'glossary'].forEach((key) => assert.match(errors, new RegExp(`refs\\.${key}`), key));
  const stepOnly = errorsOf(base([walk({ steps: [{ lines: '3', note: 'x.', refs: { flow: 'f', step: 9 } }, { lines: '6', note: 'y.' }] })], extra)).join();
  assert.match(stepOnly, /refs\.step.*1 to 3/);
});

test('illustrative code has no file, counts lines from 1, and warns in code-citing types', () => {
  const illustrative = walk({ file: undefined, illustrative: true, code: SOURCE.slice(0, 6).join('\n'), steps: [{ lines: '1-2', note: 'x.' }, { lines: '5', note: 'y.' }] });
  assert.deepEqual(errorsOf(base([illustrative])), []);
  assert.deepEqual(warningsOf(base([illustrative])), []);
  assert.match(errorsOf(base([{ ...illustrative, file: 'src/a.js:1-6' }])).join(), /illustrative.*no file/);
  const pr = base([illustrative], { meta: { type: 'pr', title: 'T', summary: 'S. Two.' }, context: { problem: 'P.', goals: [], nonGoals: [] }, diff: [{ path: 'a', status: 'added', summary: 'x' }] });
  assert.match(warningsOf(pr).join(), /illustrative.*real code/);
});

test('credentials in code are an error, with or without --repo', () => {
  const secret = ['password = "', 'hunter2hunter2', '"'].join('');
  const code = [...SOURCE.slice(2, 5), secret, ...SOURCE.slice(6, 9)].join('\n');
  assert.match(errorsOf(base([walk({ code })])).join(), /credential/);
});

test('with --repo the code must equal the cited lines', () => {
  const root = mkdtempSync(join(tmpdir(), 'walk-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src/a.js'), `${SOURCE.map((l) => `${l}   `).join('\r\n')}\n`);
  const data = base([walk()], { meta: { type: 'repo', title: 'T', summary: 'S. Two.' }, layers: [{ id: 'l', label: 'L', color: 'green' }], nodes: [{ id: 'n', label: 'N', layer: 'l', kind: 'api', summary: 'x', files: ['src/a.js'] }] });
  assert.deepEqual(errorsOf(data, { repoRoot: root }), []);
  assert.deepEqual(warningsOf(data, { repoRoot: root }), [], 'trailing spaces and CRLF are ignored');
  const changed = base([walk({ code: walk().code.replace('v5 = 5', 'v5 = 50') })], { ...data, walkthroughs: undefined });
  changed.walkthroughs = [walk({ code: walk().code.replace('v5 = 5', 'v5 = 50') })];
  assert.match(warningsOf(changed, { repoRoot: root }).join(), /does not match src\/a\.js line 5/);
  const pastEnd = { ...data, walkthroughs: [walk({ file: 'src/a.js:15-24', code: SOURCE.slice(14, 20).concat(['x', 'y', 'z', 'w']).join('\n'), steps: [{ lines: '15', note: 'x.' }, { lines: '16', note: 'y.' }] })] };
  assert.match(errorsOf(pastEnd, { repoRoot: root }).join(), /has 20 lines/);
  const missing = { ...data, walkthroughs: [walk({ file: 'src/gone.js:3-9' })] };
  assert.match(errorsOf(missing, { repoRoot: root }).join(), /not found/);
});

test('search indexes each walkthrough and each step, steps counted from 1', () => {
  const entries = buildSearchIndex('s', base([walk()])).filter((e) => e.type === 'code');
  assert.deepEqual(entries.map((e) => e.href), ['explainers/s/index.html#code/w', 'explainers/s/index.html#code/w/1', 'explainers/s/index.html#code/w/2']);
  assert.equal(entries[0].title, 'A walk');
  assert.match(entries[1].text, /Sets two values/);
});

test('the examples with walkthroughs validate cleanly under --strict rules', () => {
  ['pr-cursor-paging', 'concept-idempotency-keys', 'taskflow'].forEach((name) => {
    const data = read(`../examples/${name}.explainer.json`);
    assert.ok(Array.isArray(data.walkthroughs) && data.walkthroughs.length > 0, `${name} has a walkthrough`);
    const { errors, warnings } = validateExplainer(data);
    assert.deepEqual([...errors, ...warnings], [], name);
  });
});
