// Brand artwork in the Clean (Geist) look: ink, greys and one orange accent.
// Text is drawn as Geist paths (brand-text.mjs); nothing depends on a font.
// Colors are the design tokens in references/design-system.md.
import { textPath, textWidth } from './brand-text.mjs';

export const TOKENS = {
  canvas: '#fafafa', surface: '#ffffff', line: '#ebebeb', ink: '#171717', body: '#4d4d4d',
  muted: '#666666', quiet: '#8f8f8f', faint: '#c9c9c9', accent: '#fc5e32', accentFill: '#d2430e',
};
const T = TOKENS;
export const BRAND_NAME = 'Concept Explainer';
export const TAGLINE = ['Explain a repo, a PR, a proposal or a concept', 'as one interactive picture, every claim cited.'];
const TYPES = ['repo', 'pr', 'change', 'proposal', 'migration', 'incident', 'concept'];

// The mark's graph (three nodes, three links) in its 32 unit box.
function graph(color, stroke = 1.75) {
  return [
    `<path d="M10.5 11h11M10.5 11l5.5 10.5M21.5 11L16 21.5" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"/>`,
    `<circle cx="10.5" cy="11" r="2.5" fill="${color}"/>`,
    `<circle cx="21.5" cy="11" r="2.5" fill="${color}"/>`,
    `<circle cx="16" cy="21.5" r="2.5" fill="${color}"/>`,
  ].join('');
}

/** The mark: an orange tile with the graph, in a 32 unit box. */
export function markInner() {
  return `<rect x="2" y="2" width="28" height="28" rx="6" fill="${T.accent}"/>${graph(T.surface)}`;
}

const svg = (w, h, body, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"${extra}>\n${body}\n</svg>\n`;

export function markSvg(size = 128) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" role="img" aria-label="${BRAND_NAME}">\n${markInner()}\n</svg>\n`;
}

export function lockupSvg() {
  const name = { font: 'sansSemibold', size: 30, tracking: -0.035 };
  const width = Math.ceil(62 + textWidth(BRAND_NAME, name) + 4);
  const body = [
    `<g transform="translate(0 8) scale(1.5)">${markInner()}</g>`,
    textPath(BRAND_NAME, { ...name, x: 62, y: 43, fill: T.ink }),
  ].join('\n');
  return svg(width, 64, body, ` role="img" aria-label="${BRAND_NAME}"`);
}

// Mono uppercase pills for the explainer types, wrapped to `maxWidth`.
function typePills(x, y, maxWidth) {
  const style = { font: 'mono', size: 13, tracking: 0.07 };
  let cx = x;
  let cy = y;
  return TYPES.map((type) => {
    const label = type.toUpperCase();
    const w = Math.ceil(textWidth(label, style) + 28);
    if (cx + w > x + maxWidth) { cx = x; cy += 42; }
    const pill = `<rect x="${cx + 0.5}" y="${cy + 0.5}" width="${w - 1}" height="31" rx="16" fill="${T.surface}" stroke="${T.line}"/>${textPath(label, { ...style, x: cx + 14, y: cy + 21, fill: T.muted })}`;
    cx += w + 8;
    return pill;
  }).join('\n');
}

const box = (x, y, w, h, { fill = T.surface, stroke = T.line, rx = 6 } = {}) => `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="${rx}" fill="${fill}" stroke="${stroke}"/>`;
const bar = (x, y, w, color = T.line, h = 8) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${color}"/>`;

// A small explainer page: sidebar, a map with one traced path, a step card.
const MOCK = { x: 724, y: 96, width: 460, height: 448, side: 132 };

function mockSidebar({ x, y, side }) {
  const nav = [72, 60, 68, 52, 64, 46].map((w, i) => {
    const ny = y + 92 + i * 30;
    const active = i === 1;
    return `${active ? `<rect x="${x + 18}" y="${ny - 1}" width="8" height="8" rx="1.5" fill="${T.accent}"/>` : ''}${bar(x + 32, ny - 1, w, active ? T.ink : T.line)}`;
  }).join('');
  return [
    `<path d="M${x + side} ${y + 1}V${y + MOCK.height - 1}" stroke="${T.line}"/>`,
    `<g transform="translate(${x + 16} ${y + 20}) scale(0.75)">${markInner()}</g>`,
    bar(x + 48, y + 30, 64, T.ink),
    bar(x + 18, y + 64, 40, T.faint, 6),
    nav,
  ].join('');
}

