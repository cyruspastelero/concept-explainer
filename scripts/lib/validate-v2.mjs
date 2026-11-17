// Schema v2 checks: meta.type and friends, and the chapters for PRs,
// proposals, migrations, incidents and concepts. See references/data-schema.md.
import {
  DECIDED_STATUSES, DEFAULT_TYPE, DIFF_STATUSES, EVENT_KINDS, EXPLAINER_TYPES, FLOW_VARIANTS, IMPACTS, LIMITS,
  NODE_STATUSES, SOURCE_KINDS, STATUSES, TYPE_RULES, UNDECIDED_STATUSES,
} from './schema.mjs';
import { checkDiagrams, checkVisual } from './validate-visuals.mjs';
import {
  arr, checkCount, checkOneOf, isObject, isText, listAt, optionalText, requireText, sentences, words,
} from './validate-util.mjs';

const LINES = /^\+\d+ -\d+$/;
const SAFE_URL = /^https?:\/\//i;

/** The explainer's type: meta.type, or "repo" for files without one (every v1 file). */
export function typeOf(data) {
  const type = isObject(data) && isObject(data.meta) ? data.meta.type : undefined;
  return EXPLAINER_TYPES.includes(type) ? type : DEFAULT_TYPE;
}

export function checkMetaV2(report, data) {
  const meta = isObject(data.meta) ? data.meta : {};
  if (meta.type === undefined) {
    if (Number(data.schemaVersion) >= 2) report.error('meta.type', `is required from schema v2 (one of ${EXPLAINER_TYPES.join(', ')})`);
  } else {
    checkOneOf(report, 'meta.type', meta.type, EXPLAINER_TYPES);
  }
  checkOneOf(report, 'meta.status', meta.status, STATUSES);
  const tags = listAt(report, 'meta.tags', meta.tags);
  checkCount(report, 'meta.tags', tags, { max: LIMITS.tags }, { what: 'tags' });
  tags.forEach((tag, i) => requireText(report, `meta.tags[${i}]`, tag));
  if (meta.source !== undefined) {
    if (!isObject(meta.source)) report.error('meta.source', 'must be { kind, ref, url? }');
    else {
      checkOneOf(report, 'meta.source.kind', meta.source.kind, SOURCE_KINDS, { required: true });
      requireText(report, 'meta.source.ref', meta.source.ref);
    }
  }
}

/** Errors for the objects this type cannot do without. */
export function checkTypeRequirements(report, data) {
  const type = typeOf(data);
  const present = (key) => (key === 'context' ? isObject(data.context) : arr(data[key]).length > 0);
  TYPE_RULES[type].requires.forEach((key) => {
    if (!present(key)) report.error(key, `a ${type} explainer needs ${key === 'context' ? 'a context object' : `at least one entry in ${key}`}`);
  });
}

function checkContext(report, context) {
  if (context === undefined) return;
  if (!isObject(context)) return report.error('context', 'must be { problem, goals[], nonGoals[], background? }');
  requireText(report, 'context.problem', context.problem);
  ['goals', 'nonGoals'].forEach((key) => {
    const items = listAt(report, `context.${key}`, context[key]);
    checkCount(report, `context.${key}`, items, { max: LIMITS.goals });
    items.forEach((item, i) => requireText(report, `context.${key}[${i}]`, item));
  });
  optionalText(report, 'context.background', context.background);
  return undefined;
}

function checkDiff(report, diff, nodeIds) {
  const entries = listAt(report, 'diff', diff);
  checkCount(report, 'diff', entries, { max: LIMITS.diff }, { what: 'files' });
  entries.forEach((entry, i) => {
    const path = `diff[${i}]`;
    if (!isObject(entry)) return report.error(path, 'must be an object');
    requireText(report, `${path}.path`, entry.path);
    checkOneOf(report, `${path}.status`, entry.status, DIFF_STATUSES, { required: true });
    requireText(report, `${path}.summary`, entry.summary);
    if (entry.lines !== undefined && !(typeof entry.lines === 'string' && LINES.test(entry.lines))) {
      report.error(`${path}.lines`, 'must look like "+12 -3"');
    }
    arr(entry.nodes).forEach((id, j) => {
      if (!nodeIds.has(id)) report.error(`${path}.nodes[${j}]`, `"${id}" is not a node id`);
    });
    return undefined;
  });
  const keys = entries.filter((e) => isObject(e) && e.key === true).length;
  if (keys > LIMITS.keyFiles) report.warn('diff', `${keys} key files. Mark only the 2 to ${LIMITS.keyFiles} a reviewer must read`);
}

