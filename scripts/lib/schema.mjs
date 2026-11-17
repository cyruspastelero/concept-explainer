// Single source of truth for the explainer data contract.
// Documented for humans in references/data-schema.md — keep them in sync.

// v2 adds meta.type and the chapters for PRs, proposals, incidents and concepts.
// A file without meta.type (every v1 file) is read as a repo explainer.
export const SCHEMA_VERSION = 2;

export const CHAPTER_KEYS = [
  'map', 'flows', 'changes', 'tree', 'data', 'concepts', 'quiz', 'glossary', 'run',
  'context', 'diff', 'options', 'risks', 'rollout', 'timeline', 'visuals', 'code',
];

// What an explainer explains. Each type picks default chapters and the objects it needs.
export const EXPLAINER_TYPES = ['repo', 'pr', 'change', 'proposal', 'migration', 'incident', 'concept'];
export const DEFAULT_TYPE = 'repo';

export const TYPE_RULES = {
  repo: { chapters: ['map', 'flows', 'changes', 'tree', 'data', 'concepts', 'quiz', 'glossary', 'run'], requires: ['nodes'], citesCode: true, optional: ['code'] },
  pr: { chapters: ['context', 'diff', 'map', 'flows', 'risks', 'rollout', 'quiz'], requires: ['context', 'diff'], citesCode: true, optional: ['code'] },
  change: { chapters: ['context', 'diff', 'flows', 'risks', 'quiz'], requires: ['context', 'diff'], citesCode: true, optional: ['code'] },
  proposal: { chapters: ['context', 'options', 'map', 'flows', 'risks', 'rollout', 'quiz'], requires: ['context', 'options'], citesCode: false, optional: ['code'] },
  migration: { chapters: ['context', 'options', 'map', 'flows', 'rollout', 'risks', 'quiz'], requires: ['context', 'options'], citesCode: true, optional: ['code'] },
  incident: { chapters: ['context', 'timeline', 'flows', 'risks', 'rollout', 'quiz'], requires: ['context', 'timeline'], citesCode: false, optional: ['code'] },
  concept: { chapters: ['concepts', 'map', 'flows', 'glossary', 'quiz'], requires: ['concepts'], citesCode: false, optional: ['code'] },
};

// The code walkthrough is optional for every type: added only when code
// carries the root of the idea (config codeWalkthrough, references/code-walkthrough.md).
export const OPTIONAL_CHAPTERS = ['code'];
export const WALK_STEP_KINDS = ['what', 'why', 'gotcha', 'input', 'output'];

export const SOURCE_KINDS = ['repo', 'pr', 'commit', 'doc', 'issue', 'url', 'notes'];
export const STATUSES = ['draft', 'proposed', 'accepted', 'rejected', 'in-progress', 'merged', 'done'];
// A decision is made in these states, so exactly one option must be chosen.
export const DECIDED_STATUSES = ['accepted', 'done', 'merged'];
// Nothing is chosen yet in these states.
export const UNDECIDED_STATUSES = ['draft', 'proposed'];
export const NODE_STATUSES = ['added', 'changed', 'removed', 'unchanged'];
export const DIFF_STATUSES = ['added', 'modified', 'removed', 'renamed'];
export const IMPACTS = ['low', 'medium', 'high'];
export const EVENT_KINDS = ['detect', 'act', 'fix', 'learn'];
export const FLOW_VARIANTS = ['before', 'after'];

// The fixed visuals kit. Data only: no SVG, no images. See references/visuals.md.
export const VISUAL_KINDS = ['layers', 'cycle', 'state', 'compare', 'hierarchy', 'beforeAfter', 'quadrant', 'funnel', 'venn'];

export const NODE_KINDS = [
  'user', 'ui', 'mobile', 'api', 'service', 'db', 'queue', 'cache',
  'external', 'job', 'cli', 'auth', 'storage', 'library',
];

export const LAYER_COLORS = ['green', 'blue', 'navy', 'midnight', 'yellow', 'pink'];

export const STEP_KINDS = ['request', 'response', 'async', 'data', 'internal'];

export const EDGE_KINDS = ['sync', 'async', 'data'];

export const AUTHOR_TYPES = ['human', 'agent'];

export const CHANGE_KINDS = ['feat', 'fix', 'refactor', 'perf', 'docs', 'test', 'chore', 'ci', 'security'];

export const PLACEHOLDER = /\bTODO\b/;

// Lesson-shape limits from SKILL.md. Exceeding them is a warning (an error
// under --strict) because it makes the page harder to read, not broken.
export const LIMITS = {
  stepsPerFlow: { min: 3, max: 12 },
  actorsPerFlow: 7,
  layers: 8,
  nodeLabelWords: 4,
  stepLabelWords: 7,
  edgeLabelWords: 4,
  detailSentences: 3,
  concepts: 6,
  quiz: 6,
  // v2 objects. Above a max is a warning (an error for parts and venn sets, which break the drawing).
  tags: 8,
  goals: 5,
  options: { min: 2, max: 5 },
  prosCons: 5,
  risks: 8,
  rollout: 12,
  timeline: 20,
  diff: 40,
  keyFiles: 4,
  diagrams: 8,
  // Code walkthroughs: above a max is a warning, except codeLines.hard, which is an error.
  walkthroughs: 5,
  codeLines: { min: 5, max: 40, hard: 80 },
  walkSteps: { min: 2, max: 12 },
  noteSentences: 2,
  parts: { min: 2, max: 6 },
  visualItems: {
    layers: { min: 2, max: 8 },
    cycle: { min: 3, max: 8 },
    funnel: { min: 2, max: 6 },
    states: { min: 2, max: 10 },
    transitions: 16,
    compareColumns: { min: 2, max: 5 },
    compareRows: { min: 1, max: 10 },
    hierarchy: { min: 2, max: 20 },
    beforeAfter: { min: 1, max: 8 },
    notes: 5,
    quadrant: { min: 1, max: 12 },
    vennSets: { min: 2, max: 3 },
    vennItems: { min: 1, max: 12 },
  },
};

export const MARKUP = /<\/?[a-z][a-z0-9-]*(\s[^>]*)?>/i;

// Prose fields are read by people; code-ish fields are exempt from style checks.
export const NON_PROSE_KEYS = new Set(['code', 'file', 'files', 'path', 'command', 'url', 'ref', 'id', 'type', 'name', 'lang', 'from', 'to', 'layer', 'kind', 'color', 'date', 'generatedAt', 'commit', 'repo', 'author', 'authorType', 'chapters', 'preset', 'stack', '$schema',
  'status', 'impact', 'variant', 'pair', 'at', 'lines', 'in', 'parent', 'schemaVersion', 'refs', 'illustrative']);

// Em dash, en dash, or a spaced hyphen used as punctuation.
export const DASH = /\s[\u2014\u2013-]\s|\u2014|\u2013/;
