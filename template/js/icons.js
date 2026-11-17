// Hairline icons for each component kind: one stroke weight, no fills,
// drawn in currentColor so they follow the text colour and the theme.
// scripts/lib/assets.mjs runs this file on its own with a string `s()`,
// so it must not use anything but `s` from the other modules.

// Layer colours stay in the data contract but render only as small markers
// and thin bars. `ink` is the marker; `wash` and `text` keep the old shape.
const LAYER_MARKERS = {
  green: '#5b9a6e',
  blue: '#5b86c4',
  navy: '#4a5d8a',
  midnight: '#76739a',
  yellow: '#c39a3d',
  pink: '#c0689a',
};

const PALETTE = Object.fromEntries(Object.entries(LAYER_MARKERS)
  .map(([name, hex]) => [name, { ink: hex, wash: hex, text: hex }]));

// The Playful style shows the original saturated layer colours.
const PLAYFUL_LAYERS = {
  green: '#58cc02', blue: '#1cb0f6', navy: '#042c60', midnight: '#000437', yellow: '#ffc800', pink: '#ff86d0',
};

function paletteFor(name) {
  return PALETTE[name] || PALETTE.green;
}

// Inline custom properties for a layer marker; CSS picks one per style.
function layerStyle(name) {
  const key = PALETTE[name] ? name : 'green';
  return `--layer-clean:${PALETTE[key].ink};--layer-fun:${PLAYFUL_LAYERS[key]}`;
}

