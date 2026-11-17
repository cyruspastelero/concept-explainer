import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectDiff, mergeDiff, parseNameStatus, parseNumstat } from '../scripts/lib/diff.mjs';
import { validateExplainer } from '../scripts/lib/validate.mjs';

function repoWithBranch() {
  const dir = mkdtempSync(join(tmpdir(), 'rx-diff-'));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  mkdirSync(join(dir, 'src', 'routes'), { recursive: true });
  writeFileSync(join(dir, 'src', 'routes', 'tasks.js'), 'a\nb\nc\n');
  writeFileSync(join(dir, 'src', 'old.js'), 'x\ny\n');
  writeFileSync(join(dir, 'src', 'name.js'), Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n'));
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  git('checkout', '-q', '-b', 'feature');
  writeFileSync(join(dir, 'src', 'routes', 'tasks.js'), 'a\nB\nc\nd\n');
  rmSync(join(dir, 'src', 'old.js'));
  writeFileSync(join(dir, 'src', 'new.js'), 'n\n');
  git('mv', 'src/name.js', 'src/renamed.js');
  git('add', '-A');
  git('commit', '-q', '-m', 'feat: change things');
  return dir;
}

const NODES = [
  { id: 'router', files: ['src/routes/'] },
  { id: 'legacy', files: ['src/old.js'] },
  { id: 'fresh', files: ['src/new.js'] },
  { id: 'idle', files: ['docs/'] },
];

test('numstat and name-status output parse, renames included', () => {
  assert.deepEqual(parseNumstat('3\t1\tsrc/a.js\0-\t-\timg.png\0' + '0\t0\t\0src/x.js\0src/y.js\0'), [
    { path: 'src/a.js', added: 3, removed: 1 },
    { path: 'img.png', added: null, removed: null },
    { path: 'src/y.js', from: 'src/x.js', added: 0, removed: 0 },
  ]);
  assert.deepEqual(parseNameStatus('M\0src/a.js\0D\0gone.js\0R097\0src/x.js\0src/y.js\0A\0new.js\0'), [
    { path: 'src/a.js', status: 'modified' },
    { path: 'gone.js', status: 'removed' },
    { path: 'src/y.js', from: 'src/x.js', status: 'renamed' },
    { path: 'new.js', status: 'added' },
  ]);
});

test('collectDiff drafts one entry per file, with TODO summaries and node links', () => {
  const repo = repoWithBranch();
  const { diff, nodeStatuses } = collectDiff(repo, { base: 'main', head: 'feature', nodes: NODES });
  const byPath = Object.fromEntries(diff.map((d) => [d.path, d]));
  assert.deepEqual(Object.keys(byPath).sort(), ['src/new.js', 'src/old.js', 'src/renamed.js', 'src/routes/tasks.js']);
  assert.equal(byPath['src/routes/tasks.js'].status, 'modified');
  assert.equal(byPath['src/routes/tasks.js'].lines, '+2 -1');
  assert.deepEqual(byPath['src/routes/tasks.js'].nodes, ['router']);
  assert.equal(byPath['src/old.js'].status, 'removed');
  assert.equal(byPath['src/new.js'].status, 'added');
  assert.equal(byPath['src/renamed.js'].status, 'renamed');
  assert.equal(byPath['src/renamed.js'].from, 'src/name.js');
  diff.forEach((d) => assert.match(d.summary, /^TODO/));
  assert.deepEqual(nodeStatuses, { router: 'changed', legacy: 'removed', fresh: 'added', idle: 'unchanged' });
});

test('head defaults to HEAD, and a bad ref names the git command that failed', () => {
  const repo = repoWithBranch();
  assert.equal(collectDiff(repo, { base: 'main' }).diff.length, 4);
  assert.throws(() => collectDiff(repo, { base: 'nope' }), /git diff failed/);
  assert.throws(() => collectDiff(repo, {}), /needs --base/);
});

test('a ref that looks like an option is refused, never passed to git', () => {
  const repo = repoWithBranch();
  assert.throws(() => collectDiff(repo, { base: '--output=/tmp/x' }), /not a git ref/);
  assert.throws(() => collectDiff(repo, { base: 'main', head: '-p' }), /not a git ref/);
});

test('mergeDiff keeps summaries already written and sets node statuses', () => {
  const data = {
    schemaVersion: 2,
    meta: { type: 'pr', title: 'PR', summary: 'S.' },
    context: { problem: 'P.', goals: [], nonGoals: [] },
    layers: [{ id: 'l', label: 'L', color: 'green' }],
    nodes: NODES.map((n) => ({ ...n, label: n.id, layer: 'l', kind: 'service' })),
    diff: [{ path: 'src/routes/tasks.js', status: 'modified', summary: 'Adds the d line.', key: true }],
  };
  const drafted = collectDiff(repoWithBranch(), { base: 'main', head: 'feature', nodes: data.nodes });
  const merged = mergeDiff(data, drafted);
  const tasks = merged.diff.find((d) => d.path === 'src/routes/tasks.js');
  assert.equal(tasks.summary, 'Adds the d line.');
  assert.equal(tasks.key, true);
  assert.equal(tasks.lines, '+2 -1');
  assert.equal(merged.diff.length, 4);
  assert.equal(merged.nodes.find((n) => n.id === 'legacy').status, 'removed');
  assert.equal(data.diff.length, 1, 'input untouched');
  assert.deepEqual(validateExplainer(merged).errors, []);
});
