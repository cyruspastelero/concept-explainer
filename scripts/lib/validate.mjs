import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  AUTHOR_TYPES, CHANGE_KINDS, CHAPTER_KEYS, DASH, EDGE_KINDS, LAYER_COLORS, LIMITS, MARKUP, NODE_KINDS, NON_PROSE_KEYS, PLACEHOLDER, STEP_KINDS, TYPE_RULES,
} from './schema.mjs';
import {
  arr, checkEnum, checkUniqueIds, collector, isObject, isText, requireText, sentences, words,
} from './validate-util.mjs';
import { checkV2, typeOf } from './validate-v2.mjs';
import { checkWalkthroughSources, checkWalkthroughs } from './validate-code.mjs';

/**
 * @typedef {{ errors: string[], warnings: string[] }} ValidationResult
 */

function checkMeta(report, meta) {
  if (!isObject(meta)) return report.error('meta', 'is required');
  requireText(report, 'meta.title', meta.title);
  requireText(report, 'meta.summary', meta.summary);
  arr(meta.chapters).forEach((key, i, all) => {
    if (!CHAPTER_KEYS.includes(key)) report.error(`meta.chapters[${i}]`, `unknown chapter "${key}" (use ${CHAPTER_KEYS.join(', ')})`);
    else if (all.indexOf(key) !== i) report.error(`meta.chapters[${i}]`, `"${key}" is listed twice (each chapter appears once)`);
  });
  return undefined;
}

// The map is required for repos; other types may leave it out, but a map
// that is there must be whole.
function checkGraph(report, data, type) {
  const layers = arr(data.layers);
  const nodes = arr(data.nodes);
  const needsMap = type === 'repo' || layers.length > 0 || nodes.length > 0;
  if (needsMap && !layers.length) report.error('layers', 'needs at least one layer');
  if (needsMap && !nodes.length) report.error('nodes', 'needs at least one node');
  const layerIds = checkUniqueIds(report, 'layers', layers);
  layers.forEach((layer, i) => {
    requireText(report, `layers[${i}].label`, layer.label);
    checkEnum(report, `layers[${i}].color`, layer.color, LAYER_COLORS);
  });
  const nodeIds = checkUniqueIds(report, 'nodes', nodes);
  nodes.forEach((node, i) => {
    requireText(report, `nodes[${i}].label`, node.label);
    if (!layerIds.has(node.layer)) report.error(`nodes[${i}].layer`, `"${node.layer}" is not a layer id`);
    checkEnum(report, `nodes[${i}].kind`, node.kind, NODE_KINDS);
    if (TYPE_RULES[type].citesCode && !arr(node.files).length && node.kind !== 'user') report.warn(`nodes[${i}].files`, `"${node.id}" cites no files, so readers cannot find it in the code`);
  });
  layers.forEach((layer, i) => {
    if (!nodes.some((node) => node.layer === layer.id)) report.warn(`layers[${i}]`, `layer "${layer.id}" has no nodes`);
  });
  arr(data.edges).forEach((edge, i) => {
    if (!nodeIds.has(edge.from)) report.error(`edges[${i}].from`, `"${edge.from}" is not a node id`);
    if (!nodeIds.has(edge.to)) report.error(`edges[${i}].to`, `"${edge.to}" is not a node id`);
    checkEnum(report, `edges[${i}].kind`, edge.kind, EDGE_KINDS);
  });
  return nodeIds;
}

function checkFlows(report, flows, nodeIds, type) {
  if (!flows.length && type === 'repo') report.warn('flows', 'no end-to-end flow traced. This is the most useful chapter');
  checkUniqueIds(report, 'flows', flows);
  flows.forEach((flow, i) => {
    requireText(report, `flows[${i}].title`, flow.title);
    const steps = arr(flow.steps);
    if (!steps.length) report.error(`flows[${i}].steps`, 'needs at least one step');
    steps.forEach((step, j) => {
      const path = `flows[${i}].steps[${j}]`;
      requireText(report, `${path}.label`, step.label);
      if (!nodeIds.has(step.from)) report.error(`${path}.from`, `"${step.from}" is not a node id`);
      if (!nodeIds.has(step.to)) report.error(`${path}.to`, `"${step.to}" is not a node id`);
      checkEnum(report, `${path}.kind`, step.kind, STEP_KINDS);
      if (TYPE_RULES[type].citesCode && !isText(step.file)) report.warn(`${path}.file`, 'no file cited for this step');
    });
  });
}

