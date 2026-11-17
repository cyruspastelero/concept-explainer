import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildExplainer } from '../scripts/lib/build.mjs';
import { buildSearchIndex } from '../scripts/lib/search-index.mjs';
import { shownChapters } from '../scripts/lib/chapters.mjs';
import { bootPage, snapshot } from './page-harness.mjs';

// Every href the library search can produce must land on a real view and on
// its own item there, never on the chapter's fallback. The page's own router
// runs in node:vm (page-harness.mjs).
const SOURCES = {
  'acme-taskflow': '../examples/taskflow.explainer.json',
  'acme-taskflow-pr-512': '../examples/pr-cursor-paging.explainer.json',
  'acme-taskflow-proposal-0007-live-updates': '../examples/proposal-live-updates.explainer.json',
  'idempotency-keys': '../examples/concept-idempotency-keys.explainer.json',
  'chapters-all': './fixtures/chapters-all.explainer.json',
};
const load = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
// Types that open a whole chapter, not one item in it.
const CHAPTER_LEVEL = new Set(['explainer', 'run']);

const hashOf = (href) => href.split('#')[1] || '';
const viewOf = (hash) => decodeURIComponent((hash.split('/')[0]) || 'overview');

for (const [slug, path] of Object.entries(SOURCES)) {
  test(`${slug}: every search href lands on its view and its own item`, async (t) => {
    const data = load(path);
    const page = bootPage(buildExplainer(data, { context: { slug } }));
    const shown = new Set(page.views());
    // Hrefs into chapters this page does not show are checked on their own, below.
    const entries = buildSearchIndex(slug, data).filter((e) => shown.has(viewOf(hashOf(e.href))));
    assert.equal(entries.length, buildSearchIndex(slug, data).length, 'the index links only into chapters this page shows');
    assert.ok(entries.length > 5, 'the index has entries to check');
    const byType = new Map();
    entries.forEach((e) => byType.set(e.type, [...(byType.get(e.type) || []), e]));

    for (const [type, group] of byType) {
      await t.test(type, () => {
        const hrefs = [...new Set(group.map((e) => e.href))];
        const states = hrefs.map((href) => {
          const hash = hashOf(href);
          const landed = page.route(hash);
          assert.equal(landed.view, viewOf(hash), `${hash} opened "${landed.view}" instead of its own view`);
          return { hash, state: snapshot(landed.section) };
        });
        if (CHAPTER_LEVEL.has(type)) return;
        // "X/1" is X at its first step (a walkthrough and its step 1): the same target.
        const hashes = new Set(states.map((x) => x.hash));
        const targets = states.filter(({ hash }) => !(hash.endsWith('/1') && hashes.has(hash.slice(0, -2))));
        // ...and both open exactly the same thing.
        states.filter(({ hash }) => hash.endsWith('/1') && hashes.has(hash.slice(0, -2))).forEach(({ hash, state }) => {
          const parent = states.find((x) => x.hash === hash.slice(0, -2));
          assert.equal(state, parent.state, `#${hash} and #${parent.hash} should both open the item at its first step`);
        });
        if (targets.length > 1) {
          // Fallback would leave every item showing the same state.
          const seen = new Map();
          targets.forEach(({ hash, state }) => {
            assert.ok(!seen.has(state), `${hash} shows the same state as ${seen.get(state)}: the router fell back instead of opening the item`);
            seen.set(state, hash);
          });
        } else {
          const [{ hash }] = targets;
          const entry = group[0];
          const { section } = page.route(hash);
          assert.ok(section.textContent.includes(entry.title), `${hash}: "${entry.title}" is not on the view`);
        }
      });
    }
  });
}

test('an unknown id falls back to its chapter, and an unknown chapter to the overview', () => {
  const page = bootPage(buildExplainer(load('../examples/taskflow.explainer.json'), { context: {} }));
  assert.equal(page.route('flows/no-such-flow').view, 'flows');
  assert.equal(page.route('concepts/99').view, 'concepts');
  assert.equal(page.route('no-such-chapter/x').view, 'overview');
  assert.equal(page.route('').view, 'overview');
});

// The index and the page decide which chapters show by the same rule
// (scripts/lib/chapters.mjs on one side, app.js chooseChapters on the other).
for (const [slug, path] of Object.entries(SOURCES)) {
  const data = load(path);
  test(`${slug}: the shared chapter rule and the page show the same chapters`, () => {
    const views = bootPage(buildExplainer(data, { context: { slug } })).views().filter((v) => !['overview', 'settings'].includes(v));
    assert.deepEqual(views, shownChapters(data));
  });
  test(`${slug}: the search index links only into chapters the rule shows`, () => {
    const shown = new Set(shownChapters(data));
    const outside = buildSearchIndex(slug, data).map((e) => hashOf(e.href)).filter((h) => h && !shown.has(viewOf(h)));
    assert.deepEqual(outside, []);
  });
}
