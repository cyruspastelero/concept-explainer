// Text for brand SVGs, drawn as paths from scripts/lib/brand-glyphs.json
// (Geist outlines), so the files render the same anywhere with no font.
import { readFileSync } from 'node:fs';

const GLYPHS = JSON.parse(readFileSync(new URL('./brand-glyphs.json', import.meta.url), 'utf8'));
export const FONTS = Object.keys(GLYPHS.fonts);

const round = (value) => {
  const r = Math.round(value * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

function fontOf(name) {
  const font = GLYPHS.fonts[name];
  if (!font) throw new Error(`brand text: unknown font "${name}" (use ${FONTS.join(', ')})`);
  return font;
}

function glyphOf(font, ch, fontName) {
  const glyph = font.glyphs[ch];
  if (!glyph) throw new Error(`brand text: no "${ch}" in ${fontName}; add it to CHARS in scripts/dev/brand-glyphs.mjs`);
  return glyph;
}

/**
 * Width of a run in pixels.
 * @param {string} text
 * @param {{ font?: string, size: number, tracking?: number }} style tracking in em
 */
export function textWidth(text, { font = 'sans', size, tracking = 0 }) {
  const f = fontOf(font);
  const scale = size / f.unitsPerEm;
  const chars = [...text];
  const advance = chars.reduce((sum, ch) => sum + glyphOf(f, ch, font).advance * scale, 0);
  return advance + tracking * size * Math.max(chars.length - 1, 0);
}

/**
 * One SVG path element for a run of text. `x` is the left edge, `y` the baseline.
 * `align: 'middle'` centers the run on x.
 */
export function textPath(text, { font = 'sans', size, x, y, fill, tracking = 0, align = 'start' }) {
  const f = fontOf(font);
  const scale = size / f.unitsPerEm;
  let pen = align === 'middle' ? x - textWidth(text, { font, size, tracking }) / 2 : x;
  const d = [...text].map((ch) => {
    const glyph = glyphOf(f, ch, font);
    const at = pen;
    pen += glyph.advance * scale + tracking * size;
    return glyph.d.replace(/(-?\d+) (-?\d+)/g, (_, gx, gy) => `${round(at + gx * scale)} ${round(y + gy * scale)}`);
  }).join('');
  return d ? `<path fill="${fill}" d="${d}"/>` : '';
}
