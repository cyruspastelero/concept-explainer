// Visual kinds in one line of parts: layers (a stack), cycle (a loop) and
// funnel (narrowing stages). See viz-core.js for the drawer contract.

const VIZ_LAYER = { index: 30, gap: 18, pad: 14 };

function vizItemLabel(item) {
  return typeof item === 'string' ? item : text(item && item.label);
}

function vizItemDetail(item) {
  return item && typeof item === 'object' ? text(item.detail) : '';
}

// A short downward connector with an arrowhead, from (x, y1) to (x, y2).
function vizArrow(x1, y1, x2, y2, marker, cls = 'viz-link') {
  return s('path', { class: cls, d: `M${x1},${y1} L${x2},${y2}`, 'marker-end': `url(#${marker}-rest)`, 'data-marker': marker });
}

// Swap a link's arrowhead between rest and on, to follow its class.
function vizLinkOn(path, on) {
  path.classList.toggle('is-on', on);
  const marker = path.dataset.marker;
  if (marker) path.setAttribute('marker-end', `url(#${marker}-${on ? 'on' : 'rest'})`);
}

/** layers: a stack, top to bottom. Each layer uses the one below it. */
function vizDrawLayers(visual, width, marker) {
  const items = list(visual.items);
  const boxX = VIZ_LAYER.index;
  // A stack reads as a stack, not as full-width rows.
  const boxW = Math.min(width - boxX - 1, 560);
  const chars = vizChars(boxW - VIZ_LAYER.pad * 2);
  let y = 1;
  const nodes = [];
  const links = [];
  const parts = items.map((item, i) => {
    const lines = vizWrap(vizItemLabel(item), chars, 2);
    const boxH = Math.max(44, lines.length * VIZ_LINE + 22);
    const top = y;
    y += boxH;
    if (i < items.length - 1) {
      const link = vizArrow(boxX + boxW / 2, y + 2, boxX + boxW / 2, y + VIZ_LAYER.gap - 3, marker);
      links.push(link);
      nodes.push(link);
      y += VIZ_LAYER.gap;
    }
    const below = items[i + 1];
    const above = items[i - 1];
    return vizPart([
      vizRoundRect(boxX, top, boxW, boxH),
      s('text', { class: 'viz-index', x: 0, y: top + boxH / 2, 'dominant-baseline': 'central' }, String(i + 1).padStart(2, '0')),
      vizText(lines, { x: boxX + VIZ_LAYER.pad, y: top + boxH / 2 }),
    ], {
      label: vizItemLabel(item),
      detail: vizItemDetail(item),
      kicker: `Layer ${i + 1} of ${items.length}${i === 0 ? ', the top' : i === items.length - 1 ? ', the bottom' : ''}`,
      facts: [['Uses', below && vizItemLabel(below)], ['Used by', above && vizItemLabel(above)]],
    });
  });
  return {
    nodes, parts, height: y + 1,
    highlight(index) {
      parts.forEach((part, i) => part.el.classList.toggle('is-related', index !== null && i === index + 1));
      links.forEach((link, i) => vizLinkOn(link, index === i));
    },
  };
}

const VIZ_CYCLE = { boxH: 48, pad: 10, wideAt: 480, gutter: 36 };

// The first point along the circle (from the node outward) outside its box.
function vizCycleExit(cx, cy, r, angle, dir, half) {
  for (let t = 0; t < Math.PI; t += 0.01) {
    const a = angle + dir * t;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    const nodeX = cx + r * Math.cos(angle);
    const nodeY = cy + r * Math.sin(angle);
    if (Math.abs(x - nodeX) > half.w + 6 || Math.abs(y - nodeY) > half.h + 6) return a;
  }
  return angle + dir * 0.3;
}

// Wide cycle: boxes on a circle, each arc trimmed to leave its boxes.
function vizCycleCircle(n, width) {
  const boxW = Math.min(160, Math.round(width * 0.28));
  const r = Math.min(width / 2 - boxW / 2 - 8, 60 + n * 22);
  const cx = width / 2;
  const cy = r + VIZ_CYCLE.boxH / 2 + VIZ_CYCLE.pad;
  const angleOf = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const half = { w: boxW / 2, h: VIZ_CYCLE.boxH / 2 };
  const boxes = [];
  const links = [];
  for (let i = 0; i < n; i += 1) {
    const a1 = vizCycleExit(cx, cy, r, angleOf(i), 1, half);
    const a2 = vizCycleExit(cx, cy, r, angleOf(i + 1), -1, half);
    const p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
    const p2 = [cx + r * Math.cos(a2), cy + r * Math.sin(a2)];
    links.push(`M${p1[0]},${p1[1]} A${r},${r} 0 0 1 ${p2[0]},${p2[1]}`);
    boxes.push({ x: cx + r * Math.cos(angleOf(i)) - boxW / 2, y: cy + r * Math.sin(angleOf(i)) - VIZ_CYCLE.boxH / 2, w: boxW, h: VIZ_CYCLE.boxH });
  }
  return { boxes, links, height: cy * 2 };
}