function checkOptions(report, options, status) {
  const items = listAt(report, 'options', options);
  if (!items.length) return;
  checkCount(report, 'options', items, LIMITS.options, { what: 'options' });
  items.forEach((option, i) => {
    const path = `options[${i}]`;
    if (!isObject(option)) return report.error(path, 'must be an object');
    requireText(report, `${path}.title`, option.title);
    requireText(report, `${path}.summary`, option.summary);
    ['pros', 'cons'].forEach((key) => {
      const list = listAt(report, `${path}.${key}`, option[key]);
      checkCount(report, `${path}.${key}`, list, { max: LIMITS.prosCons });
      list.forEach((item, j) => requireText(report, `${path}.${key}[${j}]`, item));
    });
    if (option.chosen !== undefined && typeof option.chosen !== 'boolean') report.error(`${path}.chosen`, 'must be true or false');
    return undefined;
  });
  const chosen = items.filter((o) => isObject(o) && o.chosen === true).length;
  if (DECIDED_STATUSES.includes(status) && chosen !== 1) {
    report.error('options', `status is "${status}", so exactly one option must be chosen (found ${chosen})`);
  } else if (UNDECIDED_STATUSES.includes(status) && chosen > 0) {
    report.error('options', `status is "${status}", so the decision is not chosen yet. Remove "chosen"`);
  } else if (chosen > 1) {
    report.error('options', `${chosen} options are chosen. Choose exactly one, or none while undecided`);
  }
}

function checkRisks(report, risks) {
  const items = listAt(report, 'risks', risks);
  checkCount(report, 'risks', items, { max: LIMITS.risks }, { what: 'risks' });
  items.forEach((risk, i) => {
    const path = `risks[${i}]`;
    if (!isObject(risk)) return report.error(path, 'must be an object');
    requireText(report, `${path}.risk`, risk.risk);
    checkOneOf(report, `${path}.impact`, risk.impact, IMPACTS, { required: true });
    requireText(report, `${path}.mitigation`, risk.mitigation);
    optionalText(report, `${path}.owner`, risk.owner);
    return undefined;
  });
}

function checkRollout(report, rollout) {
  const items = listAt(report, 'rollout', rollout);
  checkCount(report, 'rollout', items, { max: LIMITS.rollout }, { what: 'steps' });
  items.forEach((step, i) => {
    const path = `rollout[${i}]`;
    if (!isObject(step)) return report.error(path, 'must be an object');
    requireText(report, `${path}.label`, step.label);
    if (step.done !== undefined && typeof step.done !== 'boolean') report.error(`${path}.done`, 'must be true or false');
    optionalText(report, `${path}.detail`, step.detail);
    optionalText(report, `${path}.command`, step.command);
    return undefined;
  });
}

function checkTimeline(report, timeline) {
  const items = listAt(report, 'timeline', timeline);
  checkCount(report, 'timeline', items, { max: LIMITS.timeline }, { what: 'events' });
  items.forEach((event, i) => {
    const path = `timeline[${i}]`;
    if (!isObject(event)) return report.error(path, 'must be an object');
    requireText(report, `${path}.at`, event.at);
    requireText(report, `${path}.label`, event.label);
    checkOneOf(report, `${path}.kind`, event.kind, EVENT_KINDS);
    return undefined;
  });
}

function checkNodeStatuses(report, nodes) {
  arr(nodes).forEach((node, i) => {
    if (isObject(node)) checkOneOf(report, `nodes[${i}].status`, node.status, NODE_STATUSES);
  });
}

