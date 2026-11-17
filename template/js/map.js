// Chapter: architecture map. Layers are columns, nodes are pressable cards,
// edges are an SVG overlay redrawn whenever the layout changes.
function mapRelated(edges, id) {
  return edges.filter((edge) => edge.from === id || edge.to === id);
}

// Selected node, its neighbours, and the lines between them.
function mapPaintSelection(canvas, grid, svg, edges, selectedId) {
  canvas.classList.toggle('has-selection', Boolean(selectedId));
  canvas.classList.remove('is-changes');
  const neighbours = new Set(selectedId ? mapRelated(edges, selectedId).flatMap((e) => [e.from, e.to]) : []);
  grid.querySelectorAll('.node').forEach((el) => {
    el.classList.toggle('is-selected', el.dataset.node === selectedId);
    el.classList.toggle('is-related', neighbours.has(el.dataset.node));
    el.setAttribute('aria-pressed', String(el.dataset.node === selectedId));
  });
  svg.querySelectorAll('[data-edge]').forEach((el) => {
    const [from, to] = el.dataset.edge.split('→');
    const active = from === selectedId || to === selectedId;
    el.querySelectorAll('path, text').forEach((part) => part.classList.toggle('is-active', active));
    el.querySelector('path').setAttribute('marker-end', active ? 'url(#map-arrow-active)' : 'url(#map-arrow)');
  });
}

function mapEmptyDetail() {
  return [h('div', { class: 'detail-main' },
    h('p', { class: 'eyebrow quiet' }, 'Tip'),
    h('h3', null, 'Pick any box above'),
    h('p', null, 'You will see what it does, which files hold it, and who it talks to. Pick it again to clear.'))];
}

function mapRelationItem(edge, selfId, nodeIndex, select) {
  const otherId = edge.from === selfId ? edge.to : edge.from;
  const other = nodeIndex.get(otherId);
  const direction = edge.from === selfId ? '→' : '←';
  return h('li', null, h('span', { class: 'arrow-glyph' }, direction),
    h('button', { class: 'link', type: 'button', onclick: () => select(otherId) }, softBreaks(other ? other.label : otherId)),
    edge.label && tag(edge.label));
}

function mapNodeDetail(data, node, nodeIndex, select) {
  const layer = list(data.layers).find((l) => l.id === node.layer);
  const links = mapRelated(list(data.edges), node.id);
  const flows = list(data.flows).filter((flow) => list(flow.steps).some((st) => st.from === node.id || st.to === node.id));
  return [h('div', { class: 'detail-main' },
    h('div', { class: 'step-top' }, h('span', { class: 'detail-icon' }, icon(node.kind)), tag(text(layer && layer.label, node.layer), 'tag-layer'), node.kind && tag(node.kind)),
    h('h3', null, softBreaks(node.label)),
    h('p', null, softBreaks(text(node.summary, 'No summary yet.'))),
    node.tech && h('p', { class: 'detail-tech' }, softBreaks(node.tech)),
    list(node.files).length > 0 && [h('div', { class: 'detail-label' }, 'Lives in'), h('div', { class: 'files' }, list(node.files).map(fileChip))]),
  h('div', { class: 'detail-side' },
    links.length > 0 && [h('div', { class: 'detail-label' }, 'Talks to'), h('ul', { class: 'rel' }, links.map((edge) => mapRelationItem(edge, node.id, nodeIndex, select)))],
    flows.length > 0 && [h('div', { class: 'detail-label' }, 'Shows up in'), h('ul', { class: 'rel' }, flows.map((flow) => h('li', null,
      h('a', { class: 'link', href: `#flows/${linkPart(flow.id)}` }, softBreaks(flow.title)))))]),
  ];
}

