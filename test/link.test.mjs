import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { linkDir } from '../scripts/lib/link.mjs';

function folders() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'rx-link-')));
  const one = join(root, 'one');
  const two = join(root, 'two');
  mkdirSync(one);
  mkdirSync(two);
  mkdirSync(join(root, 'skills'));
  return { root, one, two, target: join(root, 'skills', 'concept-explainer') };
}

test('a new link is made under a temp name and renamed into place, leaving nothing behind', () => {
  const { root, one, target } = folders();
  linkDir(one, target);
  assert.ok(lstatSync(target).isSymbolicLink());
  assert.equal(realpathSync(target), one);
  assert.deepEqual(readdirSync(join(root, 'skills')), ['concept-explainer']);
});

test('relinking renames the new link over the old one, never removing it first', () => {
  const { root, one, two, target } = folders();
  symlinkSync(one, target, 'junction');
  const seen = [];
  const rename = (from, to) => {
    seen.push(existsSync(target) ? 'target present' : 'target missing');
    renameSync(from, to);
  };
  linkDir(two, target, { rename });
  assert.equal(realpathSync(target), two);
  assert.deepEqual(seen, ['target present']);
  assert.deepEqual(readdirSync(join(root, 'skills')), ['concept-explainer']);
});

test('where rename cannot replace a folder link (Windows), the old link moves aside and goes only after the new one is in', () => {
  const { root, one, two, target } = folders();
  symlinkSync(one, target, 'junction');
  const steps = [];
  const rename = (from, to) => {
    if (lstatOrNull(to)) {
      const error = new Error(`EPERM: operation not permitted, rename '${from}' -> '${to}'`);
      error.code = 'EPERM';
      throw error;
    }
    steps.push(to === target ? 'new link in' : 'old link aside');
    renameSync(from, to);
  };
  const removeLink = (path) => {
    steps.push(lstatOrNull(target) ? 'old link removed after' : 'old link removed BEFORE');
    rmSync(path);
  };
  linkDir(two, target, { rename, removeLink });
  assert.deepEqual(steps, ['old link aside', 'new link in', 'old link removed after']);
  assert.equal(realpathSync(target), two);
});

test('when the new link cannot go in, the old link is put back', () => {
  const { root, one, two, target } = folders();
  symlinkSync(one, target, 'junction');
  let calls = 0;
  const rename = (from, to) => {
    calls += 1;
    if (to === target && calls === 1) { const e = new Error('EPERM'); e.code = 'EPERM'; throw e; }
    if (to === target && from.includes('.new-')) { const e = new Error('EACCES: denied'); e.code = 'EACCES'; throw e; }
    renameSync(from, to);
  };
  assert.throws(() => linkDir(two, target, { rename }), /link .*concept-explainer: EACCES/);
  assert.equal(realpathSync(target), one, 'the old link is back');
  assert.deepEqual(readdirSync(join(root, 'skills')), ['concept-explainer']);
});

function lstatOrNull(path) {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}
