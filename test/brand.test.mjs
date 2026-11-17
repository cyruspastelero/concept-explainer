import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// Guardrails from references/design-system.md. If one of these fails, the
// change is a design-system change: update that document in the same PR.

import { STYLE_ORDER } from '../scripts/lib/build.mjs';

// The stylesheet is template/styles/*.css joined in STYLE_ORDER (Playful last).
const stylesDir = new URL('../template/styles/', import.meta.url);
const css = STYLE_ORDER.map((f) => readFileSync(new URL(f, stylesDir), 'utf8')).join('\n');
const html = readFileSync(new URL('../template/explainer.html', import.meta.url), 'utf8');
const hubHtml = readFileSync(new URL('../template/library.html', import.meta.url), 'utf8');
const jsDir = new URL('../template/js/', import.meta.url);
// Comments may name banned things ("never innerHTML"); only code counts.
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
// Every module, including template/js/chapters/*.js, follows the same rules.
const jsFiles = readdirSync(jsDir, { recursive: true }).filter((f) => String(f).endsWith('.js')).map(String);
const jsSource = jsFiles.map((f) => readFileSync(new URL(f, jsDir), 'utf8')).join('\n');
// Strip per file, so an unusual "/*" in one module cannot swallow the next.
const js = jsFiles.map((f) => stripComments(readFileSync(new URL(f, jsDir), 'utf8'))).join('\n');
const cssCode = stripComments(css);

// Geist greys, the one orange (marks, fills, text), quiz right/wrong, and
// the six layer markers. Light values first, then the dark theme.
const ALLOWED_COLORS = new Set([
  '#fafafa', '#ffffff', '#fff', '#ebebeb', '#171717', '#4d4d4d', '#666666', '#8f8f8f', '#c9c9c9',
  '#fc5e32', '#d2430e', '#b83a0b', '#c2410c', '#297a3a', '#cb2a2f',
  '#111111', '#1a1a1a', '#2c2c2c', '#ededed', '#c4c4c4', '#a3a3a3', '#8c8c8c', '#5a5a5a',
  '#ff7043', '#c8410e', '#ff8a5c', '#62c073', '#ff6166',
  '#5b9a6e', '#5b86c4', '#4a5d8a', '#76739a', '#c39a3d', '#c0689a',
  // Playful, light: Duolingo-inspired greens, blues, greys, and the AA text variants.
  '#ffffff', '#e5e5e5', '#3c3c3c', '#4b4b4b', '#757575', '#afafaf', '#58cc02', '#3e8500', '#367400', '#2e6400', '#58a700', '#3c7d00',
  '#cc3333', '#d7ffb8', '#ffdfe0', '#042c60', '#1479b8', '#1cb0f6', '#ddf4ff', '#000437', '#e8ecff', '#a5ed6e',
  '#8a90c2', '#ffd66b', '#ffc800', '#ff86d0',
  // Playful, dark.
  '#131f24', '#202f36', '#37464f', '#f1f7fb', '#dce6ec', '#a7bac4', '#8fa3ad', '#52656d', '#93d333', '#79b933',
  '#ff7878', '#2b4022', '#4a2a2e', '#49c0f8', '#1a3a4a', '#0b1418',
  // Playful icon illustrations (icons.js), from the original kit.
  '#fff5d3', '#a56d00', '#ffd84d', '#cfcfcf',
]);
// The compound form is the phone bottom sheet: rounded top, square bottom edge.
const ALLOWED_RADII = new Set(['6px', 'var(--radius)', 'var(--radius-sm)', '4px', '8px', '12px', '9999px', '0', '50%', '1px', '2px', 'var(--radius) var(--radius) 0 0']);

// The Playful token block, and every Playful rule after it.
const PLAYFUL_START = cssCode.indexOf(':root[data-style="playful"] {');

// Split on commas that are not inside parentheses.
function splitTopLevel(value) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

// Every definition of a custom property, so var(--ring) can be checked too.
const customProps = [...cssCode.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)]
  .reduce((map, [, name, value]) => map.set(name, [...(map.get(name) || []), value.trim()]), new Map());

function shadowLayers(value, seen = new Set()) {
  return splitTopLevel(value).flatMap((layer) => {
    const ref = layer.match(/^var\((--[\w-]+)\)$/);
    if (!ref) return [layer];
    if (seen.has(ref[1])) return [];
    const definitions = customProps.get(ref[1]) || [];
    assert.ok(definitions.length, `box-shadow uses ${ref[1]}, which is never defined`);
    return definitions.flatMap((def) => shadowLayers(def, new Set([...seen, ref[1]])));
  });
}

