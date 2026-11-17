// Helpers the existing chapters call for v2 data: node status markers on the
// map, before/after flow pairs, and concept parts with a concept visual.
// Each returns an element (or null when the data has nothing to show), so a
// caller can drop it into an h() children list as is.

// ---------- Map: node status (added, changed, removed, unchanged) ----------
const CH_NODE_STATUSES = ['added', 'changed', 'removed'];

/** The small marker for a map node with a status; null for unchanged or none. */
function chNodeStatus(node) {
  const status = node && node.status;
  if (!CH_NODE_STATUSES.includes(status)) return null;
  return h('span', { class: `ch-node-status is-${status}` }, chStatusMark(status), h('span', { class: 'sr-only' }, `, ${CH_STATUS_LABELS[status].toLowerCase()}`));
}

/** Attributes for a node button: data-status drives the ring (dashed when removed). */
function chNodeStatusAttrs(node) {
  const status = node && node.status;
  return CH_NODE_STATUSES.includes(status) ? { 'data-status': status } : {};
}

/** The status line for the map detail panel. */
function chNodeStatusTag(node) {
  const status = node && node.status;
  return CH_NODE_STATUSES.includes(status) || status === 'unchanged' ? chStatusTag(status) : null;
}

/** Legend entries for the statuses the map uses, or null when none. */
function chStatusLegend(nodes) {
  const used = CH_NODE_STATUSES.filter((status) => list(nodes).some((n) => n && n.status === status));
  if (!used.length) return null;
  return used.map((status) => h('span', { class: 'ch-legend-status' }, chStatusMark(status), CH_STATUS_LABELS[status]));
}

// ---------- Flows: before/after pairs ----------

/** The before and after flows sharing this flow's pair id, or null. */
function chFlowPair(flows, flow) {
  if (!flow || typeof flow.pair !== 'string' || !flow.pair) return null;
  const same = list(flows).filter((f) => f && f.pair === flow.pair);
  const before = same.find((f) => f.variant === 'before') || null;
  const after = same.find((f) => f.variant === 'after') || null;
  return before && after ? { pair: flow.pair, before, after } : null;
}

/** Flows grouped for a picker: a pair becomes one entry { pair, before, after }; others { flow }. */
function chFlowGroups(flows) {
  const seen = new Set();
  return list(flows).flatMap((flow) => {
    const pair = chFlowPair(flows, flow);
    if (!pair) return [{ flow }];
    if (seen.has(pair.pair)) return [];
    seen.add(pair.pair);
    return [pair];
  });
}

/** "Before" or "After" as a small tag for a flow with a variant, else null. */
function chVariantTag(flow) {
  if (!flow || (flow.variant !== 'before' && flow.variant !== 'after')) return null;
  return tag(flow.variant === 'before' ? 'Before' : 'After', `ch-variant is-${flow.variant}`);
}

/**
 * A Before | After switch for a pair (uses the .seg control from diagrams.css).
 * onPick(flowId) is called with the picked flow's id.
 */
function chPairSwitch(pair, currentId, onPick) {
  if (!pair) return null;
  const sides = [['Before', pair.before], ['After', pair.after]];
  const buttons = sides.map(([label, flow]) => h('button', {
    class: 'seg-option', type: 'button', 'aria-pressed': String(flow.id === currentId), onclick: () => onPick(flow.id),
  }, label));
  chRoving(buttons, { axis: 'x', onMove: (i) => onPick(sides[i][1].id) });
  buttons.forEach((b, i) => { b.tabIndex = sides[i][1].id === currentId ? 0 : -1; });
  return h('div', { class: 'seg ch-pair-switch', role: 'group', 'aria-label': 'Before or after' }, buttons);
}

function chFlowActors(flow) {
  return [...new Set(list(flow && flow.steps).flatMap((st) => [st.from, st.to]))];
}

/**
 * Before and after side by side: each flow's hops in order, with the parts
 * only one side uses marked + (new) or − (gone).
 * @param {{ before: object, after: object }} pair from chFlowPair
 * @param {Map<string, object>} nodeIndex byId(data.nodes)
 * @param {(flowId: string, step: number) => void} [onOpen] called with a flow id and a 1-based step
 */