// Three columns: A calls B1 or B2, both reach C. The traced path A, B1, C is orange.
function mockMap(mx, y) {
  const w = 76;
  const h = 40;
  const col = [mx, mx + 98, mx + 196];
  const at = { a: [col[0], y + 150], b1: [col[1], y + 104], b2: [col[1], y + 196], c: [col[2], y + 150] };
  const node = ([nx, ny], label, hot) => `${box(nx, ny, w, h, { stroke: hot ? T.ink : T.line })}${bar(nx + 12, ny + 16, label, hot ? T.ink : T.faint)}`;
  const link = ([fx, fy], [tx, ty], hot) => {
    const sx = fx + w;
    const sy = fy + h / 2;
    const ey = ty + h / 2;
    const mid = (sx + tx) / 2;
    return `<path d="M${sx} ${sy}C${mid} ${sy} ${mid} ${ey} ${tx} ${ey}" fill="none" stroke="${hot ? T.accent : T.faint}" stroke-width="${hot ? 2 : 1.5}"/>`;
  };
  return [
    link(at.a, at.b2, false), link(at.b2, at.c, false), link(at.a, at.b1, true), link(at.b1, at.c, true),
    node(at.a, 44, true), node(at.b1, 36, true), node(at.b2, 40, false), node(at.c, 48, true),
    `<circle cx="${at.c[0]}" cy="${at.c[1] + h / 2}" r="4" fill="${T.accent}"/>`,
  ].join('');
}

function mockStepCard(mx, top, width) {
  const label = { font: 'sansSemibold', size: 14, tracking: -0.01 };
  const buttonW = Math.ceil(textWidth('Continue', label) + 32);
  const bx = mx + width - buttonW - 18;
  return [
    box(mx, top, width, 128),
    textPath('STEP 2 OF 5', { font: 'mono', size: 11, tracking: 0.08, x: mx + 18, y: top + 30, fill: T.quiet }),
    bar(mx + 18, top + 46, 168, T.ink, 10),
    bar(mx + 18, top + 68, 120, T.line),
    bar(mx + 18, top + 84, 92, T.line),
    `<rect x="${bx}" y="${top + 78}" width="${buttonW}" height="32" rx="6" fill="${T.accentFill}"/>`,
    textPath('Continue', { ...label, x: bx + buttonW / 2, y: top + 99, fill: T.surface, align: 'middle' }),
  ].join('');
}

function productMock() {
  const { x, y, width, height, side } = MOCK;
  const mx = x + side + 28;
  const inner = width - side - 56;
  return [
    box(x, y, width, height, { rx: 10 }),
    mockSidebar(MOCK),
    textPath('OVERVIEW / FLOWS', { font: 'mono', size: 11, tracking: 0.08, x: mx, y: y + 40, fill: T.quiet }),
    bar(mx, y + 54, 172, T.ink, 12),
    mockMap(mx, y),
    mockStepCard(mx, y + 284, inner),
  ].join('\n');
}

/** The GitHub social preview, 1280 x 640. */
export function socialCardSvg() {
  const left = 96;
  const body = [
    `<rect width="1280" height="640" fill="${T.canvas}"/>`,
    `<g transform="translate(${left} 96) scale(2)">${markInner()}</g>`,
    textPath('AGENT SKILL  ·  OPEN SOURCE', { font: 'mono', size: 15, tracking: 0.08, x: left, y: 226, fill: T.muted }),
    textPath(BRAND_NAME, { font: 'sansSemibold', size: 64, tracking: -0.045, x: left - 3, y: 300, fill: T.ink }),
    textPath(TAGLINE[0], { font: 'sans', size: 27, tracking: -0.015, x: left, y: 362, fill: T.body }),
    textPath(TAGLINE[1], { font: 'sans', size: 27, tracking: -0.015, x: left, y: 400, fill: T.body }),
    typePills(left, 452, 520),
    productMock(),
  ].join('\n');
  return svg(1280, 640, body, ` role="img" aria-label="${BRAND_NAME}: ${TAGLINE.join(' ')}"`);
}

/** The launcher icon: a rounded orange tile, the graph centered. */
export function appIconSvg() {
  return svg(512, 512, `<rect width="512" height="512" rx="112" fill="${T.accent}"/>\n<g transform="translate(0 -4) scale(16)">${graph(T.surface)}</g>`, ` role="img" aria-label="${BRAND_NAME}"`);
}

/** Maskable: full bleed, the graph inside the 80% safe circle. */
export function maskableIconSvg() {
  const scale = 13;
  return svg(512, 512, `<rect width="512" height="512" fill="${T.accent}"/>\n<g transform="translate(${256 - 16 * scale} ${256 - 16.25 * scale}) scale(${scale})">${graph(T.surface)}</g>`, ` role="img" aria-label="${BRAND_NAME}"`);
}
