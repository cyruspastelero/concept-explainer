import { DOM_LAYER } from '../scripts/lib/build.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// The design-system rules (references/design-system.md, test/brand.test.mjs)
// applied to the chapter modules and their stylesheets, whether or not the
// build lists them yet. Plus: they share one function scope with every other
// module, so their top-level names must be prefixed and unique.

const jsDir = new URL('../template/js/', import.meta.url);
const chaptersDir = new URL('chapters/', jsDir);
const stylesDir = new URL('../template/styles/', import.meta.url);
const STYLES = ['chapters.css', 'visuals.css'];
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const chapterFiles = readdirSync(chaptersDir).filter((f) => f.endsWith('.js')).sort();
const sources = Object.fromEntries(chapterFiles.map((f) => [f, readFileSync(new URL(f, chaptersDir), 'utf8')]));
const js = stripComments(Object.values(sources).join('\n'));
const cssFiles = Object.fromEntries(STYLES.map((f) => [f, readFileSync(new URL(f, stylesDir), 'utf8')]));
const css = stripComments(Object.values(cssFiles).join('\n'));
const ALLOWED_RADII = new Set(['6px', 'var(--radius)', 'var(--radius-sm)', '4px', '8px', '12px', '9999px', '0', '50%', '1px', '2px']);

test('the chapter modules exist', () => {
  ['kit.js', 'viz-core.js', 'viz-linear.js', 'viz-graph.js', 'viz-grid.js', 'visuals.js', 'context.js', 'diff.js', 'options.js', 'risks.js', 'rollout.js', 'timeline.js', 'code.js', 'hooks.js']
    .forEach((f) => assert.ok(chapterFiles.includes(f), f));
});