function chPairCompare(pair, nodeIndex, onOpen) {
  if (!pair) return null;
  const actors = { before: new Set(chFlowActors(pair.before)), after: new Set(chFlowActors(pair.after)) };
  const name = (id) => text(nodeIndex && nodeIndex.get(id) && nodeIndex.get(id).label, String(id));
  const side = (key, label) => {
    const flow = pair[key];
    const other = actors[key === 'before' ? 'after' : 'before'];
    const only = [...actors[key]].filter((id) => !other.has(id));
    return h('section', { class: `ch-pair-side is-${key}`, 'aria-label': `${label}: ${text(flow.title)}` },
      h('p', { class: 'eyebrow quiet' }, label, h('span', { class: 'ch-pair-count' }, chCount(list(flow.steps).length, 'step'))),
      h('p', { class: 'ch-pair-title' }, softBreaks(text(flow.title))),
      only.length > 0 && h('p', { class: 'ch-pair-only' }, only.map((id) => h('span', { class: 'ch-status' }, chStatusMark(key === 'after' ? 'added' : 'removed'), softBreaks(name(id))))),
      h('ol', { class: 'ch-pair-steps' }, list(flow.steps).map((st, i) => h('li', null,
        h('button', { class: 'ch-pair-step', type: 'button', disabled: !onOpen, onclick: () => onOpen && onOpen(flow.id, i + 1) },
          h('span', { class: 'ch-pair-n' }, String(i + 1)),
          h('span', { class: 'ch-pair-hop' },
            h('span', { class: 'ch-pair-route' }, softBreaks(name(st.from)), st.from !== st.to && [' → ', softBreaks(name(st.to))]),
            h('span', { class: 'ch-pair-label' }, softBreaks(text(st.label)))))))));
  };
  return h('div', { class: 'ch-cq' }, h('div', { class: 'ch-pair' }, side('before', 'Before'), h('div', { class: 'ch-pair-arrow', 'aria-hidden': 'true' }), side('after', 'After')));
}

// ---------- Concepts: parts and a visual ----------

/**
 * A concept broken into parts: a chain of named pieces, each selectable,
 * with its detail beside the chain. Returns null without parts.
 */
function chConceptParts(concept) {
  const parts = list(concept && concept.parts).filter((p) => p && typeof p === 'object' && text(p.label));
  if (!parts.length) return null;
  const detail = h('div', { class: 'ch-parts-detail', 'aria-live': 'polite' });
  let selected = null;
  const buttons = parts.map((part, i) => h('button', {
    class: 'ch-part', type: 'button', 'aria-pressed': 'false', onclick: () => select(selected === i ? null : i),
  }, h('span', { class: 'ch-part-n', 'aria-hidden': 'true' }, String(i + 1)), h('span', { class: 'ch-part-label' }, softBreaks(part.label))));
  chRoving(buttons, { onMove: (i) => select(i) });

  function select(index) {
    selected = index;
    chMarkCurrent(buttons, index);
    if (index === null) {
      fill(detail, h('p', { class: 'ch-parts-tip' }, `${chCount(parts.length, 'part')}. Pick one to see what it does.`));
      return;
    }
    const part = parts[index];
    fill(detail, h('p', { class: 'eyebrow quiet' }, `Part ${index + 1} of ${parts.length}`),
      h('p', { class: 'ch-parts-label' }, softBreaks(part.label)),
      text(part.detail) && h('p', null, softBreaks(part.detail)));
  }
  select(null);
  return h('div', { class: 'ch-parts' },
    h('ol', { class: 'ch-part-chain', 'aria-label': 'Parts' }, buttons.map((b) => h('li', null, b))),
    detail);
}

/** The concept's visual (one of the nine kinds) with its own detail panel, or null. */
function chConceptVisual(concept) {
  const visual = concept && concept.visual;
  if (!visual || typeof visual !== 'object' || !vizDrawer(visual.kind)) return null;
  return vizFigure(visual, { title: visual.title, caption: visual.caption, headingLevel: 'h4', compact: true }).root;
}

/** Both, in teaching order: the parts first, then the picture that joins them. */
function chConceptExtras(concept) {
  const parts = chConceptParts(concept);
  const visual = chConceptVisual(concept);
  if (!parts && !visual) return null;
  return h('div', { class: 'ch-concept-extras' }, parts, visual);
}
