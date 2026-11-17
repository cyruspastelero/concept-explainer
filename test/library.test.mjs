import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import {
  resolveHome, migrateLegacyHome, libraryPaths, readManifest, publishExplainer, removeExplainer, rebuildLibrary, listExplainers, ensureHub, withLibraryLock,
} from '../scripts/lib/library.mjs';

const example = JSON.parse(readFileSync(new URL('../examples/taskflow.explainer.json', import.meta.url), 'utf8'));
const tempHome = () => mkdtempSync(join(tmpdir(), 'rx-lib-'));
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

function embedded(html, id) {
  const match = html.match(new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`));
  assert.ok(match, `${id} script tag present`);
  return JSON.parse(match[1]);
}

test('home comes from CONCEPT_EXPLAINER_HOME, then REPO_EXPLAINER_HOME, else ~/.concept-explainer', () => {
  assert.equal(resolveHome({ CONCEPT_EXPLAINER_HOME: '/tmp/new', REPO_EXPLAINER_HOME: '/tmp/old' }), '/tmp/new');
  assert.equal(resolveHome({ REPO_EXPLAINER_HOME: '/tmp/x' }), '/tmp/x');
  assert.equal(resolveHome({}), join(homedir(), '.concept-explainer'));
  assert.equal(resolveHome({ CONCEPT_EXPLAINER_HOME: '' }), join(homedir(), '.concept-explainer'));
});

test('the old ~/.repo-explainer moves to ~/.concept-explainer once, and nothing is deleted', () => {
  const fakeHome = tempHome();
  const old = join(fakeHome, '.repo-explainer');
  mkdirSync(join(old, 'explainers'), { recursive: true });
  writeFileSync(join(old, 'library.json'), '{"keep":true}');
  const moved = migrateLegacyHome({ env: {}, homeDir: fakeHome });
  assert.match(moved, /moved .*\.repo-explainer to .*\.concept-explainer/);
  assert.equal(readFileSync(join(fakeHome, '.concept-explainer', 'library.json'), 'utf8'), '{"keep":true}');
  assert.ok(!existsSync(old));
  assert.equal(migrateLegacyHome({ env: {}, homeDir: fakeHome }), null, 'second run does nothing');
});

test('the move never runs over an existing new home or a home set by env', () => {
  const both = tempHome();
  mkdirSync(join(both, '.repo-explainer'));
  mkdirSync(join(both, '.concept-explainer'));
  writeFileSync(join(both, '.repo-explainer', 'library.json'), 'old');
  assert.equal(migrateLegacyHome({ env: {}, homeDir: both }), null);
  assert.equal(readFileSync(join(both, '.repo-explainer', 'library.json'), 'utf8'), 'old');
  const pinned = tempHome();
  mkdirSync(join(pinned, '.repo-explainer'));
  assert.equal(migrateLegacyHome({ env: { CONCEPT_EXPLAINER_HOME: '/tmp/elsewhere' }, homeDir: pinned }), null);
  assert.equal(migrateLegacyHome({ env: { REPO_EXPLAINER_HOME: '/tmp/elsewhere' }, homeDir: pinned }), null);
  assert.ok(existsSync(join(pinned, '.repo-explainer')));
});

test('publish writes the data, the page, the manifest and the hub', () => {
  const home = tempHome();
  const result = publishExplainer(example, { home, sourcePath: '/w/taskflow/.explainer/explainer.json', repoPath: '/w/taskflow' });
  const paths = libraryPaths(home);
  assert.equal(result.slug, 'acme-taskflow');
  assert.equal(result.updated, false);
  assert.equal(result.hubPath, paths.hub);
  assert.equal(result.pagePath, join(home, 'explainers', 'acme-taskflow', 'index.html'));
  assert.deepEqual(readJson(join(home, 'explainers', 'acme-taskflow', 'explainer.json')), example);

  const page = readFileSync(result.pagePath, 'utf8');
  assert.deepEqual(embedded(page, 'explainer-data'), example);

  const manifest = readJson(paths.manifest);
  assert.equal(manifest.version, 1);
  assert.equal(manifest.explainers.length, 1);
  assert.equal(manifest.explainers[0].sourcePath, '/w/taskflow/.explainer/explainer.json');
  assert.equal(manifest.explainers[0].repoPath, '/w/taskflow');

  const hubHtml = readFileSync(paths.hub, 'utf8');
  const hub = embedded(hubHtml, 'explainer-data');
  assert.deepEqual(hub.manifest.explainers.map((e) => e.slug), manifest.explainers.map((e) => e.slug));
  assert.ok(hub.manifest.explainers.every((e) => !('sourcePath' in e) && !('repoPath' in e)), 'no local paths in the hub');
  assert.doesNotMatch(hubHtml, /\/w\/taskflow/);
  assert.ok(hub.index.some((e) => e.href === 'explainers/acme-taskflow/index.html#flows/create-task/1'));
  assert.deepEqual(readdirSync(home).sort(), ['explainers', 'fonts', 'index.html', 'kit.html', 'library.json'], 'no temp files left behind');
});

test('publishing the same source again updates in place', () => {
  const home = tempHome();
  publishExplainer(example, { home, sourcePath: '/a.json' });
  const changed = { ...example, meta: { ...example.meta, title: 'Taskflow v2' } };
  const result = publishExplainer(changed, { home, sourcePath: '/b.json' });
  assert.equal(result.slug, 'acme-taskflow');
  assert.equal(result.updated, true);
  const { manifest } = readManifest(home);
  assert.equal(manifest.explainers.length, 1);
  assert.equal(manifest.explainers[0].title, 'Taskflow v2');
});

test('a different repo with the same name gets a suffixed slug', () => {
  const home = tempHome();
  const data = (repoPath) => ({ meta: { title: repoPath, summary: 's' } });
  assert.equal(publishExplainer(data('a'), { home, repoPath: '/one/shop' }).slug, 'shop');
  assert.equal(publishExplainer(data('b'), { home, repoPath: '/two/shop' }).slug, 'shop-2');
  assert.equal(publishExplainer(data('a2'), { home, repoPath: '/one/shop' }).slug, 'shop');
  assert.deepEqual(listExplainers({ home }).map((e) => e.slug).sort(), ['shop', 'shop-2']);
});

test('pages built into the library carry the library context', () => {
  const home = tempHome();
  const { pagePath } = publishExplainer(example, { home });
  const { config, chapters, enums, ...context } = embedded(readFileSync(pagePath, 'utf8'), 'explainer-context');
  assert.deepEqual(context, { libraryHref: '../../index.html', slug: 'acme-taskflow', style: 'clean' });
  assert.ok(chapters.includes('map') && enums.styles.includes('clean'), 'the build adds chapters and enums');
  assert.equal(config.audience, 'engineer');
});

test('remove deletes the folder and the entry, and refuses unknown or unsafe slugs', () => {
  const home = tempHome();
  publishExplainer(example, { home });
  publishExplainer({ meta: { title: 'Other', summary: 's', repo: 'o/other' } }, { home });
  removeExplainer('acme-taskflow', { home });
  assert.ok(!existsSync(join(home, 'explainers', 'acme-taskflow')));
  assert.deepEqual(listExplainers({ home }).map((e) => e.slug), ['o-other']);
  const hub = embedded(readFileSync(libraryPaths(home).hub, 'utf8'), 'explainer-data');
  assert.ok(hub.index.every((e) => e.slug === 'o-other'));
  assert.throws(() => removeExplainer('acme-taskflow', { home }), /no explainer "acme-taskflow"/);
  assert.throws(() => removeExplainer('../..', { home }), /invalid slug/);
});

test('rebuild re-renders every page, drops entries whose data is gone and adopts orphans', () => {
  const home = tempHome();
  publishExplainer(example, { home });
  publishExplainer({ meta: { title: 'Gone', summary: 's', repo: 'o/gone' } }, { home });
  const page = join(home, 'explainers', 'acme-taskflow', 'index.html');
  writeFileSync(page, 'stale');
  // Break the stored data for one entry, and add an orphan folder.
  writeFileSync(join(home, 'explainers', 'o-gone', 'explainer.json'), 'not json');
  mkdirSync(join(home, 'explainers', 'orphan'));
  writeFileSync(join(home, 'explainers', 'orphan', 'explainer.json'), JSON.stringify({ meta: { title: 'Orphan', summary: 's' } }));

  const result = rebuildLibrary({ home });
  assert.deepEqual(result.rebuilt.sort(), ['acme-taskflow', 'orphan']);
  assert.deepEqual(result.skipped, ['o-gone']);
  assert.match(readFileSync(page, 'utf8'), /^<!doctype html>/);
  assert.deepEqual(listExplainers({ home }).map((e) => e.slug).sort(), ['acme-taskflow', 'orphan']);
});

test('a corrupt manifest is backed up and rebuilt from the stored data', () => {
  const home = tempHome();
  publishExplainer(example, { home, sourcePath: '/src.json' });
  writeFileSync(libraryPaths(home).manifest, '{ broken');
  const { manifest, recovered, backupPath } = withLibraryLock(home, () => readManifest(home));
  assert.equal(recovered, true);
  assert.equal(readFileSync(backupPath, 'utf8'), '{ broken');
  assert.deepEqual(manifest.explainers.map((e) => e.slug), ['acme-taskflow']);
  assert.equal(manifest.explainers[0].title, example.meta.title);
  // A later publish works on top of the recovered manifest.
  publishExplainer({ meta: { title: 'Next', summary: 's', repo: 'o/next' } }, { home });
  assert.equal(listExplainers({ home }).length, 2);
});

test('without the lock, a corrupt manifest is recovered in memory only and nothing is written', () => {
  const home = tempHome();
  publishExplainer(example, { home });
  writeFileSync(libraryPaths(home).manifest, '{ broken');
  const before = readdirSync(home).sort();
  const { manifest, recovered, backupPath } = readManifest(home);
  assert.equal(recovered, true);
  assert.equal(backupPath, null);
  assert.deepEqual(manifest.explainers.map((e) => e.slug), ['acme-taskflow']);
  assert.deepEqual(listExplainers({ home }).map((e) => e.slug), ['acme-taskflow']);
  assert.equal(readFileSync(libraryPaths(home).manifest, 'utf8'), '{ broken', 'the file is left for a writer to recover');
  assert.deepEqual(readdirSync(home).sort(), before, 'no backup or temp file appears');
  // The next writer, under the lock, does the recovery.
  publishExplainer({ meta: { title: 'Next', summary: 's', repo: 'o/next' } }, { home });
  assert.ok(readdirSync(home).some((f) => f.startsWith('library.json.corrupt-')));
  assert.equal(listExplainers({ home }).length, 2);
});

test('a manifest with the wrong shape counts as corrupt', () => {
  const home = tempHome();
  publishExplainer(example, { home });
  writeFileSync(libraryPaths(home).manifest, JSON.stringify({ explainers: 'nope' }));
  assert.equal(readManifest(home).recovered, true);
});

test('an empty home lists nothing and ensureHub writes an empty hub', () => {
  const home = join(tempHome(), 'nested', 'lib');
  assert.deepEqual(listExplainers({ home }), []);
  const hub = ensureHub({ home });
  const data = embedded(readFileSync(hub, 'utf8'), 'explainer-data');
  assert.deepEqual(data.manifest.explainers, []);
  assert.deepEqual(data.index, []);
});

test('publish refuses data without a meta object', () => {
  assert.throws(() => publishExplainer({}, { home: tempHome() }), /publish explainer: data has no meta/);
});

test('hostile titles stay inert in the hub', () => {
  const home = tempHome();
  const title = '</script><script>alert(1)</script><!--';
  publishExplainer({ meta: { title, summary: '<img src=x onerror=alert(1)>', repo: 'evil/x' } }, { home });
  const html = readFileSync(libraryPaths(home).hub, 'utf8');
  const templateTags = (readFileSync(new URL('../template/library.html', import.meta.url), 'utf8').match(/<\/script>/gi) || []).length;
  assert.equal((html.match(/<\/script>/gi) || []).length, templateTags, 'only the template\'s own closing tags');
  assert.doesNotMatch(html, /<img src=x/);
  assert.equal(embedded(html, 'explainer-data').manifest.explainers[0].title, title);
});

test('the library carries the kit page, linked from the hub', () => {
  const home = tempHome();
  publishExplainer(example, { home });
  const kit = join(home, 'kit.html');
  assert.ok(existsSync(kit));
  const kitHtml = readFileSync(kit, 'utf8');
  assert.match(kitHtml, /bootGallery\(\);/);
  const context = embedded(kitHtml, 'explainer-context');
  assert.equal(context.libraryHref, 'index.html');
  assert.equal(context.style, 'clean');
  assert.ok(embedded(kitHtml, 'explainer-data').kinds.length > 5);
  assert.equal(embedded(readFileSync(libraryPaths(home).hub, 'utf8'), 'explainer-data').kitHref, 'kit.html');
  writeFileSync(kit, 'stale');
  rebuildLibrary({ home });
  assert.match(readFileSync(kit, 'utf8'), /^<!doctype html>/);
});
