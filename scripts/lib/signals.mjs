// Reader signal batches: what a page sends (POST /api/signals) or downloads
// (<key>.signals.json). Untrusted input: strict shape, caps, no identifiers,
// no URLs, and the only free text is a one-line note. Prototype keys are
// dropped while parsing. Contract: references/learning-loop.md.

export const SIGNALS_FORMAT = 'concept-explainer-signals';
export const MAX_BATCH_BYTES = 64 * 1024;
export const VOTES = ['clear', 'more', 'basic'];
export const TIME_BUCKETS = ['<30s', '30s-2m', '2-10m', '>10m'];
export const NOTE_MAX = 140;
const MAX_EXPLAINERS = 50;
const MAX_SECTIONS = 500;
const MAX_QUIZ = 50;
const MAX_LOOKUPS = 200;
const MAX_COUNT = 10000;
const MAX_MISSES = 9;
const BANNED = new Set(['__proto__', 'constructor', 'prototype']);
const HIDDEN = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/;
const CHAPTERS = ['map', 'flows', 'changes', 'tree', 'data', 'concepts', 'quiz', 'glossary', 'run', 'context', 'diff', 'options', 'risks', 'rollout', 'timeline', 'visuals', 'code'];
const ITEM_ROUTE = /^(flows|visuals|diff|code)\/[^/]+$|^concepts\/\d{1,3}$|^quiz\/[1-9]\d{0,2}$/;
const SECTION_FIELDS = new Set(['fp', 'vote', 'note', 'views', 'finished', 'time']);
const QUIZ_FIELDS = new Set(['fp', 'answers', 'firstWrong', 'misses', 'wrong']);
const EXPLAINER_FIELDS = new Set(['key', 'slug', 'build', 'sections', 'quiz', 'lookups']);
const BATCH_FIELDS = new Set(['format', 'version', 'batchId', 'date', 'explainers']);

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const refuse = (message) => { throw new Error(`signals: ${message}`); };

function onlyFields(value, allowed, where) {
  Object.keys(value).forEach((key) => { if (!allowed.has(key)) refuse(`${where}: unknown field "${key}"`); });
}

function count(value, where, max = MAX_COUNT) {
  if (!Number.isInteger(value) || value < 0 || value > max) refuse(`${where} must be a whole number from 0 to ${max}`);
  return value;
}

function plainText(value, where, max) {
  if (typeof value !== 'string' || !value.trim()) refuse(`${where} must be text`);
  if (/[\n\r]/.test(value)) refuse(`${where} must be one line`);
  if (HIDDEN.test(value)) refuse(`${where} contains a control or invisible character`);
  if (value.length > max) refuse(`${where} is over ${max} characters`);
  return value;
}

export const isRoute = (route) => typeof route === 'string' && route.length <= 300 && (CHAPTERS.includes(route) || ITEM_ROUTE.test(route));

function section(route, value, where) {
  if (!isRoute(route)) refuse(`${where}: "${route}" is not a section route`);
  if (!isObject(value)) refuse(`${where} must be an object`);
  onlyFields(value, SECTION_FIELDS, where);
  if (typeof value.fp !== 'string' || !/^[0-9a-f]{8}$/.test(value.fp)) refuse(`${where}.fp must be 8 hex characters`);
  const out = { fp: value.fp, views: count(value.views, `${where}.views`), finished: count(value.finished, `${where}.finished`) };
  if (!TIME_BUCKETS.includes(value.time)) refuse(`${where}.time must be one of ${TIME_BUCKETS.join(', ')}`);
  out.time = value.time;
  if (value.vote !== undefined) {
    const { from = null, to = null } = isObject(value.vote) ? value.vote : refuse(`${where}.vote must be { from, to }`);
    [from, to].forEach((v) => { if (v !== null && !VOTES.includes(v)) refuse(`${where}.vote: "${v}" is not one of ${VOTES.join(', ')}`); });
    out.vote = { from, to };
  }
  if (value.note !== undefined) {
    if (!out.vote || !['more', 'basic'].includes(out.vote.to)) refuse(`${where}: a note needs a vote of more or basic`);
    out.note = plainText(value.note, `${where}.note`, NOTE_MAX);
  }
  return out;
}

