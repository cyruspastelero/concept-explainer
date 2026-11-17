import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// "Save as page" (settings.js, pageSnapshot) rebuilds the page from its own
// untouched parts plus a fixed body skeleton. That skeleton must stay in step
// with template/explainer.html, or saved pages would drift from built ones.

const template = readFileSync(new URL('../template/explainer.html', import.meta.url), 'utf8');
// pageSnapshot lives in share.js.
const settings = readFileSync(new URL('../template/js/share.js', import.meta.url), 'utf8');

function snapshotSkeleton() {
  const start = settings.indexOf("'<body>'");
  const end = settings.indexOf("'</body>'", start);
  assert.ok(start > 0 && end > start, 'pageSnapshot lists the body skeleton');
  return [...settings.slice(start, end).matchAll(/'(<[^']+>)'/g)].map((m) => m[1]);
}

test('every fixed body line of a saved page is in the template', () => {
  const lines = snapshotSkeleton();
  assert.ok(lines.length >= 3, 'skip link, app root and noscript line');
  lines.forEach((line) => assert.ok(template.includes(line), `template/explainer.html is missing: ${line}`));
});

test('a saved page carries the same script slots as the template', () => {
  ['<script type="application/json" id="explainer-data">', '<script type="application/json" id="explainer-context">', '<script data-prepaint>']
    .forEach((tag) => {
      assert.ok(template.includes(tag), `template has ${tag}`);
      assert.ok(settings.includes(tag), `pageSnapshot writes ${tag}`);
    });
});

test('a saved page keeps the style, chapters and choice lists, never the token or library link', () => {
  const kept = settings.match(/const kept = (\{[^\n]*\});/);
  assert.ok(kept, 'pageSnapshot builds its context from named keys');
  assert.match(kept[1], /style/);
  assert.match(kept[1], /chapters/);
  assert.match(kept[1], /enums/);
  assert.doesNotMatch(kept[1], /serve|token|libraryHref|slug|\.\.\.built/);
  assert.doesNotMatch(settings, /outerHTML|innerHTML|XMLSerializer/);
});

// Save as page keeps the page's CSP and drops the library's @font-face rules.

function fontFaceRegex() {
  const m = settings.match(/const FONT_FACE_BLOCK = (new RegExp\(.+\));/);
  assert.ok(m, 'settings.js names FONT_FACE_BLOCK');
  return new Function(`return ${m[1]}`)();
}

test('a saved page copies the CSP meta and rehashes only the trimmed stylesheet', () => {
  assert.match(settings, /const CSP_NAME = \['Content', 'Security', 'Policy'\]\.join\('-'\)/);
  assert.match(settings, /<meta http-equiv="\$\{CSP_NAME\}"/);
  assert.match(settings, /policy\.replace\(\/style-src \[\^;\]\*\/, `style-src \$\{styleHash\}`\)/);
  // Script hashes stay valid only if the scripts are copied unchanged.
  assert.match(settings, /<script data-prepaint>\$\{prepaint\.textContent\}/);
  assert.match(settings, /<script>\$\{main \? main\.textContent : ''\}/);
});

test('the font block regex strips exactly the leading @font-face rules a library page carries', async () => {
  const { buildExplainer: make } = await import('../scripts/lib/build.mjs');
  const data = JSON.parse(readFileSync(new URL('../examples/concept-idempotency-keys.explainer.json', import.meta.url), 'utf8'));
  const html = make(data, { fontBase: '../../fonts/' });
  const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.match(style, /^\s*@font-face\{/);
  const trimmed = style.replace(fontFaceRegex(), '$1');
  assert.doesNotMatch(trimmed, /@font-face/);
  assert.ok(style.endsWith(trimmed.trimStart()) && trimmed.length > 1000, 'only the leading block goes');
  const plain = make(data, {}).match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.equal(plain.replace(fontFaceRegex(), '$1'), plain, 'a page without fonts is unchanged');
});
