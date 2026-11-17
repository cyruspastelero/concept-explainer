// Visual kinds laid out on a plane: compare (a grid of marks), beforeAfter
// (two panels), quadrant (a 2x2) and venn (2 or 3 overlapping sets).
// See viz-core.js for the drawer contract.

const VIZ_COMPARE = { minCol: 84, row: 40, mark: 5.5, head: 15 };

function vizIsPartial(value) {
  return typeof value === 'string' && value.trim().toLowerCase() === 'partial';
}

function vizValueText(value) {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  if (typeof value === 'number') return value.toLocaleString('en');
  return text(value, 'Not given');
}

// One cell mark: a filled dot (yes), a ring (no), a half dot (partial), or the value as text.
function vizMark(value, x, y, room) {
  const r = VIZ_COMPARE.mark;
  if (value === true) return s('circle', { class: 'viz-yes', cx: x, cy: y, r });
  if (value === false) return s('circle', { class: 'viz-no', cx: x, cy: y, r: r - 0.5 });
  if (vizIsPartial(value)) {
    return s('g', { class: 'viz-half' }, s('circle', { class: 'viz-no', cx: x, cy: y, r: r - 0.5 }),
      s('path', { class: 'viz-yes', d: `M${x},${y - r} A${r},${r} 0 0 0 ${x},${y + r} Z` }));
  }
  return s('text', { class: 'viz-cell', x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, vizWrap(vizValueText(value), vizChars(room, 12), 1)[0]);
}

function vizCompareLegend(rows) {
  const values = rows.flatMap((row) => list(row.values));
  const keys = [
    values.includes(true) && ['is-yes', 'Yes'],
    values.includes(false) && ['is-no', 'No'],
    values.some(vizIsPartial) && ['is-half', 'Partly'],
  ].filter(Boolean);
  if (!keys.length) return null;
  return h('p', { class: 'viz-legend' }, keys.map(([cls, label]) => h('span', null, h('i', { class: `viz-key ${cls}`, 'aria-hidden': 'true' }), label)));
}

/** compare: columns across, one row of marks per criterion. Narrow: the label sits above its marks. */
function vizDrawCompare(visual, width) {
  const columns = list(visual.columns).map((c) => text(c, '?'));
  const rows = list(visual.rows).filter((row) => row && typeof row === 'object');
  const cols = Math.max(columns.length, 1);
  const labelW = Math.min(260, Math.max(120, Math.round(width * 0.34)));
  const wide = (width - labelW) / cols >= VIZ_COMPARE.minCol;
  const gridX = wide ? labelW : 0;
  const colW = (width - gridX) / cols;
  const colX = (j) => gridX + colW * (j + 0.5);
  const heads = columns.map((c) => vizWrap(c, vizChars(colW - 8, 12), 3));
  const headH = Math.max(...heads.map((l) => l.length), 1) * VIZ_COMPARE.head + 14;
  const nodes = heads.map((lines, j) => vizText(lines, { x: colX(j), y: 4, cls: 'viz-col-head', anchor: 'middle', lineHeight: VIZ_COMPARE.head, middle: false }));
  nodes.push(s('line', { class: 'viz-rule', x1: 0, x2: width, y1: headH - 4.5, y2: headH - 4.5 }));
  let y = headH;
  const parts = rows.map((row, i) => {
    const labelLines = vizWrap(text(row.label), vizChars((wide ? labelW : width) - 16), 2);
    const labelH = labelLines.length * VIZ_LINE;
    const height = wide ? Math.max(VIZ_COMPARE.row, labelH + 16) : labelH + 44;
    const top = y;
    y += height + 2;
    const markY = wide ? top + height / 2 : top + labelH + 24;
    const values = list(row.values);
    return vizPart([
      s('rect', { class: 'viz-row-hit', x: 0.5, y: top + 0.5, width: width - 1, height: height - 1 }),
      vizText(labelLines, { x: 10, y: wide ? top + height / 2 : top + 10 + (labelH - VIZ_LINE) / 2 }),
      columns.map((_, j) => vizMark(values[j], colX(j), markY, colW - 8)),
    ], {
      label: text(row.label),
      kicker: `Row ${i + 1} of ${rows.length}`,
      facts: columns.map((c, j) => [c, vizValueText(values[j])]),
    });
  });
  return { nodes, parts, height: y + 1, legend: vizCompareLegend(rows) };
}

const VIZ_PANEL = { head: 34, item: 40, gap: 6, pad: 10, between: 44, wideAt: 560 };

// Both panels and every item box: side by side when wide, stacked when narrow.
// An item whose label is on both sides stays; otherwise it is gone (before) or new (after).
function vizBeforeAfterLayout(visual, width) {
  const sides = [['before', 'Before'], ['after', 'After']].map(([key, name]) => ({
    key, name, items: list(visual[key] && visual[key].items).filter((item) => vizItemLabel(item)),
  }));
  const wide = width >= VIZ_PANEL.wideAt;
  const panelW = wide ? (width - VIZ_PANEL.between) / 2 : width;
  const sets = sides.map((side) => new Set(side.items.map((item) => vizItemLabel(item).trim().toLowerCase())));
  const panels = [];
  const items = [];
  let nextTop = 1;
  sides.forEach((side, sideIndex) => {
    const x = wide ? sideIndex * (panelW + VIZ_PANEL.between) : 0;
    const top = wide ? 1 : nextTop;
    let y = top + VIZ_PANEL.head;
    side.items.forEach((item, i) => {
      const label = vizItemLabel(item);
      const lines = vizWrap(label, vizChars(panelW - VIZ_PANEL.pad * 2 - 34), 2);
      const itemH = Math.max(VIZ_PANEL.item, lines.length * VIZ_LINE + 14);
      items.push({ item, label, lines, side, sideIndex, i, shared: sets[1 - sideIndex].has(label.trim().toLowerCase()), box: { x: x + VIZ_PANEL.pad, y, w: panelW - VIZ_PANEL.pad * 2, h: itemH } });
      y += itemH + VIZ_PANEL.gap;
    });
    const bottom = y - VIZ_PANEL.gap + VIZ_PANEL.pad;
    panels.push({ name: side.name, x, top, bottom });
    nextTop = bottom + VIZ_PANEL.between;
  });
  const lowest = Math.max(0, ...panels.map((p) => p.bottom));
  const arrow = wide
    ? `M${panelW + 10},${Math.min(lowest, 120) / 2 + 10} H${panelW + VIZ_PANEL.between - 10}`
    : `M${width / 2},${panels[0].bottom + 8} V${panels[0].bottom + VIZ_PANEL.between - 10}`;
  return { panelW, panels, items, arrow, height: (wide ? lowest : nextTop - VIZ_PANEL.between) + 1 };
}

function vizBeforeAfterLegend(visual, moved) {
  const notes = list(visual.notes).filter((note) => typeof note === 'string' && note.trim());
  if (!notes.length && !moved) return false;
  return h('div', { class: 'viz-notes' },
    moved && h('p', { class: 'viz-legend' }, h('span', null, h('b', { class: 'viz-key-glyph', 'aria-hidden': 'true' }, '+'), 'New'), h('span', null, h('b', { class: 'viz-key-glyph', 'aria-hidden': 'true' }, '−'), 'Gone')),
    notes.length > 0 && h('ul', { class: 'viz-note-list', 'aria-label': 'Notes' }, notes.map((note) => h('li', null, softBreaks(note)))));
}

/** beforeAfter: two panels with what moved; items in one side only get + or −. */
function vizDrawBeforeAfter(visual, width, marker) {
  const layout = vizBeforeAfterLayout(visual, width);
  const nodes = layout.panels.flatMap((panel) => [vizRoundRect(panel.x, panel.top, layout.panelW, panel.bottom - panel.top, 'viz-panel'),
    s('text', { class: 'viz-panel-head', x: panel.x + VIZ_PANEL.pad + 2, y: panel.top + VIZ_PANEL.head / 2 + 2, 'dominant-baseline': 'central' }, panel.name.toUpperCase())]);
  nodes.push(s('path', { class: 'viz-link is-flow', d: layout.arrow, 'marker-end': `url(#${marker}-rest)` }));
  const parts = layout.items.map(({ item, label, lines, side, sideIndex, i, shared, box }) => {
    const glyph = shared ? '' : sideIndex === 0 ? '−' : '+';
    return vizPart([
      vizRoundRect(box.x, box.y, box.w, box.h),
      glyph && s('text', { class: 'viz-glyph', x: box.x + 14, y: box.y + box.h / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, glyph),
      vizText(lines, { x: box.x + 28, y: box.y + box.h / 2 }),
    ], {
      label,
      detail: vizItemDetail(item),
      kicker: `${side.name}, ${i + 1} of ${side.items.length}`,
      facts: [['Change', shared ? 'Stays the same' : sideIndex === 0 ? 'Gone after the change' : 'New after the change']],
    });
  });
  return { nodes, parts, height: layout.height, legend: vizBeforeAfterLegend(visual, layout.items.some((it) => !it.shared)) };
}

const VIZ_QUAD = { axis: 30, foot: 38, dot: 6, label: 12.5 };

function vizLevel(value) {
  if (value < 0.34) return 'low';
  if (value > 0.66) return 'high';
  return 'middle';
}

/** quadrant: points on two axes from 0 (low, left, bottom) to 1. */
function vizDrawQuadrant(visual, width) {
  const axes = visual.axes && typeof visual.axes === 'object' ? visual.axes : {};
  const xName = text(axes.x, 'x');
  const yName = text(axes.y, 'y');
  const plotW = Math.min(width - VIZ_QUAD.axis - 2, 640);
  const plotH = Math.round(Math.min(Math.max(plotW * 0.72, 220), 440));
  const x0 = VIZ_QUAD.axis;
  const y0 = 8;
  const clamp = (v) => Math.min(Math.max(typeof v === 'number' ? v : 0.5, 0), 1);
  const nodes = [
    s('rect', { class: 'viz-plot', x: x0 + 0.5, y: y0 + 0.5, width: plotW - 1, height: plotH - 1 }),
    s('line', { class: 'viz-mid', x1: x0 + plotW / 2, x2: x0 + plotW / 2, y1: y0, y2: y0 + plotH }),
    s('line', { class: 'viz-mid', x1: x0, x2: x0 + plotW, y1: y0 + plotH / 2, y2: y0 + plotH / 2 }),
    s('text', { class: 'viz-axis', x: x0 + plotW / 2, y: y0 + plotH + 22, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, `${vizWrap(xName, vizChars(plotW - 120, 12), 1)[0]} →`),
    s('text', { class: 'viz-axis-end', x: x0 + 2, y: y0 + plotH + 22, 'dominant-baseline': 'central' }, 'low'),
    s('text', { class: 'viz-axis-end', x: x0 + plotW - 2, y: y0 + plotH + 22, 'text-anchor': 'end', 'dominant-baseline': 'central' }, 'high'),
    s('text', { class: 'viz-axis', x: 0, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'central', transform: `translate(${x0 / 2 - 2} ${y0 + plotH / 2}) rotate(-90)` }, `${vizWrap(yName, vizChars(plotH - 40, 12), 1)[0]} →`),
  ];
  const points = list(visual.points).filter((p) => p && typeof p === 'object');
  // Labels go right of the dot, or left near the right edge; overlapping ones are nudged apart.
  const placed = points.map((p, i) => {
    const cx = x0 + clamp(p.x) * plotW;
    const cy = y0 + (1 - clamp(p.y)) * plotH;
    const right = clamp(p.x) < 0.6;
    const room = right ? x0 + plotW - cx - 14 : cx - x0 - 14;
    const label = vizWrap(text(p.label), vizChars(room, VIZ_QUAD.label), 1)[0];
    return { i, p, cx, cy, right, label, ly: cy, w: vizTextWidth(label, VIZ_QUAD.label) };
  });
  [...placed].sort((a, b) => a.ly - b.ly).forEach((a, k, sorted) => {
    sorted.slice(0, k).forEach((b) => {
      const ax = a.right ? [a.cx, a.cx + a.w + 12] : [a.cx - a.w - 12, a.cx];
      const bx = b.right ? [b.cx, b.cx + b.w + 12] : [b.cx - b.w - 12, b.cx];
      if (ax[0] < bx[1] && bx[0] < ax[1] && Math.abs(a.ly - b.ly) < 17) a.ly = Math.min(b.ly + 17, y0 + plotH - 8);
    });
  });
  const parts = placed.map(({ i, p, cx, cy, right, label, ly }) => vizPart([
    s('circle', { class: 'viz-dot', cx, cy, r: VIZ_QUAD.dot }),
    s('text', { class: 'viz-point-label', x: right ? cx + 11 : cx - 11, y: ly, 'text-anchor': right ? 'start' : 'end', 'dominant-baseline': 'central' }, label),
  ], {
    label: text(p.label),
    kicker: `Point ${i + 1} of ${points.length}`,
    facts: [[xName, `${vizLevel(clamp(p.x))} (${clamp(p.x).toFixed(2)})`], [yName, `${vizLevel(clamp(p.y))} (${clamp(p.y).toFixed(2)})`]],
  }));
  return { nodes, parts, height: y0 + plotH + VIZ_QUAD.foot + 2 };
}

const VIZ_VENN = { top: 26, label: 12 };

// Circle centres and radius for 2 or 3 sets.
function vizVennLayout(count, width) {
  if (count >= 3) {
    const r = Math.min((width - 12) / 3.1, 128);
    const cy = r + VIZ_VENN.top;
    return { r, centres: [[width / 2 - 0.58 * r, cy], [width / 2 + 0.58 * r, cy], [width / 2, cy + 0.98 * r]], height: cy + 1.98 * r + VIZ_VENN.top };
  }
  const r = Math.min((width - 12) / 3.2, 140);
  const cy = r + VIZ_VENN.top;
  return { r, centres: [[width / 2 - 0.6 * r, cy], [width / 2 + 0.6 * r, cy]], height: cy + r + 6 };
}

// The middle of the region for the sets in `inside` (indexes): the mean of
// those centres, pushed away from the centre of the whole drawing.
function vizRegionCentre(layout, inside) {
  const mean = (pts) => pts.reduce((acc, p) => [acc[0] + p[0] / pts.length, acc[1] + p[1] / pts.length], [0, 0]);
  const all = mean(layout.centres);
  if (inside.length === layout.centres.length) return all;
  const own = mean(inside.map((i) => layout.centres[i]));
  const push = inside.length === 1 ? 0.95 : layout.centres.length === 2 ? 0 : 0.85;
  return [own[0] + (own[0] - all[0]) * push, own[1] + (own[1] - all[1]) * push];
}

// Where each item sits: the region of its sets, items of one region stacked
// around its centre, up to two lines each, kept inside the drawing.
function vizVennPlace(items, sets, layout, width) {
  const LINE = 14;
  const regionOf = (item) => sets.map((set, i) => (list(item.in).includes(set.id) ? i : -1)).filter((i) => i >= 0);
  const groups = new Map();
  items.forEach((item, i) => {
    const key = regionOf(item).join(',');
    groups.set(key, [...(groups.get(key) || []), i]);
  });
  const roomFor = (inside) => layout.r * (inside.length === 1 ? 0.92 : inside.length === sets.length ? 0.66 : 0.8);
  const wrapped = items.map((item) => vizWrap(text(item.label), vizChars(roomFor(regionOf(item)), VIZ_VENN.label), 2));
  const heightOf = (i) => wrapped[i].length * LINE + 4;
  return items.map((item, i) => {
    const inside = regionOf(item);
    const group = groups.get(inside.join(','));
    const total = group.reduce((sum, j) => sum + heightOf(j) + 3, -3);
    const before = group.slice(0, group.indexOf(i)).reduce((sum, j) => sum + heightOf(j) + 3, 0);
    const [cx, ry] = inside.length ? vizRegionCentre(layout, inside) : [width / 2, layout.height - 10];
    const top = ry - total / 2 + before;
    const w = Math.min(width - 2, Math.max(...wrapped[i].map((line) => vizTextWidth(line, VIZ_VENN.label))) + 12);
    const x = Math.min(Math.max(cx, w / 2 + 1), width - w / 2 - 1);
    return { item, inside, lines: wrapped[i], line: LINE, chip: { x: x - w / 2, y: top, w, h: heightOf(i) }, x, y: top + heightOf(i) / 2 };
  });
}

/** venn: 2 or 3 circles; each item sits in the region of the sets it belongs to. */
function vizDrawVenn(visual, width) {
  const sets = list(visual.sets).filter((set) => set && set.id !== undefined).slice(0, 3);
  const layout = vizVennLayout(sets.length, width);
  const circles = sets.map((set, i) => s('circle', { class: 'viz-set', cx: layout.centres[i][0], cy: layout.centres[i][1], r: layout.r }));
  const setLabels = sets.map((set, i) => {
    const [cx, cy] = layout.centres[i];
    return s('text', { class: 'viz-set-label', x: cx, y: i === 2 ? cy + layout.r + 14 : cy - layout.r - 12, 'text-anchor': 'middle', 'dominant-baseline': 'central' },
      vizWrap(text(set.label, String(set.id)), vizChars(sets.length === 2 ? layout.r * 1.6 : layout.r * 1.3, VIZ_VENN.label), 1)[0]);
  });
  const names = (keep) => sets.filter((_, j) => keep(j)).map((set) => text(set.label, String(set.id))).join(', ');
  const placed = vizVennPlace(list(visual.items).filter((item) => item && typeof item === 'object'), sets, layout, width);
  const parts = placed.map(({ item, inside, lines, line, chip, x, y }) => vizPart([
    s('rect', { class: 'viz-chip', x: chip.x, y: chip.y, width: chip.w, height: chip.h }),
    vizText(lines, { x, y, cls: 'viz-item-label', anchor: 'middle', lineHeight: line }),
  ], {
    label: text(item.label),
    kicker: inside.length > 1 ? `In ${inside.length} groups` : 'In one group',
    facts: [['In', names((j) => inside.includes(j))], ['Not in', names((j) => !inside.includes(j))]],
    inside,
  }));
  return {
    nodes: [circles, setLabels],
    parts,
    height: layout.height,
    highlight(index) {
      const inside = index === null ? [] : parts[index].inside;
      circles.forEach((c, j) => c.classList.toggle('is-on', inside.includes(j)));
      setLabels.forEach((label, j) => label.classList.toggle('is-on', inside.includes(j)));
    },
  };
}
