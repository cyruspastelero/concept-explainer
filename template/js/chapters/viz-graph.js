// Visual kinds with links between parts: state (a state machine) and
// hierarchy (a tree). See viz-core.js for the drawer contract.

const VIZ_STATE = { boxH: 46, rowSlot: 128, level: 22, label: 11.5, vGap: 34 };

// States in reading order: from the first state along its transitions,
// then any the walk did not reach, in data order.
function vizStateOrder(states, transitions) {
  const ids = states.map((st) => st.id);
  if (!ids.length) return [];
  const seen = new Set([ids[0]]);
  const queue = [ids[0]];
  while (queue.length) {
    const id = queue.shift();
    transitions.filter((t) => t.from === id && ids.includes(t.to) && !seen.has(t.to)).forEach((t) => {
      seen.add(t.to);
      queue.push(t.to);
    });
  }
  return [...ids.filter((id) => seen.has(id)), ...ids.filter((id) => !seen.has(id))];
}

// Levels for arcs over [from, to] positions: the shortest arcs sit lowest,
// and two arcs whose spans overlap never share a level.
function vizArcLevels(spans) {
  const order = spans.map((sp, i) => ({ i, lo: Math.min(sp[0], sp[1]), hi: Math.max(sp[0], sp[1]) }))
    .sort((a, b) => (a.hi - a.lo) - (b.hi - b.lo) || a.lo - b.lo);
  const levels = new Array(spans.length).fill(1);
  const taken = [];
  order.forEach((arc) => {
    let level = Math.max(1, arc.hi - arc.lo);
    const clash = (l) => taken.some((o) => o.level === l && arc.lo <= o.hi && o.lo <= arc.hi && !(arc.lo === o.hi || o.lo === arc.hi));
    while (clash(level)) level += 1;
    taken.push({ ...arc, level });
    levels[arc.i] = level;
  });
  return levels;
}

function vizRelationList(items) {
  if (!items.length) return null;
  return h('ul', { class: 'viz-rel' }, items.map((item) => h('li', null, softBreaks(item))));
}

// Points along a cubic or a straight segment, to test labels against lines.
function vizCubic(p0, p1, p2, p3, n = 40) {
  return Array.from({ length: n + 1 }, (_, k) => {
    const t = k / n;
    const u = 1 - t;
    return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
  });
}

function vizSegment(p0, p1, n = 16) {
  return Array.from({ length: n + 1 }, (_, k) => [p0[0] + ((p1[0] - p0[0]) * k) / n, p0[1] + ((p1[1] - p0[1]) * k) / n]);
}

function vizRectsMeet(a, b, pad = 0) {
  return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
}

function vizRectHasPoint(r, points, pad = 0) {
  return points.some(([x, y]) => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad);
}

const VIZ_PILL = { padX: 6, h: 18 };

/**
 * Place each label off every stroke: try spots moving out from its anchor
 * and take the first that clears all paths, boxes and placed labels.
 * Each wanted label is { key, value, x, y, dx, dy, chars }; (dx, dy) points outward.
 */
function vizPlaceLabels(wanted, { paths, boxes, width, size }) {
  const placed = [];
  wanted.forEach((want) => {
    const value = vizWrap(want.value, want.chars, 1)[0];
    const w = vizTextWidth(value, size) + VIZ_PILL.padX * 2;
    const spot = (along, side) => {
      const cx = want.x + want.dx * along + side;
      const cy = want.y + want.dy * along;
      return { x: Math.min(Math.max(cx - w / 2, 1), width - w - 1), y: cy - VIZ_PILL.h / 2, w, h: VIZ_PILL.h };
    };
    const tries = [];
    for (let along = 0; along <= 96; along += 6) [0, -w * 0.6, w * 0.6, -w * 1.2, w * 1.2].forEach((side) => tries.push(spot(along, side)));
    const clear = (r) => !paths.some((p) => vizRectHasPoint(r, p.points, 3))
      && !boxes.some((b) => vizRectsMeet(r, b, 3)) && !placed.some((o) => vizRectsMeet(r, o.rect, 3));
    placed.push({ key: want.key, value, rect: tries.find(clear) || tries[0] });
  });
  return placed;
}

