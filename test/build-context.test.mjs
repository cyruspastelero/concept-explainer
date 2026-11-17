import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildExplainer, buildGallery, buildLibrary } from '../scripts/lib/build.mjs';
import { shownChapters } from '../scripts/lib/chapters.mjs';
import { CONFIG_DEFAULTS, INSTRUCTIONS_MAX, MODEL_IDS, setConfigValue, validateConfig } from '../scripts/lib/config.mjs';
import { EXPLAINER_TYPES, VISUAL_KINDS } from '../scripts/lib/schema.mjs';
import { STYLES } from '../scripts/lib/style.mjs';
import { BUNDLE_FORMAT, MAX_BUNDLE_BYTES } from '../scripts/lib/bundle.mjs';
import { validateExplainer } from '../scripts/lib/validate.mjs';

const load = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}.explainer.json`, import.meta.url), 'utf8'));
const taskflow = load('taskflow');
const pr = load('pr-cursor-paging');

function contextOf(html) {
  const match = html.match(/<script type="application\/json" id="explainer-context">([\s\S]*?)<\/script>/);
  assert.ok(match, 'the page has a context tag');
  return JSON.parse(match[1]);
}

const pages = () => ({
  page: buildExplainer(pr, { context: { slug: 'p' } }),
  hub: buildLibrary({ explainers: [] }, [], {}),
  kit: buildGallery({ kinds: [], patterns: [] }),
});

test('an explainer page carries the chapters it shows, by the shared rule', () => {
  const context = contextOf(buildExplainer(pr, { context: { slug: 'p' } }));
  assert.deepEqual(context.chapters, shownChapters(pr));
  assert.equal(context.slug, 'p', 'the caller context is kept');
  assert.deepEqual(contextOf(buildExplainer(taskflow)).chapters, shownChapters(taskflow));
});

test('page, hub and kit carry the settings enums from the same constants the validators use', () => {
  for (const [name, html] of Object.entries(pages())) {
    const { enums } = contextOf(html);
    assert.ok(enums, `${name} has enums`);
    assert.deepEqual(enums.models, ['auto', ...MODEL_IDS], name);
    assert.deepEqual(enums.visualKinds, VISUAL_KINDS, name);
    assert.deepEqual(enums.types, EXPLAINER_TYPES, name);
    assert.deepEqual(enums.styles, STYLES, name);
    assert.deepEqual(enums.depth, ['overview', 'standard', 'deep'], name);
    assert.deepEqual(enums.audience, ['newcomer', 'engineer', 'expert'], name);
    assert.deepEqual(enums.codeWalkthrough, ['auto', 'always', 'never'], name);
    assert.equal(enums.bundleFormat, BUNDLE_FORMAT, name);
    assert.equal(enums.bundleMaxBytes, MAX_BUNDLE_BYTES, name);
    assert.equal(enums.instructionsLimit, INSTRUCTIONS_MAX, name);
    assert.ok(new RegExp(enums.languagePattern).test('pt-BR') && !new RegExp(enums.languagePattern).test('english'), name);
  }
});

test('every enum value shown is one the config accepts', () => {
  const { enums } = contextOf(pages().hub);
  const accepts = (key, value) => validateConfig({ ...CONFIG_DEFAULTS, [key]: value }).errors.length === 0;
  enums.models.forEach((m) => assert.ok(accepts('model', m), m));
  enums.styles.forEach((s) => assert.ok(accepts('style', s), s));
  enums.depth.forEach((d) => assert.ok(accepts('depth', d), d));
  enums.audience.forEach((a) => assert.ok(accepts('audience', a), a));
  enums.codeWalkthrough.forEach((c) => assert.ok(accepts('codeWalkthrough', c), c));
  enums.types.forEach((t) => assert.ok(accepts('defaultType', t), t));
  assert.ok(accepts('visuals', enums.visualKinds));
  assert.ok(accepts('instructions', 'x'.repeat(enums.instructionsLimit)));
  assert.ok(!accepts('instructions', 'x'.repeat(enums.instructionsLimit + 1)));
});

test('a chapter listed twice in meta.chapters is an error naming it', () => {
  const twice = structuredClone(pr);
  twice.meta.chapters = [...pr.meta.chapters, pr.meta.chapters[0]];
  const { errors } = validateExplainer(twice);
  assert.ok(errors.some((e) => e.includes(`meta.chapters[${pr.meta.chapters.length}]`) && e.includes(`"${pr.meta.chapters[0]}" is listed twice`)), errors.join('\n'));
});

test('a bad chapter flag names the chapter setting, not another one', () => {
  assert.throws(() => setConfigValue(CONFIG_DEFAULTS, 'chapters.pr.risks', 'maybe'), (error) => error.message === 'chapters.pr.risks: use on or off');
  assert.deepEqual(setConfigValue(CONFIG_DEFAULTS, 'chapters.pr.risks', 'off').chapters, { pr: { risks: false } });
});
