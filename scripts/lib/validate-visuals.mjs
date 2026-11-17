// Shapes of the fixed visuals kit (diagrams[] and concepts[].visual).
// Documented for humans in references/visuals.md: keep them in sync.
import { LIMITS, VISUAL_KINDS } from './schema.mjs';
import {
  arr, checkCount, checkOneOf, checkUniqueIds, isObject, isText, listAt, optionalText, requireText,
} from './validate-util.mjs';

const V = LIMITS.visualItems;

function labelled(report, path, items, limits, { strict = true } = {}) {
  checkCount(report, path, items, limits, { strict });
  items.forEach((item, i) => {
    if (!isObject(item)) return report.error(`${path}[${i}]`, 'must be an object with a label');
    requireText(report, `${path}[${i}].label`, item.label);
    optionalText(report, `${path}[${i}].detail`, item.detail);
    return undefined;
  });
}

// beforeAfter items may be plain strings or { label, detail? }.
function panelItems(report, path, panel) {
  if (!isObject(panel)) return report.error(path, 'is required: { items: [...] }');
  const items = listAt(report, `${path}.items`, panel.items);
  checkCount(report, `${path}.items`, items, V.beforeAfter, { strict: true });
  items.forEach((item, i) => {
    if (isText(item)) return;
    if (isObject(item) && isText(item.label)) return;
    report.error(`${path}.items[${i}]`, 'must be text or { label, detail? }');
  });
  return undefined;
}

function hasCycle(nodes) {
  const parent = new Map(nodes.map((n) => [n.id, n.parent]));
  return nodes.some((start) => {
    const seen = new Set();
    for (let id = start.id; id !== undefined; id = parent.get(id)) {
      if (seen.has(id)) return true;
      seen.add(id);
    }
    return false;
  });
}