function vizLabelPill(item) {
  const { rect, value } = item;
  return s('g', { class: 'viz-edge-tag' },
    s('rect', { class: 'viz-edge-pill', x: rect.x + 0.5, y: rect.y + 0.5, width: rect.w - 1, height: rect.h - 1 }),
    s('text', { class: 'viz-edge-label', x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, value));
}

// Row layout: boxes across; forward arcs above, backward below, each side on
// its own levels (longer spans further out); self-loops in the gap beside
// their box, which no arc enters (arcs use box tops and bottoms).
function vizStateRow(order, transitions, width, top) {
  const pos = new Map(order.map((id, i) => [id, i]));
  const slot = width / order.length;
  const boxW = Math.min(slot - 32, 170);
  const boxes = new Map(order.map((id, i) => [id, { x: i * slot + (slot - boxW) / 2, y: top, w: boxW, h: VIZ_STATE.boxH }]));
  const ahead = (tr) => pos.get(tr.to) > pos.get(tr.from);
  const above = transitions.filter((tr) => tr.from !== tr.to && ahead(tr));
  const below = transitions.filter((tr) => tr.from !== tr.to && !ahead(tr));
  const levelsAbove = vizArcLevels(above.map((tr) => [pos.get(tr.from), pos.get(tr.to)]));
  const levelsBelow = vizArcLevels(below.map((tr) => [pos.get(tr.from), pos.get(tr.to)]));
  const geo = transitions.map((tr) => {
    const a = boxes.get(tr.from);
    const b = boxes.get(tr.to);
    if (tr.from === tr.to) {
      const r = a.x + a.w;
      const p = [[r, a.y + 13], [r + 24, a.y + 6], [r + 24, a.y + a.h - 6], [r + 3, a.y + a.h - 13]];
      return { tr, d: `M${p[0]} C${p[1]} ${p[2]} ${p[3]}`, points: vizCubic(...p), anchor: { x: r + 12, y: a.y + a.h + 14, dx: 0, dy: 1 } };
    }
    const forward = ahead(tr);
    const level = forward ? levelsAbove[above.indexOf(tr)] : levelsBelow[below.indexOf(tr)];
    const lift = (12 + level * VIZ_STATE.level) * 1.33;
    const x1 = a.x + a.w / 2 + (forward ? a.w * 0.18 : -a.w * 0.18);
    const x2 = b.x + b.w / 2 + (forward ? -b.w * 0.18 : b.w * 0.18);
    const y = forward ? a.y : a.y + a.h;
    const cy = forward ? y - lift : y + lift;
    const p = [[x1, y], [x1, cy], [x2, cy], [x2, y + (forward ? -3 : 3)]];
    const apex = forward ? y - lift * 0.75 : y + lift * 0.75;
    return { tr, d: `M${p[0]} C${p[1]} ${p[2]} ${p[3]}`, points: vizCubic(...p), anchor: { x: (x1 + x2) / 2, y: apex + (forward ? -12 : 12), dx: 0, dy: forward ? -1 : 1 } };
  });
  const down = Math.max(0, ...levelsBelow);
  return { boxes, geo, chars: vizChars(Math.max(slot * 1.4, 80), VIZ_STATE.label), floor: top + VIZ_STATE.boxH + (down ? 26 + down * VIZ_STATE.level : 8) };
}

function vizStatePath(d, marker) {
  return s('path', { class: 'viz-link', d, 'marker-end': `url(#${marker}-rest)`, 'data-marker': marker });
}

// Row: lay out and place labels; lay out again lower when anything would leave the top.
function vizStateRowDraw(order, transitions, width, marker) {
  let top = 40;
  let layout;
  let placed;
  for (let pass = 0; pass < 3; pass += 1) {
    layout = vizStateRow(order, transitions, width, top);
    placed = vizPlaceLabels(layout.geo.filter((g) => text(g.tr.label)).map((g) => ({ key: g, value: g.tr.label, ...g.anchor, chars: layout.chars })),
      { paths: layout.geo, boxes: [...layout.boxes.values()], width, size: VIZ_STATE.label });
    const highest = Math.min(top, ...placed.map((p) => p.rect.y), ...layout.geo.flatMap((g) => g.points.map((pt) => pt[1])));
    if (highest >= 4) break;
    top += 4 - highest;
  }
  const links = [];
  const geometry = { paths: [], labels: [] };
  layout.geo.forEach((g) => {
    const item = placed.find((p) => p.key === g);
    links.push({ t: g.tr, path: vizStatePath(g.d, marker), label: item ? vizLabelPill(item) : null });
    geometry.paths.push({ key: g.tr, points: g.points });
    if (item) geometry.labels.push({ key: g.tr, rect: item.rect, onLine: false });
  });
  const height = Math.max(layout.floor, ...placed.map((p) => p.rect.y + p.rect.h + 4), ...layout.geo.flatMap((g) => g.points.map((pt) => pt[1] + 4)));
  return { links, geometry, boxes: layout.boxes, height, legend: null };
}

// Column geometry: self-loops in their own lane on the left; next-door steps
// down are straight; every other transition bends right on its own level.
function vizStateColumn(order, transitions, width) {
  const pos = new Map(order.map((id, i) => [id, i]));
  const lane = 30;
  const boxW = Math.min(200, Math.max(120, Math.round(width * 0.42)));
  const boxes = new Map(order.map((id, i) => [id, { x: lane, y: 1 + i * (VIZ_STATE.boxH + VIZ_STATE.vGap), w: boxW, h: VIZ_STATE.boxH }]));
  const right = lane + boxW;
  const straight = (tr) => pos.get(tr.to) - pos.get(tr.from) === 1;
  const bends = transitions.filter((tr) => tr.from !== tr.to && !straight(tr));
  const levels = vizArcLevels(bends.map((tr) => [pos.get(tr.from), pos.get(tr.to)]));
  const step = Math.min(VIZ_STATE.level, Math.max(18, (width - right - 24) / Math.max(1, ...levels)));
  const geo = transitions.map((tr) => {
    const a = boxes.get(tr.from);
    const b = boxes.get(tr.to);
    if (tr.from === tr.to) {
      const p = [[a.x, a.y + 12], [a.x - 26, a.y + 4], [a.x - 26, a.y + a.h - 4], [a.x - 3, a.y + a.h - 12]];
      return { tr, p, points: vizCubic(...p), badge: [a.x - 19, a.y + a.h / 2] };
    }
    if (straight(tr)) {
      const p = [[a.x + a.w / 2, a.y + a.h], [b.x + b.w / 2, b.y - 3]];
      return { tr, p, points: vizSegment(...p), badge: [a.x + a.w / 2, (a.y + a.h + b.y) / 2] };
    }
    const bulge = right + 8 + levels[bends.indexOf(tr)] * step;
    const forward = pos.get(tr.to) > pos.get(tr.from);
    const y1 = a.y + a.h / 2 + (forward ? 8 : -8);
    const y2 = b.y + b.h / 2 + (forward ? -8 : 8);
    const reach = right + (bulge - right) * 1.33;
    const p = [[right, y1], [reach, y1], [reach, y2], [right + 3, y2]];
    return { tr, p, points: vizCubic(...p), badge: [bulge, (y1 + y2) / 2] };
  });
  return { boxes, geo, height: order.length * (VIZ_STATE.boxH + VIZ_STATE.vGap) - VIZ_STATE.vGap + 2 };
}

// Column: labels would cross the arcs, so each arc gets a numbered badge on its
// own line and the key under the drawing spells it out.
function vizStateColumnDraw(order, transitions, width, marker, label) {
  const layout = vizStateColumn(order, transitions, width);
  const links = [];
  const geometry = { paths: [], labels: [] };
  layout.geo.forEach(({ tr, p, points, badge: [bx, by] }, k) => {
    const d = p.length === 2 ? `M${p[0]} L${p[1]}` : `M${p[0]} C${p[1]} ${p[2]} ${p[3]}`;
    const badge = s('g', { class: 'viz-badge' }, s('circle', { cx: bx, cy: by, r: 8 }),
      s('text', { x: bx, y: by, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, String(k + 1)));
    links.push({ t: tr, path: vizStatePath(d, marker), label: badge });
    geometry.paths.push({ key: tr, points });
    geometry.labels.push({ key: tr, rect: { x: bx - 8, y: by - 8, w: 16, h: 16 }, onLine: true });
  });
  const legend = h('ol', { class: 'viz-key-list', 'aria-label': 'Transitions' }, transitions.map((tr, k) => h('li', null,
    h('span', { class: 'viz-key-n', 'aria-hidden': 'true' }, String(k + 1)),
    h('span', null, tr.label ? `${tr.label}: ` : '', softBreaks(`${label(tr.from)} → ${label(tr.to)}`)))));
  return { links, geometry, boxes: layout.boxes, height: layout.height, legend };
}

function vizStateParts(states, transitions, boxes, label) {
  return states.map((st, i) => {
    const box = boxes.get(st.id);
    const out = transitions.filter((t) => t.from === st.id);
    const into = transitions.filter((t) => t.to === st.id && t.from !== st.id);
    const describe = (t, other) => `${t.label ? `${t.label}: ` : ''}${label(other)}`;
    return vizPart([
      vizRoundRect(box.x, box.y, box.w, box.h),
      vizText(vizWrap(text(st.label, String(st.id)), vizChars(box.w - 18), 2), { x: box.x + box.w / 2, y: box.y + box.h / 2, anchor: 'middle' }),
    ], {
      label: text(st.label, String(st.id)),
      kicker: `State ${i + 1} of ${states.length}${out.length ? '' : ', an end state'}`,
      detail: out.length ? '' : 'Nothing leaves this state.',
      facts: [
        ['Can go to', vizRelationList(out.map((t) => describe(t, t.to)))],
        ['Reached from', vizRelationList(into.map((t) => describe(t, t.from)))],
      ],
      id: st.id,
    });
  });
}

// Selecting a state lights its transitions and the states they connect.
function vizStateHighlight(links, parts) {
  return (index) => {
    const id = index === null ? null : parts[index].id;
    links.forEach((l) => {
      const on = id !== null && (l.t.from === id || l.t.to === id);
      vizLinkOn(l.path, on);
      if (l.label) l.label.classList.toggle('is-on', on);
    });
    parts.forEach((part, i) => part.el.classList.toggle('is-related', id !== null && i !== index
      && links.some((l) => (l.t.from === id && l.t.to === part.id) || (l.t.to === id && l.t.from === part.id))));
  };
}

/** state: boxes in a row (wide) or a column (narrow); transitions as arcs. */
function vizDrawState(visual, width, marker) {
  const states = list(visual.states).filter((st) => st && st.id !== undefined);
  const transitions = list(visual.transitions).filter((t) => t && states.some((st) => st.id === t.from) && states.some((st) => st.id === t.to));
  const order = vizStateOrder(states, transitions);
  const label = (id) => text((states.find((st) => st.id === id) || {}).label, String(id));
  const drawn = width / Math.max(order.length, 1) >= VIZ_STATE.rowSlot
    ? vizStateRowDraw(order, transitions, width, marker)
    : vizStateColumnDraw(order, transitions, width, marker, label);
  const parts = vizStateParts(states, transitions, drawn.boxes, label);
  return {
    nodes: [drawn.links.map((l) => l.path), drawn.links.map((l) => l.label)],
    parts,
    height: drawn.height,
    legend: drawn.legend,
    // For tests: every edge as points, every label as a box, every state box.
    geometry: { ...drawn.geometry, boxes: [...drawn.boxes.values()] },
    highlight: vizStateHighlight(drawn.links, parts),
  };
}

const VIZ_TREE = { boxH: 44, level: 40, slot: 112, row: 40, rowGap: 8, indent: 22 };

// The tree as data: parents, children, depth-first order from the roots, leaves.
function vizTreeModel(visual) {
  const nodes = list(visual.nodes).filter((n) => n && n.id !== undefined);
  const ids = new Set(nodes.map((n) => n.id));
  const parentOf = (n) => (n.parent !== undefined && ids.has(n.parent) && n.parent !== n.id ? n.parent : null);
  const children = (id) => nodes.filter((n) => parentOf(n) === id);
  const roots = nodes.filter((n) => parentOf(n) === null);
  const depth = new Map();
  const walkOrder = [];
  const walk = (n, d) => {
    if (depth.has(n.id)) return;
    depth.set(n.id, d);
    walkOrder.push(n);
    children(n.id).forEach((c) => walk(c, d + 1));
  };
  roots.forEach((r) => walk(r, 0));
  const leaves = walkOrder.filter((n) => !children(n.id).length).map((n) => n.id);
  return { nodes, parentOf, children, roots, depth, walkOrder, leaves };
}

// Top down: leaves share the width, each parent centred over its children.
function vizTreeTopDown(model, width) {
  const { nodes, parentOf, children, roots, depth, leaves } = model;
  const slot = width / leaves.length;
  const boxW = Math.min(slot - 10, 180);
  const centre = new Map();
  const place = (n) => {
    const kids = children(n.id).filter((c) => depth.get(c.id) === depth.get(n.id) + 1);
    if (!kids.length) centre.set(n.id, (leaves.indexOf(n.id) + 0.5) * slot);
    else {
      kids.forEach(place);
      centre.set(n.id, (centre.get(kids[0].id) + centre.get(kids[kids.length - 1].id)) / 2);
    }
  };
  roots.forEach(place);
  const boxes = new Map(nodes.map((n) => [n.id, { x: (centre.get(n.id) ?? width / 2) - boxW / 2, y: 1 + (depth.get(n.id) ?? 0) * (VIZ_TREE.boxH + VIZ_TREE.level), w: boxW, h: VIZ_TREE.boxH }]));
  const links = nodes.filter((n) => parentOf(n) !== null).map((n) => {
    const a = boxes.get(parentOf(n));
    const b = boxes.get(n.id);
    const mid = a.y + a.h + VIZ_TREE.level / 2;
    return { from: parentOf(n), to: n.id, d: `M${a.x + a.w / 2},${a.y + a.h} V${mid} H${b.x + b.w / 2} V${b.y}` };
  });
  const maxDepth = Math.max(0, ...depth.values());
  return { boxes, links, height: (maxDepth + 1) * (VIZ_TREE.boxH + VIZ_TREE.level) - VIZ_TREE.level + 2 };
}

// Outline: one row per node in depth-first order, indented by depth.
function vizTreeOutline(model, width) {
  const boxes = new Map();
  let y = 1;
  model.walkOrder.forEach((n) => {
    const x = 1 + model.depth.get(n.id) * VIZ_TREE.indent;
    boxes.set(n.id, { x, y, w: width - x - 1, h: VIZ_TREE.row });
    y += VIZ_TREE.row + VIZ_TREE.rowGap;
  });
  const links = model.nodes.filter((n) => model.parentOf(n) !== null && boxes.has(n.id)).map((n) => {
    const a = boxes.get(model.parentOf(n));
    const b = boxes.get(n.id);
    return { from: model.parentOf(n), to: n.id, d: `M${a.x + 11},${a.y + a.h} V${b.y + b.h / 2} H${b.x}` };
  });
  return { boxes, links, height: y - VIZ_TREE.rowGap + 1 };
}

function vizTreeParts(model, boxes, topDown) {
  const labelOf = (id) => text((model.nodes.find((n) => n.id === id) || {}).label, String(id));
  return model.nodes.filter((n) => boxes.has(n.id)).map((n) => {
    const box = boxes.get(n.id);
    const p = model.parentOf(n);
    const lines = vizWrap(text(n.label, String(n.id)), vizChars(box.w - 20), topDown ? 2 : 1);
    return vizPart([
      vizRoundRect(box.x, box.y, box.w, box.h),
      vizText(lines, { x: topDown ? box.x + box.w / 2 : box.x + 12, y: box.y + box.h / 2, anchor: topDown ? 'middle' : 'start' }),
    ], {
      label: text(n.label, String(n.id)),
      kicker: p === null ? 'The whole' : `Level ${model.depth.get(n.id) + 1}`,
      facts: [['Part of', p !== null ? labelOf(p) : null], ['Made of', vizRelationList(model.children(n.id).map((k) => labelOf(k.id)))]],
      id: n.id,
    });
  });
}

// Selecting a node lights its line up to the root and the links to its children.
function vizTreeHighlight(model, links, parts) {
  return (index) => {
    const id = index === null ? null : parts[index].id;
    const line = new Set();
    for (let at = id; at !== null && at !== undefined;) {
      const node = model.nodes.find((n) => n.id === at);
      const up = node ? model.parentOf(node) : null;
      if (up === null) break;
      line.add(`${up}>${at}`);
      at = up;
    }
    links.forEach((l) => l.path.classList.toggle('is-on', line.has(`${l.from}>${l.to}`) || (id !== null && l.from === id)));
    parts.forEach((part) => part.el.classList.toggle('is-related', id !== null && part.id !== id
      && (links.some((l) => l.from === id && l.to === part.id) || [...line].some((key) => key.startsWith(`${part.id}>`)))));
  };
}

/** hierarchy: a top-down tree when its leaves fit, else an indented outline. */
function vizDrawHierarchy(visual, width) {
  const model = vizTreeModel(visual);
  const topDown = width / Math.max(model.leaves.length, 1) >= VIZ_TREE.slot;
  const layout = topDown ? vizTreeTopDown(model, width) : vizTreeOutline(model, width);
  const links = layout.links.map((l) => ({ ...l, path: s('path', { class: 'viz-link', d: l.d }) }));
  const parts = vizTreeParts(model, layout.boxes, topDown);
  return { nodes: links.map((l) => l.path), parts, height: layout.height, highlight: vizTreeHighlight(model, links, parts) };
}
