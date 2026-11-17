import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BUNDLE_FORMAT, MAX_BUNDLE_BYTES, applyImport, createBundle, parseBundle, planImport, readBundleFile,
} from '../scripts/lib/bundle.mjs';
import { libraryPaths, listExplainers, publishExplainer, rebuildLibrary } from '../scripts/lib/library.mjs';

const load = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}.explainer.json`, import.meta.url), 'utf8'));
const taskflow = load('taskflow');
const pr = load('pr-cursor-paging');
const concept = load('concept-idempotency-keys');
const tempHome = () => mkdtempSync(join(tmpdir(), 'rx-bundle-'));
const stored = (home, slug) => JSON.parse(readFileSync(join(home, 'explainers', slug, 'explainer.json'), 'utf8'));

function libraryWith(...items) {
  const home = tempHome();
  items.forEach((data, i) => publishExplainer(data, { home, sourcePath: `/work/${i}/explainer.json`, repoPath: `/work/${i}` }));
  return home;
}

const bundleOf = (explainers) => JSON.stringify({ format: BUNDLE_FORMAT, version: 1, exportedAt: 't', explainers });
const importText = (home, text, options = {}) => applyImport(home, parseBundle(text), options);

test('export then import into an empty library gives the same data', () => {
  const from = libraryWith(taskflow, pr, concept);
  const { bundle, slugs } = createBundle(from, {});
  assert.equal(bundle.format, BUNDLE_FORMAT);
  assert.equal(bundle.version, 1);
  assert.equal(bundle.exportedBy, null);
  assert.equal(slugs.length, 3);
  const to = tempHome();
  const summary = importText(to, JSON.stringify(bundle));
  assert.equal(summary.added.length, 3);
  slugs.forEach((slug) => assert.deepEqual(stored(to, slug), stored(from, slug)));
  listExplainers({ home: to }).forEach((entry) => {
    assert.equal(entry.sourcePath, null);
    assert.equal(entry.repoPath, null);
  });
  assert.ok(existsSync(join(to, 'explainers', slugs[0], 'index.html')));
  assert.ok(existsSync(libraryPaths(to).hub));
});

test('a bundle carries data only: no paths, no config, no HTML', () => {
  const home = libraryWith(taskflow);
  const text = JSON.stringify(createBundle(home, {}).bundle);
  assert.doesNotMatch(text, /sourcePath|repoPath|\/work\/|<!doctype|"config"|audience/);
});

test('selectors pick by slug, type, tag, stack and search', () => {
  const home = libraryWith(taskflow, pr, concept);
  const slugsOf = (selectors) => createBundle(home, selectors).slugs.sort();
  const all = listExplainers({ home });
  const prSlug = all.find((e) => e.type === 'pr').slug;
  assert.deepEqual(slugsOf({ slugs: [prSlug] }), [prSlug]);
  assert.deepEqual(slugsOf({ type: 'concept' }), [all.find((e) => e.type === 'concept').slug]);
  assert.deepEqual(slugsOf({ tag: 'payments' }), [all.find((e) => e.type === 'concept').slug]);
  assert.deepEqual(slugsOf({ stack: 'prisma' }).length, 2);
  assert.deepEqual(slugsOf({ search: 'keyset' }), [prSlug], 'search reaches inside the explainer');
  assert.throws(() => createBundle(home, { slugs: ['nope'] }), /export: no explainer "nope"/);
  assert.throws(() => createBundle(home, { type: 'incident' }), /export: nothing matches/);
});

test('conflicts: rename by default, skip, or replace an entry from the same source', () => {
  const from = libraryWith(pr);
  const text = JSON.stringify(createBundle(from, {}).bundle);
  const to = tempHome();
  const first = importText(to, text).added[0].slug;
  const renamed = importText(to, text);
  assert.equal(renamed.added[0].slug, `${first}-2`);
  assert.match(renamed.added[0].note, /renamed/);
  const skipped = importText(to, text, { onConflict: 'skip' });
  assert.equal(skipped.skipped.length, 1);
  assert.equal(skipped.added.length, 0);
  const changed = JSON.parse(text);
  changed.explainers[0].data.meta.title = 'Updated title';
  const replaced = importText(to, JSON.stringify(changed), { onConflict: 'replace' });
  assert.equal(replaced.replaced.length, 1);
  assert.equal(stored(to, replaced.replaced[0].slug).meta.title, 'Updated title');
  assert.throws(() => planImport(to, parseBundle(text), { onConflict: 'merge' }), /--on-conflict "merge"/);
});

test('replace never overwrites an explainer from a different source', () => {
  const to = tempHome();
  publishExplainer({ ...concept, meta: { ...concept.meta, repo: 'one/thing' } }, { home: to, slug: 'one-thing' });
  const other = { ...concept, meta: { ...concept.meta, repo: 'two/thing' } };
  const summary = importText(to, bundleOf([{ slug: 'one-thing', data: other }]), { onConflict: 'replace' });
  assert.equal(summary.replaced.length, 0);
  assert.equal(summary.added[0].slug, 'one-thing-2');
  assert.equal(stored(to, 'one-thing').meta.repo, 'one/thing', 'the original is untouched');
});

test('a dry run plans but writes nothing', () => {
  const to = tempHome();
  const plan = planImport(to, parseBundle(bundleOf([{ slug: 'x', data: concept }])), {});
  assert.equal(plan.summary.added.length, 1);
  assert.equal(plan.summary.dryRun, true);
  assert.ok(!existsSync(join(to, 'library.json')));
});

test('a bundle is untrusted: format, version, size and JSON are checked and named', () => {
  assert.throws(() => parseBundle('{ nope'), /import: the file is not JSON/);
  assert.throws(() => parseBundle(JSON.stringify({ format: 'zip', version: 1, explainers: [] })), /not a concept-explainer bundle/);
  assert.throws(() => parseBundle(JSON.stringify({ format: BUNDLE_FORMAT, version: 9, explainers: [] })), /version 9/);
  assert.throws(() => parseBundle(JSON.stringify({ format: BUNDLE_FORMAT, version: 1, explainers: 'x' })), /explainers must be a list/);
  assert.throws(() => parseBundle('x'.repeat(MAX_BUNDLE_BYTES + 1)), /larger than 10 MB/);
  const big = join(tempHome(), 'big.explainers.json');
  writeFileSync(big, 'x'.repeat(MAX_BUNDLE_BYTES + 1));
  assert.throws(() => readBundleFile(big), /larger than 10 MB/);
});

test('markup in prose rejects that explainer; markup in code stays inert text', () => {
  const to = tempHome();
  const prose = structuredClone(concept);
  prose.concepts[0].body = '<img src=x onerror=alert(1)> body';
  const code = structuredClone(pr);
  code.flows[1].steps[3].code = '</script><script>alert(1)</script>';
  const summary = importText(to, bundleOf([{ slug: 'a', data: prose }, { slug: 'b', data: code }]));
  assert.equal(summary.rejected.length, 1);
  assert.match(summary.rejected[0].reasons.join(' '), /markup/);
  assert.equal(summary.added.length, 1);
  const html = readFileSync(join(to, 'explainers', summary.added[0].slug, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /<\/script><script>alert/);
});

test('unsafe urls are dropped and the explainer still imports', () => {
  const data = structuredClone(pr);
  data.meta.source.url = 'javascript:alert(1)';
  data.risks[0].url = 'data:text/html,hi';
  const to = tempHome();
  const summary = importText(to, bundleOf([{ slug: 'x', data }]));
  assert.equal(summary.added.length, 1);
  assert.match(summary.added[0].note, /dropped 2 unsafe links/);
  const saved = stored(to, summary.added[0].slug);
  assert.equal(saved.meta.source.url, undefined);
  assert.equal(saved.risks[0].url, undefined);
});

test('slugs from a bundle are re-derived and sanitised', () => {
  const to = tempHome();
  const summary = importText(to, bundleOf([{ slug: '../../etc/passwd', data: concept }, { slug: 42, data: { ...concept, meta: { ...concept.meta, title: 'Other' } } }]));
  assert.deepEqual(summary.added.map((a) => a.slug), ['etc-passwd', 'other'], 'a missing hint is re-derived from the data');
  assert.ok(existsSync(join(to, 'explainers', 'etc-passwd', 'explainer.json')));
});

test('prototype pollution keys are dropped and never reach Object.prototype', () => {
  const text = `{"format":"${BUNDLE_FORMAT}","version":1,"__proto__":{"polluted":1},"explainers":[{"slug":"p","data":${JSON.stringify({ ...concept, constructor: { prototype: { polluted: 2 } } }).replace(/^\{/, '{"__proto__":{"polluted":3},')}}]}`;
  const bundle = parseBundle(text);
  assert.equal(({}).polluted, undefined);
  assert.ok(!Object.prototype.hasOwnProperty.call(bundle, '__proto__'));
  assert.ok(!Object.prototype.hasOwnProperty.call(bundle.explainers[0].data, '__proto__'));
  assert.ok(!Object.prototype.hasOwnProperty.call(bundle.explainers[0].data, 'constructor'));
  const to = tempHome();
  applyImport(to, bundle, {});
  assert.equal(({}).polluted, undefined);
  assert.doesNotMatch(readFileSync(join(to, 'explainers', 'p', 'explainer.json'), 'utf8'), /polluted/);
});

test('entries that are not objects, or too many, are rejected or refused', () => {
  const summary = planImport(tempHome(), parseBundle(bundleOf([{ slug: 'a', data: 'nope' }, null, { slug: 'b' }])), {}).summary;
  assert.equal(summary.rejected.length, 3);
  const many = bundleOf(Array.from({ length: 501 }, () => ({ slug: 'a', data: {} })));
  assert.throws(() => parseBundle(many), /more than 500 explainers/);
});

test('replace backs up the old data, names it in the dry run, and marks the entry as imported', () => {
  const to = libraryWith(pr);
  const original = stored(to, listExplainers({ home: to })[0].slug);
  const changed = structuredClone(pr);
  changed.meta.title = 'Attacker version';
  const text = bundleOf([{ slug: 'x', data: changed }]);
  const slug = listExplainers({ home: to })[0].slug;
  const withHint = text.replace('"slug":"x"', `"slug":"${slug}"`);
  const plan = planImport(to, parseBundle(withHint), { onConflict: 'replace' });
  assert.deepEqual(plan.summary.replaced[0].overwrites, { slug, title: pr.meta.title });
  applyImport(to, parseBundle(withHint), { onConflict: 'replace' });
  const dir = join(to, 'explainers', slug);
  const backups = readdirSync(dir).filter((f) => f.startsWith('explainer.json.replaced-'));
  assert.equal(backups.length, 1);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, backups[0]), 'utf8')), original);
  const entry = listExplainers({ home: to }).find((e) => e.slug === slug);
  assert.equal(entry.origin, 'import');
  assert.match(entry.importedAt, /^\d{4}-\d{2}-\d{2}T/);
  const added = importText(tempHome(), bundleOf([{ slug: 'y', data: concept }]));
  assert.equal(added.added.length, 1);
});

test('imported entries keep their origin through a rebuild; local builds have none', () => {
  const to = tempHome();
  importText(to, bundleOf([{ slug: 'y', data: concept }]));
  rebuildLibrary({ home: to });
  assert.equal(listExplainers({ home: to })[0].origin, 'import');
  const local = libraryWith(concept);
  assert.equal(listExplainers({ home: local })[0].origin, undefined);
});

test('two items replacing one slug in one bundle: the original is kept and the duplicate skipped', () => {
  const to = libraryWith(pr);
  const slug = listExplainers({ home: to })[0].slug;
  const original = stored(to, slug);
  const first = structuredClone(pr);
  first.meta.title = 'First replacement';
  const second = structuredClone(pr);
  second.meta.title = 'Second replacement';
  const twice = bundleOf([{ slug, data: first }, { slug, data: second }]);
  const plan = planImport(to, parseBundle(twice), { onConflict: 'replace' });
  assert.equal(plan.summary.replaced.length, 1);
  assert.deepEqual(plan.summary.skipped.map((s) => [s.index, s.reason]), [[1, 'duplicate in this bundle']]);
  applyImport(to, parseBundle(twice), { onConflict: 'replace' });
  const dir = join(to, 'explainers', slug);
  const backups = readdirSync(dir).filter((f) => f.startsWith('explainer.json.replaced-'));
  assert.equal(backups.length, 1);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, backups[0]), 'utf8')), original, 'the original survives');
  assert.equal(stored(to, slug).meta.title, 'First replacement');
});

test('backups never overwrite each other, even within one millisecond', () => {
  const to = libraryWith(pr);
  const slug = listExplainers({ home: to })[0].slug;
  const v = (title) => ({ ...structuredClone(pr), meta: { ...pr.meta, title } });
  publishExplainer(v('two'), { home: to, slug, backupExisting: true });
  publishExplainer(v('three'), { home: to, slug, backupExisting: true });
  const backups = readdirSync(join(to, 'explainers', slug)).filter((f) => f.startsWith('explainer.json.replaced-'));
  assert.equal(backups.length, 2);
  assert.match(backups[0], /^explainer\.json\.replaced-[\dT-]+Z-[0-9a-f]{8}$/);
});

test('a publish between the dry run and the import is never overwritten: the import plans again under the lock', () => {
  const to = tempHome();
  const text = bundleOf([{ slug: 'shared-slug', data: concept }]);
  const dry = planImport(to, parseBundle(text), {});
  assert.deepEqual(dry.summary.added.map((a) => a.slug), ['shared-slug']);
  // Someone else publishes a different explainer at that slug before the import runs.
  publishExplainer(taskflow, { home: to, slug: 'shared-slug' });
  const summary = applyImport(to, parseBundle(text), {});
  assert.equal(summary.dryRun, false);
  assert.deepEqual(summary.added.map((a) => a.slug), ['shared-slug-2']);
  assert.equal(stored(to, 'shared-slug').meta.title, taskflow.meta.title, 'the other publish survives');
  assert.equal(stored(to, 'shared-slug-2').meta.title, concept.meta.title);
});

test('publishing to a slug that is taken, without asking for a backup, refuses', () => {
  const to = tempHome();
  publishExplainer(taskflow, { home: to, slug: 'held' });
  assert.throws(() => publishExplainer(concept, { home: to, slug: 'held' }), /publish explainer: slug "held" was taken since the plan/);
  assert.equal(stored(to, 'held').meta.title, taskflow.meta.title);
  publishExplainer(concept, { home: to, slug: 'held', backupExisting: true });
  assert.equal(stored(to, 'held').meta.title, concept.meta.title);
});

test('export names the explainer whose data file is missing', () => {
  const from = libraryWith(taskflow, concept);
  const slug = listExplainers({ home: from })[0].slug;
  rmSync(join(from, 'explainers', slug, 'explainer.json'));
  assert.throws(() => createBundle(from, {}), new RegExp(`read explainer "${slug}": .*explainer\\.json is missing or not valid JSON`));
});

test('publish and import agree on the source: a re-import with a respaced url replaces, not duplicates', () => {
  const to = libraryWith(pr);
  const slug = listExplainers({ home: to })[0].slug;
  const respaced = structuredClone(pr);
  respaced.meta.source = { ...respaced.meta.source, url: `  ${respaced.meta.source.url}  ` };
  const summary = importText(to, bundleOf([{ slug, data: respaced }]), { onConflict: 'replace' });
  assert.deepEqual(summary.replaced.map((r) => r.slug), [slug]);
  assert.equal(listExplainers({ home: to }).length, 1);
});
