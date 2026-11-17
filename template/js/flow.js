// Chapter: end-to-end flow player. A sequence diagram you step through one
// hop at a time, Brilliant style: one idea per step and a Continue button.
const SEQ = { minCol: 130, maxCol: 220, head: 64, top: 40, row: 58, pad: 20 };
const DASHED_KINDS = new Set(['response', 'async']);
const FLOW_SIDE_BY_SIDE = '(min-width: 1180px)';
const FLOW_CARD_WIDTH = 380;
const LABEL_CHAR = 6.6;

// Side by side only when the widest flow fits beside the step card without
// sideways scrolling; otherwise the card comes first and the diagram gets the
// full width. Decided for the whole page, so flows do not jump around.
function watchFlowLayout(flows, { root, layout, panel }, render) {
  const widest = Math.max(...flows.map((f) => flowActors(list(f.steps)).length), 1);
  const fitsBeside = () => window.matchMedia(FLOW_SIDE_BY_SIDE).matches
    && root.clientWidth - FLOW_CARD_WIDTH - 16 >= widest * SEQ.minCol + SEQ.pad * 2;
  let lastWidth = 0;
  new ResizeObserver(() => {
    if (Math.abs(root.clientWidth - lastWidth) <= 24) return;
    lastWidth = root.clientWidth;
    layout.classList.toggle('is-stacked', !fitsBeside());
    render();
  }).observe(root);
  // The step card follows the reader only while it fits on screen: no inner scroll areas.
  new ResizeObserver(() => {
    panel.classList.toggle('is-static', panel.offsetHeight > window.innerHeight - 96);
  }).observe(panel);
}

function flowPicks(flows, current, onPick) {
  return flows.map((f, i) => h('li', null, h('button', {
    class: 'flow-pick', type: 'button', 'aria-pressed': String(i === current), onclick: () => onPick(i),
  },
  h('span', { class: 'flow-pick-top' }, h('span', null, padNumber(i + 1)), h('span', null, plural(list(f.steps).length, 'step'))),
  h('span', { class: `flow-pick-title ${fitClass(f.title)}` }, softBreaks(f.title)))));
}

// onJump(flowId, stepIndex) switches to a paired flow.
function flowMeta(flows, flow, nodeIndex, onJump) {
  const pair = chFlowPair(flows, flow);
  return [
    flow.trigger && h('p', { class: 'flow-trigger' }, h('span', { class: 'eyebrow quiet' }, 'Starts when'), h('span', null, softBreaks(flow.trigger))),
    flow.summary && h('p', { class: 'flow-summary' }, softBreaks(flow.summary)),
    chPairSwitch(pair, flow.id, (id) => onJump(id, 0)),
    chPairCompare(pair, nodeIndex, (id, n) => onJump(id, n - 1)),
  ];
}

function flowStepRoute(step, nodeIndex) {
  const from = nodeIndex.get(step.from);
  const to = nodeIndex.get(step.to);
  return h('div', { class: 'step-route' },
    h('span', { class: 'route-part' }, from && icon(from.kind), softBreaks(text(from && from.label, step.from))),
    h('span', { class: 'arrow-glyph', 'aria-hidden': 'true' }, step.from === step.to ? '↺' : '→'),
    step.from !== step.to && h('span', { class: 'route-part' }, to && icon(to.kind), softBreaks(text(to && to.label, step.to))));
}

function flowStepPanel(data, flow, stepIndex, nodeIndex, go) {
  const steps = list(flow.steps);
  const step = steps[stepIndex];
  const last = stepIndex === steps.length - 1;
  return [h('div', { class: 'step-body' }, h('div', { class: 'step-text' },
    h('div', { class: 'step-top' },
      h('span', { class: 'step-count' }, `Step ${stepIndex + 1} of ${steps.length}`),
      step.kind && tag(step.kind, `tag-${step.kind}`)),
    flowStepRoute(step, nodeIndex),
    h('h3', null, softBreaks(step.label)),
    step.detail && h('p', null, softBreaks(step.detail)),
    step.why && h('div', { class: 'why' }, h('p', { class: 'eyebrow quiet' }, 'Why it works this way'), h('p', null, softBreaks(step.why)))),
    (step.file || step.code) && h('div', { class: 'step-code' },
      step.file && h('div', { class: 'code-head' }, fileChip(step.file), chWalkthroughLink(data, step.file)),
      step.code && codeBlock(step.code, step.lang))),
    h('div', { class: 'step-controls' },
      stepDots(steps.length, stepIndex, go),
      h('button', { class: 'btn', type: 'button', disabled: stepIndex === 0, onclick: () => go(stepIndex - 1) }, 'Back'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => go(stepIndex + 1) }, last ? 'Finish' : 'Continue')),
    h('p', { class: 'kbd-hint' }, 'Tip: use ', h('kbd', null, '←'), ' ', h('kbd', null, '→'), ' to step through.'),
  ];
}