function checkFlowPairs(report, flows) {
  const pairs = new Map();
  arr(flows).forEach((flow, i) => {
    if (!isObject(flow) || (flow.variant === undefined && flow.pair === undefined)) return;
    checkOneOf(report, `flows[${i}].variant`, flow.variant, FLOW_VARIANTS, { required: true });
    if (!isText(flow.pair)) return report.error(`flows[${i}].pair`, 'a before/after flow needs a pair id shared with its other half');
    pairs.set(flow.pair, [...(pairs.get(flow.pair) || []), [i, flow.variant]]);
    return undefined;
  });
  pairs.forEach((sides) => {
    FLOW_VARIANTS.forEach((variant) => {
      if (!sides.some(([, v]) => v === variant)) {
        const [i] = sides[0];
        report.warn(`flows[${i}].pair`, `pair has no "${variant}" flow, so it shows on its own`);
      }
    });
  });
}

function checkConceptParts(report, concepts) {
  arr(concepts).forEach((concept, i) => {
    if (!isObject(concept)) return;
    if (concept.parts !== undefined) {
      const parts = listAt(report, `concepts[${i}].parts`, concept.parts);
      checkCount(report, `concepts[${i}].parts`, parts, LIMITS.parts, { strict: true, what: 'parts' });
      parts.forEach((part, j) => {
        if (!isObject(part)) return report.error(`concepts[${i}].parts[${j}]`, 'must be { label, detail? }');
        requireText(report, `concepts[${i}].parts[${j}].label`, part.label);
        optionalText(report, `concepts[${i}].parts[${j}].detail`, part.detail);
        return undefined;
      });
    }
    if (concept.visual !== undefined) checkVisual(report, `concepts[${i}].visual`, concept.visual);
  });
}

// Every "url" anywhere must be http(s); the page also drops anything else.
function checkUrls(report, data) {
  const walk = (value, path, key) => {
    if (key === 'url' && value !== undefined && !(typeof value === 'string' && SAFE_URL.test(value.trim()))) {
      report.error(path, 'must start with http:// or https://');
    } else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`, key));
    else if (isObject(value)) Object.entries(value).forEach(([k, v]) => walk(v, path ? `${path}.${k}` : k, k));
  };
  walk(data, '', '');
}

// Cheap checks from references/explaining.md. Only for v2 files, so v1
// explainers keep the rules they were written against.
function checkExplaining(report, data) {
  const isV2 = Number(data.schemaVersion) >= 2 || (isObject(data.meta) && data.meta.type !== undefined);
  if (!isV2) return;
  arr(data.concepts).forEach((concept, i) => {
    if (isObject(concept) && isText(concept.analogy) && sentences(concept.analogy) < 2) {
      report.warn(`concepts[${i}].analogy`, 'say where it breaks, in a second sentence ("Unlike a ticket, a token can be copied.")');
    }
  });
  arr(data.diagrams).forEach((diagram, i) => {
    if (isObject(diagram) && isText(diagram.caption) && (words(diagram.caption) < 5 || sentences(diagram.caption) < 1)) {
      report.warn(`diagrams[${i}].caption`, 'reads like a label. Write the takeaway as a sentence ("Each refresh issues a new token.")');
    }
  });
  arr(data.quiz).forEach((q, i) => {
    if (isObject(q) && isText(q.explain) && sentences(q.explain) < 2) {
      report.warn(`quiz[${i}].explain`, 'also say why the most tempting wrong option is wrong, in a second sentence');
    }
  });
}

export function checkV2(report, data, nodeIds) {
  checkExplaining(report, data);
  checkMetaV2(report, data);
  checkTypeRequirements(report, data);
  checkContext(report, data.context);
  checkDiff(report, data.diff, nodeIds);
  checkOptions(report, data.options, isObject(data.meta) ? data.meta.status : undefined);
  checkRisks(report, data.risks);
  checkRollout(report, data.rollout);
  checkTimeline(report, data.timeline);
  checkNodeStatuses(report, data.nodes);
  checkFlowPairs(report, data.flows);
  checkConceptParts(report, data.concepts);
  checkDiagrams(report, data.diagrams);
  checkUrls(report, data);
}