function quizItem(n, value, where) {
  if (!/^[1-9]\d{0,2}$/.test(n)) refuse(`${where}: quiz items are numbered from 1, as in #quiz/<n>`);
  if (!isObject(value)) refuse(`${where} must be an object`);
  onlyFields(value, QUIZ_FIELDS, where);
  if (typeof value.fp !== 'string' || !/^[0-9a-f]{8}$/.test(value.fp)) refuse(`${where}.fp must be 8 hex characters`);
  const answers = count(value.answers, `${where}.answers`);
  const firstWrong = count(value.firstWrong, `${where}.firstWrong`);
  if (firstWrong > answers) refuse(`${where}.firstWrong cannot be more than answers`);
  const misses = count(value.misses, `${where}.misses`, MAX_MISSES);
  if (!Array.isArray(value.wrong) || value.wrong.length > MAX_MISSES) refuse(`${where}.wrong must be a list of up to ${MAX_MISSES} option indexes`);
  const wrong = value.wrong.map((i, j) => count(i, `${where}.wrong[${j}]`, 20));
  return { fp: value.fp, answers, firstWrong, misses, wrong };
}

function counts(value, where) {
  if (value === undefined) return {};
  if (!isObject(value)) refuse(`${where} must be an object`);
  const entries = Object.entries(value);
  if (entries.length > MAX_LOOKUPS) refuse(`${where}: more than ${MAX_LOOKUPS} entries`);
  return Object.fromEntries(entries.map(([k, n]) => [plainText(k, `${where} key`, 120), count(n, `${where}["${k}"]`)]));
}

function explainer(value, i) {
  const where = `explainers[${i}]`;
  if (!isObject(value)) refuse(`${where} must be an object`);
  onlyFields(value, EXPLAINER_FIELDS, where);
  const key = plainText(value.key, `${where}.key`, 300);
  if (value.slug !== undefined && (typeof value.slug !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value.slug))) refuse(`${where}.slug is not a library slug`);
  if (typeof value.build !== 'string' || !/^[0-9a-f]{64}$/.test(value.build)) refuse(`${where}.build must be 64 hex characters`);
  const sections = isObject(value.sections) ? Object.entries(value.sections) : refuse(`${where}.sections must be an object`);
  if (sections.length > MAX_SECTIONS) refuse(`${where}: more than ${MAX_SECTIONS} sections`);
  const quiz = value.quiz === undefined ? [] : (isObject(value.quiz) ? Object.entries(value.quiz) : refuse(`${where}.quiz must be an object`));
  if (quiz.length > MAX_QUIZ) refuse(`${where}: more than ${MAX_QUIZ} quiz items`);
  const lookups = value.lookups === undefined ? {} : (isObject(value.lookups) ? value.lookups : refuse(`${where}.lookups must be an object`));
  onlyFields(lookups, new Set(['glossary', 'hints']), `${where}.lookups`);
  return {
    key,
    ...(value.slug ? { slug: value.slug } : {}),
    build: value.build,
    sections: Object.fromEntries(sections.map(([route, s]) => [route, section(route, s, `${where}.sections["${route}"]`)])),
    quiz: Object.fromEntries(quiz.map(([n, q]) => [n, quizItem(n, q, `${where}.quiz["${n}"]`)])),
    lookups: { glossary: counts(lookups.glossary, `${where}.lookups.glossary`), hints: counts(lookups.hints, `${where}.lookups.hints`) },
  };
}

/**
 * Parse and check a batch. Throws `signals: <reason>` on anything off.
 * @param {string} text the JSON as received
 */
export function parseSignalBatch(text) {
  if (Buffer.byteLength(String(text)) > MAX_BATCH_BYTES) refuse('the batch is larger than 64 KB');
  let raw;
  try {
    raw = JSON.parse(text, (key, value) => (BANNED.has(key) ? undefined : value));
  } catch (error) {
    refuse(`not JSON (${error.message})`);
  }
  if (!isObject(raw) || raw.format !== SIGNALS_FORMAT) refuse(`not a ${SIGNALS_FORMAT} batch`);
  onlyFields(raw, BATCH_FIELDS, 'batch');
  if (raw.version !== 1) refuse(`version ${raw.version} is not supported (this version reads 1)`);
  if (typeof raw.batchId !== 'string' || !/^[0-9a-f]{16,64}$/.test(raw.batchId)) refuse('batchId must be 16 to 64 hex characters');
  if (typeof raw.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) refuse('date must be YYYY-MM-DD');
  if (!Array.isArray(raw.explainers) || !raw.explainers.length) refuse('explainers must be a non-empty list');
  if (raw.explainers.length > MAX_EXPLAINERS) refuse(`more than ${MAX_EXPLAINERS} explainers in one batch`);
  return { format: SIGNALS_FORMAT, version: 1, batchId: raw.batchId, date: raw.date, explainers: raw.explainers.map(explainer) };
}
