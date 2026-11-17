import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import {
  ICO, ICON_STROKE, RASTERS, exportAllSvgs, exportIcons, exportLogos, icoEntries, icoFromPngs, pngSize,
} from '../scripts/lib/assets.mjs';
import { TOKENS } from '../scripts/lib/brand-art.mjs';
import { NODE_KINDS } from '../scripts/lib/schema.mjs';
import { textWidth } from '../scripts/lib/brand-text.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ASSETS = join(ROOT, 'assets');

function svgFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return svgFiles(path);
    return entry.name.endsWith('.svg') ? [relative(ASSETS, path)] : [];
  });
}

test('assets/ holds exactly a fresh export of every SVG', () => {
  const fresh = exportAllSvgs();
  assert.deepEqual(svgFiles(ASSETS).sort(), fresh.map((f) => f.path).sort(), 'run scripts/dev/render-assets.mjs');
  fresh.forEach(({ path, svg }) => assert.equal(readFileSync(join(ASSETS, path), 'utf8'), svg, `${path} is stale: run scripts/dev/render-assets.mjs`));
});

test('rendered PNGs exist at their sizes, and the ICO wraps PNGs at its sizes', () => {
  RASTERS.forEach(({ out, width, height }) => {
    const path = join(ROOT, out);
    assert.ok(existsSync(path), `${out} missing: run scripts/dev/render-assets.mjs`);
    assert.deepEqual(pngSize(readFileSync(path)), { width, height }, out);
  });
  const entries = icoEntries(readFileSync(join(ROOT, ICO.out)));
  assert.deepEqual(entries.map((e) => e.width), ICO.sizes);
  entries.forEach((e) => assert.deepEqual(pngSize(e.png), { width: e.width, height: e.width }));
});

test('brand SVGs use no font, no old brand colors and only design tokens', () => {
  const allowed = new Set([...Object.values(TOKENS), ICON_STROKE].map((c) => c.toLowerCase()));
  exportAllSvgs().forEach(({ path, svg }) => {
    assert.doesNotMatch(svg, /<text|font-family|Nunito|@import|<image|<script|href=/i, path);
    assert.doesNotMatch(svg, /#58cc02|#1cb0f6|#ffc800|#d7ffb8/i, path);
    const colors = [...svg.matchAll(/#[0-9a-f]{3,6}\b/gi)].map((m) => m[0].toLowerCase());
    colors.forEach((c) => assert.ok(allowed.has(c), `${path}: ${c} is not a token`));
    assert.doesNotMatch(svg, /filter|gradient|blur/i, path);
  });
});

test('icons are one Clean hairline icon per node kind: ink strokes, no fills, at 24px', () => {
  const icons = exportIcons();
  assert.deepEqual(icons.map((i) => i.name), NODE_KINDS, 'only the kinds agents can set; no interface glyphs');
  icons.forEach(({ name, svg }) => {
    assert.match(svg, /width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#171717" stroke-width="1.5"/, name);
    assert.doesNotMatch(svg, /currentColor|ico-playful/, name);
  });
});

test('the logos carry the Concept Explainer name and one orange accent', () => {
  const logos = Object.fromEntries(exportLogos().map((l) => [l.name, l.svg]));
  assert.match(logos.lockup, /aria-label="Concept Explainer"/);
  assert.match(logos['social-card'], /viewBox="0 0 1280 640" width="1280" height="640"/);
  assert.match(logos['social-card'], new RegExp(TOKENS.accent));
  assert.doesNotMatch(Object.values(logos).join(''), /Repo Explainer/);
});

test('text layout is deterministic and grows with the string', () => {
  const style = { font: 'sansSemibold', size: 30 };
  assert.ok(textWidth('Concept Explainer', style) > textWidth('Concept', style));
  assert.throws(() => textWidth('\u{1F600}', style), /no "\u{1F600}"/u);
  assert.equal(exportAllSvgs().map((f) => f.svg).join(''), exportAllSvgs().map((f) => f.svg).join(''));
});

test('icoFromPngs writes a valid header and refuses images over 256px', () => {
  const fakePng = (size) => {
    const buf = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
    buf.writeUInt32BE(13, 8);
    buf.write('IHDR', 12, 'latin1');
    buf.writeUInt32BE(size, 16);
    buf.writeUInt32BE(size, 20);
    return buf;
  };
  const ico = icoFromPngs([fakePng(16), fakePng(256)]);
  const entries = icoEntries(ico);
  assert.deepEqual(entries.map((e) => [e.width, e.png.length]), [[16, 33], [256, 33]]);
  assert.equal(ico[6 + 16], 0, '256 is written as 0');
  assert.throws(() => icoFromPngs([fakePng(512)]), /larger than 256/);
  assert.throws(() => pngSize(Buffer.from('nope')), /not a PNG/);
});
