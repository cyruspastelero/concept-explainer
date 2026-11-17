import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// End-to-end runs of the CLI. Every run points the library, the Claude config
// and HOME at temp folders, so the real ~/.concept-explainer and ~/.claude stay untouched.
const CLI = fileURLToPath(new URL('../bin/concept-explainer.mjs', import.meta.url));
const ALIAS = fileURLToPath(new URL('../bin/repo-explainer.mjs', import.meta.url));
const EXAMPLE = fileURLToPath(new URL('../examples/taskflow.explainer.json', import.meta.url));

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'rx-cli-'));
  const env = {
    ...process.env, HOME: root, USERPROFILE: root, CONCEPT_EXPLAINER_HOME: join(root, 'home'), CLAUDE_CONFIG_DIR: join(root, 'claude'),
  };
  delete env.REPO_EXPLAINER_HOME;
  const data = join(root, 'taskflow.explainer.json');
  copyFileSync(EXAMPLE, data);
  const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { env, encoding: 'utf8', cwd: root });
  return { root, env, data, run, home: env.CONCEPT_EXPLAINER_HOME, config: env.CLAUDE_CONFIG_DIR };
}

test('build publishes to the library by default and prints the hub path', () => {
  const { root, data, run, home } = setup();
  const result = run('build', data);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(join(root, 'taskflow.html')));
  assert.ok(existsSync(join(home, 'explainers', 'acme-taskflow', 'index.html')));
  assert.ok(existsSync(join(home, 'library.json')));
  assert.match(result.stderr, new RegExp(`library: .*${join(home, 'index.html').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
});

test('build --no-library leaves the library alone', () => {
  const { data, run, home } = setup();
  const result = run('build', data, '--no-library');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!existsSync(home));
  assert.doesNotMatch(result.stderr, /library/);
});

test('a failed build publishes nothing', () => {
  const { root, run, home } = setup();
  const bad = join(root, 'bad.json');
  writeFileSync(bad, JSON.stringify({ meta: {} }));
  const result = run('build', bad);
  assert.equal(result.status, 1);
  assert.ok(!existsSync(home));
});

test('library list, path, add, remove and rebuild work end to end', () => {
  const { data, run, home, env } = setup();
  assert.match(run('library').stdout, /empty/i);
  assert.equal(run('library', 'path').stdout.trim(), join(home, 'index.html'));

  const added = run('library', 'add', data);
  assert.equal(added.status, 0, added.stderr);
  assert.match(added.stderr, /added acme-taskflow/);
  assert.match(run('library', 'add', data).stderr, /updated acme-taskflow/);

  const listed = execFileSync(process.execPath, [CLI, 'library', 'list'], { env, encoding: 'utf8' });
  assert.match(listed, /acme-taskflow\s+repo\s+Taskflow, explained/);

  const rebuilt = run('library', 'rebuild');
  assert.equal(rebuilt.status, 0, rebuilt.stderr);
  assert.match(rebuilt.stderr, /rebuilt 1 explainer/);

  const removed = run('library', 'remove', 'acme-taskflow');
  assert.equal(removed.status, 0, removed.stderr);
  assert.ok(!existsSync(join(home, 'explainers', 'acme-taskflow')));
  assert.match(run('library', 'remove', 'acme-taskflow').stderr, /no explainer "acme-taskflow"/);
  assert.equal(run('library', 'remove').status, 1);
});

test('library add validates first', () => {
  const { root, run, home } = setup();
  const bad = join(root, 'bad.json');
  writeFileSync(bad, JSON.stringify({ meta: {} }));
  assert.equal(run('library', 'add', bad).status, 1);
  assert.ok(!existsSync(join(home, 'library.json')));
});

test('unknown library subcommands are usage errors', () => {
  const { run } = setup();
  const result = run('library', 'frobnicate');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown library command "frobnicate"/);
});

test('install links into CLAUDE_CONFIG_DIR, is idempotent and refuses real folders', () => {
  const { run, config } = setup();
  const first = run('install');
  assert.equal(first.status, 0, first.stderr);
  assert.ok(lstatSync(join(config, 'skills', 'concept-explainer')).isSymbolicLink());
  assert.ok(existsSync(join(config, 'rules', 'concept-explainer.md')));
  assert.match(run('install').stderr, /already linked/);

  writeFileSync(join(config, 'rules', 'concept-explainer.md'), 'edited');
  const refused = run('install');
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /--force/);
  assert.equal(readFileSync(join(config, 'rules', 'concept-explainer.md'), 'utf8'), 'edited');
  assert.equal(run('install', '--force').status, 0);
});

test('help mentions the library and install commands', () => {
  const { run } = setup();
  const { stdout } = run('--help');
  ['library serve', 'library style', 'config set', 'init [input] --type', 'diff <repo> --base', 'estimate [input]'].forEach((text) => assert.ok(stdout.includes(text), text));
  assert.match(stdout, /install \[--force\]/);
  assert.match(stdout, /--no-library/);
});

function contextOf(path) {
  const match = readFileSync(path, 'utf8').match(/<script type="application\/json" id="explainer-context">([\s\S]*?)<\/script>/);
  assert.ok(match, 'context tag present');
  return JSON.parse(match[1]);
}

test('--style sets the page style, standalone and in the library', () => {
  const { root, data, run, home } = setup();
  const result = run('build', data, '--style', 'playful');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(contextOf(join(root, 'taskflow.html')).style, 'playful');
  assert.equal(contextOf(join(home, 'explainers', 'acme-taskflow', 'index.html')).style, 'playful');
  assert.equal(run('build', data).status, 0);
  assert.equal(contextOf(join(root, 'taskflow.html')).style, 'clean');
});

test('a bad --style is a usage error naming the value, on every command', () => {
  const { data, run, home } = setup();
  [['build', data], ['library', 'add', data], ['library', 'rebuild'], ['library', 'style']].forEach((args) => {
    const result = run(...args, ...(args[1] === 'style' ? ['neon'] : ['--style', 'neon']));
    assert.equal(result.status, 1, args.join(' '));
    assert.match(result.stderr, /unknown style "neon": use clean or playful/);
  });
  assert.ok(!existsSync(join(home, 'library.json')));
});

test('library style sets the default used when no flag is given', () => {
  const { root, data, run, home } = setup();
  assert.equal(run('library', 'style').stdout.trim(), 'clean');
  const set = run('library', 'style', 'playful');
  assert.equal(set.status, 0, set.stderr);
  assert.match(set.stderr, /default style: playful/);
  assert.equal(JSON.parse(readFileSync(join(home, 'config.json'), 'utf8')).style, 'playful');
  assert.equal(run('library', 'style').stdout.trim(), 'playful');
  run('build', data);
  assert.equal(contextOf(join(root, 'taskflow.html')).style, 'playful');
  const hub = readFileSync(join(home, 'index.html'), 'utf8').match(/id="explainer-data">([\s\S]*?)<\/script>/)[1];
  assert.equal(JSON.parse(hub).style, 'playful');
});

test('the repo-explainer alias still works and says it is deprecated', () => {
  const { env, root } = setup();
  const result = spawnSync(process.execPath, [ALIAS, 'library', 'path'], { env, encoding: 'utf8', cwd: root });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /repo-explainer is now concept-explainer/);
  assert.equal(result.stdout.trim(), join(env.CONCEPT_EXPLAINER_HOME, 'index.html'));
});

test('REPO_EXPLAINER_HOME is still read when the new variable is not set', () => {
  const { env, root } = setup();
  const old = { ...env, REPO_EXPLAINER_HOME: join(root, 'old-home') };
  delete old.CONCEPT_EXPLAINER_HOME;
  const result = spawnSync(process.execPath, [CLI, 'library', 'path'], { env: old, encoding: 'utf8', cwd: root });
  assert.equal(result.stdout.trim(), join(root, 'old-home', 'index.html'));
});

test('a first run moves ~/.repo-explainer to ~/.concept-explainer and says so', () => {
  const { env, root } = setup();
  const bare = { ...env };
  delete bare.CONCEPT_EXPLAINER_HOME;
  mkdirSync(join(root, '.repo-explainer'));
  writeFileSync(join(root, '.repo-explainer', 'library.json'), JSON.stringify({ version: 1, updatedAt: 't', explainers: [] }));
  const result = spawnSync(process.execPath, [CLI, 'library', 'path'], { env: bare, encoding: 'utf8', cwd: root });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /moved your library from .*\.repo-explainer to .*\.concept-explainer/);
  assert.ok(existsSync(join(root, '.concept-explainer', 'library.json')));
  assert.equal(result.stdout.trim(), join(root, '.concept-explainer', 'index.html'));
});

test('init --type writes a typed starter that validates without errors', () => {
  const { run, root } = setup();
  const out = join(root, 'pr.json');
  const result = run('init', 'https://github.com/acme/app/pull/7', '--type', 'pr', '--out', out);
  assert.equal(result.status, 0, result.stderr);
  const starter = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(starter.meta.type, 'pr');
  assert.equal(starter.meta.source.url, 'https://github.com/acme/app/pull/7');
  assert.equal(run('validate', out).status, 0);
  assert.match(run('init', '--type', 'essay').stderr, /unknown type "essay"/);
});

test('diff drafts entries from git and writes them into the data file', () => {
  const { run, root } = setup();
  const repo = join(root, 'repo');
  mkdirSync(join(repo, 'src'), { recursive: true });
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'T');
  writeFileSync(join(repo, 'src', 'a.js'), 'a\n');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  writeFileSync(join(repo, 'src', 'a.js'), 'a\nb\n');
  git('commit', '-q', '-am', 'change');
  const out = join(root, 'pr.json');
  run('init', '--type', 'pr', '--out', out);
  const printed = run('diff', repo, '--base', 'HEAD~1');
  assert.equal(printed.status, 0, printed.stderr);
  assert.equal(JSON.parse(printed.stdout).diff[0].path, 'src/a.js');
  const written = run('diff', repo, '--base', 'HEAD~1', '--data', out, '--write');
  assert.equal(written.status, 0, written.stderr);
  assert.ok(JSON.parse(readFileSync(out, 'utf8')).diff.some((d) => d.path === 'src/a.js' && d.lines === '+1 -0'));
  assert.match(run('diff', repo).stderr, /needs --base/);
});

test('estimate prints a table, or JSON with the config model and budget', () => {
  const { run, root } = setup();
  const table = run('estimate', '--type', 'concept');
  assert.equal(table.status, 0, table.stderr);
  assert.match(table.stdout, /Estimate for a concept explainer/);
  assert.match(table.stdout, /Recommended: /);
  const doc = join(root, 'notes.md');
  writeFileSync(doc, 'word '.repeat(1200));
  const json = JSON.parse(run('estimate', '--type', 'proposal', '--source', doc, '--json').stdout);
  assert.match(json.input, /1,200 words/);
  assert.equal(json.budget, null);
  assert.equal(json.confirmBeforeStart, true);
  run('config', 'set', 'model', 'opus-5.5');
  run('config', 'set', 'budgetUsd', '100');
  const pinned = JSON.parse(run('estimate', '--type', 'proposal', '--json').stdout);
  assert.equal(pinned.recommended.model, 'opus-5.5');
  assert.deepEqual(pinned.budget, { usd: 100, fits: true });
  assert.match(run('estimate', '--type', 'essay').stderr, /unknown type "essay"/);
});

test('config prints, gets, sets, resets and refuses bad values', () => {
  const { run, home } = setup();
  assert.equal(JSON.parse(run('config', '--json').stdout).audience, 'engineer');
  assert.match(run('config').stdout, /audience\s+engineer/);
  assert.equal(run('config', 'set', 'audience', 'expert').status, 0);
  assert.equal(run('config', 'get', 'audience').stdout.trim(), 'expert');
  assert.equal(run('config', 'set', 'chapters.pr.risks', 'off').status, 0);
  assert.deepEqual(JSON.parse(run('config', 'get', 'chapters').stdout), { pr: { risks: false } });
  assert.equal(run('config', 'set', 'instructions', 'Use', 'British', 'spelling.').status, 0);
  assert.equal(run('config', 'get', 'instructions').stdout.trim(), 'Use British spelling.');
  const bad = run('config', 'set', 'audience', 'kids');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /audience: "kids" is not one of newcomer, engineer, expert/);
  assert.match(run('config', 'set', 'theme', 'dark').stderr, /unknown setting "theme"/);
  assert.match(run('config', 'get', 'theme').stderr, /unknown setting "theme"/);
  assert.equal(run('config', 'reset').status, 0);
  assert.equal(JSON.parse(readFileSync(join(home, 'config.json'), 'utf8')).audience, 'engineer');
});

test('export writes a bundle and import reads it, with a dry run first', () => {
  const { run, root, data } = setup();
  run('build', data);
  const out = join(root, 'share.explainers.json');
  const exported = run('export', '--out', out);
  assert.equal(exported.status, 0, exported.stderr);
  assert.match(exported.stderr, /exported 1 explainer/);
  assert.match(exported.stderr, /acme-taskflow/);
  const other = setup();
  const dry = other.run('import', out, '--dry-run');
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /dry run/i);
  assert.match(dry.stdout, /add\s+acme-taskflow/);
  assert.ok(!existsSync(join(other.home, 'library.json')), 'the dry run wrote nothing');
  const real = other.run('import', out);
  assert.equal(real.status, 0, real.stderr);
  assert.ok(existsSync(join(other.home, 'explainers', 'acme-taskflow', 'index.html')));
  assert.match(other.run('import', out, '--on-conflict', 'skip').stdout, /skip\s+acme-taskflow/);
  assert.match(other.run('import', out, '--on-conflict', 'merge').stderr, /--on-conflict "merge"/);
  assert.match(run('export', '--type', 'incident', '--out', out).stderr, /nothing matches/);
  writeFileSync(join(root, 'bad.json'), '{"format":"zip"}');
  assert.match(other.run('import', join(root, 'bad.json')).stderr, /not a concept-explainer bundle/);
});
