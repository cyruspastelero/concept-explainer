// Hub card thumbnails: a tiny drawing of the explainer from manifest.thumb.
// Hairlines only, no text; the accent marks one thing (the first part), the
// way the map thumbnail marks layers with a thin bar. Shapes per kind follow
// scripts/lib/thumb.mjs.
const THUMB = { w: 240, h: 64, pad: 6 };
const THUMB_MID = { x: THUMB.w / 2, y: THUMB.h / 2 };

function thumbSvg(...children) {
  return s('svg', { class: 'lib-thumb', viewBox: `0 0 ${THUMB.w} ${THUMB.h}`, 'aria-hidden': 'true', focusable: 'false' }, ...children);
}

function thumbBox(x, y, w, hgt, accent = false) {
  return [
    s('rect', { class: 'thumb-box', x, y, width: w, height: hgt, rx: 2 }),
    accent && s('rect', { class: 'thumb-mark', x, y, width: 2, height: hgt }),
  ];
}

const thumbLine = (x1, y1, x2, y2) => s('line', { class: 'thumb-edge', x1, y1, x2, y2 });
const clampCount = (n, low, high) => Math.min(Math.max(n, low), high);

function mapThumb(thumb) {
  const layers = list(thumb.layers);
  const nodes = list(thumb.nodes);
  if (!layers.length || !nodes.length) return null;
  const colW = (THUMB.w - THUMB.pad * 2) / layers.length;
  const perCol = layers.map((l) => nodes.filter((n) => n.layer === l.id));
  const rows = Math.max(...perCol.map((c) => c.length), 1);
  const boxH = Math.min(12, (THUMB.h - THUMB.pad * 2 - (rows - 1) * 4) / rows);
  const at = new Map();
  perCol.forEach((col, i) => col.forEach((n, j) => at.set(n.id, {
    x: THUMB.pad + i * colW + 6, y: THUMB.pad + j * (boxH + 4), w: colW - 12, h: boxH,
  })));
  const lines = list(thumb.edges).map((e) => [at.get(e.from), at.get(e.to)]).filter(([a, b]) => a && b)
    .map(([a, b]) => thumbLine(a.x + a.w, a.y + a.h / 2, b.x, b.y + b.h / 2));
  const boxes = perCol.flatMap((col, i) => col.map((n) => {
    const b = at.get(n.id);
    return s('g', { class: 'thumb-layer', style: layerStyle(layers[i].color) },
      s('rect', { class: 'thumb-box', x: b.x, y: b.y, width: b.w, height: b.h, rx: 2 }),
      s('rect', { class: 'thumb-bar', x: b.x, y: b.y, width: 2, height: b.h }));
  }));
  return thumbSvg(lines, boxes);
}

// Two or three overlapping circles.
function vennThumb(thumb) {
  const n = clampCount(list(thumb.sets).length, 2, 3);
  const r = 22;
  const step = 26;
  const x0 = THUMB_MID.x - ((n - 1) * step) / 2;
  return thumbSvg(Array.from({ length: n }, (_, i) => s('circle', {
    class: i === 0 ? 'thumb-ring is-accent' : 'thumb-ring', cx: x0 + i * step, cy: THUMB_MID.y, r,
  })));
}

// A ring with one dot per step.
function cycleThumb(thumb) {
  const n = clampCount(list(thumb.items).length, 3, 8);
  const r = 22;
  const dots = Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return s('circle', { class: i === 0 ? 'thumb-dot is-accent' : 'thumb-dot', cx: THUMB_MID.x + r * Math.cos(a), cy: THUMB_MID.y + r * Math.sin(a), r: 4 });
  });
  return thumbSvg(s('circle', { class: 'thumb-ring', cx: THUMB_MID.x, cy: THUMB_MID.y, r }), dots);
}

