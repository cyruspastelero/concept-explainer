import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Guard: no test and no npm script may write to the real home. Snapshot the
// real library, legacy library and Claude folders, run representative
// commands the way the tests and npm scripts do, and compare.
const CLI = fileURLToPath(new URL('../bin/concept-explainer.mjs', import.meta.url));
const EXAMPLE = fileURLToPath(new URL('../examples/taskflow.explainer.json', import.meta.url));
const REAL = [
  join(homedir(), '.concept-explainer'),
  join(homedir(), '.repo-explainer'),
  join(homedir(), '.claude', 'skills', 'concept-explainer'),
  join(homedir(), '.claude', 'rules', 'concept-explainer.md'),
];

const snapshot = () => REAL.map((path) => (existsSync(path) ? `${path}:${statSync(path).mtimeMs}` : `${path}:absent`));

function tempEnv() {
  const root = mkdtempSync(join(tmpdir(), 'rx-guard-'));
  const env = { ...process.env, HOME: root, USERPROFILE: root, CONCEPT_EXPLAINER_HOME: join(root, 'home'), CLAUDE_CONFIG_DIR: join(root, 'claude') };
  delete env.REPO_EXPLAINER_HOME;
  return { root, env };
}

test('CLI runs with temp HOME and homes never touch the real home', () => {
  const before = snapshot();
  const { root, env } = tempEnv();
  const data = join(root, 'taskflow.explainer.json');
  copyFileSync(EXAMPLE, data);
  const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { env, encoding: 'utf8', cwd: root });
  [['build', data], ['library'], ['config', 'set', 'audience', 'expert'], ['install'], ['export', '--out', join(root, 'b.json')], ['estimate']]
    .forEach((args) => assert.equal(run(...args).status, 0, args.join(' ')));
  assert.deepEqual(snapshot(), before);
});

test('the npm check commands never move or create a library, even with a legacy one present', () => {
  const before = snapshot();
  const { root, env } = tempEnv();
  const bare = { ...env };
  delete bare.CONCEPT_EXPLAINER_HOME;
  mkdirSync(join(root, '.repo-explainer'));
  writeFileSync(join(root, '.repo-explainer', 'library.json'), '{}');
  const out = join(root, 'out.html');
  const commands = [
    ['build', EXAMPLE, '--no-library', '--style', 'clean', '--out', out],
    ['gallery', '--out', join(root, 'gallery.html')],
    ['validate', EXAMPLE, '--strict'],
  ];
  commands.forEach((args) => assert.equal(spawnSync(process.execPath, [CLI, ...args], { env: bare, encoding: 'utf8', cwd: root }).status, 0, args.join(' ')));
  assert.ok(existsSync(join(root, '.repo-explainer', 'library.json')), 'legacy library not moved by check commands');
  assert.ok(!existsSync(join(root, '.concept-explainer')), 'no library created by check commands');
  assert.deepEqual(snapshot(), before);
});