test('box-shadow is only ever a ring: every shadow has blur 0', () => {
  const values = [...cssCode.matchAll(/box-shadow\s*:\s*([^;{}]+);/g)].map((m) => m[1].trim())
    .concat([...customProps.entries()].filter(([name]) => /^--ring/.test(name)).flatMap(([, defs]) => defs));
  assert.ok(values.length > 0, 'expected hairline rings in the stylesheet');
  const blurred = values.flatMap((value) => (value === 'none' ? [] : shadowLayers(value)))
    .filter((layer) => {
      const lengths = layer.replace(/var\([^)]*\)|rgb\([^)]*\)|#[0-9a-f]+|currentColor|transparent|inset/gi, ' ').trim().split(/\s+/).filter(Boolean);
      assert.ok(lengths.length >= 2 && lengths.length <= 4, `unreadable shadow "${layer}"`);
      return lengths.length >= 3 && parseFloat(lengths[2]) !== 0;
    });
  assert.deepEqual(blurred, [], `blurred shadows: ${blurred.join(' | ')}`);
  assert.doesNotMatch(cssCode, /text-shadow|drop-shadow/);
  assert.doesNotMatch(js, /boxShadow|box-shadow|drop-shadow|textShadow/);
});

test('no gradients', () => {
  assert.doesNotMatch(css, /gradient\(/);
  assert.doesNotMatch(js, /gradient/i);
});

test('every hex color is a design token value', () => {
  const used = new Set([...`${css}\n${js}`.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase()));
  const strays = [...used].filter((c) => !ALLOWED_COLORS.has(c));
  assert.deepEqual(strays, [], `colors outside the tokens: ${strays.join(', ')}`);
});

test('Clean is the default skin and the orange is its only accent', () => {
  assert.match(cssCode.slice(0, PLAYFUL_START), /:root \{[^}]*--accent: #fc5e32;/);
  const cleanPart = cssCode.slice(0, PLAYFUL_START);
  assert.doesNotMatch(cleanPart, /#58cc02|#1cb0f6|#ffc800/i, 'Playful colours stay in the Playful block');
});

test('every style file is listed in STYLE_ORDER and kept under 800 lines', () => {
  const files = readdirSync(stylesDir).filter((f) => f.endsWith('.css')).sort();
  assert.deepEqual(files, [...STYLE_ORDER].sort());
  STYLE_ORDER.forEach((f) => assert.ok(readFileSync(new URL(f, stylesDir), 'utf8').split('\n').length < 800, f));
  assert.equal(STYLE_ORDER.at(-1), 'playful.css', 'Playful overrides come last');
});

test('both skins exist, each with light and dark tokens', () => {
  assert.ok(PLAYFUL_START > 0, 'a :root[data-style="playful"] block');
  assert.match(cssCode, /:root\[data-style="playful"\]:not\(\[data-theme="light"\]\)/);
  assert.match(cssCode, /:root\[data-style="playful"\]\[data-theme="dark"\] \{/);
  assert.match(js, /function applyStyle\(/);
  assert.match(js, /'concept-explainer:style'/);
  assert.doesNotMatch(js.replace(/LEGACY_PREFIX = 'repo-explainer:'/, ''), /'repo-explainer:/, 'storage keys use concept-explainer:*');
  // The Playful footer credit is the one place that names its inspiration.
  const withoutCredit = js.replace(/const CREDIT_PLAYFUL = '[^\n]*';/, '');
  assert.match(js, /const CREDIT_PLAYFUL = '[^\n]*Duolingo[^\n]*';/);
  assert.doesNotMatch(withoutCredit, /Duolingo/, 'controls say Clean and Playful, never the brand');
});

// WCAG 2 contrast between two hex colours.
function contrast(a, b) {
  const lum = (hex) => {
    const full = hex.length === 4 ? hex.replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3') : hex;
    return [1, 3, 5].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('button text meets AA on the primary fill and its hover, in both styles and themes', () => {
  const block = (selector) => {
    const at = cssCode.indexOf(selector);
    assert.ok(at >= 0, `missing ${selector}`);
    return cssCode.slice(at, cssCode.indexOf('}', at));
  };
  const token = (text, name, fallback) => (text.match(new RegExp(`--${name}: (#[0-9a-fA-F]{3,6})`)) || [])[1] || fallback;
  const cleanLight = block(':root {');
  const looks = {
    'clean light': cleanLight,
    'clean dark': block(':root[data-theme="dark"] {'),
    'playful light': block(':root[data-style="playful"] {'),
    'playful dark': block(':root[data-style="playful"][data-theme="dark"] {'),
  };
  Object.entries(looks).forEach(([look, text]) => {
    const ink = token(text, 'on-accent', token(cleanLight, 'on-accent'));
    ['accent-fill', 'accent-hover'].forEach((name) => {
      const fill = token(text, name, token(cleanLight, name));
      const ratio = contrast(ink, fill);
      assert.ok(ratio >= 4.5, `${look}: button text ${ink} on --${name} ${fill} is ${ratio.toFixed(2)}:1, needs 4.5:1`);
    });
  });
});

test('border radii stay on the scale', () => {
  const radii = [...cssCode.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1].trim());
  const strays = radii.filter((r) => !ALLOWED_RADII.has(r));
  assert.deepEqual(strays, [], `unexpected radii: ${strays.join(', ')}`);
  assert.match(css, /--radius: 6px;/);
});

test('light, dark and system themes share the same tokens', () => {
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\)/);
  assert.match(css, /:root\[data-theme="dark"\] \{/);
  assert.match(js, /function applyTheme\(/);
  assert.match(js, /window\.localStorage/);
});

test('reduced motion disables every animation and transition', () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none !important;[\s\S]*?transition: none !important;/);
  assert.match(js, /function reducedMotion\(\)/);
});

test('no script source can close the page script early', () => {
  // All modules are inlined into one <script>; a literal closing tag in a
  // string would end it. Write it as <\\/script> instead.
  assert.doesNotMatch(jsSource, /<\/script/i);
});

test('choices use the pickers, never a native select', () => {
  // Native select popups show raw values in the OS look; picker.js is the system's own.
  assert.doesNotMatch(js, /h\('select'/);
  assert.match(js, /function listboxPicker\(/);
});

test('rendering never uses innerHTML or eval', () => {
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function\(/);
});

test('Clean uses Geist; Nunito and JetBrains Mono appear only for Playful', () => {
  assert.match(cssCode.slice(0, PLAYFUL_START), /--sans: "Geist"/);
  assert.match(cssCode.slice(0, PLAYFUL_START), /--mono: "Geist Mono"/);
  assert.doesNotMatch(cssCode.slice(0, PLAYFUL_START), /Nunito|JetBrains/i);
  assert.match(cssCode.slice(PLAYFUL_START), /--sans: "Nunito"/);
  assert.doesNotMatch(js.replace(/const CREDIT_PLAYFUL = '[^\n]*';/, ''), /Nunito|JetBrains/i);
  // Fonts are self-hosted by the library build; templates load nothing remote,
  // and every stack ends in system fonts for standalone pages.
  [html, hubHtml].forEach((page) => assert.doesNotMatch(page, /fonts\.googleapis|fonts\.gstatic/));
  [...cssCode.matchAll(/--(sans|mono): ([^;]+);/g)].forEach(([, kind, stack]) => {
    assert.match(stack, kind === 'sans' ? /system-ui[^;]*sans-serif$/ : /ui-monospace[^;]*monospace$/, `${kind} stack ends in system fonts: ${stack}`);
  });
});

test('links from data go through the http(s) allowlist', () => {
  assert.doesNotMatch(js, /href: change\.url/);
  assert.match(js, /href: safeUrl\(/);
});

test('the explainer and the hub carry the context slot', () => {
  [html, hubHtml].forEach((page) => assert.match(page, /<script type="application\/json" id="explainer-context">__CONTEXT__<\/script>/));
});

// Overflow guardrails. Long identifiers and paths must wrap inside their box;
// test/fixtures/stress.explainer.json is the visual check for this.
test('long words wrap instead of stretching their box', () => {
  assert.match(css, /body \{[^}]*overflow-wrap: break-word;/);
});

test('grid tracks can shrink below their longest word', () => {
  const bare = [...css.matchAll(/grid-template-columns:\s*([^;]+);/g)]
    .map((m) => m[1])
    .filter((value) => /(^|[\s(,])1fr/.test(value.replace(/minmax\((?:[^()]|\([^()]*\))*\)/g, '')));
  assert.deepEqual(bare, [], `use minmax(0, 1fr) instead of 1fr: ${bare.join(' | ')}`);
});

test('no inner vertical scroll areas inside the content', () => {
  const scrollers = [...cssCode.matchAll(/([^{}]+)\{[^}]*overflow-y:\s*(auto|scroll)/g)].map((m) => m[1].trim());
  const allowed = scrollers.filter((sel) => !/\.side\b|\.sheet\b/.test(sel));
  assert.deepEqual(allowed, [], `only the sidebar and the menu sheet may scroll on their own: ${allowed.join(' | ')}`);
});
