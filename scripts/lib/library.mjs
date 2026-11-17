// The explainer library: one folder that holds every published explainer and
// a hub page to search them. Pure rules live in library-model.mjs; this file
// does the fs work. Layout and contract: references/library.md.
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { LOCK_TIMEOUT_MS, holdsLock, withLock } from './lock.mjs';
import { FONTS_DIR, buildExplainer, buildGallery, buildLibrary } from './build.mjs';
import { listPatterns } from './init.mjs';
import { NODE_KINDS } from './schema.mjs';
import { buildSearchIndex } from './search-index.mjs';
import { parseStyle } from './style.mjs';
import { normalizeConfig, publicConfig, validateConfig } from './config.mjs';
import {
  SLUG_PATTERN, baseSlugFor, chooseSlug, emptyManifest, entryFor, isManifest, sourceIdentity, upsertEntry, withoutEntry,
} from './library-model.mjs';

// Explainer pages link back to the hub with this relative path.
const HUB_FROM_PAGE = '../../index.html';

export const HOME_NAME = '.concept-explainer';
export const LEGACY_HOME_NAME = '.repo-explainer';

/** Library home: $CONCEPT_EXPLAINER_HOME, else the old $REPO_EXPLAINER_HOME, else ~/.concept-explainer. */
export function resolveHome(env = process.env) {
  return env.CONCEPT_EXPLAINER_HOME || env.REPO_EXPLAINER_HOME || join(homedir(), HOME_NAME);
}

/**
 * One-time move of ~/.repo-explainer to ~/.concept-explainer. Runs only when
 * no home is set by env, the old folder exists and the new one does not. It
 * renames (never copies, never deletes) and says what it did.
 * @returns {string|null} a line to print, or null when nothing moved
 */
export function migrateLegacyHome({ env = process.env, homeDir = homedir() } = {}) {
  if (env.CONCEPT_EXPLAINER_HOME || env.REPO_EXPLAINER_HOME) return null;
  const from = join(homeDir, LEGACY_HOME_NAME);
  const to = join(homeDir, HOME_NAME);
  if (!existsSync(from) || existsSync(to)) return null;
  try {
    renameSync(from, to);
  } catch (error) {
    throw new Error(`move library ${from} to ${to}: ${error.message}. Nothing was deleted; move it yourself or set CONCEPT_EXPLAINER_HOME`);
  }
  return `moved your library from ${from} to ${to} (Repo Explainer is now Concept Explainer)`;
}

export function libraryPaths(home) {
  const explainers = join(home, 'explainers');
  return {
    home,
    hub: join(home, 'index.html'),
    manifest: join(home, 'library.json'),
    config: join(home, 'config.json'),
    kit: join(home, 'kit.html'),
    explainers,
    dirFor: (slug) => join(explainers, slug),
  };
}

/** Write via a temp file in the same folder, then rename, so readers never see half a file. */
export function writeAtomic(path, content) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  try {
    // Private, and 'wx' so a file already at the temp name is never followed or reused.
    writeFileSync(temp, content, { flag: 'wx', mode: 0o600 });
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    throw new Error(`write ${path}: ${error.message}`);
  }
}

const now = () => new Date().toISOString();
const toJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

/** Create the library home if needed, private to this user (0700). */
export function ensureHome(home) {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  chmodSync(home, 0o700);
}

// One writer at a time: the CLI, library serve and other agents may all
// update the manifest. The lock itself lives in lock.mjs.
export { LOCK_TIMEOUT_MS, holdsLock } from './lock.mjs';

/**
 * Run `fn` while holding <home>/.lock. Waits up to `timeoutMs` for another
 * writer (0 means do not wait), then throws an error with code LIBRARY_BUSY.
 * @template T
 * @param {string} home
 * @param {() => T} fn
 * @returns {T}
 */
export function withLibraryLock(home, fn, timeoutMs = LOCK_TIMEOUT_MS) {
  if (!holdsLock(home)) ensureHome(home);
  return withLock(home, fn, timeoutMs);
}

