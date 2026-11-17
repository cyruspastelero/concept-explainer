import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  slugify, baseSlugFor, chooseSlug, entryFor, upsertEntry, withoutEntry, emptyManifest, isManifest, SLUG_PATTERN, sameSource, sourceIdentity,
} from '../scripts/lib/library-model.mjs';

const example = JSON.parse(readFileSync(new URL('../examples/taskflow.explainer.json', import.meta.url), 'utf8'));

test('slugify makes lowercase kebab from anything, capped at 64', () => {
  assert.equal(slugify('Acme/Task Flow'), 'acme-task-flow');
  assert.equal(slugify('  --Café__Ünïcode!!  '), 'cafe-unicode');
  assert.equal(slugify('../../etc/passwd'), 'etc-passwd');
  assert.equal(slugify('x'.repeat(100)).length, 64);
  assert.equal(slugify('!!!'), 'explainer');
  assert.match(slugify('a'.repeat(63) + '-b'), SLUG_PATTERN);
});

test('base slug prefers meta.repo, then the repo folder, then the data folder', () => {
  assert.equal(baseSlugFor(example, {}), 'acme-taskflow');
  assert.equal(baseSlugFor({ meta: {} }, { repoPath: '/work/My App' }), 'my-app');
  assert.equal(baseSlugFor({ meta: {} }, { sourcePath: '/work/shop/data/explainer.json' }), 'data');
  assert.equal(baseSlugFor({ meta: {} }, { sourcePath: '/work/shop/.explainer/explainer.json' }), 'shop', '.explainer means the repo above it');
  assert.equal(baseSlugFor({}, {}), 'explainer');
});

test('chooseSlug reuses the slug of the same source and suffixes a different one', () => {
  const entries = [
    { slug: 'shop', repo: 'acme/shop' },
    { slug: 'shop-2', repo: 'other/shop' },
    { slug: 'local', repoPath: '/a/local' },
  ];
  assert.deepEqual(chooseSlug(entries, 'shop', { repo: 'acme/shop' }), { slug: 'shop', existing: true });
  assert.deepEqual(chooseSlug(entries, 'shop', { repo: 'other/shop' }), { slug: 'shop-2', existing: true });
  assert.deepEqual(chooseSlug(entries, 'shop', { repo: 'third/shop' }), { slug: 'shop-3', existing: false });
  assert.deepEqual(chooseSlug(entries, 'local', { repoPath: '/a/local' }), { slug: 'local', existing: true });
  assert.deepEqual(chooseSlug(entries, 'local', { repoPath: '/b/local' }), { slug: 'local-2', existing: false });
  assert.deepEqual(chooseSlug(entries, 'fresh', { sourcePath: '/x.json' }), { slug: 'fresh', existing: false });
});

test('a suffixed slug still fits in 64 characters', () => {
  const base = 'a'.repeat(64);
  const { slug } = chooseSlug([{ slug: base, repo: 'one/x' }], base, { repo: 'two/x' });
  assert.equal(slug.length, 64);
  assert.ok(slug.endsWith('-2'));
});

test('entryFor summarises the data with counts and layers', () => {
  const entry = entryFor(example, { slug: 'acme-taskflow', sourcePath: '/s.json', repoPath: '/r', publishedAt: '2026-11-18T00:00:00.000Z' });
  assert.equal(entry.title, example.meta.title);
  assert.equal(entry.repo, 'acme/taskflow');
  assert.deepEqual(entry.stack, example.meta.stack);
  assert.equal(entry.counts.flows, example.flows.length);
  assert.equal(entry.counts.files, example.tree.length);
  assert.equal(entry.counts.quiz, example.quiz.length);
  assert.deepEqual(entry.layers[0], { label: example.layers[0].label, color: example.layers[0].color });
  assert.equal(entry.publishedAt, '2026-11-18T00:00:00.000Z');
  assert.deepEqual(Object.keys(entry).sort(), ['commit', 'counts', 'generatedAt', 'layers', 'preset', 'publishedAt', 'repo', 'repoPath', 'slug', 'source', 'sourcePath', 'stack', 'status', 'summary', 'tags', 'thumb', 'title', 'type'].sort());
});

test('entryFor tolerates sparse data', () => {
  const entry = entryFor({}, { slug: 'x', publishedAt: 't' });
  assert.equal(entry.title, 'x');
  assert.equal(entry.repo, null);
  assert.deepEqual(entry.stack, []);
  assert.equal(entry.counts.nodes, 0);
});

