import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { TEMPLATE_DIR, escapeHtml } from './build.mjs';
import { NODE_KINDS } from './schema.mjs';
import { TOKENS, appIconSvg, lockupSvg, markSvg, maskableIconSvg, socialCardSvg } from './brand-art.mjs';

// Exported brand files: the Clean hairline icons, the logo set, the social
// card and the launcher icons. SVGs come from code here and are checked
// against assets/ by test/assets.test.mjs; PNGs and the ICO are rendered from
// them by scripts/dev/render-assets.mjs. See assets/README.md.

// Standalone icons draw in ink on transparent, at their native 24px.
export const ICON_STROKE = TOKENS.ink;
export const ICON_SIZE = 24;

function svgString(tag, attrs, ...children) {
  const attrText = Object.entries(attrs || {})
    .filter(([, v]) => v !== null && v !== undefined && v !== false)
    .map(([k, v]) => ` ${k}="${escapeHtml(v)}"`)
    .join('');
  const inner = children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false).join('');
  return inner ? `<${tag}${attrText}>${inner}</${tag}>` : `<${tag}${attrText}/>`;
}

// Runs template/js/icons.js with a string-based `s()` and no document, which
// gives the Clean shapes only: the same ones the page draws.
function loadIconModule() {
  const source = readFileSync(join(TEMPLATE_DIR, 'js', 'icons.js'), 'utf8');
  const context = vm.createContext({ s: svgString });
  vm.runInContext(`${source}\n;globalThis.__api = { icon };`, context);
  return context.__api;
}

/**
 * The data-facing icons: one per node `kind` agents can set. Interface glyphs
 * (theme, settings, download) stay in the template.
 * @returns {{ name: string, svg: string }[]} each as a standalone Clean SVG
 */
export function exportIcons(size = ICON_SIZE) {
  const { icon } = loadIconModule();
  return NODE_KINDS.map((name) => {
    const svg = icon(name, { stroke: ICON_STROKE, 'aria-hidden': null, focusable: null })
      .replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" `);
    return { name, svg: `${svg}\n` };
  });
}

/** @returns {{ name: string, svg: string }[]} logo mark, horizontal lockup and social card */
export function exportLogos() {
  return [
    { name: 'mark', svg: markSvg(128) },
    { name: 'lockup', svg: lockupSvg() },
    { name: 'social-card', svg: socialCardSvg() },
  ];
}

/** @returns {{ name: string, svg: string }[]} launcher icon sources */
export function exportAppIcons() {
  return [
    { name: 'icon', svg: appIconSvg() },
    { name: 'maskable', svg: maskableIconSvg() },
  ];
}

/** Every exported SVG, by its path under assets/. */
export function exportAllSvgs() {
  return [
    ...exportIcons().map(({ name, svg }) => ({ path: `icons/${name}.svg`, svg })),
    ...exportLogos().map(({ name, svg }) => ({ path: `logo/${name}.svg`, svg })),
    ...exportAppIcons().map(({ name, svg }) => ({ path: `app/${name}.svg`, svg })),
  ];
}

// What scripts/dev/render-assets.mjs rasterizes. Paths are from the repo root.
export const RASTERS = [
  { from: 'assets/app/icon.svg', out: 'assets/app/icon-192.png', width: 192, height: 192 },
  { from: 'assets/app/icon.svg', out: 'assets/app/icon-512.png', width: 512, height: 512 },
  { from: 'assets/app/icon.svg', out: 'assets/app/icon-1024.png', width: 1024, height: 1024 },
  { from: 'assets/app/maskable.svg', out: 'assets/app/maskable-512.png', width: 512, height: 512 },
  { from: 'assets/logo/social-card.svg', out: 'docs/media/social-card.png', width: 1280, height: 640 },
];
export const ICO = { from: 'assets/app/icon.svg', out: 'assets/app/icon.ico', sizes: [16, 32, 48, 256] };

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Width and height from a PNG's IHDR chunk. Throws on anything else. */
export function pngSize(buffer) {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE) || buffer.toString('latin1', 12, 16) !== 'IHDR') {
    throw new Error('png size: not a PNG');
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/**
 * An .ico that wraps PNG images (Windows Vista and later read PNG entries).
 * @param {Buffer[]} pngs square PNGs up to 256px
 * @returns {Buffer}
 */
export function icoFromPngs(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + pngs.length * 16;
  const entries = pngs.map((png) => {
    const { width, height } = pngSize(png);
    if (width > 256 || height > 256) throw new Error(`ico: ${width}x${height} is larger than 256`);
    const entry = Buffer.alloc(16);
    entry.writeUInt8(width === 256 ? 0 : width, 0);
    entry.writeUInt8(height === 256 ? 0 : height, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...pngs]);
}

/** Read back the entries of an .ico made by icoFromPngs. */
export function icoEntries(buffer) {
  if (buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) throw new Error('ico: not an icon file');
  return Array.from({ length: buffer.readUInt16LE(4) }, (_, i) => {
    const at = 6 + i * 16;
    const size = buffer.readUInt32LE(at + 8);
    const offset = buffer.readUInt32LE(at + 12);
    return { width: buffer[at] || 256, height: buffer[at + 1] || 256, png: buffer.subarray(offset, offset + size) };
  });
}
