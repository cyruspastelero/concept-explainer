// Which chapters a page shows, in order: the one rule shared by the search
// index (scripts/lib/search-index.mjs) and the page (template/js/app.js
// chooseChapters, which test/integration-routes.test.mjs keeps in step).
//
// meta.chapters wins when set, in its order. Otherwise the type's default
// order (TYPE_RULES, which app.js copies as TYPE_CHAPTERS), with the code
// walkthrough right after flows, then every other chapter that has data, so
// nothing written is hidden. Either way, only chapters with data show.
import { DEFAULT_TYPE, EXPLAINER_TYPES, TYPE_RULES } from './schema.mjs';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = (value) => (Array.isArray(value) ? value.length : 0);

// The page's chapter table order (app.js CHAPTERS), used for the chapters after the type's own.
export const PAGE_CHAPTER_ORDER = Object.freeze([
  'context', 'diff', 'options', 'risks', 'rollout', 'timeline', 'visuals',
  'map', 'flows', 'code', 'changes', 'tree', 'data', 'concepts', 'quiz', 'glossary', 'run',
]);

// The same "has data" tests as the page's chapter table.
const HAS = {
  context: (d) => isObject(d.context) && Boolean(d.context.problem),
  diff: (d) => count(d.diff) > 0,
  options: (d) => count(d.options) > 0,
  risks: (d) => count(d.risks) > 0,
  rollout: (d) => count(d.rollout) > 0,
  timeline: (d) => count(d.timeline) > 0,
  visuals: (d) => count(d.diagrams) > 0,
  map: (d) => count(d.nodes) > 0,
  flows: (d) => count(d.flows) > 0,
  code: (d) => count(d.walkthroughs) > 0,
  changes: (d) => count(d.changes) > 0,
  tree: (d) => count(d.tree) > 0,
  data: (d) => count(d.dataModel) > 0,
  concepts: (d) => count(d.concepts) > 0,
  quiz: (d) => count(d.quiz) > 0,
  glossary: (d) => count(d.glossary) > 0,
  run: (d) => count(d.runbook) > 0,
};

/** True when the chapter has something to show for this data. */
export const chapterHasData = (key, data) => Boolean(HAS[key] && HAS[key](isObject(data) ? data : {}));

// The type's order with the optional code walkthrough placed right after flows.
function typeOrder(type) {
  const base = TYPE_RULES[type].chapters;
  if (base.includes('code')) return base;
  const at = base.indexOf('flows');
  return at < 0 ? [...base, 'code'] : [...base.slice(0, at + 1), 'code', ...base.slice(at + 1)];
}

/**
 * The chapter keys this explainer's page shows, in order.
 * @param {object} data explainer data
 * @returns {string[]}
 */
export function shownChapters(data) {
  const d = isObject(data) ? data : {};
  const meta = isObject(d.meta) ? d.meta : {};
  const requested = Array.isArray(meta.chapters) ? meta.chapters.filter((k) => typeof k === 'string') : [];
  const type = EXPLAINER_TYPES.includes(meta.type) ? meta.type : DEFAULT_TYPE;
  const order = requested.length ? requested : [...typeOrder(type), ...PAGE_CHAPTER_ORDER.filter((k) => !typeOrder(type).includes(k))];
  return [...new Set(order)].filter((key) => chapterHasData(key, d));
}
