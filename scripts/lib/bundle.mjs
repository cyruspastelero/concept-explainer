// Export and import: share explainers as a data-only bundle
// (*.explainers.json). A bundle is untrusted input: it is size capped, parsed
// without prototype keys, format checked, and every explainer is validated
// and rebuilt with the importer's own template, so it can never inject
// markup or code. Contract: references/library.md.
import { readFileSync, statSync } from 'node:fs';
import { buildSearchIndex } from './search-index.mjs';
import { baseSlugFor, freeSlug, sameSource, slugify, sourceIdentity } from './library-model.mjs';
import { publishExplainer, readManifest, readStoredExplainer, withLibraryLock, writeHub } from './library.mjs';
import { validateExplainer } from './validate.mjs';
import { exportInsights, importInsights, subjectOf } from './insights.mjs';
import { importNotes, validateNotes } from './notes.mjs';
import { readConfig } from './library.mjs';
import { slugify as notesFile } from './library-model.mjs';

import { BUNDLE_FORMAT, BUNDLE_VERSION, MAX_BUNDLE_BYTES, MAX_BUNDLE_EXPLAINERS } from './bundle-format.mjs';

export { BUNDLE_FORMAT, BUNDLE_VERSION, MAX_BUNDLE_BYTES, MAX_BUNDLE_EXPLAINERS };
export const CONFLICT_MODES = ['rename', 'skip', 'replace'];
const BANNED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SAFE_URL = /^https?:\/\//i;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const lower = (value) => String(value || '').toLowerCase();

function matches(entry, data, selectors) {
  if (selectors.type && entry.type !== selectors.type) return false;
  if (selectors.tag && !entry.tags.some((t) => lower(t) === lower(selectors.tag))) return false;
  if (selectors.stack && !entry.stack.some((s) => lower(s).includes(lower(selectors.stack)))) return false;
  if (selectors.search) {
    const q = lower(selectors.search);
    const fields = [entry.title, entry.summary, entry.repo, ...entry.tags, ...entry.stack];
    const inside = buildSearchIndex(entry.slug, data).some((e) => lower(`${e.title} ${e.text}`).includes(q));
    if (!inside && !fields.some((f) => lower(f).includes(q))) return false;
  }
  return true;
}

/**
 * Pick explainers and wrap their data in a bundle. No selectors means the whole library.
 * @param {string} home
 * @param {{ slugs?: string[], type?: string, tag?: string, stack?: string, search?: string }} selectors
 * @returns {{ bundle: object, slugs: string[] }}
 */
function localNotes(home, subject) {
  try {
    const { updatedAt, ...notes } = JSON.parse(readFileSync(`${home}/notes/${notesFile(subject)}.json`, 'utf8'));
    return notes;
  } catch {
    return null;
  }
}

// --with-insights: counts and notes for the picked explainers, never the reader profile.
function learningParts(home, picked) {
  const insights = picked.map(({ entry }) => ({ slug: entry.slug, insights: exportInsights(home, entry.slug) })).filter((i) => i.insights);
  const subjects = [...new Set(picked.map(({ data }) => subjectOf(data)).filter(Boolean))];
  const notes = subjects.map((s) => localNotes(home, s)).filter(Boolean);
  return { insights, notes };
}

export function createBundle(home, selectors = {}, { now = new Date().toISOString(), withInsights = false } = {}) {
  const { manifest } = readManifest(home);
  const known = new Map(manifest.explainers.map((e) => [e.slug, e]));
  (selectors.slugs || []).forEach((slug) => {
    if (!known.has(slug)) throw new Error(`export: no explainer "${slug}" in ${home}`);
  });
  const picked = manifest.explainers
    .filter((e) => !selectors.slugs || !selectors.slugs.length || selectors.slugs.includes(e.slug))
    .map((entry) => ({ entry, data: readStoredExplainer(home, entry.slug) }))
    .filter(({ entry, data }) => matches(entry, data, selectors));
  if (!picked.length) throw new Error('export: nothing matches those selectors');
  return {
    bundle: {
      format: BUNDLE_FORMAT,
      version: BUNDLE_VERSION,
      exportedAt: now,
      exportedBy: null,
      explainers: picked.map(({ entry, data }) => ({ slug: entry.slug, data })),
      ...(withInsights ? learningParts(home, picked) : {}),
    },
    slugs: picked.map(({ entry }) => entry.slug),
  };
}