function mapEdgeShape(edge, grid, box) {
  const fromEl = grid.querySelector(`[data-node="${CSS.escape(edge.from)}"]`);
  const toEl = grid.querySelector(`[data-node="${CSS.escape(edge.to)}"]`);
  if (!fromEl || !toEl) return null;
  const a = relativeRect(fromEl, box);
  const b = relativeRect(toEl, box);
  const d = connectorPath(a, b);
  const key = `${edge.from}→${edge.to}`;
  const mid = { x: (a.cx + b.cx) / 2, y: (a.cy + b.cy) / 2 };
  // No label when the boxes almost touch: it would sit on top of them.
  const gap = Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom);
  return s('g', { 'data-edge': key },
    s('path', { class: `edge${edge.kind === 'async' ? ' is-async' : ''}`, d, 'marker-end': 'url(#map-arrow)' }),
    edge.label && gap > 36 && s('text', { class: 'edge-label', x: mid.x, y: mid.y - 6, 'text-anchor': 'middle' }, truncate(edge.label, 28)));
}

function mapLegend(nodes, changedIds) {
  return h('div', { class: 'map-legend' },
    h('span', null, h('i'), 'Calls / reads'),
    h('span', null, h('i', { class: 'dash' }), 'Async / events'),
    chStatusLegend(nodes),
    changedIds.size > 0 && h('span', null, h('span', { class: 'tag tag-new' }, 'New'), 'Changed recently'));
}

// As many layer columns as fit at MAP_MIN_COL each; the rest wrap onto the
// next row, so the map never scrolls sideways.
function mapFitColumns(canvas, layerCount) {
  const width = canvas.parentElement ? canvas.parentElement.clientWidth : 0;
  const fit = Math.max(1, Math.min(layerCount, Math.floor((width + MAP_GAP) / (MAP_MIN_COL + MAP_GAP))));
  if (canvas.style.getPropertyValue('--fit-cols') !== String(fit)) canvas.style.setProperty('--fit-cols', String(fit));
}

function mapParts(layers, nodes, changedIds, onSelect) {
  const cols = `--cols:${Math.max(layers.length, 1)}`;
  const svg = s('svg', { class: 'map-edges', 'aria-hidden': 'true' });
  const grid = h('div', { class: 'map-grid', style: cols }, layers.map((layer) => mapColumn(layer, nodes, changedIds, onSelect)));
  const canvas = h('div', { class: 'map-canvas', style: cols }, svg, grid);
  const detail = h('aside', { class: 'map-detail panel', 'aria-live': 'polite' });
  return { svg, grid, canvas, detail };
}

function mapShowChanges(canvas, grid, changedIds) {
  canvas.classList.remove('has-selection');
  canvas.classList.add('is-changes');
  grid.querySelectorAll('.node').forEach((el) => el.classList.toggle('is-changed', changedIds.has(el.dataset.node)));
}

function mapDrawEdges(canvas, svg, grid, edges) {
  const box = canvas.getBoundingClientRect();
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  const defs = s('defs', null, arrowMarker('map-arrow', 'is-rest'), arrowMarker('map-arrow-active', 'is-active'));
  fill(svg, defs, ...edges.map((edge) => mapEdgeShape(edge, grid, box)).filter(Boolean));
}