// Narrow cycle: a column of boxes; the loop closes on the right, from the last box back to the first.
function vizCycleColumn(n, width) {
  const boxW = width - VIZ_CYCLE.gutter;
  const boxes = [];
  const links = [];
  let y = 1;
  for (let i = 0; i < n; i += 1) {
    boxes.push({ x: 0, y, w: boxW, h: VIZ_CYCLE.boxH });
    y += VIZ_CYCLE.boxH;
    if (i < n - 1) {
      links.push(`M${boxW / 2},${y + 2} L${boxW / 2},${y + 15}`);
      y += 18;
    }
  }
  const first = boxes[0];
  const last = boxes[boxes.length - 1];
  const lane = boxW + VIZ_CYCLE.gutter / 2;
  links.push(`M${boxW + 2},${last.y + last.h / 2} H${lane - 6} Q${lane},${last.y + last.h / 2} ${lane},${last.y + last.h / 2 - 6} V${first.y + first.h / 2 + 6} Q${lane},${first.y + first.h / 2} ${lane - 6},${first.y + first.h / 2} H${boxW + 5}`);
  return { boxes, links, height: y + 2 };
}

/** cycle: a loop. Wide: nodes on a circle; narrow: a column with a return line. Link i leaves item i. */
function vizDrawCycle(visual, width, marker) {
  const items = list(visual.items);
  const layout = width >= VIZ_CYCLE.wideAt ? vizCycleCircle(Math.max(items.length, 1), width) : vizCycleColumn(items.length, width);
  const links = layout.links.map((d) => s('path', { class: 'viz-link', d, 'marker-end': `url(#${marker}-rest)`, 'data-marker': marker }));
  const parts = items.map((item, i) => {
    const box = layout.boxes[i];
    const lines = vizWrap(vizItemLabel(item), vizChars(box.w - 20), 2);
    return vizPart([
      vizRoundRect(box.x, box.y, box.w, box.h),
      vizText(lines, { x: box.x + box.w / 2, y: box.y + box.h / 2, anchor: 'middle' }),
    ], {
      label: vizItemLabel(item),
      detail: vizItemDetail(item),
      kicker: `Step ${i + 1} of ${items.length} in the loop`,
      facts: [['Comes after', vizItemLabel(items[(i - 1 + items.length) % items.length])], ['Leads to', vizItemLabel(items[(i + 1) % items.length])]],
    });
  });
  return {
    nodes: links, parts, height: layout.height,
    highlight(index) {
      links.forEach((link, i) => vizLinkOn(link, index === i));
      parts.forEach((part, i) => part.el.classList.toggle('is-related', index !== null && i === (index + 1) % parts.length));
    },
  };
}

const VIZ_FUNNEL = { row: 50, gap: 6, min: 0.3 };

/** funnel: centred stages that narrow; widths follow the values when every stage has one. */
function vizDrawFunnel(visual, width) {
  const items = list(visual.items);
  const values = items.map((item) => (item && typeof item.value === 'number' ? item.value : null));
  const numeric = values.length > 0 && values.every((v) => v !== null);
  const max = numeric ? Math.max(...values, 1) : 1;
  const share = (i) => {
    if (i >= items.length) return null;
    if (numeric) return Math.max(VIZ_FUNNEL.min, values[i] / max);
    return 1 - (i * (1 - 0.45)) / Math.max(items.length - 1, 1);
  };
  const cx = width / 2;
  const parts = items.map((item, i) => {
    const top = 1 + i * (VIZ_FUNNEL.row + VIZ_FUNNEL.gap);
    const wTop = share(i) * (width - 2);
    const nextShare = share(i + 1);
    const wBottom = (nextShare === null ? share(i) * 0.9 : Math.min(share(i), nextShare)) * (width - 2);
    const shape = s('path', {
      class: 'viz-box',
      d: `M${cx - wTop / 2},${top} H${cx + wTop / 2} L${cx + wBottom / 2},${top + VIZ_FUNNEL.row} H${cx - wBottom / 2} Z`,
    });
    const hasValue = values[i] !== null;
    const lines = vizWrap(vizItemLabel(item), vizChars(wBottom - 20), hasValue ? 1 : 2);
    const prev = i > 0 ? values[i - 1] : null;
    const kept = hasValue && typeof prev === 'number' && prev > 0 ? `${Math.round((values[i] / prev) * 100)}% of the stage before` : null;
    return vizPart([
      shape,
      vizText(lines, { x: cx, y: top + VIZ_FUNNEL.row / 2 - (hasValue ? 8 : 0), anchor: 'middle' }),
      hasValue && s('text', { class: 'viz-value', x: cx, y: top + VIZ_FUNNEL.row / 2 + 11, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, values[i].toLocaleString('en')),
    ], {
      label: vizItemLabel(item),
      detail: vizItemDetail(item),
      kicker: `Stage ${i + 1} of ${items.length}`,
      facts: [['Value', hasValue ? values[i].toLocaleString('en') : null], ['Kept', kept]],
    });
  });
  return { nodes: [], parts, height: items.length * (VIZ_FUNNEL.row + VIZ_FUNNEL.gap) };
}
