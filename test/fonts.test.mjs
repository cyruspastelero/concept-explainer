import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildExplainer, fontFaceCss } from '../scripts/lib/build.mjs';
import { libraryPaths, publishExplainer } from '../scripts/lib/library.mjs';

const example = JSON.parse(readFileSync(new URL('../examples/taskflow.explainer.json', import.meta.url), 'utf8'));
const FONTS = new URL('../fonts/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('fonts.json', FONTS), 'utf8'));

test('fonts/ ships each family in latin and latin-ext, with the OFL text', () => {
  const families = new Set(manifest.fonts.map((f) => f.family));
  assert.deepEqual([...families].sort(), ['Geist', 'Geist Mono', 'JetBrains Mono', 'Nunito']);
  manifest.fonts.forEach((f) => {
    assert.ok(['latin', 'latin-ext'].includes(f.subset));
    const bytes = readFileSync(new URL(f.file, FONTS));
    assert.equal(bytes.toString('latin1', 0, 4), 'wOF2', f.file);
  });
  const ofl = readFileSync(new URL('OFL.txt', FONTS), 'utf8');
  assert.match(ofl, /SIL Open Font License/);
  ['Geist', 'Nunito', 'JetBrains Mono'].forEach((f) => assert.match(ofl, new RegExp(`^${f}$`, 'm')));
  assert.ok(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).files.includes('fonts/'));
});

test('font-face rules use relative URLs from a known base only', () => {
  const css = fontFaceCss('../../fonts/');
  assert.equal((css.match(/@font-face/g) || []).length, manifest.fonts.length);
  assert.match(css, /src:url\('\.\.\/\.\.\/fonts\/geist-latin\.woff2'\) format\('woff2'\)/);
  assert.match(css, /font-display:swap/);
  assert.doesNotMatch(css, /https?:/);
  assert.throws(() => fontFaceCss('https://evil.example/'), /font base/);
  assert.throws(() => fontFaceCss("x');}body{background:url(//e)"), /font base/);
});

test('library pages load the fonts from the library; standalone pages get none', () => {
  const home = join(mkdtempSync(join(tmpdir(), 'rx-fonts-')), 'home');
  const { pagePath } = publishExplainer(example, { home });
  const page = readFileSync(pagePath, 'utf8');
  assert.match(page, /url\('\.\.\/\.\.\/fonts\/geist-latin\.woff2'\)/);
  assert.match(readFileSync(libraryPaths(home).hub, 'utf8'), /url\('fonts\/geist-latin\.woff2'\)/);
  assert.match(readFileSync(libraryPaths(home).kit, 'utf8'), /url\('fonts\/geist-latin\.woff2'\)/);
  const copied = readdirSync(join(home, 'fonts')).sort();
  assert.deepEqual(copied, [...manifest.fonts.map((f) => f.file), 'OFL.txt'].sort());
  assert.ok(!existsSync(join(home, 'fonts', 'fonts.json')));
  assert.doesNotMatch(buildExplainer(example), /@font-face/);
});