test('colours come from tokens only: no hex values in chapter scripts or styles', () => {
  assert.doesNotMatch(js, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(css, /\brgb\(|\bhsl\(|\boklch\(/, 'no raw colour functions either');
});

test('no gradients, no blurred shadows, no text or drop shadows', () => {
  assert.doesNotMatch(`${css}\n${js}`, /gradient/i);
  assert.doesNotMatch(css, /text-shadow|drop-shadow/);
  assert.doesNotMatch(js, /boxShadow|box-shadow|drop-shadow|textShadow/);
  [...css.matchAll(/box-shadow\s*:\s*([^;{}]+);/g)].map((m) => m[1].trim()).forEach((value) => {
    value.split(/,(?![^(]*\))/).forEach((layer) => {
      const lengths = layer.replace(/var\([^)]*\)|inset|currentColor|transparent/gi, ' ').trim().split(/\s+/).filter(Boolean);
      assert.ok(lengths.length <= 2 || parseFloat(lengths[2]) === 0, `blurred shadow: ${layer}`);
    });
  });
});

test('radii stay on the scale', () => {
  const radii = [...css.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1].trim());
  assert.deepEqual(radii.filter((r) => !ALLOWED_RADII.has(r)), []);
  const rx = [...css.matchAll(/\brx:\s*([^;]+);/g)].map((m) => m[1].trim());
  assert.deepEqual(rx.filter((r) => !['var(--radius)', 'var(--radius-sm)'].includes(r)), [], 'SVG corners use the radius tokens');
});

test('grid tracks can shrink and nothing scrolls inside the content', () => {
  const bare = [...css.matchAll(/grid-template-columns:\s*([^;]+);/g)].map((m) => m[1])
    .filter((value) => /(^|[\s(,])1fr/.test(value.replace(/minmax\((?:[^()]|\([^()]*\))*\)/g, '')));
  assert.deepEqual(bare, []);
  assert.doesNotMatch(css, /overflow-y:\s*(auto|scroll)/);
  assert.doesNotMatch(css, /overflow:\s*(auto|scroll)/);
});

test('motion plays once and goes through the reduced-motion helpers', () => {
  assert.doesNotMatch(css, /\binfinite\b/);
  assert.doesNotMatch(js, /\.animate\(|setInterval|requestAnimationFrame\(function loop/);
  assert.doesNotMatch(js, /s\('animate|s\('animateMotion/);
  assert.match(js, /motion\(|riseIn\(/);
});

test('Playful rules are scoped and Clean fonts stay Geist', () => {
  assert.doesNotMatch(css, /Nunito|JetBrains/i);
  assert.doesNotMatch(js, /Nunito|JetBrains|Duolingo/i);
  [...css.matchAll(/([^{}]*data-style[^{}]*)\{/g)].forEach(([, selector]) => {
    assert.match(selector.trim(), /^:root\[data-style="playful"\]/, `playful rules start at :root: ${selector.trim()}`);
  });
});

test('rendering never builds markup from strings', () => {
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function\(/);
  assert.doesNotMatch(Object.values(sources).join('\n'), /<\/script/i);
  assert.doesNotMatch(js, /h\('select'/);
  // Links: either an in-page hash or a data url through the http(s) allowlist.
  [...js.matchAll(/href:\s*([^,}]+)/g)].map((m) => m[1].trim()).forEach((value) => {
    assert.match(value, /^safeUrl\(|^`#/, `href from ${value}`);
  });
});

test('files stay small', () => {
  Object.entries({ ...sources, ...cssFiles }).forEach(([f, source]) => assert.ok(source.split('\n').length < 800, f));
});

test('top-level names are prefixed and do not collide with the other modules', () => {
  const declared = (source) => [...stripComments(source).matchAll(/^(?:function\s+([\w$]+)|const\s+([\w$]+)\s*=)/gm)].map((m) => m[1] || m[2]);
  const mine = Object.values(sources).flatMap(declared);
  const strays = mine.filter((name) => !/^(ch|viz|CH_|VIZ_|VIZ)[A-Z_]/.test(name) && !/^(VIZ|VIZ_)$/.test(name));
  assert.deepEqual(strays, [], 'prefix chapter names with ch / viz (CH_ / VIZ_ for constants)');
  assert.equal(new Set(mine).size, mine.length, 'no name declared twice in the chapter modules');
  const others = readdirSync(jsDir).filter((f) => f.endsWith('.js')).flatMap((f) => declared(readFileSync(new URL(f, jsDir), 'utf8')));
  assert.deepEqual(mine.filter((name) => others.includes(name)), [], 'no clash with dom.js, app.js and the rest');
});

test('chapter modules depend on the shared DOM layer only, not on the chapters other modules own', () => {
  const topLevel = (file) => [...readFileSync(new URL(file, jsDir), 'utf8').matchAll(/^function\s+([\w$]+)/gm)].map((m) => m[1]);
  const dom = new Set(DOM_LAYER.flatMap(topLevel));
  const elsewhere = readdirSync(jsDir).filter((f) => f.endsWith('.js') && !DOM_LAYER.includes(f)).flatMap(topLevel).filter((name) => !dom.has(name));
  const called = new Set([...js.matchAll(/(?<![.\w$])([a-zA-Z][\w$]*)\(/g)].map((m) => m[1]));
  // Names the chapter modules define themselves (locals, methods) are theirs.
  const own = new Set([...js.matchAll(/(?:const|let|function)\s+([\w$]+)/g), ...js.matchAll(/^\s*([\w$]+)\([^()]*\)\s*\{/gm)].map((m) => m[1]));
  assert.deepEqual(elsewhere.filter((name) => called.has(name) && !own.has(name)), [], 'call only dom.js helpers, so app.js, map.js and the rest can change freely');
});

test('top-level functions stay under 50 lines (layout apart from drawing and wiring)', () => {
  const long = Object.entries(sources).flatMap(([file, source]) => {
    const lines = source.split('\n');
    const found = [];
    let open = null;
    lines.forEach((line, i) => {
      const start = line.match(/^function ([\w$]+)\(/);
      if (start) open = { name: start[1], at: i };
      else if (open && /^}/.test(line)) {
        if (i - open.at + 1 > 50) found.push(`${file}: ${open.name} (${i - open.at + 1} lines)`);
        open = null;
      }
    });
    return found;
  });
  assert.deepEqual(long, []);
});
