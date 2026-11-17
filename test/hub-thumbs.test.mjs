import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadChapters, walk } from './chapters-fake-dom.mjs';
import { thumbFor } from '../scripts/lib/thumb.mjs';
import { VISUAL_KINDS } from '../scripts/lib/schema.mjs';

// Hub card thumbnails draw every visual kind as a small hairline picture:
// no text, real shapes, one accent mark.
const dir = new URL('../template/js/', import.meta.url);
const fixture = JSON.parse(readFileSync(new URL('./fixtures/chapters-all.explainer.json', import.meta.url), 'utf8'));
const visuals = [...fixture.diagrams, ...fixture.concepts.map((c) => c.visual).filter(Boolean)];

function hub() {
  const { ctx } = loadChapters();
  vm.runInContext(['icons.js', 'hub-thumbs.js'].map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n;\n'), ctx);
  return ctx;
}

const SHAPES = new Set(['rect', 'circle', 'line', 'path']);
const textOf = (el) => walk(el).flatMap((e) => (e.childNodes || []).filter((c) => c.nodeType === 3).map((c) => c.data)).join('').trim();

test('every visual kind gets a drawn thumbnail', () => {
  const ctx = hub();
  VISUAL_KINDS.forEach((kind) => {
    const visual = visuals.find((v) => v.kind === kind);
    assert.ok(visual, `the fixture has a ${kind} visual`);
    const thumb = thumbFor({ meta: { type: 'concept' }, diagrams: [visual] });
    assert.equal(thumb.kind, kind);
    const svg = ctx.cardThumb(thumb);
    assert.ok(svg, `${kind} draws`);
    assert.equal(svg.tagName.toLowerCase(), 'svg');
    const shapes = walk(svg).filter((e) => SHAPES.has(String(e.tagName).toLowerCase()));
    assert.ok(shapes.length >= 3, `${kind}: real shapes, not a label (${shapes.length})`);
    assert.equal(textOf(svg), '', `${kind}: no text`);
    const accents = shapes.filter((e) => /\b(thumb-mark|is-accent)\b/.test(e.getAttribute('class') || ''));
    assert.ok(accents.length >= 1, `${kind}: one accent mark`);
    shapes.forEach((e) => ['x', 'y', 'cx', 'cy', 'r', 'width', 'height', 'x1', 'y1', 'x2', 'y2'].forEach((a) => {
      const v = e.getAttribute(a);
      if (v !== null) assert.ok(Number.isFinite(Number(v)), `${kind}: ${a}=${v}`);
    }));
  });
});

test('the hub keeps the map thumbnail and draws nothing for an unknown kind', () => {
  const ctx = hub();
  const data = JSON.parse(readFileSync(new URL('../examples/taskflow.explainer.json', import.meta.url), 'utf8'));
  const svg = ctx.cardThumb(thumbFor(data));
  assert.ok(walk(svg).some((e) => (e.getAttribute('class') || '').includes('thumb-bar')), 'layer bars on the map');
  assert.equal(ctx.cardThumb({ kind: 'nope' }), null);
  assert.equal(ctx.cardThumb({ kind: 'constructor' }), null);
  assert.equal(ctx.cardThumb(null), null);
});
