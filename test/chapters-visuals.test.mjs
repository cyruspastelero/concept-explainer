import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadChapters, walk } from './chapters-fake-dom.mjs';
import { EXAMPLES, PARTS, allVisuals, parts, mountIn } from './chapters-fixtures.mjs';

// The visuals kit: every kind draws its parts inside its width, one tab stop, keys, the detail panel, and state routing.

test('the fixture and the examples cover all nine visual kinds', () => {
  const kinds = new Set(allVisuals().map(([, v]) => v.kind));
  assert.deepEqual([...kinds].sort(), Object.keys(PARTS).sort());
});

test('every visual draws one selectable part per data item, in the documented order', () => {
  const env = loadChapters();
  allVisuals().forEach(([name, visual]) => {
    const mounted = env.ctx.vizMount(visual, { label: name });
    mountIn(env, mounted.root);
    const found = parts(mounted.root);
    assert.equal(found.length, PARTS[visual.kind](visual), `${name} (${visual.kind})`);
    assert.equal(mounted.count(), found.length);
    found.forEach((el, i) => {
      assert.equal(el.getAttribute('data-part'), String(i), `${name} part order`);
      assert.ok(el.getAttribute('aria-label'), `${name} part ${i} has a name`);
    });
  });
});

test('drawings stay inside their width, with no NaN, at phone and desktop widths', () => {
  const env = loadChapters();
  [260, 330, 700, 1040].forEach((width) => {
    allVisuals().forEach(([name, visual]) => {
      const drawing = env.ctx.vizDrawer(visual.kind)(visual, width, 'm');
      assert.ok(Number.isFinite(drawing.height) && drawing.height > 0, `${name} height`);
      const els = [...[drawing.nodes].flat(Infinity).filter(Boolean), ...drawing.parts.map((p) => p.el)].flatMap(walk);
      els.forEach((el) => {
        [...el.attributes.entries()].forEach(([attr, value]) => {
          assert.doesNotMatch(value, /NaN|undefined|Infinity/, `${name} at ${width}: ${el.localName}.${attr}="${value}"`);
        });
        const num = (a) => Number(el.getAttribute(a));
        if (el.localName === 'rect') {
          assert.ok(num('x') >= -1 && num('x') + num('width') <= width + 1, `${name} at ${width}: rect ${num('x')}+${num('width')}`);
          assert.ok(num('y') >= -1 && num('y') + num('height') <= drawing.height + 1, `${name} at ${width}: rect y ${num('y')}+${num('height')} > ${drawing.height}`);
        }
        if (el.localName === 'circle' && !el.closest('marker')) {
          assert.ok(num('cx') - num('r') >= -1 && num('cx') + num('r') <= width + 1, `${name} at ${width}: circle`);
        }
        // Text anchored at its start must start inside; centred text must be centred inside.
        if (el.localName === 'text' && el.getAttribute('x') !== null && !el.getAttribute('transform')) {
          assert.ok(num('x') >= -1 && num('x') <= width + 1, `${name} at ${width}: text x ${num('x')}`);
        }
      });
    });
  });
});

test('one tab stop: the selected part, or the first when nothing is selected', () => {
  const env = loadChapters();
  const visual = EXAMPLES.all.diagrams.find((d) => d.kind === 'state');
  const mounted = env.ctx.vizMount(visual);
  mountIn(env, mounted.root);
  const stops = () => parts(mounted.root).filter((el) => el.getAttribute('tabindex') === '0');
  assert.equal(stops().length, 1);
  assert.equal(stops()[0].getAttribute('data-part'), '0');
  mounted.select(3);
  assert.equal(stops().length, 1);
  assert.equal(stops()[0].getAttribute('data-part'), '3');
  assert.equal(parts(mounted.root).filter((el) => el.getAttribute('aria-selected') === 'true').length, 1);
});