// onNext is null on the last flow.
function flowDonePanel(flow, go, onNext) {
  const steps = list(flow.steps);
  const actors = new Set(steps.flatMap((st) => [st.from, st.to]));
  return [h('div', { class: 'flow-done' },
    h('span', { class: 'trophy' }, icon('trophy')),
    h('p', { class: 'eyebrow quiet' }, 'Flow complete'),
    h('h3', null, softBreaks(flow.title)),
    h('p', null, `You followed it through ${plural(steps.length, 'step')} and ${plural(actors.size, 'part')} of the system.`),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', onclick: () => go(0) }, 'Replay'),
      onNext && h('button', { class: 'btn primary', type: 'button', onclick: onNext }, 'Next flow')))];
}

// Draw the current arrow, slide the card in, keep the step in view.
function animateFlowStep(diagram, panel, layout, state, animate) {
  const current = diagram.body.querySelector('.seq-step.is-current .arrow');
  if (current) {
    const marker = current.dataset.marker;
    if (animate) drawPath(current, marker); else current.setAttribute('marker-end', marker);
  }
  if (!animate) return;
  slideIn(panel.firstElementChild, state.direction);
  // Stacked layouts keep the reader at the Continue button instead.
  if (!state.finished && !layout.classList.contains('is-stacked')) revealCurrentStep(diagram.body);
  if (state.finished) pop(panel.querySelector('.trophy'));
}

function flowPlayerParts() {
  const headsWrap = h('div', { class: 'seq-heads-wrap' });
  const bodyWrap = h('div', { class: 'seq-body' });
  // The body scrolls sideways only; the sticky header strip follows it.
  bodyWrap.addEventListener('scroll', () => {
    if (headsWrap.firstElementChild) headsWrap.firstElementChild.style.transform = `translateX(${-bodyWrap.scrollLeft}px)`;
  }, { passive: true });
  const seqWrap = h('div', { class: 'panel seq-wrap seq', 'aria-label': 'Sequence diagram' }, headsWrap, bodyWrap);
  const picker = h('ul', { class: 'flow-list', 'aria-label': 'Flows' });
  const meta = h('div', { class: 'flow-meta' });
  const panel = h('div', { class: 'panel step-card', 'aria-live': 'polite' });
  const layout = h('div', { class: 'flow-layout' }, seqWrap, panel);
  const root = h('div', { class: 'flow-player' }, picker, meta, layout);
  return { headsWrap, bodyWrap, picker, meta, panel, layout, root };
}

// #flows/<id>/<n>, with n = the step count once finished.
function flowLink(flows, state) {
  const flow = flows[state.flowIndex];
  return `flows/${linkPart(flow.id)}/${state.finished ? list(flow.steps).length : state.stepIndex + 1}`;
}

// Going past the last step finishes the flow.
function flowStepState(flows, state, stepIndex) {
  if (stepIndex >= list(flows[state.flowIndex].steps).length) return { finished: true, direction: 1 };
  return { stepIndex: Math.max(0, stepIndex), finished: false, direction: stepIndex >= state.stepIndex ? 1 : -1 };
}

// Left and right arrows step through, except while typing.
function wireFlowKeys(root, getState, go) {
  root.addEventListener('keydown', (event) => {
    if (event.target.closest('input, textarea')) return;
    const state = getState();
    if (event.key === 'ArrowRight') { event.preventDefault(); go(state.stepIndex + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); go(state.finished ? state.stepIndex : state.stepIndex - 1); }
  });
}

// #flows/<id>/<n>: the state to open, or null when the flow is unknown.
function flowOpenState(flows, flowId, n) {
  if (flowId === undefined) return null;
  const index = flows.findIndex((f) => f.id === flowId);
  if (index < 0) return null;
  const count = list(flows[index].steps).length;
  const wanted = Number.parseInt(n, 10);
  const stepIndex = Number.isInteger(wanted) && wanted >= 1 && wanted <= count ? wanted - 1 : 0;
  return { flowIndex: index, stepIndex, finished: false, direction: 1 };
}

