import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_STYLE, STYLES, parseStyle } from '../scripts/lib/style.mjs';
import { libraryPaths, publishExplainer, readConfig, rebuildLibrary, writeConfig } from '../scripts/lib/library.mjs';

const example = JSON.parse(readFileSync(new URL('../examples/taskflow.explainer.json', import.meta.url), 'utf8'));
const tempHome = () => mkdtempSync(join(tmpdir(), 'rx-style-'));

function embedded(html, id) {
  const match = html.match(new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`));
  assert.ok(match, `${id} script tag present`);
  return JSON.parse(match[1]);
}

test('two styles, clean by default', () => {
  assert.deepEqual(STYLES, ['clean', 'playful']);
  assert.equal(DEFAULT_STYLE, 'clean');
});

test('parseStyle accepts known styles and names a bad one', () => {
  assert.equal(parseStyle('playful'), 'playful');
  assert.equal(parseStyle(' Clean '), 'clean');
  assert.throws(() => parseStyle('neon'), /unknown style "neon": use clean or playful/);
  assert.throws(() => parseStyle(''), /unknown style "": use clean or playful/);
});

test('config.json holds the library default, and a broken one falls back to clean', () => {
  const home = tempHome();
  assert.equal(readConfig(home).style, 'clean');
  writeConfig(home, { style: 'playful' });
  assert.equal(JSON.parse(readFileSync(join(home, 'config.json'), 'utf8')).style, 'playful');
  assert.equal(readConfig(home).style, 'playful');
  writeFileSync(join(home, 'config.json'), '{ nope');
  assert.equal(readConfig(home).style, 'clean');
  writeFileSync(join(home, 'config.json'), JSON.stringify({ style: 'neon' }));
  assert.equal(readConfig(home).style, 'clean');
  assert.throws(() => writeConfig(home, { style: 'neon' }), /unknown style "neon"/);
});

test('publish puts the style in the page context and the hub data', () => {
  const home = tempHome();
  const { pagePath } = publishExplainer(example, { home });
  assert.equal(embedded(readFileSync(pagePath, 'utf8'), 'explainer-context').style, 'clean');
  assert.equal(embedded(readFileSync(libraryPaths(home).hub, 'utf8'), 'explainer-data').style, 'clean');

  writeConfig(home, { style: 'playful' });
  publishExplainer(example, { home });
  assert.equal(embedded(readFileSync(pagePath, 'utf8'), 'explainer-context').style, 'playful', 'library default used without a flag');
  assert.equal(embedded(readFileSync(libraryPaths(home).hub, 'utf8'), 'explainer-data').style, 'playful');

  publishExplainer(example, { home, style: 'clean' });
  const context = embedded(readFileSync(pagePath, 'utf8'), 'explainer-context');
  const { config: _c, sections: _s, build: _b, key: _k, chapters: _ch, enums: _e, ...rest } = context;
  assert.deepEqual(rest, { libraryHref: '../../index.html', slug: 'acme-taskflow', style: 'clean' }, 'a flag wins for that page');
  assert.equal(embedded(readFileSync(libraryPaths(home).hub, 'utf8'), 'explainer-data').style, 'playful', 'the hub follows the library default');
});

test('rebuild uses the given style, else the library default', () => {
  const home = tempHome();
  const { pagePath } = publishExplainer(example, { home });
  rebuildLibrary({ home, style: 'playful' });
  assert.equal(embedded(readFileSync(pagePath, 'utf8'), 'explainer-context').style, 'playful');
  rebuildLibrary({ home });
  assert.equal(embedded(readFileSync(pagePath, 'utf8'), 'explainer-context').style, 'clean');
  assert.throws(() => rebuildLibrary({ home, style: 'neon' }), /unknown style "neon"/);
});