function checkChanges(report, changes, nodeIds) {
  changes.forEach((change, i) => {
    const path = `changes[${i}]`;
    requireText(report, `${path}.title`, change.title);
    if (Number.isNaN(Date.parse(change.date))) report.error(`${path}.date`, 'must be an ISO date');
    checkEnum(report, `${path}.authorType`, change.authorType, AUTHOR_TYPES);
    checkEnum(report, `${path}.kind`, change.kind, CHANGE_KINDS);
    if (!isText(change.why)) report.warn(`${path}.why`, 'missing the reason. The "why" is the point of this chapter');
    arr(change.nodes).forEach((id, j) => {
      if (!nodeIds.has(id)) report.error(`${path}.nodes[${j}]`, `"${id}" is not a node id`);
    });
  });
}

function checkLessons(report, data) {
  arr(data.quiz).forEach((q, i) => {
    requireText(report, `quiz[${i}].question`, q.question);
    const options = arr(q.options);
    if (options.length < 2) report.error(`quiz[${i}].options`, 'needs at least two options');
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= options.length) {
      report.error(`quiz[${i}].answer`, `must be an index between 0 and ${Math.max(options.length - 1, 0)}`);
    }
  });
  arr(data.concepts).forEach((c, i) => {
    requireText(report, `concepts[${i}].title`, c.title);
    requireText(report, `concepts[${i}].body`, c.body);
  });
  const models = new Set(arr(data.dataModel).map((m) => m.name));
  arr(data.dataModel).forEach((m, i) => arr(m.relations).forEach((rel, j) => {
    if (!models.has(rel.to)) report.warn(`dataModel[${i}].relations[${j}].to`, `"${rel.to}" is not a model in dataModel`);
  }));
}

function citedFiles(data) {
  return [
    ...arr(data.nodes).flatMap((n) => arr(n.files)),
    ...arr(data.flows).flatMap((f) => arr(f.steps).map((st) => st.file)),
    ...arr(data.concepts).map((c) => c && c.file),
    ...arr(data.tree).map((t) => t.path),
    // A removed file is gone at the head, so it is not looked for.
    ...arr(data.diff).filter((d) => isObject(d) && d.status !== 'removed').map((d) => d.path),
  ].filter(isText);
}