/** Explainer defaults from <home>/config.json. Missing or broken values mean the defaults. */
export function readConfig(home) {
  try {
    return normalizeConfig(JSON.parse(readFileSync(libraryPaths(home).config, 'utf8')));
  } catch {
    return normalizeConfig({});
  }
}

/**
 * Merge `changes` into the saved config. Throws, naming the key, on anything invalid.
 * @returns {object} the full saved config
 */
export function writeConfig(home, changes, options = {}) {
  return withLibraryLock(home, () => writeConfigUnlocked(home, changes), options.lockTimeoutMs);
}

function writeConfigUnlocked(home, changes) {
  if (changes && changes.style !== undefined) parseStyle(changes.style);
  const { errors } = validateConfig(changes);
  if (errors.length) throw new Error(`save config: ${errors.join('; ')}`);
  const config = normalizeConfig({ ...readConfig(home), ...changes });
  writeAtomic(libraryPaths(home).config, toJson(config));
  return config;
}

// The style for one run: the flag when given, else the library default.
export function styleFor(home, style) {
  return style === undefined || style === null ? readConfig(home).style : parseStyle(style);
}

function readStoredData(paths, slug) {
  try {
    return JSON.parse(readFileSync(join(paths.dirFor(slug), 'explainer.json'), 'utf8'));
  } catch {
    return null;
  }
}

/** One explainer's stored data. Throws naming the slug when it is missing or broken. */
export function readStoredExplainer(home, slug) {
  const paths = libraryPaths(home);
  const data = readStoredData(paths, slug);
  if (data === null) throw new Error(`read explainer "${slug}": ${join(paths.dirFor(slug), 'explainer.json')} is missing or not valid JSON`);
  return data;
}

// Every explainers/<slug>/explainer.json that parses, as [slug, data, mtime].
function scanStored(paths) {
  if (!existsSync(paths.explainers)) return [];
  return readdirSync(paths.explainers)
    .filter((slug) => SLUG_PATTERN.test(slug))
    .map((slug) => [slug, readStoredData(paths, slug)])
    .filter(([, data]) => data && typeof data === 'object')
    .map(([slug, data]) => [slug, data, statSync(join(paths.dirFor(slug), 'explainer.json')).mtime.toISOString()]);
}

function recoverManifest(paths) {
  const at = now();
  return scanStored(paths).reduce(
    (manifest, [slug, data, mtime]) => upsertEntry(manifest, entryFor(data, { slug, publishedAt: mtime }), at),
    emptyManifest(at),
  );
}

/**
 * Read library.json. A missing file is an empty library. A corrupt one is
 * rebuilt from the stored data. Only a caller holding the library lock writes
 * that recovery (the old file moved to library.json.corrupt-<time>); anyone
 * else gets the recovered manifest read-only and the file is left for the
 * next writer, so two readers never race to move it.
 * @returns {{ manifest: object, recovered: boolean, backupPath: string|null }}
 */
export function readManifest(home) {
  const paths = libraryPaths(home);
  if (!existsSync(paths.manifest)) return { manifest: emptyManifest(now()), recovered: false, backupPath: null };
  let parsed = null;
  try {
    parsed = JSON.parse(readFileSync(paths.manifest, 'utf8'));
  } catch {
    parsed = null;
  }
  if (isManifest(parsed)) return { manifest: parsed, recovered: false, backupPath: null };
  if (!holdsLock(home)) return { manifest: recoverManifest(paths), recovered: true, backupPath: null };
  const backupPath = `${paths.manifest}.corrupt-${now().replace(/[:.]/g, '-')}`;
  renameSync(paths.manifest, backupPath);
  const manifest = recoverManifest(paths);
  writeAtomic(paths.manifest, toJson(manifest));
  return { manifest, recovered: true, backupPath };
}

const KIT_HREF = 'kit.html';

function packageVersion() {
  try {
    return JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
  } catch {
    return '';
  }
}