function checkSize(bytes) {
  if (bytes > MAX_BUNDLE_BYTES) throw new Error(`import: the bundle is larger than 10 MB (${bytes} bytes)`);
}

/**
 * Parse an untrusted bundle. Keys that could reach Object.prototype are dropped.
 * @param {string} text
 */
export function parseBundle(text) {
  checkSize(Buffer.byteLength(String(text)));
  let bundle;
  try {
    bundle = JSON.parse(text, (key, value) => (BANNED_KEYS.has(key) ? undefined : value));
  } catch (error) {
    throw new Error(`import: the file is not JSON (${error.message})`);
  }
  if (!isObject(bundle) || bundle.format !== BUNDLE_FORMAT) throw new Error(`import: not a concept-explainer bundle (format must be "${BUNDLE_FORMAT}")`);
  if (bundle.version !== BUNDLE_VERSION) throw new Error(`import: bundle version ${bundle.version} is not supported (this version reads ${BUNDLE_VERSION})`);
  if (!Array.isArray(bundle.explainers)) throw new Error('import: explainers must be a list');
  if (bundle.explainers.length > MAX_BUNDLE_EXPLAINERS) throw new Error(`import: more than ${MAX_BUNDLE_EXPLAINERS} explainers in one bundle`);
  ['insights', 'notes'].forEach((key) => {
    if (bundle[key] === undefined) return;
    if (!Array.isArray(bundle[key]) || bundle[key].length > MAX_BUNDLE_EXPLAINERS) throw new Error(`import: ${key} must be a list of up to ${MAX_BUNDLE_EXPLAINERS}`);
  });
  return bundle;
}

export function readBundleFile(path) {
  let size;
  try {
    size = statSync(path).size;
  } catch (error) {
    throw new Error(`import: cannot read ${path}: ${error.message}`);
  }
  checkSize(size);
  return parseBundle(readFileSync(path, 'utf8'));
}

// Drop every "url" that is not http(s), anywhere. Returns a new object and the count.
function dropUnsafeUrls(value) {
  let dropped = 0;
  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (!isObject(node)) return node;
    return Object.fromEntries(Object.entries(node).flatMap(([key, child]) => {
      if (key === 'url' && !(typeof child === 'string' && SAFE_URL.test(child.trim()))) {
        dropped += 1;
        return [];
      }
      return [[key, walk(child)]];
    }));
  };
  return { data: walk(value), dropped };
}

function checkItem(item) {
  if (!isObject(item) || !isObject(item.data)) return { reasons: ['entry has no data object'] };
  const { data, dropped } = dropUnsafeUrls(item.data);
  let result;
  try {
    result = validateExplainer(data);
  } catch (error) {
    return { reasons: [`could not be checked: ${error.message}`] };
  }
  if (result.errors.length) return { reasons: result.errors.slice(0, 5) };
  return { data, dropped };
}

/**
 * Decide what an import would do, without writing. The result is the dry run.
 * @param {string} home
 * @param {object} bundle from parseBundle()
 * @param {{ onConflict?: 'rename'|'skip'|'replace' }} options
 */
