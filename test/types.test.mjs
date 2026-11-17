import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTypedStarter, listPresets, listTypePresets, loadTypePreset } from '../scripts/lib/init.mjs';
import { validateExplainer } from '../scripts/lib/validate.mjs';
import { CHAPTER_KEYS, EXPLAINER_TYPES, TYPE_RULES } from '../scripts/lib/schema.mjs';

const NON_REPO = EXPLAINER_TYPES.filter((t) => t !== 'repo');

test('there is one type preset per non-repo type, and the stack presets stay repo-only', () => {
  assert.deepEqual(listTypePresets().map((p) => p.type).sort(), [...NON_REPO].sort());
  assert.ok(listPresets().length >= 5);
  assert.ok(listPresets().every((p) => !p.type || p.type === 'repo'));
});

test('each type preset carries its chapters and the questions it must cover', () => {
  listTypePresets().forEach((preset) => {
    assert.equal(preset.id, preset.type);
    assert.deepEqual(preset.chapters, TYPE_RULES[preset.type].chapters, preset.type);
    preset.chapters.forEach((c) => assert.ok(CHAPTER_KEYS.includes(c)));
    assert.ok(preset.mustCover.length >= 3, preset.type);
    assert.ok(preset.name && preset.whenToUse);
  });
  assert.throws(() => loadTypePreset('essay'), /unknown type "essay"/);
});

test('every typed starter has no errors, only TODO warnings, and says its type', () => {
  NON_REPO.forEach((type) => {
    const starter = createTypedStarter(type, { ref: 'https://example.com/pr/1' });
    assert.equal(starter.schemaVersion, 2);
    assert.equal(starter.meta.type, type);
    assert.deepEqual(starter.meta.chapters, TYPE_RULES[type].chapters);
    const { errors, warnings } = validateExplainer(starter);
    assert.deepEqual(errors, [], type);
    assert.ok(warnings.some((w) => w.includes('TODO')), type);
  });
});

test('a starter records the source it explains', () => {
  const pr = createTypedStarter('pr', { ref: 'https://github.com/acme/app/pull/7' });
  assert.deepEqual(pr.meta.source, { kind: 'pr', ref: 'https://github.com/acme/app/pull/7', url: 'https://github.com/acme/app/pull/7' });
  const concept = createTypedStarter('concept', { ref: 'notes/oauth.md' });
  assert.deepEqual(concept.meta.source, { kind: 'doc', ref: 'notes/oauth.md' });
  const none = createTypedStarter('incident');
  assert.equal(none.meta.source.ref, 'TODO: where this comes from');
});

test('an open proposal starts undecided, so nothing is chosen', () => {
  const proposal = createTypedStarter('proposal');
  assert.equal(proposal.meta.status, 'draft');
  assert.ok(proposal.options.every((o) => !o.chosen));
});
