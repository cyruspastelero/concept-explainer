import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildExplainer, buildGallery, buildLibrary, pageCspFrom } from '../scripts/lib/build.mjs';
import { NODE_KINDS } from '../scripts/lib/schema.mjs';

const example = JSON.parse(readFileSync(new URL('../examples/taskflow.explainer.json', import.meta.url), 'utf8'));
const hash = (text) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;
const metaOf = (html) => {
  const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  assert.ok(m, 'CSP meta tag present');
  return m[1];
};
// Executable inline blocks: scripts without src that are not JSON data, and styles.
const blocks = (html) => [
  ...[...html.matchAll(/<script(?![^>]*\b(?:src|type)=)(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((m) => m[1]),
  ...[...html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi)].map((m) => m[1]),
];

const pages = {
  explainer: buildExplainer(example, { context: { style: 'clean' } }),
  gallery: buildGallery({ kinds: NODE_KINDS, patterns: [], version: '0' }),
  hub: buildLibrary({ version: 1, updatedAt: 't', explainers: [] }, []),
};

test('every built page carries a CSP meta tag right after the charset', () => {
  Object.entries(pages).forEach(([name, html]) => {
    assert.match(html, /<meta charset="utf-8">\n?<meta http-equiv="Content-Security-Policy" content="/i, name);
    assert.equal((html.match(/http-equiv="Content-Security-Policy"/g) || []).length, 1, name);
  });
});

test('the policy allows exactly the page\'s own inline blocks, by hash, and nothing remote', () => {
  Object.entries(pages).forEach(([name, html]) => {
    const csp = metaOf(html);
    const found = blocks(html);
    assert.ok(found.length >= 2, name);
    found.forEach((block) => assert.ok(csp.includes(hash(block)), `${name}: a block is not hashed`));
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /font-src 'self'/);
    assert.match(csp, /worker-src 'self'/, 'so the app can register /sw.js');
    assert.match(csp, /manifest-src 'self'/, 'so the app can link /manifest.webmanifest');
    assert.doesNotMatch(csp.replace("style-src-attr 'unsafe-inline'", ''), /unsafe-inline|unsafe-eval|https:|\*/, name);
    assert.doesNotMatch(csp, /frame-ancestors/, 'ignored in a meta tag, so it is sent by serve instead');
  });
});

test('pageCspFrom reads the policy back, and a page without one gets the strictest policy', () => {
  assert.equal(pageCspFrom(pages.explainer), metaOf(pages.explainer));
  assert.equal(pageCspFrom('<html><script>alert(1)</script></html>'), "default-src 'none'");
});

test('text in data cannot forge or break the meta tag', () => {
  const data = { ...example, meta: { ...example.meta, title: '<meta charset="utf-8"> "><script>x</script>' } };
  const html = buildExplainer(data);
  assert.equal((html.match(/http-equiv="Content-Security-Policy"/g) || []).length, 1);
  assert.ok(metaOf(html).includes(hash(blocks(html).at(-1))) || blocks(html).every((b) => metaOf(html).includes(hash(b))));
});