const SHAPES = {
  layers: (report, path, v) => labelled(report, `${path}.items`, listAt(report, `${path}.items`, v.items), V.layers),
  cycle: (report, path, v) => labelled(report, `${path}.items`, listAt(report, `${path}.items`, v.items), V.cycle),
  funnel(report, path, v) {
    const items = listAt(report, `${path}.items`, v.items);
    labelled(report, `${path}.items`, items, V.funnel);
    items.forEach((item, i) => {
      if (isObject(item) && item.value !== undefined && !(typeof item.value === 'number' && item.value >= 0)) {
        report.error(`${path}.items[${i}].value`, 'must be a number of 0 or more');
      }
    });
    const values = items.map((item) => (isObject(item) ? item.value : undefined));
    if (values.every((n) => typeof n === 'number') && values.some((n, i) => i > 0 && n > values[i - 1])) {
      report.warn(`${path}.items`, 'a funnel narrows. Values should not grow from one stage to the next');
    }
  },
  state(report, path, v) {
    const states = listAt(report, `${path}.states`, v.states);
    checkCount(report, `${path}.states`, states, V.states, { strict: true });
    const ids = checkUniqueIds(report, `${path}.states`, states);
    states.forEach((st, i) => requireText(report, `${path}.states[${i}].label`, st && st.label));
    const transitions = listAt(report, `${path}.transitions`, v.transitions);
    checkCount(report, `${path}.transitions`, transitions, { max: V.transitions });
    transitions.forEach((t, i) => {
      const at = `${path}.transitions[${i}]`;
      if (!isObject(t)) return report.error(at, 'must be { from, to, label }');
      if (!ids.has(t.from)) report.error(`${at}.from`, `"${t.from}" is not a state id`);
      if (!ids.has(t.to)) report.error(`${at}.to`, `"${t.to}" is not a state id`);
      optionalText(report, `${at}.label`, t.label);
      return undefined;
    });
  },
  compare(report, path, v) {
    const columns = listAt(report, `${path}.columns`, v.columns);
    checkCount(report, `${path}.columns`, columns, V.compareColumns, { strict: true });
    columns.forEach((c, i) => requireText(report, `${path}.columns[${i}]`, c));
    const rows = listAt(report, `${path}.rows`, v.rows);
    checkCount(report, `${path}.rows`, rows, V.compareRows, { strict: true });
    rows.forEach((row, i) => {
      const at = `${path}.rows[${i}]`;
      if (!isObject(row)) return report.error(at, 'must be { label, values[] }');
      requireText(report, `${at}.label`, row.label);
      const values = arr(row.values);
      if (!Array.isArray(row.values) || values.length !== columns.length) {
        report.error(`${at}.values`, `needs one value per column (${columns.length})`);
      }
      values.forEach((value, j) => {
        if (!['string', 'boolean', 'number'].includes(typeof value)) report.error(`${at}.values[${j}]`, 'must be text, true/false or a number');
      });
      return undefined;
    });
  },
  hierarchy(report, path, v) {
    const nodes = listAt(report, `${path}.nodes`, v.nodes);
    checkCount(report, `${path}.nodes`, nodes, V.hierarchy, { strict: true });
    const ids = checkUniqueIds(report, `${path}.nodes`, nodes);
    nodes.forEach((n, i) => {
      if (!isObject(n)) return;
      requireText(report, `${path}.nodes[${i}].label`, n.label);
      if (n.parent !== undefined && !ids.has(n.parent)) report.error(`${path}.nodes[${i}].parent`, `"${n.parent}" is not a node id`);
    });
    const valid = nodes.filter(isObject);
    if (valid.length && !valid.some((n) => n.parent === undefined)) report.error(`${path}.nodes`, 'needs one root (a node without parent)');
    else if (hasCycle(valid)) report.error(`${path}.nodes`, 'parents form a loop');
  },
  beforeAfter(report, path, v) {
    panelItems(report, `${path}.before`, v.before);
    panelItems(report, `${path}.after`, v.after);
    const notes = listAt(report, `${path}.notes`, v.notes);
    checkCount(report, `${path}.notes`, notes, { max: V.notes });
    notes.forEach((note, i) => requireText(report, `${path}.notes[${i}]`, note));
  },
  quadrant(report, path, v) {
    if (!isObject(v.axes)) report.error(`${path}.axes`, 'is required: { x, y }');
    else ['x', 'y'].forEach((axis) => requireText(report, `${path}.axes.${axis}`, v.axes[axis]));
    const points = listAt(report, `${path}.points`, v.points);
    checkCount(report, `${path}.points`, points, V.quadrant, { strict: true });
    points.forEach((p, i) => {
      const at = `${path}.points[${i}]`;
      if (!isObject(p)) return report.error(at, 'must be { label, x, y }');
      requireText(report, `${at}.label`, p.label);
      ['x', 'y'].forEach((axis) => {
        if (typeof p[axis] !== 'number' || p[axis] < 0 || p[axis] > 1) report.error(`${at}.${axis}`, 'must be a number from 0 to 1');
      });
      return undefined;
    });
  },
  venn(report, path, v) {
    const sets = listAt(report, `${path}.sets`, v.sets);
    checkCount(report, `${path}.sets`, sets, V.vennSets, { strict: true, what: 'sets' });
    const ids = checkUniqueIds(report, `${path}.sets`, sets);
    sets.forEach((set, i) => requireText(report, `${path}.sets[${i}].label`, set && set.label));
    const items = listAt(report, `${path}.items`, v.items);
    checkCount(report, `${path}.items`, items, V.vennItems);
    items.forEach((item, i) => {
      const at = `${path}.items[${i}]`;
      if (!isObject(item)) return report.error(at, 'must be { label, in[] }');
      requireText(report, `${at}.label`, item.label);
      const inside = arr(item.in);
      if (!inside.length) report.error(`${at}.in`, 'must name at least one set id');
      inside.forEach((id, j) => {
        if (!ids.has(id)) report.error(`${at}.in[${j}]`, `"${id}" is not a set id`);
      });
      return undefined;
    });
  },
};

/** Check one visual's kind and shape. Title, caption and id are checked by the caller. */
export function checkVisual(report, path, visual) {
  if (!isObject(visual)) return report.error(path, 'must be an object with a kind');
  checkOneOf(report, `${path}.kind`, visual.kind, VISUAL_KINDS, { required: true });
  if (SHAPES[visual.kind]) SHAPES[visual.kind](report, path, visual);
  return undefined;
}

/** The diagrams[] chapter: each diagram is a visual with id, title and a one-sentence caption. */
export function checkDiagrams(report, value) {
  const diagrams = listAt(report, 'diagrams', value);
  checkCount(report, 'diagrams', diagrams, { max: LIMITS.diagrams }, { what: 'diagrams' });
  checkUniqueIds(report, 'diagrams', diagrams);
  diagrams.forEach((d, i) => {
    const path = `diagrams[${i}]`;
    if (!isObject(d)) return report.error(path, 'must be an object');
    requireText(report, `${path}.title`, d.title);
    requireText(report, `${path}.caption`, d.caption);
    checkVisual(report, path, d);
    return undefined;
  });
}