test('upsertEntry and withoutEntry return new manifests, newest first', () => {
  const start = emptyManifest('t0');
  const a = upsertEntry(start, { slug: 'a', publishedAt: '2026-01-01' }, 't1');
  const b = upsertEntry(a, { slug: 'b', publishedAt: '2026-02-01' }, 't2');
  const a2 = upsertEntry(b, { slug: 'a', publishedAt: '2026-03-01', title: 'new' }, 't3');
  assert.deepEqual(start.explainers, []);
  assert.deepEqual(b.explainers.map((e) => e.slug), ['b', 'a']);
  assert.deepEqual(a2.explainers.map((e) => e.slug), ['a', 'b']);
  assert.equal(a2.explainers[0].title, 'new');
  assert.equal(a2.updatedAt, 't3');
  assert.deepEqual(withoutEntry(a2, 'a', 't4').explainers.map((e) => e.slug), ['b']);
  assert.equal(a2.explainers.length, 2, 'original untouched');
});

test('isManifest accepts only the documented shape', () => {
  assert.ok(isManifest(emptyManifest('t')));
  assert.ok(isManifest({ version: 1, updatedAt: 't', explainers: [{ slug: 'ok' }] }));
  assert.ok(!isManifest(null));
  assert.ok(!isManifest({ version: 1 }));
  assert.ok(!isManifest({ version: 1, explainers: [{ slug: '../evil' }] }));
  assert.ok(!isManifest({ version: 2, explainers: [] }));
});

test('entries carry the type, status, tags, source and the v2 counts', () => {
  const data = {
    schemaVersion: 2,
    meta: { type: 'proposal', title: 'Queues', summary: 'S.', status: 'accepted', tags: ['infra', 'email'], source: { kind: 'doc', ref: 'rfc-12.md' } },
    options: [{}, {}], risks: [{}], rollout: [{}, {}, {}], timeline: [], diff: [{}], diagrams: [{}, {}], walkthroughs: [{}],
  };
  const entry = entryFor(data, { slug: 'queues', publishedAt: 't' });
  assert.equal(entry.type, 'proposal');
  assert.equal(entry.status, 'accepted');
  assert.deepEqual(entry.tags, ['infra', 'email']);
  assert.deepEqual(entry.source, { kind: 'doc', ref: 'rfc-12.md' });
  assert.deepEqual(entry.counts, { layers: 0, nodes: 0, flows: 0, changes: 0, concepts: 0, files: 0, quiz: 0, diff: 1, options: 2, risks: 1, rollout: 3, timeline: 0, diagrams: 2, walkthroughs: 1 });
  const v1 = entryFor(example, { slug: 'a', publishedAt: 't' });
  assert.equal(v1.type, 'repo');
  assert.equal(v1.status, null);
  assert.deepEqual(v1.tags, []);
  assert.equal(v1.source, null);
});

test('non-repo types get slugs from their repo, type and source, or their title', () => {
  const prData = { meta: { type: 'pr', title: 'PR 512', repo: 'acme/taskflow', source: { kind: 'pr', ref: '#512', url: 'https://github.com/acme/taskflow/pull/512' } } };
  assert.equal(baseSlugFor(prData, {}), 'acme-taskflow-pr-512');
  const rfc = { meta: { type: 'proposal', title: 'Live updates', repo: 'acme/taskflow', source: { kind: 'doc', ref: 'docs/rfcs/0007-live-updates.md' } } };
  assert.equal(baseSlugFor(rfc, {}), 'acme-taskflow-proposal-0007-live-updates');
  const idea = { meta: { type: 'concept', title: 'Idempotency keys, explained', source: { kind: 'url', ref: 'x', url: 'https://example.com/a/b' } } };
  assert.equal(baseSlugFor(idea, {}), 'idempotency-keys');
});

test('a source is the same only with the same type, and for non-repo types the same reference', () => {
  const entries = [
    { slug: 'acme-taskflow', type: 'repo', repo: 'acme/taskflow' },
    { slug: 'acme-taskflow-pr-512', type: 'pr', repo: 'acme/taskflow', source: { kind: 'pr', ref: '#512' } },
  ];
  assert.deepEqual(chooseSlug(entries, 'acme-taskflow-pr-512', { type: 'pr', repo: 'acme/taskflow', ref: '#512' }), { slug: 'acme-taskflow-pr-512', existing: true });
  assert.deepEqual(chooseSlug(entries, 'acme-taskflow-pr-513', { type: 'pr', repo: 'acme/taskflow', ref: '#513' }), { slug: 'acme-taskflow-pr-513', existing: false });
  assert.deepEqual(chooseSlug(entries, 'acme-taskflow', { type: 'pr', repo: 'acme/taskflow' }), { slug: 'acme-taskflow-2', existing: false }, 'a PR never takes over the repo explainer');
  assert.deepEqual(chooseSlug(entries, 'acme-taskflow', { repo: 'acme/taskflow' }), { slug: 'acme-taskflow', existing: true }, 'a missing type means repo');
});