function renderFlows(data, mount) {
  const flows = list(data.flows);
  if (!flows.length) {
    mount.append(h('p', { class: 'empty' }, 'No flows traced yet.'));
    return null;
  }
  const nodeIndex = byId(data.nodes);
  const parts = flowPlayerParts();
  const { headsWrap, bodyWrap, picker, meta, panel, layout, root } = parts;
  let state = { flowIndex: 0, stepIndex: 0, finished: false, direction: 1 };

  function setState(next) {
    state = { ...state, ...next };
    setDeepLink(flowLink(flows, state));
    render({ animate: true });
  }

  const go = (stepIndex) => setState(flowStepState(flows, state, stepIndex));

  const jump = (id, stepIndex) => setState({ flowIndex: flows.findIndex((f) => f.id === id), stepIndex, finished: false });
  const nextFlow = () => (state.flowIndex + 1 < flows.length ? () => setState({ flowIndex: state.flowIndex + 1, stepIndex: 0, finished: false }) : null);

  function render({ animate = false } = {}) {
    const flow = flows[state.flowIndex];
    fill(picker, ...flowPicks(flows, state.flowIndex, (i) => setState({ flowIndex: i, stepIndex: 0, finished: false })));
    fill(meta, ...flowMeta(flows, flow, nodeIndex, jump));
    const diagram = sequenceDiagram(flow, nodeIndex, state.finished ? list(flow.steps).length : state.stepIndex, go, bodyWrap.clientWidth);
    fill(headsWrap, diagram.heads);
    fill(bodyWrap, diagram.body);
    centerCurrentStep(bodyWrap, animate);
    fill(panel, ...(state.finished ? flowDonePanel(flow, go, nextFlow()) : flowStepPanel(data, flow, state.stepIndex, nodeIndex, go)));
    animateFlowStep(diagram, panel, layout, state, animate);
  }

  watchFlowLayout(flows, parts, render);
  wireFlowKeys(root, () => state, go);

  render();
  mount.append(root);
  return {
    open([flowId, n] = []) {
      const opened = flowOpenState(flows, flowId, n);
      if (!opened) return null;
      state = opened;
      render();
      return panel;
    },
  };
}

// A segmented progress bar. Each segment is a button with a full-height hit area.
function stepDots(count, current, go) {
  return h('div', { class: 'step-dots' }, Array.from({ length: count }, (_, i) => h('button', {
    type: 'button', class: i === current ? 'is-current' : i < current ? 'is-done' : '', 'aria-label': `Go to step ${i + 1}`,
    'aria-current': i === current ? 'step' : null, onclick: () => go(i),
  })));
}

function flowActors(steps) {
  return [...new Set(steps.flatMap((step) => [step.from, step.to]))];
}

// Two SVGs share one scroll box: a sticky strip of actor heads and the steps.
function sequenceDiagram(flow, nodeIndex, currentIndex, go, available) {
  const steps = list(flow.steps);
  const actors = flowActors(steps);
  const fit = ((available || 0) - SEQ.pad * 2) / Math.max(actors.length, 1);
  const col = Math.min(SEQ.maxCol, Math.max(SEQ.minCol, fit));
  const width = SEQ.pad * 2 + actors.length * col;
  const height = SEQ.top + steps.length * SEQ.row;
  const xOf = (id) => SEQ.pad + actors.indexOf(id) * col + col / 2;
  const headW = Math.min(col - 16, 170);
  const chars = Math.floor((headW - 46) / 7);
  const heads = s('svg', { class: 'seq-heads', viewBox: `0 0 ${width} ${SEQ.head}`, width, height: SEQ.head, 'aria-hidden': 'true' });
  const body = s('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': `${flow.title}: ${plural(steps.length, 'step')}` });

  actors.forEach((id) => {
    const node = nodeIndex.get(id);
    const x = xOf(id);
    heads.append(
      s('rect', { class: 'seq-head-box', x: x - headW / 2 + 0.5, y: 12.5, width: headW - 1, height: 40, rx: 6 }),
      icon(node ? node.kind : 'service', { class: 'seq-head-icon', x: x - headW / 2 + 10, y: 22, width: 20, height: 20 }),
      s('text', { class: 'seq-head-label', x: x - headW / 2 + 38, y: 37 }, truncate(node ? node.label : id, chars), s('title', null, node ? node.label : id)),
    );
    body.append(s('line', { class: 'seq-lifeline', x1: x, x2: x, y1: 0, y2: height }));
  });

  steps.forEach((step, i) => body.append(sequenceStep(step, i, currentIndex, xOf, width, go, col)));
  return { heads, body };
}