// Full-width bars stacked top to bottom.
function layersThumb(thumb) {
  const n = clampCount(list(thumb.items).length, 2, 5);
  const gap = 3;
  const barH = (THUMB.h - THUMB.pad * 2 - gap * (n - 1)) / n;
  const w = 128;
  return thumbSvg(Array.from({ length: n }, (_, i) => thumbBox(THUMB_MID.x - w / 2, THUMB.pad + i * (barH + gap), w, barH, i === 0)));
}

// Bars that narrow by value (or evenly).
function funnelThumb(thumb) {
  const items = list(thumb.items).slice(0, 5);
  const n = clampCount(items.length, 2, 5);
  const values = items.map((i) => (typeof i.value === 'number' && i.value > 0 ? i.value : null));
  const top = Math.max(...values.filter(Boolean), 1);
  const gap = 3;
  const barH = (THUMB.h - THUMB.pad * 2 - gap * (n - 1)) / n;
  return thumbSvg(Array.from({ length: n }, (_, i) => {
    const share = values[i] ? Math.max(values[i] / top, 0.2) : 1 - (i * 0.7) / n;
    const w = 140 * share;
    return thumbBox(THUMB_MID.x - w / 2, THUMB.pad + i * (barH + gap), w, barH, i === 0);
  }));
}

// States as boxes in a row, transitions as arcs above them.
function stateThumb(thumb) {
  const states = list(thumb.states).slice(0, 5);
  const n = clampCount(states.length, 2, 5);
  const w = 30;
  const step = Math.min(44, (THUMB.w - THUMB.pad * 2 - w) / Math.max(n - 1, 1));
  const x0 = THUMB_MID.x - ((n - 1) * step + w) / 2;
  const y = 34;
  const index = new Map(states.map((st, i) => [st.id, i]));
  const arcs = list(thumb.transitions).map(([from, to]) => [index.get(from), index.get(to)])
    .filter(([a, b]) => a !== undefined && b !== undefined && a !== b)
    .slice(0, 6)
    .map(([a, b]) => {
      const xa = x0 + a * step + w / 2;
      const xb = x0 + b * step + w / 2;
      return s('path', { class: 'thumb-arc', d: `M${xa},${y} C${xa},${y - 22} ${xb},${y - 22} ${xb},${y}` });
    });
  return thumbSvg(arcs, Array.from({ length: n }, (_, i) => thumbBox(x0 + i * step, y, w, 16, i === 0)));
}

// Depth of each node from the parent links (roots are depth 0).
function hierarchyDepths(nodes) {
  const byIdMap = new Map(nodes.map((n) => [n.id, n]));
  const depthOf = (n, seen = new Set()) => {
    if (!n.parent || !byIdMap.has(n.parent) || seen.has(n.id)) return 0;
    return 1 + depthOf(byIdMap.get(n.parent), new Set([...seen, n.id]));
  };
  return nodes.map((n) => ({ ...n, depth: Math.min(depthOf(n), 2) }));
}

// A small tree: one row per level, lines from each parent.
function hierarchyThumb(thumb) {
  const nodes = hierarchyDepths(list(thumb.nodes));
  if (!nodes.length) return null;
  const levels = [0, 1, 2].map((d) => nodes.filter((n) => n.depth === d).slice(0, 6)).filter((row) => row.length);
  const w = 24;
  const rowY = (d) => THUMB.pad + d * 19;
  const at = new Map();
  levels.forEach((row, d) => row.forEach((n, i) => {
    const step = Math.min(34, 200 / row.length);
    at.set(n.id, { x: THUMB_MID.x - (row.length * step) / 2 + i * step + (step - w) / 2, y: rowY(d) });
  }));
  const lines = nodes.filter((n) => at.has(n.id) && at.has(n.parent)).map((n) => {
    const a = at.get(n.parent);
    const b = at.get(n.id);
    return thumbLine(a.x + w / 2, a.y + 12, b.x + w / 2, b.y);
  });
  const boxes = [...at.entries()].map(([nodeId, p]) => thumbBox(p.x, p.y, w, 12, nodeId === levels[0][0].id));
  return thumbSvg(lines, boxes);
}

