// Section keys for the learning loop: one per chapter view and per item a
// reader can react to, spelled exactly like the page's deep-link routes
// (location.hash without "#", each id one encodeURIComponent segment).
// A fingerprint (first 8 hex of sha256 of the item's own text) travels with
// every key, so a rewritten or reordered item never inherits old feedback.
// Contract: references/learning-loop.md.
import { createHash } from 'node:crypto';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value.filter(isObject) : []);
const text = (value) => (typeof value === 'string' ? value : '');
const enc = encodeURIComponent;

const sha = (value) => createHash('sha256').update(value).digest('hex');
const fp = (...parts) => sha(parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p ?? null))).join('\n')).slice(0, 8);

// Chapter key -> the data it shows. A chapter has a route when it has data.
const CHAPTER_DATA = {
  map: (d) => [d.layers, d.nodes, d.edges],
  flows: (d) => d.flows,
  changes: (d) => d.changes,
  tree: (d) => d.tree,
  data: (d) => d.dataModel,
  concepts: (d) => d.concepts,
  quiz: (d) => d.quiz,
  glossary: (d) => d.glossary,
  run: (d) => d.runbook,
  context: (d) => d.context,
  diff: (d) => d.diff,
  options: (d) => d.options,
  risks: (d) => d.risks,
  rollout: (d) => d.rollout,
  timeline: (d) => d.timeline,
  visuals: (d) => d.diagrams,
  code: (d) => d.walkthroughs,
};

const hasData = (value) => (Array.isArray(value) ? value.some((v) => (Array.isArray(v) ? v.length : v)) : isObject(value));

/**
 * Every section of an explainer: { "<route>": "<8 hex fp>" }.
 * Chapters: "map", "flows", ... "visuals", "code". Items: "flows/<id>",
 * "concepts/<i>" (from 0), "visuals/<id>", "diff/<path>", "code/<id>", "quiz/<n>" (from 1).
 */
export function sectionsFor(data) {
  const d = isObject(data) ? data : {};
  const out = {};
  Object.entries(CHAPTER_DATA).forEach(([key, pick]) => {
    const value = pick(d);
    const present = key === 'map' ? list(d.nodes).length > 0 : hasData(value);
    if (present) out[key] = fp(key, value);
  });
  list(d.flows).filter((f) => text(f.id)).forEach((f) => {
    out[`flows/${enc(f.id)}`] = fp(f.title, list(f.steps).map((s) => [s.label, s.detail, s.why]));
  });
  if (Array.isArray(d.concepts)) d.concepts.forEach((c, i) => { if (isObject(c)) out[`concepts/${i}`] = fp(c.title, c.body, c.parts, c.visual); });
  list(d.diagrams).filter((v) => text(v.id)).forEach((v) => {
    const { id, title, caption, ...shape } = v;
    out[`visuals/${enc(id)}`] = fp(title, caption, shape);
  });
  list(d.diff).filter((f) => text(f.path)).forEach((f) => { out[`diff/${enc(f.path)}`] = fp(f.path, f.summary); });
  list(d.walkthroughs).filter((w) => text(w.id)).forEach((w) => { out[`code/${enc(w.id)}`] = fp(w.title, w.code, w.lines, w.takeaway); });
  if (Array.isArray(d.quiz)) d.quiz.forEach((q, i) => { if (isObject(q)) out[`quiz/${i + 1}`] = fp(q.question, q.options); });
  return out;
}

/** The full sha256 of the explainer data: which build a batch was recorded on. */
export function buildHash(data) {
  return sha(JSON.stringify(data ?? null));
}

/** How signals name an explainer: its library slug, else "<meta.repo>|<meta.title>". */
export function explainerKey(data, slug) {
  if (typeof slug === 'string' && slug) return slug;
  const meta = isObject(data) && isObject(data.meta) ? data.meta : {};
  return `${text(meta.repo)}|${text(meta.title)}`;
}