function renderMap(data, mount) {
  const [layers, nodes, edges] = [list(data.layers), list(data.nodes), list(data.edges)];
  const nodeIndex = byId(nodes);
  const changedIds = new Set(list(data.changes).flatMap((change) => list(change.nodes)));
  const { svg, grid, canvas, detail } = mapParts(layers, nodes, changedIds, (id) => select(id));
  let selectedId = null;

  function select(id) {
    setSelected(selectedId === id ? null : id);
    setDeepLink(selectedId ? `map/${linkPart(selectedId)}` : 'map');
  }

  const paintSelection = () => mapPaintSelection(canvas, grid, svg, edges, selectedId);
  const renderDetail = () => fill(detail, ...(selectedId ? mapNodeDetail(data, nodeIndex.get(selectedId), nodeIndex, select) : mapEmptyDetail()));

  function setSelected(id) {
    selectedId = id;
    if (id) delete canvas.dataset.changes;
    paintSelection();
    renderDetail();
  }

  const showChanges = () => mapShowChanges(canvas, grid, changedIds);
  function drawEdges() {
    mapDrawEdges(canvas, svg, grid, edges);
    paintSelection();
    if (canvas.dataset.changes === 'on') showChanges();
  }

  on('highlight-changes', ({ enabled }) => {
    selectedId = null;
    renderDetail();
    if (enabled) canvas.dataset.changes = 'on'; else delete canvas.dataset.changes;
    if (enabled) showChanges(); else paintSelection();
  });

  renderDetail();
  mount.append(h('div', { class: 'map-shell' }, h('div', { class: 'panel map-panel' }, h('div', { class: 'map-scroll' }, canvas)), detail), mapLegend(nodes, changedIds));
  const redraw = () => window.requestAnimationFrame(() => { mapFitColumns(canvas, layers.length); drawEdges(); });
  new ResizeObserver(redraw).observe(canvas.parentElement || canvas);
  if (document.fonts) document.fonts.ready.then(redraw);
  return {
    open([id] = []) {
      if (id === undefined) return null;
      setSelected(nodeIndex.has(id) ? id : null);
      // A deep link to a part: the router scrolls to it and focuses it.
      return nodeIndex.has(id) ? grid.querySelector(`[data-node="${CSS.escape(id)}"]`) : null;
    },
  };
}

const MAP_MIN_COL = 150;
const MAP_GAP = 40;

function mapColumn(layer, nodes, changedIds, onSelect) {
  const layerNodes = nodes.filter((node) => node.layer === layer.id);
  return h('div', { class: 'map-col', style: layerStyle(layer.color) },
    h('div', { class: 'map-col-head' }, truncatable(h('span', { class: 'map-col-name' }, softBreaks(layer.label)), layer.label)),
    layerNodes.map((node) => h('button', {
      class: 'node', type: 'button', 'data-node': node.id, 'aria-pressed': 'false', onclick: () => onSelect(node.id), ...chNodeStatusAttrs(node),
    },
    changedIds.has(node.id) && h('span', { class: 'node-badge tag tag-new' }, 'New'),
    chNodeStatus(node),
    h('span', { class: 'node-icon' }, icon(node.kind)),
    h('span', { class: 'node-text' }, h('span', { class: 'node-label' }, softBreaks(node.label)), node.tech && truncatable(h('span', { class: 'node-tech' }, softBreaks(node.tech)), node.tech)))));
}

function relativeRect(el, box) {
  const r = el.getBoundingClientRect();
  const left = r.left - box.left;
  const top = r.top - box.top;
  return { left, top, right: left + r.width, bottom: top + r.height, cx: left + r.width / 2, cy: top + r.height / 2 };
}

// Route across the wider gap between the two boxes, so a line never runs
// along a box edge when boxes sit diagonally close.
function connectorPath(a, b) {
  const gapX = Math.max(b.left - a.right, a.left - b.right);
  const gapY = Math.max(b.top - a.bottom, a.top - b.bottom);
  const horizontal = gapX >= gapY;
  if (horizontal) {
    const forward = b.cx > a.cx;
    const x1 = forward ? a.right : a.left;
    const x2 = forward ? b.left - 4 : b.right + 4;
    const bend = (x2 - x1) / 2;
    return `M${x1},${a.cy} C${x1 + bend},${a.cy} ${x2 - bend},${b.cy} ${x2},${b.cy}`;
  }
  const down = b.cy > a.cy;
  const y1 = down ? a.bottom : a.top;
  const y2 = down ? b.top - 4 : b.bottom + 4;
  const bend = (y2 - y1) / 2;
  return `M${a.cx},${y1} C${a.cx},${y1 + bend} ${b.cx},${y2 - bend} ${b.cx},${y2}`;
}

// Arrowhead colours come from CSS classes, so they follow the theme.
function arrowMarker(id, cls) {
  return s('marker', { id, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 8, markerHeight: 8, markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse' },
    s('path', { class: `marker-head ${cls}`, d: 'M0,1 L9,5 L0,9 z' }));
}
