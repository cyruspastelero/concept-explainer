import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadChapters, walk } from './chapters-fake-dom.mjs';
import { EXAMPLES, parts, renderChapter, pressed } from './chapters-fixtures.mjs';

// The v2 chapter renderers (context, diff, options, risks, rollout, timeline, visuals) and the helpers other chapters call.

test('every v2 chapter renders each example that has its data', () => {
  const env = loadChapters();
  const chapters = { context: 'chRenderContext', diff: 'chRenderDiff', options: 'chRenderOptions', risks: 'chRenderRisks', rollout: 'chRenderRollout', timeline: 'chRenderTimeline', diagrams: 'chRenderVisuals' };
  let rendered = 0;
  Object.entries(EXAMPLES).forEach(([name, data]) => {
    Object.entries(chapters).forEach(([key, fn]) => {
      if (data[key] === undefined) return;
      const { mount, controller } = renderChapter(env, fn, data);
      assert.ok(controller && typeof controller.open === 'function', `${name} ${key}`);
      assert.ok(mount.textContent.length > 20, `${name} ${key} drew something`);
      assert.doesNotMatch(mount.textContent, /undefined|NaN|\[object Object\]/, `${name} ${key}`);
      rendered += 1;
    });
  });
  assert.ok(rendered >= 15, `rendered ${rendered}`);
});

test('chapters with no data say so and return null', () => {
  const env = loadChapters();
  ['chRenderContext', 'chRenderDiff', 'chRenderOptions', 'chRenderRisks', 'chRenderRollout', 'chRenderTimeline', 'chRenderVisuals'].forEach((fn) => {
    const { mount, controller } = renderChapter(env, fn, { meta: { title: 'x' } });
    assert.equal(controller, null, fn);
    assert.ok(walk(mount).some((el) => el.classList.contains('empty')), fn);
  });
});

test('deep links select the item and clicks write them (indexes from 0)', () => {
  const env = loadChapters();
  const data = EXAMPLES.all;
  const cases = [
    ['chRenderRisks', 'ch-risk', ['1'], 'risks/1'],
    ['chRenderRollout', 'ch-step', ['2'], 'rollout/2'],
    ['chRenderTimeline', 'ch-event', ['4'], 'timeline/4'],
    ['chRenderOptions', 'ch-score', ['2'], 'options/2'],
  ];
  cases.forEach(([fn, cls, link, hash]) => {
    const { mount, controller } = renderChapter(env, fn, data);
    const target = controller.open(link);
    assert.ok(target, `${fn} open(${link}) returns its element`);
    assert.equal(controller.open(['99']), null, `${fn} ignores an index out of range`);
    assert.equal(controller.open(['-1']), null);
    assert.equal(controller.open(['x']), null);
    env.window.location.hash = '';
    const buttons = walk(mount).filter((el) => el.classList.contains(cls) && el.getAttribute('aria-pressed') !== 'true');
    buttons[0].click();
    assert.match(env.window.location.hash, new RegExp(`^#${hash.split('/')[0]}/\\d+$`), `${fn} click writes a deep link`);
    assert.equal(pressed(mount, cls).length, 1, `${fn} one pressed`);
  });
});

test('risks keep the data index in deep links while drawing high impact first', () => {
  const env = loadChapters();
  const { mount, controller } = renderChapter(env, 'chRenderRisks', EXAMPLES.pr);
  const cards = walk(mount).filter((el) => el.classList.contains('ch-risk'));
  assert.match(cards[0].textContent, /crafted cursor/, 'the high impact risk comes first');
  const el = controller.open(['2']);
  assert.match(el.textContent, /crafted cursor/, 'index 2 is the third risk in the data');
  env.window.location.hash = '';
  cards[0].click();
  assert.equal(env.window.location.hash, '#risks', 'clicking the selected card clears the selection');
  cards[0].click();
  assert.equal(env.window.location.hash, '#risks/2');
});

test('diff opens a path given as one encoded segment or as split parts', () => {
  const env = loadChapters();
  const { mount, controller } = renderChapter(env, 'chRenderDiff', EXAMPLES.pr);
  const path = 'packages/core/src/tasks/service.ts';
  assert.equal(controller.open([path]).getAttribute('data-path'), path);
  assert.equal(controller.open(path.split('/')).getAttribute('data-path'), path);
  assert.equal(controller.open(['nope.ts']), null);
  walk(mount).filter((el) => el.classList.contains('ch-file'))[0].click();
  assert.equal(env.window.location.hash, `#diff/${encodeURIComponent('packages/core/src/tasks/cursor.ts')}`);
  const detail = walk(mount).find((el) => el.classList.contains('ch-detail'));
  assert.ok(walk(detail).some((el) => el.getAttribute('href') === '#map/cursor'), 'files link to their map nodes');
});

test('options mark the chosen one and start on it; undecided says so', () => {
  const env = loadChapters();
  const { mount } = renderChapter(env, 'chRenderOptions', EXAMPLES.proposal);
  const cols = walk(mount).filter((el) => el.classList.contains('ch-opt-col'));
  assert.equal(cols.filter((c) => c.classList.contains('is-chosen')).length, 1);
  assert.ok(cols[2].classList.contains('is-selected'), 'the chosen option is selected first');
  const undecided = { ...EXAMPLES.proposal, meta: { ...EXAMPLES.proposal.meta, status: 'proposed' }, options: EXAMPLES.proposal.options.map(({ chosen, why, ...o }) => o) };
  const second = renderChapter(env, 'chRenderOptions', undecided);
  assert.match(second.mount.textContent, /No option is chosen yet/);
});