test('map-centric types get a small map thumbnail, capped in size', () => {
  const thumb = entryFor(example, { slug: 'a', publishedAt: 't' }).thumb;
  assert.equal(thumb.kind, 'map');
  assert.deepEqual(thumb.layers[0], { id: example.layers[0].id, color: example.layers[0].color });
  assert.deepEqual(thumb.nodes[0], { id: example.nodes[0].id, layer: example.nodes[0].layer });
  assert.deepEqual(thumb.edges[0], [example.edges[0].from, example.edges[0].to]);
  const big = {
    meta: { type: 'pr', title: 'Big' },
    layers: [{ id: 'l', label: 'L', color: 'blue' }],
    nodes: Array.from({ length: 60 }, (_, i) => ({ id: `n${i}`, layer: 'l', status: i === 0 ? 'added' : undefined })),
    edges: Array.from({ length: 90 }, (_, i) => ({ from: `n${i % 60}`, to: `n${(i + 1) % 60}` })),
  };
  const capped = entryFor(big, { slug: 'b', publishedAt: 't' }).thumb;
  assert.equal(capped.nodes.length, 40);
  assert.ok(capped.edges.length <= 60);
  const kept = new Set(capped.nodes.map((n) => n.id));
  assert.ok(capped.edges.every(([from, to]) => kept.has(from) && kept.has(to)), 'edges only between kept nodes');
  assert.equal(capped.nodes[0].status, 'added');
});

test('other types use their first visual as a thumbnail, trimmed to its shape', () => {
  const concept = {
    meta: { type: 'concept', title: 'C' },
    concepts: [{ title: 'x', body: 'y', visual: { kind: 'cycle', items: [{ label: 'A very long label that should be cut short here', detail: 'not kept' }, { label: 'B' }, { label: 'C' }] } }],
  };
  const thumb = entryFor(concept, { slug: 'c', publishedAt: 't' }).thumb;
  assert.equal(thumb.kind, 'cycle');
  assert.equal(thumb.items.length, 3);
  assert.ok(thumb.items[0].label.length <= 24);
  assert.equal(thumb.items[0].detail, undefined);
  const withDiagram = { ...concept, diagrams: [{ id: 'd', kind: 'venn', title: 'T', caption: 'C.', sets: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], items: [{ label: 'x', in: ['a', 'b'] }] }] };
  const venn = entryFor(withDiagram, { slug: 'd', publishedAt: 't' }).thumb;
  assert.equal(venn.kind, 'venn', 'diagrams come before concept visuals');
  assert.deepEqual(venn.sets, [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]);
  assert.deepEqual(venn.items, [{ in: ['a', 'b'] }]);
  assert.equal(entryFor({ meta: { type: 'incident', title: 'I' } }, { slug: 'e', publishedAt: 't' }).thumb, null);
  assert.ok(JSON.stringify(entryFor(withDiagram, { slug: 'd', publishedAt: 't' }).thumb).length < 2000);
});

test('sourceIdentity is the one source key: type, repo and a trimmed source reference', () => {
  const data = { meta: { type: 'pr', repo: ' acme/api ', source: { kind: 'pr', ref: '#42', url: '  https://example.com/pr/42 ' } } };
  assert.deepEqual(sourceIdentity(data), { type: 'pr', repo: 'acme/api', ref: 'https://example.com/pr/42' });
  assert.deepEqual(sourceIdentity({ meta: { type: 'pr', source: { ref: ' #42 ', url: 'ftp://example.com/x' } } }), { type: 'pr', repo: undefined, ref: '#42' }, 'a url that is not http(s) is not an identity');
  assert.deepEqual(sourceIdentity(null), { type: 'repo', repo: undefined, ref: undefined });
});

test('an entry matches the identity of the data it was made from, even with stray spaces', () => {
  const data = { meta: { type: 'pr', title: 'T', summary: 'S', repo: 'acme/api', source: { kind: 'pr', ref: '#42', url: ' https://example.com/pr/42' } } };
  const entry = entryFor(data, { slug: 's', publishedAt: 'now' });
  assert.equal(entry.source.url, 'https://example.com/pr/42');
  const respaced = structuredClone(data);
  respaced.meta.source.url = 'https://example.com/pr/42   ';
  assert.ok(sameSource(entry, sourceIdentity(respaced)));
});
