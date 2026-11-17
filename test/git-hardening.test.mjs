import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectDiff } from '../scripts/lib/diff.mjs';
import { collectChanges } from '../scripts/lib/changes.mjs';
import { measureDiff } from '../scripts/lib/estimate-input.mjs';
import { scanRepo } from '../scripts/lib/scan.mjs';

// A repo you are asked to explain is untrusted. Its own git config can name
// programs (fsmonitor, external diff, textconv) that git would run. None may run.
function hostileRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'rx-git-'));
  const marker = join(dir, '..', `${dir.split('/').pop()}-pwned`);
  const hook = join(dir, 'hook.sh');
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'T');
  writeFileSync(hook, `#!/bin/sh\necho ran "$@" >> "${marker}"\n`);
  chmodSync(hook, 0o755);
  writeFileSync(join(dir, 'a.js'), 'a\n');
  writeFileSync(join(dir, '.gitattributes'), '*.js diff=evil\n');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  writeFileSync(join(dir, 'a.js'), 'a\nb\n');
  git('commit', '-q', '-am', 'change');
  git('config', 'core.fsmonitor', hook);
  git('config', 'diff.external', hook);
  git('config', 'diff.evil.textconv', hook);
  git('config', 'core.pager', hook);
  // A commit that carries a signature, so log.showSignature would call gpg.
  const tree = git('rev-parse', 'HEAD^{tree}').trim();
  const parent = git('rev-parse', 'HEAD').trim();
  const body = `tree ${tree}\nparent ${parent}\nauthor T <t@example.com> 1700000000 +0000\ncommitter T <t@example.com> 1700000000 +0000\n`
    + 'gpgsig -----BEGIN PGP SIGNATURE-----\n \n iQEzBAABCAAdFiEE\n -----END PGP SIGNATURE-----\n\nfeat: signed\n';
  const signed = execFileSync('git', ['-C', dir, 'hash-object', '-t', 'commit', '-w', '--stdin'], { input: body, encoding: 'utf8' }).trim();
  git('update-ref', 'refs/heads/main', signed);
  git('config', 'log.showSignature', 'true');
  git('config', 'gpg.program', hook);
  return { dir, marker };
}

test('diff, estimate and changes never run programs named by the repo config', () => {
  const { dir, marker } = hostileRepo();
  assert.equal(collectDiff(dir, { base: 'HEAD~2' }).diff[0].path, 'a.js');
  assert.deepEqual(measureDiff(dir, { base: 'HEAD~2' }), { lines: 1, files: 1 });
  assert.ok(collectChanges(dir, { since: '10 years ago' }).length >= 1);
  assert.ok(scanRepo(dir).fileCount >= 1);
  assert.ok(!existsSync(marker), 'a repo hook ran');
});

test('every git call disables repo-configured programs and ends options before refs', async () => {
  const { gitArgs } = await import('../scripts/lib/git.mjs');
  const args = gitArgs('/r', ['diff', '--numstat', '--end-of-options', 'a...b', '--']);
  ['core.fsmonitor=false', 'diff.external=', 'core.pager=cat', 'core.hooksPath=/dev/null', 'log.showSignature=false', 'gpg.program=false',
    'gpg.ssh.program=false', 'gpg.x509.program=false', 'core.sshCommand=false', 'credential.helper=', 'protocol.allow=never']
    .forEach((setting) => assert.ok(args.includes(setting) && args[args.indexOf(setting) - 1] === '-c', setting));
  assert.deepEqual(args.slice(args.indexOf('-C'), args.indexOf('-C') + 2), ['-C', '/r']);
  assert.ok(args.includes('--no-ext-diff') && args.includes('--no-textconv'), 'diff runs without external diff or textconv');
  const log = gitArgs('/r', ['log', '-n1']);
  assert.ok(log.includes('--no-ext-diff') && log.includes('--no-textconv') && log.includes('--no-show-signature'));
  assert.ok(!gitArgs('/r', ['rev-parse', 'HEAD']).includes('--no-textconv'), 'only diff and log get diff flags');
});

test('diff and estimate put refs after --end-of-options and close with --', async () => {
  const { readFileSync } = await import('node:fs');
  ['diff.mjs', 'estimate-input.mjs'].forEach((file) => {
    const source = readFileSync(new URL(`../scripts/lib/${file}`, import.meta.url), 'utf8');
    const calls = [...source.matchAll(/git\(repo, \[([^\]]*)\]\)/g)].map((m) => m[1]);
    assert.ok(calls.length > 0, file);
    calls.forEach((call) => assert.match(call, /'--end-of-options', [^,]+, '--'$/, `${file}: ${call}`));
  });
});

test('git runs without system config, prompts or askpass programs', async () => {
  const { GIT_ENV } = await import('../scripts/lib/git.mjs');
  assert.equal(GIT_ENV.GIT_CONFIG_NOSYSTEM, '1');
  assert.equal(GIT_ENV.GIT_TERMINAL_PROMPT, '0');
  assert.equal(GIT_ENV.GIT_ASKPASS, '');
  assert.equal(GIT_ENV.SSH_ASKPASS, '');
});