// A small table: a header row, then rows of cells.
function compareThumb(thumb) {
  const cols = clampCount(list(thumb.columns ? thumb.columns.map((c) => ({ c })) : []).length, 2, 4) + 1;
  const rows = clampCount(list(thumb.rows).length, 2, 4) + 1;
  const cellW = 30;
  const cellH = (THUMB.h - THUMB.pad * 2) / rows;
  const x0 = THUMB_MID.x - (cols * cellW) / 2;
  const cells = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const header = r === 0 || c === 0;
      cells.push(s('rect', { class: header ? 'thumb-cell is-head' : 'thumb-cell', x: x0 + c * cellW, y: THUMB.pad + r * cellH, width: cellW, height: cellH }));
    }
  }
  return thumbSvg(cells, s('rect', { class: 'thumb-mark', x: x0 + cellW, y: THUMB.pad, width: cellW, height: 2 }));
}

// Two axes with the points placed on them.
function quadrantThumb(thumb) {
  const size = 52;
  const x0 = THUMB_MID.x - size / 2;
  const y0 = THUMB_MID.y - size / 2;
  // Points run from 0 (left, bottom) to 1, as in the quadrant visual.
  const unitClamp = (v) => Math.min(Math.max(v, 0), 1);
  const points = list(thumb.points).filter((p) => typeof p.x === 'number' && typeof p.y === 'number');
  const dots = points.slice(0, 12).map((p, i) => s('circle', {
    class: i === 0 ? 'thumb-dot is-accent' : 'thumb-dot', r: 3, cx: x0 + unitClamp(p.x) * size, cy: y0 + (1 - unitClamp(p.y)) * size,
  }));
  return thumbSvg(
    s('rect', { class: 'thumb-ring', x: x0, y: y0, width: size, height: size }),
    thumbLine(x0 + size / 2, y0, x0 + size / 2, y0 + size), thumbLine(x0, y0 + size / 2, x0 + size, y0 + size / 2), dots);
}

// Two panels with an arrow between, a line per item.
function beforeAfterThumb(thumb) {
  const panelW = 64;
  const gap = 36;
  const xs = [THUMB_MID.x - gap / 2 - panelW, THUMB_MID.x + gap / 2];
  const panels = [thumb.before, thumb.after].map((side, p) => {
    const n = clampCount(list(side && side.items ? side.items.map((i) => ({ i })) : []).length, 2, 4);
    const lines = Array.from({ length: n }, (_, i) => s('rect', {
      class: p === 1 && i === 0 ? 'thumb-mark' : 'thumb-line', x: xs[p] + 8, y: THUMB.pad + 9 + i * 10, width: panelW - 16 - (i % 2) * 12, height: 2,
    }));
    return [s('rect', { class: 'thumb-box', x: xs[p], y: THUMB.pad, width: panelW, height: THUMB.h - THUMB.pad * 2, rx: 2 }), lines];
  });
  const ax = THUMB_MID.x - gap / 2 + 8;
  const bx = THUMB_MID.x + gap / 2 - 8;
  return thumbSvg(panels, thumbLine(ax, THUMB_MID.y, bx, THUMB_MID.y),
    s('path', { class: 'thumb-arc', d: `M${bx - 4},${THUMB_MID.y - 4} L${bx},${THUMB_MID.y} L${bx - 4},${THUMB_MID.y + 4}` }));
}

const THUMB_KINDS = {
  map: mapThumb, venn: vennThumb, cycle: cycleThumb, layers: layersThumb, funnel: funnelThumb, state: stateThumb,
  hierarchy: hierarchyThumb, compare: compareThumb, quadrant: quadrantThumb, beforeAfter: beforeAfterThumb,
};

/** The card's thumbnail, or null for a kind the hub cannot draw. */
function cardThumb(thumb) {
  if (!thumb || typeof thumb !== 'object' || !Object.hasOwn(THUMB_KINDS, thumb.kind)) return null;
  return THUMB_KINDS[thumb.kind](thumb);
}