test('arrow keys, Home, End and Escape move through the parts', () => {
  const env = loadChapters();
  const visual = EXAMPLES.all.diagrams.find((d) => d.kind === 'cycle');
  const picked = [];
  const mounted = env.ctx.vizMount(visual, { onSelect: (i) => picked.push(i) });
  mountIn(env, mounted.root);
  const key = (k) => parts(mounted.root).find((el) => el.getAttribute('data-part') === String(mounted.selected() ?? 0)).dispatch('keydown', { key: k });
  key('ArrowRight');
  assert.equal(mounted.selected(), 1);
  assert.equal(env.document.activeElement.getAttribute('data-part'), '1');
  key('End');
  assert.equal(mounted.selected(), visual.items.length - 1);
  key('ArrowDown');
  assert.equal(mounted.selected(), 0, 'wraps around');
  key('ArrowLeft');
  assert.equal(mounted.selected(), visual.items.length - 1);
  key('Home');
  assert.equal(mounted.selected(), 0);
  key('Escape');
  assert.equal(mounted.selected(), null);
  assert.deepEqual(picked.slice(0, 2), [1, visual.items.length - 1]);
});

test('the detail panel shows the selected part, its detail and its relations', () => {
  const env = loadChapters();
  const visual = EXAMPLES.concept.concepts[2].visual;
  const mounted = env.ctx.vizMount(visual);
  mountIn(env, mounted.root);
  mounted.select(2);
  const panel = walk(mounted.root).find((el) => el.classList.contains('viz-detail'));
  assert.match(panel.textContent, /Stored response/);
  assert.match(panel.textContent, /retry replays/);
  assert.match(panel.textContent, /window ends: Expired/);
});

test('an unknown kind says so instead of drawing', () => {
  const env = loadChapters();
  const mounted = env.ctx.vizMount({ kind: 'pie' });
  assert.match(mounted.root.textContent, /not in the kit/);
  assert.equal(mounted.count(), 0);
  assert.equal(mounted.select(0), null);
});

test('state diagrams: no label sits on any edge, and no arc crosses a self-loop', () => {
  const env = loadChapters();
  const states = allVisuals().filter(([, v]) => v.kind === 'state');
  assert.ok(states.some(([name]) => name === 'all:cart-states'), 'the fixture with a self-loop is checked');
  const inside = (r, [x, y], pad = 0) => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;
  const bbox = (points) => {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };
  [330, 700, 1040].forEach((width) => states.forEach(([name, visual]) => {
    const drawing = env.ctx.vizDrawState(visual, width, 'm');
    const { paths, labels, boxes } = drawing.geometry;
    assert.equal(paths.length, visual.transitions.length, `${name} at ${width}: one path per transition`);
    labels.forEach((label) => {
      paths.forEach((path) => {
        // A numbered badge sits on its own line by design; a text label sits on none.
        if (label.onLine && path.key === label.key) return;
        assert.ok(!path.points.some((pt) => inside(label.rect, pt)), `${name} at ${width}: label "${label.key.label}" sits on edge "${path.key.label}"`);
      });
      boxes.forEach((box) => assert.ok(!(label.rect.x < box.x + box.w && box.x < label.rect.x + label.rect.w && label.rect.y < box.y + box.h && box.y < label.rect.y + label.rect.h), `${name} at ${width}: label "${label.key.label}" covers a state`));
      assert.ok(label.rect.y >= 0 && label.rect.y + label.rect.h <= drawing.height && label.rect.x >= 0 && label.rect.x + label.rect.w <= width, `${name} at ${width}: label "${label.key.label}" inside the drawing`);
    });
    const loops = paths.filter((p) => p.key.from === p.key.to);
    loops.forEach((loop) => {
      const area = bbox(loop.points);
      paths.filter((p) => p !== loop).forEach((other) => {
        assert.ok(!other.points.some((pt) => inside(area, pt, 1)), `${name} at ${width}: "${other.key.label}" crosses the self-loop "${loop.key.label}"`);
      });
    });
  }));
});