// The fonts library pages load: every woff2 in fonts.json and the OFL text,
// copied when missing or changed. fonts.json itself stays behind.
function copyFonts(home) {
  const { fonts } = JSON.parse(readFileSync(join(FONTS_DIR, 'fonts.json'), 'utf8'));
  [...fonts.map((f) => f.file), 'OFL.txt'].forEach((file) => {
    const from = readFileSync(join(FONTS_DIR, file));
    const to = join(home, 'fonts', file);
    if (!existsSync(to) || !readFileSync(to).equals(from)) writeAtomic(to, from);
  });
}

/** Rewrite the hub page and the kit page beside it, and make sure the fonts are there. */
export function writeHub(home, manifest, options = {}) {
  copyFonts(home);
  const paths = libraryPaths(home);
  const config = publicConfig(readConfig(home));
  const { style } = config;
  // The hub is a page: it gets no local paths.
  const pageManifest = { ...manifest, explainers: manifest.explainers.map(({ sourcePath, repoPath, ...entry }) => entry) };
  const index = manifest.explainers.flatMap((entry) => buildSearchIndex(entry.slug, readStoredData(paths, entry.slug) || { meta: entry }));
  writeAtomic(paths.hub, buildLibrary(pageManifest, index, { templateDir: options.templateDir, style, config, kitHref: KIT_HREF, fontBase: 'fonts/' }));
  const kit = { kinds: NODE_KINDS, patterns: listPatterns(), version: packageVersion() };
  writeAtomic(paths.kit, buildGallery(kit, { templateDir: options.templateDir, context: { libraryHref: 'index.html', style, config }, fontBase: 'fonts/' }));
  return paths.hub;
}

function writePage(paths, slug, data, options, style) {
  const pagePath = join(paths.dirFor(slug), 'index.html');
  const context = { libraryHref: HUB_FROM_PAGE, slug, style, config: publicConfig(readConfig(paths.home)) };
  writeAtomic(pagePath, buildExplainer(data, { templateDir: options.templateDir, context, fontBase: '../../fonts/' }));
  return pagePath;
}

/**
 * Copy an explainer into the library, build its page, and refresh the hub.
 * @param {object} data validated explainer data
 * @param {{ home?: string, sourcePath?: string, repoPath?: string, style?: string, templateDir?: string }} [options]
 *   `style` defaults to the library default from config.json.
 * @returns {{ slug: string, updated: boolean, pagePath: string, hubPath: string, recovered: boolean }}
 */
export function publishExplainer(data, options = {}) {
  const home = options.home || resolveHome();
  return withLibraryLock(home, () => publishUnlocked(data, { ...options, home }), options.lockTimeoutMs);
}

function publishUnlocked(data, options) {
  if (!data || typeof data !== 'object' || !data.meta || typeof data.meta !== 'object') {
    throw new Error('publish explainer: data has no meta object');
  }
  const home = options.home || resolveHome();
  const paths = libraryPaths(home);
  const style = styleFor(home, options.style);
  const { manifest, recovered } = readManifest(home);
  const source = { ...sourceIdentity(data), repoPath: options.repoPath, sourcePath: options.sourcePath };
  // An explicit slug (from import) is used as is; otherwise pick one by source.
  const { slug, existing } = options.slug
    ? { slug: checkedSlug(options.slug), existing: manifest.explainers.some((e) => e.slug === options.slug) }
    : chooseSlug(manifest.explainers, baseSlugFor(data, options), source);
  // A planned slug that someone else took meanwhile is never silently overwritten.
  if (options.slug && !options.backupExisting && (existing || existsSync(paths.dirFor(slug)))) {
    throw new Error(`publish explainer: slug "${slug}" was taken since the plan`);
  }
  const at = now();

  const dataPath = join(paths.dirFor(slug), 'explainer.json');
  // A replacing import keeps the old data beside the new, never deleting it.
  // The name is unique (time plus random) and 'wx' fails rather than overwrite.
  if (options.backupExisting && existsSync(dataPath)) {
    const backup = `${dataPath}.replaced-${at.replace(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}`;
    writeFileSync(backup, readFileSync(dataPath), { flag: 'wx', mode: 0o600 });
  }
  writeAtomic(dataPath, toJson(data));
  const pagePath = writePage(paths, slug, data, options, style);
  const origin = options.origin === 'import' ? { origin: 'import', importedAt: at } : {};
  const entry = { ...entryFor(data, { slug, sourcePath: options.sourcePath, repoPath: options.repoPath, publishedAt: at }), ...origin };
  const next = upsertEntry(manifest, entry, at);
  writeAtomic(paths.manifest, toJson(next));
  const hubPath = options.skipHub ? paths.hub : writeHub(home, next, options);
  return { slug, updated: existing, pagePath, hubPath, recovered, style };
}

