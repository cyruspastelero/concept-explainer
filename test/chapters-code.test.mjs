import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadChapters, walk } from './chapters-fake-dom.mjs';
import { EXAMPLES, renderChapter, plain } from './chapters-fixtures.mjs';

// The code walkthrough chapter and its links from flow steps and concepts.

test('code walkthrough: steps from 1 in deep links, lines highlighted, takeaway at the end', () => {
  const env = loadChapters();
  const data = EXAMPLES.pr;
  const { mount, controller } = renderChapter(env, 'chRenderCode', data);
  const rows = () => walk(mount).filter((el) => el.classList.contains('ch-code-row'));
  const current = () => rows().filter((r) => r.classList.contains('is-current')).map((r) => r.getAttribute('data-line'));
  assert.deepEqual(current(), ['10'], 'starts on step 1 of the first walkthrough');
  assert.equal(rows()[0].getAttribute('data-line'), '9', 'line numbers are the file line numbers');
  assert.ok(controller.open(['keyset-query', '2']));
  assert.deepEqual(current(), ['55', '56', '57', '58', '59', '60']);
  assert.match(mount.textContent, /Step 2 of 5/);
  assert.ok(walk(mount).some((el) => el.getAttribute('href') === '#glossary/Keyset%20query'), 'refs link to the glossary');
  assert.ok(walk(mount).some((el) => el.getAttribute('href') === '#flows/next-page-after/4'), 'refs link to the flow step');
  env.window.location.hash = '';
  walk(mount).find((el) => el.localName === 'button' && el.textContent === 'Continue').click();
  assert.equal(env.window.location.hash, '#code/keyset-query/3');
  walk(mount).find((el) => el.getAttribute('aria-label') === 'Line 63, step 4').click();
  assert.equal(env.window.location.hash, '#code/keyset-query/4', 'a line number jumps to its step');
  controller.open(['keyset-query', 'done']);
  assert.deepEqual(current(), [], 'no line is current on the takeaway');
  assert.match(mount.textContent, /Paging by position/);
  assert.equal(controller.open(['missing', '1']), null);
  controller.open(['cursor-codec', '99']);
  assert.deepEqual(current(), ['10'], 'an out of range step falls back to the first');
});

test('code walkthrough: keys move steps, illustrative code is tagged, tokens stay text', () => {
  const env = loadChapters();
  const { mount } = renderChapter(env, 'chRenderCode', EXAMPLES.concept);
  assert.match(mount.textContent, /Illustrative, not from a repo/);
  const root = walk(mount).find((el) => el.classList.contains('ch-code-chapter'));
  const note = () => walk(mount).find((el) => el.classList.contains('ch-code-note')).textContent;
  const first = note();
  root.dispatch('keydown', { key: 'j' });
  assert.notEqual(note(), first);
  root.dispatch('keydown', { key: 'k' });
  assert.equal(note(), first);
  root.dispatch('keydown', { key: 'ArrowRight' });
  assert.match(env.window.location.hash, /^#code\/middleware\/2$/);
  const comment = plain(env.ctx.chCodeTokens('const a = "x" // note', 'javascript', { block: false }));
  assert.deepEqual(comment, [['kw', 'const'], [null, ' a = '], ['st', '"x"'], [null, ' '], ['cm', '// note']]);
  const state = { block: false };
  assert.deepEqual(plain(env.ctx.chCodeTokens('x /* open', 'ts', state).at(-1)), ['cm', '/* open']);
  assert.deepEqual(plain(env.ctx.chCodeTokens('still */ y', 'ts', state)), [['cm', 'still */'], [null, ' y']]);
  assert.deepEqual(plain(env.ctx.chCodeTokens('x = 1  # py', 'python', { block: false }).at(-1)), ['cm', '# py']);
  const evil = { walkthroughs: [{ id: 'e', title: '<b>t</b>', file: 'a.js:1-5', why: '<script>x</script>', code: '<img src=x>\n<script>alert(1)</script>\n3\n4\n5', steps: [{ lines: '1', note: '<i>n</i>' }, { lines: '2', note: 'n' }], takeaway: 't' }] };
  renderChapter(env, 'chRenderCode', evil);
  assert.ok(!env.created.some((el) => ['img', 'script', 'b', 'i'].includes(el.localName)));
});

test('code walkthrough keys still work when focus sits on the view title, but not on another control', () => {
  const env = loadChapters();
  const { mount } = renderChapter(env, 'chRenderCode', EXAMPLES.concept);
  const root = walk(mount).find((el) => el.classList.contains('ch-code-chapter'));
  Object.defineProperty(root, 'isConnected', { value: true });
  root.getClientRects = () => [{}];
  const note = () => walk(mount).find((el) => el.classList.contains('ch-code-note')).textContent;
  const pressOn = (target, key) => {
    const event = { type: 'keydown', key, target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    (env.document.listeners.keydown || []).forEach((fn) => fn(event));
  };
  const title = env.document.createElement('h1');
  title.setAttribute('tabindex', '-1');
  env.document.body.append(title);
  const button = env.document.createElement('button');
  env.document.body.append(button);
  const first = note();
  pressOn(button, 'j');
  assert.equal(note(), first);
  pressOn(title, 'j');
  assert.notEqual(note(), first);
});

test('a flow step or concept that cites covered code links to its walkthrough step', () => {
  const env = loadChapters();
  assert.equal(env.ctx.chWalkthroughFor(EXAMPLES.pr, 'packages/core/src/tasks/service.ts:58'), '#code/keyset-query/2');
  assert.equal(env.ctx.chWalkthroughFor(EXAMPLES.pr, 'packages/core/src/tasks/service.ts:52'), '#code/keyset-query/1', 'an uncovered line opens step 1');
  assert.equal(env.ctx.chWalkthroughFor(EXAMPLES.pr, 'packages/core/src/tasks/service.ts:120'), null);
  assert.equal(env.ctx.chWalkthroughFor(EXAMPLES.taskflow, 'apps/web/app/api/tasks/route.ts:18'), '#code/create-task-route/2');
  assert.equal(env.ctx.chWalkthroughLink(EXAMPLES.taskflow, 'nope.ts:1'), null);
  assert.equal(env.ctx.chWalkthroughLink(EXAMPLES.taskflow, 'apps/web/app/api/tasks/route.ts:20').textContent, 'Walk through this code');
});
