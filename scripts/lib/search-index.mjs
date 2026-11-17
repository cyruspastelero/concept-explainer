// Search index for the library hub. Turns one explainer's data into flat,
// small entries whose hrefs follow the explainer's deep-link contract
// (docs/plans/2026-11-18-dashboard-and-library.md, section 2).
// Documented for humans in references/library.md: keep them in sync.

import { shownChapters } from './chapters.mjs';

export const SEARCH_TYPES = [
  'explainer', 'node', 'flow', 'step', 'change', 'entity', 'concept', 'glossary', 'file', 'run',
  'diff', 'option', 'risk', 'rollout', 'event', 'visual', 'question', 'code',
];

// Keeps the embedded hub small. Titles are short already, so only text is clipped.
export const TEXT_LIMIT = 240;

const isObject = (value) => Boolean(value) && typeof value === 'object';
const list = (value) => (Array.isArray(value) ? value.filter(isObject) : []);
// Keeps each item's original position, which numbered routes depend on.
const indexed = (value) => (Array.isArray(value) ? value.map((item, i) => [item, i]).filter(([item]) => isObject(item)) : []);
const str = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
const join = (...parts) => parts.map(str).filter(Boolean).join(' ');

export function clip(value, max = TEXT_LIMIT) {
  const text = str(value);
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Href of an explainer page (and optional hash route), relative to the hub.
 * @param {string} slug
 * @param {string} [hash] route without the leading "#", already encoded
 */
export function explainerHref(slug, hash = '') {
  return `explainers/${slug}/index.html${hash ? `#${hash}` : ''}`;
}

// Every id segment is encoded on its own, so "/", "#" and spaces in a tree
// path or glossary term stay inside one segment.
const route = (chapter, ...segments) => [chapter, ...segments.map((s) => encodeURIComponent(String(s)))].join('/');

function entry(slug, type, title, text, hash, extra) {
  return { slug, type, title: str(title), text: clip(text), href: explainerHref(slug, hash), ...extra };
}

function flowEntries(slug, flows) {
  return list(flows).filter((flow) => str(flow.id)).flatMap((flow) => [
    entry(slug, 'flow', flow.title || flow.id, join(flow.trigger, flow.summary), route('flows', flow.id)),
    ...indexed(flow.steps).map(([step, i]) => entry(slug, 'step', step.label, join(step.detail, step.why), route('flows', flow.id, i + 1))),
  ]);
}

function changeEntry(slug, change) {
  const extra = {};
  ['date', 'kind', 'authorType'].forEach((key) => { if (str(change[key])) extra[key] = str(change[key]); });
  return entry(slug, 'change', change.title || change.id, join(change.what, change.why), route('changes', change.id), extra);
}

function entityText(model) {
  return join(model.summary, list(model.fields).map((field) => str(field.name)).filter(Boolean).join(', '));
}

// Schema v2 chapters. Numbered routes use the item's position in its list.
function v2Entries(slug, d) {
  return [
    ...withKey(d.diff, 'path').map((item) => entry(slug, 'diff', item.path, join(item.summary, item.status), route('diff', item.path))),
    ...indexed(d.options).map(([item, i]) => entry(slug, 'option', item.title, join(item.summary, item.why), route('options', i))),
    ...indexed(d.risks).map(([item, i]) => entry(slug, 'risk', item.risk, join(item.mitigation, item.impact && `Impact: ${item.impact}.`), route('risks', i))),
    ...indexed(d.rollout).map(([item, i]) => entry(slug, 'rollout', item.label, join(item.detail, item.command), route('rollout', i))),
    ...indexed(d.timeline).map(([item, i]) => entry(slug, 'event', item.label, join(item.at, item.detail), route('timeline', i))),
    ...withKey(d.diagrams, 'id').map((item) => entry(slug, 'visual', item.title || item.id, item.caption, route('visuals', item.id))),
    // Code walkthroughs: the walkthrough, then each step (#code/<id>/<n>, counted from 1).
    ...withKey(d.walkthroughs, 'id').flatMap((walk) => [
      entry(slug, 'code', walk.title || walk.id, join(walk.why, walk.takeaway, walk.file), route('code', walk.id)),
      ...indexed(walk.steps).map(([step, i]) => entry(slug, 'code', `${str(walk.title) || walk.id}: lines ${str(step.lines)}`, join(step.note, step.why), route('code', walk.id, i + 1))),
    ]),
    // One question per view: #quiz/<n>, counted from 1.
    ...indexed(d.quiz).map(([item, i]) => entry(slug, 'question', item.question, item.explain, route('quiz', i + 1))),
  ];
}

const withKey = (items, key) => list(items).filter((item) => str(item[key]));

function dedupe(entries) {
  const seen = new Set();
  return entries.filter((item) => {
    const key = `${item.type}\u0000${item.href}\u0000${item.title}`;
    if (!item.title || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Build the search entries for one explainer.
 * @param {string} slug library slug (already safe for a path)
 * @param {object} data explainer data
 * @returns {{ slug: string, type: string, title: string, text: string, href: string, date?: string, kind?: string, authorType?: string }[]}
 */
export function buildSearchIndex(slug, data) {
  const d = isObject(data) ? data : {};
  const meta = isObject(d.meta) ? d.meta : {};
  // Only chapters the page shows (scripts/lib/chapters.mjs, the page's own rule);
  // a link into a hidden chapter would open the Overview instead.
  const shown = new Set(shownChapters(d));
  const visible = (e) => {
    const hash = e.href.split('#')[1] || '';
    return !hash || shown.has(decodeURIComponent(hash.split('/')[0]));
  };
  return dedupe([
    entry(slug, 'explainer', meta.title || slug, join(meta.summary, isObject(d.context) ? d.context.problem : '', ...(Array.isArray(meta.stack) ? meta.stack : [])), ''),
    ...withKey(d.nodes, 'id').map((node) => entry(slug, 'node', node.label || node.id, join(node.summary, node.tech), route('map', node.id))),
    ...flowEntries(slug, d.flows),
    ...withKey(d.changes, 'id').map((change) => changeEntry(slug, change)),
    ...withKey(d.dataModel, 'name').map((model) => entry(slug, 'entity', model.name, entityText(model), route('data', model.name))),
    ...indexed(d.concepts).map(([concept, i]) => entry(slug, 'concept', concept.title, join(concept.body, concept.analogy), route('concepts', i))),
    ...withKey(d.glossary, 'term').map((item) => entry(slug, 'glossary', item.term, item.definition, route('glossary', item.term))),
    ...withKey(d.tree, 'path').map((item) => entry(slug, 'file', item.path, item.note, route('tree', item.path))),
    ...list(d.runbook).map((item) => entry(slug, 'run', item.label || item.command, join(item.command, item.note), 'run')),
    ...v2Entries(slug, d),
  ]).filter(visible);
}
