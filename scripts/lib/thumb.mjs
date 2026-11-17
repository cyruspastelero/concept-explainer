// A small, size-capped picture of an explainer for its hub card. The hub
// cannot see explainer data, so the manifest carries this. Labels are cut
// short and details dropped. Shape documented in references/library.md.
import { DEFAULT_TYPE, EXPLAINER_TYPES, VISUAL_KINDS } from './schema.mjs';

const MAP_FIRST = ['repo', 'pr', 'change', 'proposal', 'migration'];
export const THUMB_LIMITS = { nodes: 40, edges: 60, items: 8, states: 10, transitions: 16, columns: 5, rows: 6, hierarchy: 20, points: 12, sets: 3, label: 24 };
const L = THUMB_LIMITS;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const list = (value, max) => (Array.isArray(value) ? value.filter(isObject).slice(0, max) : []);
const label = (value) => {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return text.length > L.label ? `${text.slice(0, L.label - 1)}…` : text;
};
const id = (value) => (typeof value === 'string' ? value.slice(0, 64) : '');

function mapThumb(data) {
  const nodes = list(data.nodes, L.nodes).map((n) => ({ id: id(n.id), layer: id(n.layer), ...(typeof n.status === 'string' ? { status: n.status } : {}) }));
  if (!nodes.length) return null;
  const kept = new Set(nodes.map((n) => n.id));
  const edges = list(data.edges, Infinity).filter((e) => kept.has(e.from) && kept.has(e.to)).slice(0, L.edges).map((e) => [e.from, e.to]);
  const layers = list(data.layers, 8).map((layer) => ({ id: id(layer.id), color: id(layer.color) }));
  return { kind: 'map', layers, nodes, edges };
}

const SHAPES = {
  layers: (v) => ({ items: list(v.items, L.items).map((i) => ({ label: label(i.label) })) }),
  cycle: (v) => ({ items: list(v.items, L.items).map((i) => ({ label: label(i.label) })) }),
  funnel: (v) => ({ items: list(v.items, L.items).map((i) => ({ label: label(i.label), ...(typeof i.value === 'number' ? { value: i.value } : {}) })) }),
  state: (v) => ({
    states: list(v.states, L.states).map((st) => ({ id: id(st.id), label: label(st.label) })),
    transitions: list(v.transitions, L.transitions).map((t) => [id(t.from), id(t.to)]),
  }),
  compare: (v) => ({
    columns: (Array.isArray(v.columns) ? v.columns : []).slice(0, L.columns).map(label),
    rows: list(v.rows, L.rows).map((r) => ({ label: label(r.label), values: (Array.isArray(r.values) ? r.values : []).slice(0, L.columns).map((x) => (typeof x === 'string' ? label(x) : x)) })),
  }),
  hierarchy: (v) => ({ nodes: list(v.nodes, L.hierarchy).map((n) => ({ id: id(n.id), label: label(n.label), ...(typeof n.parent === 'string' ? { parent: id(n.parent) } : {}) })) }),
  beforeAfter: (v) => {
    const side = (panel) => ({ items: (isObject(panel) && Array.isArray(panel.items) ? panel.items : []).slice(0, 4).map((i) => label(isObject(i) ? i.label : i)) });
    return { before: side(v.before), after: side(v.after) };
  },
  quadrant: (v) => ({
    axes: { x: label(isObject(v.axes) ? v.axes.x : ''), y: label(isObject(v.axes) ? v.axes.y : '') },
    points: list(v.points, L.points).map((p) => ({ x: p.x, y: p.y })),
  }),
  venn: (v) => ({
    sets: list(v.sets, L.sets).map((st) => ({ id: id(st.id), label: label(st.label) })),
    items: list(v.items, L.points).map((i) => ({ in: (Array.isArray(i.in) ? i.in : []).slice(0, L.sets).map(id) })),
  }),
};

function visualThumb(data) {
  const visuals = [...list(data.diagrams, Infinity), ...list(data.concepts, Infinity).map((c) => c.visual).filter(isObject)];
  const first = visuals.find((v) => VISUAL_KINDS.includes(v.kind));
  return first ? { kind: first.kind, ...SHAPES[first.kind](first) } : null;
}

/**
 * The card thumbnail: the map for map-centric types, else the first visual
 * (diagrams first, then concept visuals), else the map, else null.
 * @param {object} data explainer data
 */
export function thumbFor(data) {
  if (!isObject(data)) return null;
  const meta = isObject(data.meta) ? data.meta : {};
  const type = EXPLAINER_TYPES.includes(meta.type) ? meta.type : DEFAULT_TYPE;
  return MAP_FIRST.includes(type) ? mapThumb(data) || visualThumb(data) : visualThumb(data) || mapThumb(data);
}