const ICON_SHAPES = {
  user: () => [
    s('circle', { cx: 12, cy: 8, r: 3.5 }),
    s('path', { d: 'M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7' }),
  ],
  ui: () => [
    s('rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }),
    s('path', { d: 'M3 8.5h18M7 12.5h5M7 16h9' }),
  ],
  mobile: () => [
    s('rect', { x: 7, y: 2.5, width: 10, height: 19, rx: 2 }),
    s('path', { d: 'M11 18.5h2' }),
  ],
  api: () => [
    s('path', { d: 'M4 9h15M15.5 5.5L19 9l-3.5 3.5' }),
    s('path', { d: 'M20 15H5M8.5 11.5L5 15l3.5 3.5' }),
  ],
  service: () => [
    s('path', { d: 'M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z' }),
    s('circle', { cx: 12, cy: 12, r: 2.5 }),
  ],
  db: () => [
    s('ellipse', { cx: 12, cy: 6, rx: 7, ry: 2.5 }),
    s('path', { d: 'M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6' }),
    s('path', { d: 'M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5' }),
  ],
  queue: () => [
    s('rect', { x: 3, y: 7, width: 4.5, height: 10, rx: 1 }),
    s('rect', { x: 9.75, y: 7, width: 4.5, height: 10, rx: 1 }),
    s('rect', { x: 16.5, y: 7, width: 4.5, height: 10, rx: 1 }),
  ],
  cache: () => [
    s('path', { d: 'M13 3L5 13.5h6L10 21l8-10.5h-6z' }),
  ],
  external: () => [
    s('path', { d: 'M7 18.5a4 4 0 01-.6-7.96A5.5 5.5 0 0117 9a4.5 4.5 0 01.5 9.5z' }),
  ],
  job: () => [
    s('circle', { cx: 12, cy: 12, r: 8.5 }),
    s('path', { d: 'M12 7.5V12l3 2' }),
  ],
  cli: () => [
    s('rect', { x: 3, y: 4.5, width: 18, height: 15, rx: 2 }),
    s('path', { d: 'M7 10l3 2-3 2M12.5 15h4.5' }),
  ],
  auth: () => [
    s('rect', { x: 5, y: 10.5, width: 14, height: 10, rx: 2 }),
    s('path', { d: 'M8 10.5V7.5a4 4 0 018 0v3M12 14.5v2' }),
  ],
  storage: () => [
    s('rect', { x: 3, y: 4, width: 18, height: 5, rx: 1 }),
    s('path', { d: 'M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9M10 13h4' }),
  ],
  library: () => [
    s('rect', { x: 3.5, y: 4, width: 4, height: 16, rx: 1 }),
    s('rect', { x: 9.5, y: 6, width: 4, height: 14, rx: 1 }),
    s('path', { d: 'M15.4 7.2l3.3-1 3 13-3.3 1z' }),
  ],
  folder: () => [
    s('path', { d: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z' }),
  ],
  file: () => [
    s('path', { d: 'M6 3h8l4 4v14H6z' }),
    s('path', { d: 'M14 3v4h4' }),
  ],
  robot: () => [
    s('rect', { x: 4.5, y: 8, width: 15, height: 11, rx: 2.5 }),
    s('path', { d: 'M12 8V5' }),
    s('circle', { cx: 12, cy: 4, r: 1 }),
    s('circle', { cx: 9, cy: 13.5, r: 1.2 }),
    s('circle', { cx: 15, cy: 13.5, r: 1.2 }),
  ],
  trophy: () => [
    s('path', { d: 'M8 4h8v5a4 4 0 01-8 0z' }),
    s('path', { d: 'M8 6H5.5a2.5 2.5 0 002.7 3.6M16 6h2.5a2.5 2.5 0 01-2.7 3.6M12 13v4M8.5 20h7M10 17h4v3h-4z' }),
  ],
  // Interface glyphs (not node kinds).
  system: () => [
    s('rect', { x: 3.5, y: 4.5, width: 17, height: 11.5, rx: 1.8 }),
    s('path', { d: 'M9 20h6M12 16v4' }),
  ],
  light: () => [
    s('circle', { cx: 12, cy: 12, r: 3.9 }),
    s('path', { d: 'M12 2.7v2.1M12 19.2v2.1M2.7 12h2.1M19.2 12h2.1M5.4 5.4l1.5 1.5M17.1 17.1l1.5 1.5M5.4 18.6l1.5-1.5M17.1 6.9l1.5-1.5' }),
  ],
  dark: () => [
    s('path', { d: 'M19.2 14.4A7.8 7.8 0 019.6 4.8a7.8 7.8 0 109.6 9.6z' }),
  ],
  settings: () => [
    s('circle', { cx: 12, cy: 12, r: 3 }),
    s('path', { d: 'M12 2.8l1.6 2.3 2.7-.6.6 2.7 2.3 1.6-1.2 2.5 1.2 2.5-2.3 1.6-.6 2.7-2.7-.6L12 21.2l-1.6-2.3-2.7.6-.6-2.7-2.3-1.6 1.2-2.5-1.2-2.5 2.3-1.6.6-2.7 2.7.6z' }),
  ],
  download: () => [
    s('path', { d: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14' }),
  ],
  upload: () => [
    s('path', { d: 'M12 15.5V4.5M7.5 9L12 4.5 16.5 9M5 19.5h14' }),
  ],
  library_shelf: () => [
    s('rect', { x: 3.5, y: 3.5, width: 7, height: 7, rx: 1 }),
    s('rect', { x: 13.5, y: 3.5, width: 7, height: 7, rx: 1 }),
    s('rect', { x: 3.5, y: 13.5, width: 7, height: 7, rx: 1 }),
    s('rect', { x: 13.5, y: 13.5, width: 7, height: 7, rx: 1 }),
  ],
};

// The Playful set: flat, filled shapes on a 32 grid (the original kit).
const PLAYFUL_SHAPES = {
  user: () => [
    s('circle', { cx: 16, cy: 11, r: 6, fill: '#ffc800' }),
    s('path', { d: 'M5 29c0-6.5 4.9-11 11-11s11 4.5 11 11z', fill: '#1cb0f6' }),
  ],
  ui: () => [
    s('rect', { x: 3, y: 5, width: 26, height: 22, rx: 4, fill: '#1cb0f6' }),
    s('rect', { x: 6, y: 11, width: 20, height: 13, rx: 2, fill: '#fff' }),
    s('circle', { cx: 7.5, cy: 8, r: 1.3, fill: '#fff' }),
    s('circle', { cx: 11.5, cy: 8, r: 1.3, fill: '#fff' }),
    s('rect', { x: 9, y: 14, width: 9, height: 3, rx: 1.5, fill: '#58cc02' }),
    s('rect', { x: 9, y: 19, width: 14, height: 2, rx: 1, fill: '#e5e5e5' }),
  ],
  mobile: () => [
    s('rect', { x: 8, y: 2, width: 16, height: 28, rx: 4, fill: '#042c60' }),
    s('rect', { x: 10.5, y: 6, width: 11, height: 18, rx: 2, fill: '#fff' }),
    s('rect', { x: 12.5, y: 9, width: 7, height: 3, rx: 1.5, fill: '#58cc02' }),
    s('circle', { cx: 16, cy: 27, r: 1.3, fill: '#fff' }),
  ],
  api: () => [
    s('rect', { x: 4, y: 9, width: 24, height: 14, rx: 7, fill: '#58cc02' }),
    s('rect', { x: 9, y: 4, width: 3, height: 6, rx: 1.5, fill: '#58a700' }),
    s('rect', { x: 20, y: 4, width: 3, height: 6, rx: 1.5, fill: '#58a700' }),
    s('path', { d: 'M11 16h10M18 13l3 3-3 3', stroke: '#fff', 'stroke-width': 2.5, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    s('rect', { x: 14.5, y: 23, width: 3, height: 6, rx: 1.5, fill: '#58a700' }),
  ],
  service: () => [
    s('path', { d: 'M16 2l12 7v14l-12 7-12-7V9z', fill: '#042c60' }),
    s('circle', { cx: 16, cy: 16, r: 5.5, fill: '#fff' }),
    s('circle', { cx: 16, cy: 16, r: 2.5, fill: '#58cc02' }),
  ],
  db: () => [
    s('path', { d: 'M5 8v16c0 2.8 4.9 5 11 5s11-2.2 11-5V8z', fill: '#1cb0f6' }),
    s('ellipse', { cx: 16, cy: 8, rx: 11, ry: 5, fill: '#ddf4ff', stroke: '#1cb0f6', 'stroke-width': 2 }),
    s('path', { d: 'M5 16c0 2.8 4.9 5 11 5s11-2.2 11-5', stroke: '#fff', 'stroke-width': 2, fill: 'none' }),
  ],
  queue: () => [
    s('rect', { x: 3, y: 9, width: 7, height: 14, rx: 3, fill: '#ff86d0' }),
    s('rect', { x: 12.5, y: 9, width: 7, height: 14, rx: 3, fill: '#ff86d0', opacity: 0.75 }),
    s('rect', { x: 22, y: 9, width: 7, height: 14, rx: 3, fill: '#ff86d0', opacity: 0.45 }),
  ],
  cache: () => [
    s('circle', { cx: 16, cy: 16, r: 13, fill: '#fff5d3' }),
    s('path', { d: 'M18 4L8 18h7l-2 10 11-15h-7z', fill: '#ffc800', stroke: '#a56d00', 'stroke-width': 1.2, 'stroke-linejoin': 'round' }),
  ],
  external: () => [
    s('path', { d: 'M9 25a6 6 0 01-.8-11.9A8 8 0 0123.6 11 6.5 6.5 0 0124 25z', fill: '#1cb0f6' }),
    s('path', { d: 'M12 19h8', stroke: '#fff', 'stroke-width': 2.5, 'stroke-linecap': 'round' }),
  ],
  job: () => [
    s('circle', { cx: 16, cy: 16, r: 13, fill: '#58cc02' }),
    s('circle', { cx: 16, cy: 16, r: 9.5, fill: '#fff' }),
    s('path', { d: 'M16 10v6.5l4 2.5', stroke: '#042c60', 'stroke-width': 2.5, fill: 'none', 'stroke-linecap': 'round' }),
  ],
  cli: () => [
    s('rect', { x: 3, y: 5, width: 26, height: 22, rx: 4, fill: '#000437' }),
    s('path', { d: 'M8 12l4 4-4 4', stroke: '#a5ed6e', 'stroke-width': 2.5, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    s('path', { d: 'M15 21h8', stroke: '#fff', 'stroke-width': 2.5, 'stroke-linecap': 'round' }),
  ],
  auth: () => [
    s('path', { d: 'M10 14v-3a6 6 0 0112 0v3', stroke: '#042c60', 'stroke-width': 3, fill: 'none' }),
    s('rect', { x: 6, y: 13, width: 20, height: 16, rx: 4, fill: '#ffc800' }),
    s('circle', { cx: 16, cy: 20, r: 2.5, fill: '#042c60' }),
    s('rect', { x: 15, y: 21, width: 2, height: 4, rx: 1, fill: '#042c60' }),
  ],
  storage: () => [
    s('path', { d: 'M3 9a3 3 0 013-3h7l3 3h10a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3z', fill: '#ffc800' }),
    s('rect', { x: 3, y: 12, width: 26, height: 15, rx: 3, fill: '#ffd84d' }),
  ],
  library: () => [
    s('rect', { x: 4, y: 5, width: 7, height: 23, rx: 2, fill: '#58cc02' }),
    s('rect', { x: 12.5, y: 8, width: 7, height: 20, rx: 2, fill: '#1cb0f6' }),
    s('rect', { x: 21, y: 4, width: 7, height: 24, rx: 2, fill: '#ff86d0', transform: 'rotate(8 24.5 16)' }),
  ],
  folder: () => [
    s('path', { d: 'M3 9a3 3 0 013-3h7l3 3h10a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3z', fill: '#1cb0f6' }),
  ],
  file: () => [
    s('path', { d: 'M8 3h11l6 6v19a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1z', fill: '#e5e5e5' }),
    s('path', { d: 'M19 3v6h6', fill: '#cfcfcf' }),
  ],
  robot: () => [
    s('rect', { x: 6, y: 9, width: 20, height: 17, rx: 5, fill: '#1cb0f6' }),
    s('circle', { cx: 12, cy: 17, r: 2.5, fill: '#fff' }),
    s('circle', { cx: 20, cy: 17, r: 2.5, fill: '#fff' }),
    s('rect', { x: 15, y: 3, width: 2, height: 6, fill: '#042c60' }),
    s('circle', { cx: 16, cy: 3, r: 2, fill: '#ffc800' }),
  ],
  trophy: () => [
    s('path', { d: 'M9 4h14v7a7 7 0 01-14 0z', fill: '#ffc800' }),
    s('path', { d: 'M9 6H5a4 4 0 004 6M23 6h4a4 4 0 01-4 6', stroke: '#ffc800', 'stroke-width': 2.5, fill: 'none' }),
    s('rect', { x: 14, y: 17, width: 4, height: 6, fill: '#a56d00' }),
    s('rect', { x: 9, y: 23, width: 14, height: 5, rx: 2, fill: '#58cc02' }),
  ],
};

const KIND_ALIASES = { frontend: 'ui', web: 'ui', page: 'ui', server: 'service', worker: 'job', cron: 'job', database: 'db', bucket: 'storage', thirdparty: 'external', package: 'library' };

// In a page, each icon carries both sets and the style picks one in CSS, so
// switching style needs no re-render. Exported files (no document) get the
// hairline set only.
const HAS_DOCUMENT = typeof document !== 'undefined';

function icon(kind, attrs = {}) {
  const key = ICON_SHAPES[kind] ? kind : KIND_ALIASES[kind] || 'service';
  const clean = ICON_SHAPES[key]();
  const playful = PLAYFUL_SHAPES[key];
  const children = HAS_DOCUMENT && playful
    ? [s('g', { class: 'ico-clean' }, clean), s('g', { class: 'ico-playful', transform: 'scale(0.75)', stroke: 'none' }, playful())]
    : clean;
  return s('svg', {
    viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false', ...attrs,
  }, children);
}

// The mark: an orange tile holding a tiny three-part map, drawn as hairlines.
// Playful pages show the original green tile instead.
function brandMarkClean() {
  return [
    s('rect', { class: 'brand-mark-tile', x: 2, y: 2, width: 28, height: 28, rx: 6, fill: '#fc5e32' }),
    s('path', { d: 'M10.5 11h11M10.5 11l5.5 10.5M21.5 11L16 21.5', fill: 'none', stroke: '#ffffff', 'stroke-width': 1.75, 'stroke-linecap': 'round' }),
    s('circle', { cx: 10.5, cy: 11, r: 2.5, fill: '#ffffff' }),
    s('circle', { cx: 21.5, cy: 11, r: 2.5, fill: '#ffffff' }),
    s('circle', { cx: 16, cy: 21.5, r: 2.5, fill: '#ffffff' }),
  ];
}

function brandMarkPlayful() {
  return [
    s('rect', { x: 2, y: 2, width: 28, height: 28, rx: 9, fill: '#58cc02' }),
    s('path', { d: 'M9 21l5-10 4 7 2-3 3 6', stroke: '#fff', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    s('circle', { cx: 23, cy: 11, r: 2.5, fill: '#ffc800' }),
  ];
}

function brandMark() {
  const children = HAS_DOCUMENT
    ? [s('g', { class: 'ico-clean' }, brandMarkClean()), s('g', { class: 'ico-playful' }, brandMarkPlayful())]
    : brandMarkClean();
  return s('svg', { viewBox: '0 0 32 32', 'aria-hidden': 'true', focusable: 'false', class: 'brand-mark' }, children);
}