function checkedSlug(slug) {
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug)) throw new Error(`publish explainer: invalid slug "${slug}"`);
  return slug;
}

/** Delete one explainer from the library and refresh the hub. */
export function removeExplainer(slug, options = {}) {
  return withLibraryLock(options.home || resolveHome(), () => removeUnlocked(slug, options), options.lockTimeoutMs);
}

function removeUnlocked(slug, options) {
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug)) throw new Error(`remove explainer: invalid slug "${slug}"`);
  const home = options.home || resolveHome();
  const paths = libraryPaths(home);
  const { manifest } = readManifest(home);
  if (!manifest.explainers.some((e) => e.slug === slug)) throw new Error(`remove explainer: no explainer "${slug}" in ${home}`);
  rmSync(paths.dirFor(slug), { recursive: true, force: true });
  // What readers told us about it goes with it.
  rmSync(join(home, 'insights', `${slug}.json`), { force: true });
  const next = withoutEntry(manifest, slug, now());
  writeAtomic(paths.manifest, toJson(next));
  writeHub(home, next, options);
  return { slug, hubPath: paths.hub };
}

/**
 * Re-render every page and the hub from the stored data with the current
 * template. Entries whose data is gone or broken are dropped; folders with
 * data but no entry are adopted. Pages get `options.style`, else the library default.
 * @returns {{ rebuilt: string[], skipped: string[], hubPath: string }}
 */
export function rebuildLibrary(options = {}) {
  return withLibraryLock(options.home || resolveHome(), () => rebuildUnlocked(options), options.lockTimeoutMs);
}

function rebuildUnlocked(options) {
  const home = options.home || resolveHome();
  const paths = libraryPaths(home);
  const style = styleFor(home, options.style);
  const { manifest } = readManifest(home);
  const known = new Map(manifest.explainers.map((e) => [e.slug, e]));
  const stored = new Map(scanStored(paths).map(([slug, data, mtime]) => [slug, { data, mtime }]));
  const at = now();

  const skipped = [...known.keys()].filter((slug) => !stored.has(slug));
  const next = [...stored].reduce((acc, [slug, { data, mtime }]) => {
    const previous = known.get(slug) || {};
    writePage(paths, slug, data, options, style);
    const kept = previous.origin === 'import' ? { origin: 'import', importedAt: previous.importedAt } : {};
    const entry = { ...entryFor(data, { slug, sourcePath: previous.sourcePath, repoPath: previous.repoPath, publishedAt: previous.publishedAt || mtime }), ...kept };
    return upsertEntry(acc, entry, at);
  }, emptyManifest(at));

  writeAtomic(paths.manifest, toJson(next));
  const hubPath = writeHub(home, next, options);
  return { rebuilt: [...stored.keys()], skipped, hubPath, style };
}

/** Manifest entries, newest first. Never writes unless the manifest is corrupt. */
export function listExplainers(options = {}) {
  return readManifest(options.home || resolveHome()).manifest.explainers;
}

/** Make sure the hub page exists (an empty library still gets one). */
export function ensureHub(options = {}) {
  const home = options.home || resolveHome();
  return withLibraryLock(home, () => ensureHubUnlocked(home, options), options.lockTimeoutMs);
}

function ensureHubUnlocked(home, options) {
  const paths = libraryPaths(home);
  if (existsSync(paths.hub)) return paths.hub;
  return writeHub(home, readManifest(home).manifest, options);
}