export function planImport(home, bundle, { onConflict = 'rename' } = {}) {
  if (!CONFLICT_MODES.includes(onConflict)) throw new Error(`import: --on-conflict "${onConflict}" is not one of ${CONFLICT_MODES.join(', ')}`);
  let entries = readManifest(home).manifest.explainers;
  const summary = { dryRun: true, added: [], replaced: [], skipped: [], rejected: [] };
  const writes = [];
  const planned = new Set();
  bundle.explainers.forEach((item, index) => {
    const checked = checkItem(item);
    const title = isObject(item) && isObject(item.data) && isObject(item.data.meta) ? String(item.data.meta.title || '') : '';
    if (checked.reasons) return summary.rejected.push({ index, title, reasons: checked.reasons });
    const { data, dropped } = checked;
    const note = dropped ? `dropped ${dropped} unsafe link${dropped === 1 ? '' : 's'}` : '';
    const base = typeof item.slug === 'string' && item.slug.trim() ? slugify(item.slug) : baseSlugFor(data);
    const source = sourceIdentity(data);
    const same = entries.find((e) => e.slug === base && sameSource(e, source));
    const taken = entries.some((e) => e.slug === base);
    // Two items aimed at one slug: the first wins, so a replace never backs up its own output.
    if (planned.has(base) && (onConflict !== 'rename' || same)) {
      return summary.skipped.push({ index, title, slug: base, reason: 'duplicate in this bundle' });
    }
    if (taken && onConflict === 'skip') return summary.skipped.push({ index, title, slug: base, reason: 'already in the library' });
    if (same && onConflict === 'replace') {
      writes.push({ slug: base, data, replace: true, hint: isObject(item) ? item.slug : undefined });
      planned.add(base);
      return summary.replaced.push({ slug: base, title, note, overwrites: { slug: same.slug, title: same.title } });
    }
    const slug = freeSlug(entries, base);
    const renamed = slug === base ? '' : `renamed from ${base}${same ? '' : ' (that slug holds a different explainer)'}`;
    entries = [...entries, { slug, ...source }];
    writes.push({ slug, data, hint: isObject(item) ? item.slug : undefined });
    planned.add(slug);
    return summary.added.push({ slug, title, note: [renamed, note].filter(Boolean).join('; ') });
  });
  return { summary, writes, ...learningPlan(home, bundle, writes, summary) };
}

// Insights follow their explainer to its new slug; notes are checked now so
// the dry run already says which ones would be refused.
function learningPlan(home, bundle, writes, summary) {
  if (bundle.insights === undefined && bundle.notes === undefined) return {};
  if (readConfig(home).learning === false) {
    Object.assign(summary, { learning: 'off: the insights and notes in this bundle were left out' });
    return {};
  }
  const target = new Map(writes.map((w) => [w.hint, w.slug]));
  const insights = (bundle.insights || []).filter((i) => isObject(i) && target.has(i.slug)).map((i) => ({ slug: target.get(i.slug), raw: i.insights }));
  const notes = (bundle.notes || []).map((n) => ({ notes: n, errors: validateNotes(n).errors }));
  Object.assign(summary, {
    insights: insights.map((i) => ({ slug: i.slug, note: 'will be imported unless this library has its own' })),
    notes: notes.map(({ notes: n, errors }) => ({ subject: isObject(n) ? String(n.subject || '') : '', imported: !errors.length, ...(errors.length ? { reason: errors.slice(0, 3).join('; ') } : {}) })),
  });
  return { insights, notes: notes.filter((n) => !n.errors.length).map((n) => n.notes) };
}

/**
 * Import a bundle: plan it and write it under one hold of the library lock, so
 * no publish can take a planned slug in between. Returns the summary.
 * @param {string} home
 * @param {object} bundle from parseBundle()
 * @param {{ onConflict?: 'rename'|'skip'|'replace', lockTimeoutMs?: number }} options
 */
export function applyImport(home, bundle, { onConflict, lockTimeoutMs } = {}) {
  return withLibraryLock(home, () => applyUnlocked(home, planImport(home, bundle, { onConflict })), lockTimeoutMs);
}

function applyUnlocked(home, plan) {
  plan.writes.forEach(({ slug, data, replace }) => publishExplainer(data, {
    home, slug, skipHub: true, origin: 'import', backupExisting: Boolean(replace),
  }));
  const summary = { ...plan.summary, dryRun: false };
  if (plan.insights) summary.insights = plan.insights.map((i) => ({ slug: i.slug, note: importInsights(home, i.slug, i.raw) }));
  (plan.notes || []).forEach((n) => importNotes(home, n));
  if (plan.writes.length || plan.insights) writeHub(home, readManifest(home).manifest);
  return summary;
}