function checkFilesExist(report, data, repoRoot) {
  const type = typeOf(data);
  if (!TYPE_RULES[type].citesCode) {
    report.warn('files', `--repo is ignored for a ${type} explainer, which does not cite code`);
    return;
  }
  const missing = [...new Set(citedFiles(data))]
    .map((file) => file.replace(/[:#]L?\d+(-L?\d+)?$/, '').replace(/\/$/, ''))
    .filter((file) => !existsSync(resolve(repoRoot, file)));
  missing.forEach((file) => report.error('files', `cited path "${file}" does not exist in ${repoRoot}`));
}

function checkLessonShape(report, data) {
  if (arr(data.layers).length > LIMITS.layers) report.warn('layers', `${arr(data.layers).length} layers. Group into ${LIMITS.layers} or fewer`);
  arr(data.nodes).forEach((n, i) => {
    if (words(n.label) > LIMITS.nodeLabelWords) report.warn(`nodes[${i}].label`, `"${n.label}" is long. Keep node labels to ${LIMITS.nodeLabelWords} words`);
  });
  arr(data.edges).forEach((e, i) => {
    if (words(e.label) > LIMITS.edgeLabelWords) report.warn(`edges[${i}].label`, `keep edge labels to ${LIMITS.edgeLabelWords} words`);
  });
  arr(data.flows).forEach((flow, i) => {
    const steps = arr(flow.steps);
    const { min, max } = LIMITS.stepsPerFlow;
    if (steps.length && (steps.length < min || steps.length > max)) report.warn(`flows[${i}].steps`, `${steps.length} steps. Aim for ${min}–${max}; split long flows`);
    const actors = new Set(steps.flatMap((st) => [st.from, st.to])).size;
    if (actors > LIMITS.actorsPerFlow) report.warn(`flows[${i}]`, `${actors} actors. Group parts so a flow has at most ${LIMITS.actorsPerFlow}`);
    steps.forEach((st, j) => {
      if (words(st.label) > LIMITS.stepLabelWords) report.warn(`flows[${i}].steps[${j}].label`, `keep step labels to ${LIMITS.stepLabelWords} words. Put the rest in detail`);
      if (sentences(st.detail) > LIMITS.detailSentences) report.warn(`flows[${i}].steps[${j}].detail`, `one idea per step. Keep detail to ${LIMITS.detailSentences} sentences`);
    });
  });
  if (arr(data.concepts).length > LIMITS.concepts) report.warn('concepts', `keep to ${LIMITS.concepts} key ideas`);
  if (arr(data.quiz).length > LIMITS.quiz) report.warn('quiz', `keep to ${LIMITS.quiz} questions`);
}

// Writing rule from SKILL.md: say it plainly, no dashes as punctuation.
function checkProseStyle(report, data) {
  const walk = (value, path, key) => {
    if (NON_PROSE_KEYS.has(key)) return;
    if (typeof value === 'string' && DASH.test(value)) report.warn(path, 'uses a dash as punctuation. Split it into two sentences, or use a colon or comma');
    else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`, key));
    else if (value !== null && typeof value === 'object') Object.entries(value).forEach(([k, v]) => walk(v, path ? `${path}.${k}` : k, k));
  };
  walk(data, '', '');
}

// Strings render as text, so markup would show up literally — and signals an
// attempt to restyle the page. Code fields are exempt.
function checkNoMarkup(report, data) {
  const walk = (value, path, key) => {
    if (typeof value === 'string' && key !== 'code' && MARKUP.test(value)) report.error(path, 'contains HTML markup. Strings are plain text; styling comes from the template');
    else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`, key));
    else if (isObject(value)) Object.entries(value).forEach(([k, v]) => walk(v, path ? `${path}.${k}` : k, k));
  };
  walk(data, '', '');
}

// Characters that are invisible, reorder text or drive a terminal: C0 and C1
// controls, bidi overrides and isolates, zero-width marks. Newline and tab are
// fine in prose and code; identifiers, paths and commands get none at all.
const HIDDEN = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/;
const HIDDEN_OR_BREAK = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/;
const MULTILINE_KEYS = new Set(['code']);

function checkHiddenCharacters(report, data) {
  const walk = (value, path, key) => {
    if (typeof value === 'string') {
      const pattern = NON_PROSE_KEYS.has(key) && !MULTILINE_KEYS.has(key) ? HIDDEN_OR_BREAK : HIDDEN;
      const hit = value.match(pattern);
      if (hit) {
        const code = hit[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
        report.error(path, `contains a control or invisible character (U+${code}). Remove it; text must read the same everywhere`);
      }
    } else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`, key));
    else if (isObject(value)) Object.entries(value).forEach(([k, v]) => walk(v, path ? `${path}.${k}` : k, k));
  };
  walk(data, '', '');
}

function checkPlaceholders(report, data) {
  const hits = [];
  const walk = (value, path) => {
    if (typeof value === 'string' && PLACEHOLDER.test(value)) hits.push(path);
    else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`));
    else if (isObject(value)) Object.entries(value).forEach(([k, v]) => walk(v, path ? `${path}.${k}` : k));
  };
  walk(data, '');
  hits.forEach((path) => report.warn(path, 'still contains a TODO placeholder'));
}

/**
 * Validate an explainer data object.
 * @param {unknown} data
 * @param {{ repoRoot?: string, flags?: object[] }} [options] when repoRoot is given, every cited file must exist there;
 *   `flags` are this explainer's reader flags from the library (learning loop)
 *   (only for types that cite code: repo, pr, change, migration)
 * @returns {ValidationResult}
 */
export function validateExplainer(data, options = {}) {
  const report = collector();
  if (!isObject(data)) {
    report.error('root', 'explainer data must be a JSON object');
    return report.result();
  }
  const type = typeOf(data);
  checkMeta(report, data.meta);
  const nodeIds = checkGraph(report, data, type);
  checkFlows(report, arr(data.flows), nodeIds, type);
  checkChanges(report, arr(data.changes), nodeIds);
  checkLessons(report, data);
  checkV2(report, data, nodeIds, options);
  checkWalkthroughs(report, data, nodeIds, type);
  checkLessonShape(report, data);
  checkNoMarkup(report, data);
  checkHiddenCharacters(report, data);
  checkProseStyle(report, data);
  checkPlaceholders(report, data);
  if (options.repoRoot) {
    checkFilesExist(report, data, options.repoRoot);
    checkWalkthroughSources(report, data, options.repoRoot);
  }
  return report.result();
}
