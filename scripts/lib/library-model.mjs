// Pure library logic: slugs, manifest entries and manifest updates.
// No fs here; scripts/lib/library.mjs does the reading and writing.
// Documented for humans in references/library.md: keep them in sync.
import { basename, dirname } from 'node:path';
import { DEFAULT_TYPE, EXPLAINER_TYPES } from './schema.mjs';
import { thumbFor } from './thumb.mjs';

export const MANIFEST_VERSION = 1;
export const SLUG_MAX = 64;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FALLBACK_SLUG = 'explainer';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const str = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const count = (value) => (Array.isArray(value) ? value.length : 0);

/**
 * Lowercase kebab, [a-z0-9-] only, at most `max` characters.
 * @param {string} value
 * @param {number} [max]
 */
export function slugify(value, max = SLUG_MAX) {
  const slug = String(value ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');
  return slug || FALLBACK_SLUG;
}

const typeOfMeta = (meta) => (EXPLAINER_TYPES.includes(meta.type) ? meta.type : DEFAULT_TYPE);

// A short name for what a non-repo explainer is about: "#512" gives "512",
// "docs/rfcs/0007-live-updates.md" gives "0007-live-updates".
function refName(source) {
  if (!isObject(source)) return null;
  const raw = str(source.ref) || str(source.url);
  if (!raw) return null;
  const last = raw.replace(/[?#].*$/, (m) => (m.startsWith('#') && !raw.includes('/') ? m : '')).split('/').filter(Boolean).pop() || raw;
  return last.replace(/\.[a-z0-9]{1,5}$/i, '');
}

/**
 * The slug an explainer would like. A repo: meta.repo, else the repo folder,
 * else the data file's folder (".explainer" stands for the folder above it).
 * Other types: "<repo>-<type>-<ref>" when the repo and source are known
 * ("acme-taskflow-pr-512"), else the title ("idempotency-keys").
 */
export function baseSlugFor(data, { repoPath, sourcePath } = {}) {
  const meta = isObject(data) && isObject(data.meta) ? data.meta : {};
  const repo = str(meta.repo);
  const type = typeOfMeta(meta);
  if (type !== DEFAULT_TYPE) {
    const ref = refName(meta.source);
    if (repo && ref) return slugify(`${repo} ${type} ${ref}`);
    const title = str(meta.title);
    if (title) return slugify(title.replace(/,\s*explained\s*$/i, ''));
  }
  if (repo) return slugify(repo);
  if (str(repoPath)) return slugify(basename(repoPath));
  if (str(sourcePath)) {
    const folder = dirname(sourcePath);
    return slugify(basename(folder) === '.explainer' ? basename(dirname(folder)) : basename(folder));
  }
  return FALLBACK_SLUG;
}

// A source url counts only when it is http(s), the same rule entryFor keeps it by.
const safeUrl = (value) => {
  const url = isObject(value) ? str(value.url) : null;
  return url && /^https?:\/\//i.test(url) ? url : null;
};
const sourceRef = (value) => (isObject(value) ? safeUrl(value) || str(value.ref) : null);

/**
 * What makes two explainers the same, read from their data: the type, the
 * repo and the source reference (an http(s) url, else the ref), all trimmed.
 * Publish, import and entryFor all use this, so they always agree.
 * @param {unknown} data
 * @returns {{ type: string, repo: string|undefined, ref: string|undefined }}
 */
export function sourceIdentity(data) {
  const meta = isObject(data) && isObject(data.meta) ? data.meta : {};
  return {
    type: EXPLAINER_TYPES.includes(meta.type) ? meta.type : DEFAULT_TYPE,
    repo: str(meta.repo) ?? undefined,
    ref: sourceRef(meta.source) ?? undefined,
  };
}

/**
 * Two entries describe the same explainer only when they have the same type.
 * A repo then matches by repo name, else repo folder, else data file. Other
 * types match by their source reference (and repo, when both have one),
 * else by data file.
 */
export function sameSource(entry, source) {
  if ((entry.type || DEFAULT_TYPE) !== (source.type || DEFAULT_TYPE)) return false;
  if ((source.type || DEFAULT_TYPE) !== DEFAULT_TYPE) {
    const a = sourceRef(entry.source) || str(entry.ref);
    const b = str(source.ref);
    if (a && b) return a === b && (!str(entry.repo) || !str(source.repo) || entry.repo === source.repo);
    return Boolean(str(entry.sourcePath) && str(source.sourcePath) && entry.sourcePath === source.sourcePath);
  }
  if (str(entry.repo) && str(source.repo)) return entry.repo === source.repo;
  if (str(entry.repoPath) && str(source.repoPath)) return entry.repoPath === source.repoPath;
  if (str(entry.sourcePath) && str(source.sourcePath)) return entry.sourcePath === source.sourcePath;
  return false;
}

/**
 * Reuse the slug of the same source, else take `base`, else `base-2`, `base-3`...
 * @returns {{ slug: string, existing: boolean }}
 */
export function chooseSlug(entries, base, source) {
  const match = entries.find((entry) => sameSource(entry, source));
  if (match) return { slug: match.slug, existing: true };
  return { slug: freeSlug(entries, base), existing: false };
}

/** `base` if no entry uses it, else `base-2`, `base-3`... within 64 characters. */
export function freeSlug(entries, base) {
  const taken = new Set(entries.map((entry) => entry.slug));
  for (let n = 1; ; n += 1) {
    const suffix = n === 1 ? '' : `-${n}`;
    const slug = `${base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/, '')}${suffix}`;
    if (!taken.has(slug)) return slug;
  }
}

/**
 * The manifest entry for one explainer.
 * @param {object} data explainer data
 * @param {{ slug: string, sourcePath?: string, repoPath?: string, publishedAt: string }} where
 */
export function entryFor(data, { slug, sourcePath, repoPath, publishedAt }) {
  const d = isObject(data) ? data : {};
  const meta = isObject(d.meta) ? d.meta : {};
  const url = safeUrl(meta.source);
  return {
    slug,
    type: sourceIdentity(d).type,
    title: str(meta.title) || slug,
    summary: str(meta.summary) || '',
    repo: str(meta.repo),
    sourcePath: str(sourcePath),
    repoPath: str(repoPath),
    stack: Array.isArray(meta.stack) ? meta.stack.filter((s) => typeof s === 'string') : [],
    preset: str(meta.preset),
    status: str(meta.status),
    tags: Array.isArray(meta.tags) ? meta.tags.filter((t) => typeof t === 'string').slice(0, 8) : [],
    source: isObject(meta.source) && str(meta.source.ref)
      ? { kind: str(meta.source.kind), ref: str(meta.source.ref), ...(url ? { url } : {}) }
      : null,
    commit: str(meta.commit),
    generatedAt: str(meta.generatedAt),
    publishedAt,
    counts: {
      layers: count(d.layers),
      nodes: count(d.nodes),
      flows: count(d.flows),
      changes: count(d.changes),
      concepts: count(d.concepts),
      files: count(d.tree),
      quiz: count(d.quiz),
      diff: count(d.diff),
      options: count(d.options),
      risks: count(d.risks),
      rollout: count(d.rollout),
      timeline: count(d.timeline),
      diagrams: count(d.diagrams),
      walkthroughs: count(d.walkthroughs),
    },
    layers: (Array.isArray(d.layers) ? d.layers : []).filter(isObject).map((layer) => ({ label: str(layer.label) || '', color: str(layer.color) || '' })),
    thumb: thumbFor(d),
  };
}

export function emptyManifest(updatedAt) {
  return { version: MANIFEST_VERSION, updatedAt, explainers: [] };
}

export function isManifest(value) {
  return isObject(value)
    && value.version === MANIFEST_VERSION
    && Array.isArray(value.explainers)
    && value.explainers.every((entry) => isObject(entry) && typeof entry.slug === 'string' && SLUG_PATTERN.test(entry.slug));
}

const newestFirst = (a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')) || a.slug.localeCompare(b.slug);

/** A new manifest with `entry` added or replaced (by slug), newest first. */
export function upsertEntry(manifest, entry, updatedAt) {
  const others = manifest.explainers.filter((e) => e.slug !== entry.slug);
  return { ...manifest, updatedAt, explainers: [...others, entry].sort(newestFirst) };
}

/** A new manifest without the entry for `slug`. */
export function withoutEntry(manifest, slug, updatedAt) {
  return { ...manifest, updatedAt, explainers: manifest.explainers.filter((e) => e.slug !== slug) };
}