function sequenceStep(step, i, currentIndex, xOf, width, go, col) {
  const y = SEQ.top + i * SEQ.row;
  const status = i < currentIndex ? 'is-done' : i === currentIndex ? 'is-current' : 'is-todo';
  const x1 = xOf(step.from);
  const x2 = xOf(step.to);
  const self = step.from === step.to;
  const dir = x2 >= x1 ? 1 : -1;
  const d = self
    ? `M${x1},${y} h44 v18 h-40`
    : `M${x1 + dir * 12},${y} L${x2 - dir * 8},${y}`;
  // A label may run past a short hop, but always stays inside the diagram.
  const room = self ? width - (x1 + 52) - SEQ.pad : Math.max(Math.abs(x2 - x1), col * 1.6) - 12;
  const label = truncate(step.label, Math.max(10, Math.floor(room / LABEL_CHAR)));
  const half = (label.length * LABEL_CHAR) / 2;
  const labelX = self ? x1 + 52 : Math.min(Math.max((x1 + x2) / 2, half + 6), width - half - 6);
  const group = s('g', {
    class: `seq-step ${status}${DASHED_KINDS.has(step.kind) ? ' is-dashed' : ''}`,
    role: 'button', tabindex: '0', 'aria-label': `Step ${i + 1}: ${step.label}`,
    onclick: () => go(i),
    onkeydown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); go(i); } },
  },
  s('rect', { class: 'hit', x: 4, y: y - 30, width: width - 8, height: SEQ.row - 4, rx: 6 }),
  s('path', status === 'is-current'
    ? { class: 'arrow', d, 'data-marker': `url(#seq-arrow-${status})` }
    : { class: 'arrow', d, 'marker-end': `url(#seq-arrow-${status})` }),
  s('circle', { class: 'badge-bg', cx: x1, cy: y, r: 10 }),
  s('text', { class: 'badge-num', x: x1, y: y + 3.5, 'text-anchor': 'middle' }, String(i + 1)),
  s('text', { class: 'label', x: labelX, y: y - 10, 'text-anchor': self ? 'start' : 'middle' }, label, s('title', null, step.label)));

  if (i === 0) group.prepend(seqMarkers());
  if (status === 'is-current' && !reducedMotion()) {
    // One pass along the arrow after it draws, then fade. No endless loop.
    group.append(s('circle', { class: 'seq-dot', r: 4.5, opacity: 0 },
      s('set', { attributeName: 'opacity', to: 1, begin: '0.3s' }),
      s('animateMotion', { dur: '0.6s', begin: '0.3s', fill: 'freeze', path: d, calcMode: 'spline', keyTimes: '0;1', keySplines: '0.4 0 0.2 1' }),
      s('animate', { attributeName: 'opacity', from: 1, to: 0, begin: '0.9s', dur: '0.3s', fill: 'freeze' })));
  }
  return group;
}

function seqMarkers() {
  const marker = (status) => s('marker', { id: `seq-arrow-${status}`, viewBox: '0 0 10 10', refX: 7, refY: 5, markerWidth: 8, markerHeight: 8, markerUnits: 'userSpaceOnUse', orient: 'auto' },
    s('path', { class: `marker-head ${status}`, d: 'M0,1 L9,5 L0,9 z' }));
  return s('defs', null, marker('is-done'), marker('is-current'), marker('is-todo'));
}

// Only on reader actions: bring the active hop into view without fighting
// the page's own scrolling.
function centerCurrentStep(bodyWrap, animate) {
  const badge = bodyWrap.querySelector('.seq-step.is-current .badge-bg');
  if (!badge) return;
  const left = Number(badge.getAttribute('cx')) - bodyWrap.clientWidth / 3;
  bodyWrap.scrollTo({ left: Math.max(0, left), behavior: animate && !reducedMotion() ? 'smooth' : 'auto' });
}

function revealCurrentStep(diagram) {
  const current = diagram.querySelector('.seq-step.is-current');
  if (!current) return;
  const box = current.getBoundingClientRect();
  const stickyBottom = 100;
  if (box.top < stickyBottom || box.bottom > window.innerHeight - 24) {
    current.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }
}