test('rollout marks done steps and the next one', () => {
  const env = loadChapters();
  const { mount } = renderChapter(env, 'chRenderRollout', EXAMPLES.pr);
  const steps = walk(mount).filter((el) => el.classList.contains('ch-step'));
  assert.deepEqual(steps.map((el) => ['is-done', 'is-next', 'is-todo'].find((c) => el.classList.contains(c))), ['is-done', 'is-done', 'is-done', 'is-next']);
  assert.match(mount.textContent, /3 of 4/);
});

test('the visuals chapter opens a diagram and a part by deep link', () => {
  const env = loadChapters();
  const { mount, controller } = renderChapter(env, 'chRenderVisuals', EXAMPLES.proposal);
  const el = controller.open(['what-moves', '4']);
  assert.equal(el.getAttribute('data-part'), '4', 'part 4 is the second after item (parts count before then after)');
  assert.equal(el.getAttribute('aria-selected'), 'true');
  const figures = walk(mount).filter((x) => x.classList.contains('viz-figure'));
  assert.equal(figures.filter((f) => !f.hidden).length, 1, 'one diagram shows at a time');
  assert.ok(controller.open(['options-grid']), 'a diagram id alone opens the diagram');
  assert.equal(controller.open(['missing', '0']), null);
  env.window.location.hash = '';
  parts(mount).find((p) => !p.closest('[hidden]') && p.getAttribute('data-part') === '1').click();
  assert.equal(env.window.location.hash, '#visuals/options-grid/1');
});

test('map, flow and concept helpers for the other chapters', () => {
  const env = loadChapters();
  const { ctx } = env;
  const nodes = EXAMPLES.pr.nodes;
  assert.equal(ctx.chNodeStatus(nodes.find((n) => n.status === 'unchanged')), null);
  assert.match(ctx.chNodeStatus(nodes.find((n) => n.status === 'added')).textContent, /added/);
  assert.equal(ctx.chNodeStatusAttrs(nodes.find((n) => n.status === 'changed'))['data-status'], 'changed');
  assert.equal(ctx.chStatusLegend(nodes).length, 2, 'added and changed');
  assert.equal(ctx.chStatusLegend(EXAMPLES.taskflow.nodes), null);
  const flows = EXAMPLES.pr.flows;
  const pair = ctx.chFlowPair(flows, flows[1]);
  assert.equal(pair.before.id, 'next-page-before');
  assert.equal(pair.after.id, 'next-page-after');
  assert.equal(ctx.chFlowGroups(flows).length, 1);
  assert.equal(ctx.chFlowPair(EXAMPLES.taskflow.flows, EXAMPLES.taskflow.flows[0]), null);
  let opened = null;
  const compare = ctx.chPairCompare(pair, ctx.byId(EXAMPLES.pr.nodes), (id, n) => { opened = [id, n]; });
  walk(compare).filter((el) => el.classList.contains('ch-pair-step'))[1].click();
  assert.deepEqual(opened, ['next-page-before', 2]);
  assert.match(compare.textContent, /Cursor codec/, 'a part only the after flow uses is named');
  let picked = null;
  const sw = ctx.chPairSwitch(pair, 'next-page-before', (id) => { picked = id; });
  walk(sw).filter((el) => el.localName === 'button')[1].click();
  assert.equal(picked, 'next-page-after');
  assert.equal(ctx.chVariantTag(flows[0]).textContent, 'Before');
  const extras = ctx.chConceptExtras(EXAMPLES.concept.concepts[0]);
  assert.ok(walk(extras).some((el) => el.localName === 'svg'), 'a concept visual is drawn');
  const chain = walk(extras).filter((el) => el.classList.contains('ch-part'));
  assert.equal(chain.length, 3);
  chain[1].click();
  assert.match(extras.textContent, /A timeout or dropped connection/);
  assert.equal(ctx.chConceptExtras({ title: 'x', body: 'y' }), null);
});

test('text from data stays text: no element is ever made from it', () => {
  const env = loadChapters();
  const evil = '<img src=x onerror=alert(1)><script>alert(2)</script>';
  const data = {
    meta: { title: evil, status: 'accepted' },
    context: { problem: evil, goals: [evil], nonGoals: [evil], background: evil },
    diff: [{ path: evil, status: 'added', summary: evil, lines: '+1 -1', nodes: [] }],
    options: [{ title: evil, summary: evil, pros: [evil], cons: [evil], chosen: true, why: evil, url: 'javascript:alert(3)' }, { title: 'b', summary: 'b', pros: [], cons: [] }],
    risks: [{ risk: evil, impact: 'high', mitigation: evil, owner: evil }],
    rollout: [{ label: evil, detail: evil, command: evil, done: true }],
    timeline: [{ at: evil, label: evil, detail: evil, kind: 'act' }],
    diagrams: [{ id: evil, kind: 'venn', title: evil, caption: evil, sets: [{ id: 'a', label: evil }, { id: 'b', label: evil }], items: [{ label: evil, in: ['a', 'b'] }] }],
  };
  ['chRenderContext', 'chRenderDiff', 'chRenderOptions', 'chRenderRisks', 'chRenderRollout', 'chRenderTimeline', 'chRenderVisuals'].forEach((fn) => {
    const { mount, controller } = renderChapter(env, fn, data);
    if (controller) controller.open(['0']);
    walk(mount).filter((el) => el.localName === 'button').forEach((b) => b.click());
  });
  assert.ok(!env.created.some((el) => ['img', 'script'].includes(el.localName)), 'no img or script element');
  assert.ok(!env.created.some((el) => el.getAttribute('href') && /javascript:/i.test(el.getAttribute('href'))), 'no javascript: link');
});
