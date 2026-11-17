import { createHash } from 'node:crypto';
import { buildHash, explainerKey, sectionsFor } from './sections.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shownChapters } from './chapters.mjs';
import { pageEnums } from './page-enums.mjs';

export const TEMPLATE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'template');
export const FONTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fonts');

// Order matters only for readability; all modules share one function scope.
// Shared helpers every page loads first, in this order. Tests load the same list.
export const DOM_LAYER = Object.freeze(['dom.js', 'truncate.js', 'theme.js']);
// Files that together make one feature; tests read them as one source.
export const SETTINGS_FILES = Object.freeze(['settings.js', 'settings-defaults.js', 'share.js']);
export const HUB_FILES = Object.freeze(['hub-search.js', 'hub-thumbs.js', 'hub-insights.js', 'library.js']);
// The learning loop's page half: the recorder, then its controls (both pages).
export const LEARNING_FILES = Object.freeze(['signals.js', 'feedback.js']);
export const SCRIPT_ORDER = [...DOM_LAYER, 'icons.js', 'map.js', 'models.js', 'flow.js', 'changes.js', 'lessons.js', 'chapters/kit.js', 'chapters/viz-core.js', 'chapters/viz-linear.js', 'chapters/viz-graph.js', 'chapters/viz-grid.js', 'chapters/visuals.js', 'chapters/context.js', 'chapters/diff.js', 'chapters/options.js', 'chapters/risks.js', 'chapters/rollout.js', 'chapters/timeline.js', 'chapters/code.js', 'chapters/hooks.js', 'picker.js', ...SETTINGS_FILES, ...LEARNING_FILES, 'sections.js', 'app.js'];
const LIBRARY_SCRIPT_ORDER = [...DOM_LAYER, 'icons.js', 'picker.js', ...SETTINGS_FILES, ...LEARNING_FILES, ...HUB_FILES];
// Stylesheets in template/styles/, joined in cascade order. A template folder
// without styles/ (older custom templates) falls back to one styles.css.
export const STYLE_ORDER = ['base.css', 'shell.css', 'views.css', 'diagrams.css', 'lessons.css', 'chapters.css', 'visuals.css', 'learning.css', 'hub.css', 'kit.css', 'playful.css'];

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/**
 * Serialise data so it can never close the surrounding <script> tag.
 * @param {unknown} data
 * @returns {string}
 */
export function serializeForScript(data) {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .split(String.fromCharCode(0x2028)).join('\\u2028')
    .split(String.fromCharCode(0x2029)).join('\\u2029');
}

function readTemplate(templateDir, order = SCRIPT_ORDER, page = 'explainer.html') {
  const read = (file) => {
    try {
      return readFileSync(join(templateDir, file), 'utf8');
    } catch (error) {
      throw new Error(`read template ${file}: ${error.message}`);
    }
  };
  const scripts = order.map((file) => `// ---- ${file} ----\n${read(join('js', file))}`).join('\n');
  const styles = existsSync(join(templateDir, 'styles'))
    ? STYLE_ORDER.map((file) => `/* ---- ${file} ---- */\n${read(join('styles', file))}`).join('\n')
    : read('styles.css');
  return { html: read(page), styles, scripts };
}

// One pass over the template, so text inserted for one placeholder (say, a
// title containing "__EXPLAINER_DATA__") is never scanned for another.
// A template without a placeholder (say, no context tag yet) simply skips it.
const PLACEHOLDER_PATTERN = /__TITLE__|__DESCRIPTION__|\/\*__STYLES__\*\/|\/\*__SCRIPTS__\*\/|__EXPLAINER_DATA__|__CONTEXT__/g;

// Inside an inline <script>, the text "</script" ends the block, even in a JS
// string. "<\/script" means the same thing to JS and cannot end the block.
// Likewise "</style" inside the stylesheet.
export function inlineSafe(source, tag) {
  return source.replace(new RegExp(`<\\/(${tag})`, 'gi'), '<\\/$1');
}

// Content Security Policy, fixed at build time and carried by the page in a
// meta tag, so it holds from file:// too. Only the page's own inline scripts
// and styles run, by hash; fonts come from the library folder; nothing
// remote. Style attributes the page's code sets (CSS variables, positions)
// cannot be hashed, so style-src-attr allows them; that permits no style
// element and no script. frame-ancestors is ignored in a meta tag, so
// library serve adds it as a header.
const EXECUTABLE_SCRIPT = /<script(?![^>]*\b(?:src|type)=)(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
const INLINE_STYLE = /<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi;
const CSP_META = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/;
const STRICTEST = "default-src 'none'";
const sha256 = (text) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

export function cspFor(html) {
  const scripts = [...html.matchAll(EXECUTABLE_SCRIPT)].map((m) => sha256(m[1]));
  const styles = [...html.matchAll(INLINE_STYLE)].map((m) => sha256(m[1]));
  return [
    STRICTEST,
    `script-src ${scripts.join(' ') || "'none'"}`,
    `style-src ${styles.join(' ') || "'none'"}`,
    "style-src-attr 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    // The installable app: its service worker and manifest come from this server.
    "worker-src 'self'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

/** The policy a built page carries, or the strictest one if it carries none. */
export function pageCspFrom(html) {
  const match = String(html).match(CSP_META);
  return match ? match[1] : STRICTEST;
}

// Data is escaped and the title goes through escapeHtml, so the first
// <meta charset> is always the template's own, in the head.
function withCsp(html) {
  const tag = `<meta http-equiv="Content-Security-Policy" content="${cspFor(html)}">`;
  return html.replace(/<meta charset="utf-8">\n?/i, (charset) => `${charset.trimEnd()}\n${tag}\n`);
}

// Self-hosted fonts (fonts/, SIL OFL) for pages in the library, which has a
// fonts/ folder beside the hub. Standalone pages get none and fall back to
// system fonts. The base is relative and checked, so no URL can be injected.
const FONT_BASE = /^(\.\.\/)*fonts\/$/;

export function fontFaceCss(base) {
  if (!FONT_BASE.test(base)) throw new Error(`build: font base "${base}" must look like fonts/ or ../../fonts/`);
  const { fonts } = JSON.parse(readFileSync(join(FONTS_DIR, 'fonts.json'), 'utf8'));
  return fonts.map((f) => `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};font-display:swap;src:url('${base}${f.file}') format('woff2');unicode-range:${f.unicodeRange}}`).join('\n');
}

// The @font-face rules go first in the inline stylesheet, before the template's own.
function assemble({ html, styles, scripts }, title, data, bootCall = '', description = '', context = {}, fontBase = null) {
  const css = fontBase ? `${fontFaceCss(fontBase)}\n${styles}` : styles;
  const values = {
    __TITLE__: escapeHtml(title),
    __DESCRIPTION__: escapeHtml(description),
    '/*__STYLES__*/': inlineSafe(css, 'style'),
    '/*__SCRIPTS__*/': inlineSafe(`(() => {\n'use strict';\n${scripts}\n${bootCall}\n})();`, 'script'),
    __EXPLAINER_DATA__: serializeForScript(data),
    __CONTEXT__: serializeForScript(context),
  };
  return withCsp(html.replace(PLACEHOLDER_PATTERN, (match) => values[match]));
}

/**
 * Render explainer data into one self-contained HTML file.
 * @param {object} data validated explainer data
 * @param {{ templateDir?: string, context?: { libraryHref?: string, slug?: string } }} [options]
 *   `context` fills the page's explainer-context tag; `{}` for a standalone page.
 * @returns {string}
 */
export function buildExplainer(data, options = {}) {
  const parts = readTemplate(options.templateDir || TEMPLATE_DIR);
  const title = data && data.meta && data.meta.title ? `${data.meta.title} · Concept Explainer` : 'Concept Explainer';
  const description = data && data.meta && typeof data.meta.summary === 'string' ? data.meta.summary : '';
  // The page reads which chapters to show and the settings choices from its
  // context, so the rule and the lists live in one place (scripts/lib). The
  // learning loop adds which sections this build has, which build it is, and
  // how readers' signals name it. Every page carries them, standalone too.
  const given = options.context || {};
  const context = {
    ...given, chapters: shownChapters(data), enums: pageEnums(),
    sections: sectionsFor(data), build: buildHash(data), key: explainerKey(data, given.slug),
  };
  return assemble(parts, title, data, 'boot();', description, context, options.fontBase);
}

/**
 * Render the library hub: every explainer in the library, searchable.
 * The page reads `{ style, manifest, index }` from its explainer-data tag.
 * @param {object} manifest library.json contents
 * @param {object[]} searchIndex entries from search-index.mjs
 * @param {{ templateDir?: string, style?: string, kitHref?: string }} [options] `style` is the hub skin, 'clean' by default;
 *   `kitHref` links the hub to the kit page
 * @returns {string}
 */
export function buildLibrary(manifest, searchIndex, options = {}) {
  const parts = readTemplate(options.templateDir || TEMPLATE_DIR, LIBRARY_SCRIPT_ORDER, 'library.html');
  const count = manifest && Array.isArray(manifest.explainers) ? manifest.explainers.length : 0;
  const description = `${count} explainer${count === 1 ? '' : 's'}: search, browse and open them in one place.`;
  const style = options.style || 'clean';
  const data = {
    style,
    ...(options.config ? { config: options.config } : {}),
    ...(options.kitHref ? { kitHref: options.kitHref } : {}),
    ...(options.insights !== undefined ? { insights: options.insights } : {}),
    manifest,
    index: searchIndex,
  };
  const context = { style, ...(options.config ? { config: options.config } : {}), enums: pageEnums() };
  return assemble(parts, 'Explainer library · Concept Explainer', data, 'bootLibrary();', description, context, options.fontBase);
}

/**
 * Render the design-kit gallery (icons, palette, components, patterns).
 * @param {{ kinds: string[], patterns: object[], version?: string }} kit
 * @returns {string}
 */
export function buildGallery(kit, options = {}) {
  const order = SCRIPT_ORDER.filter((f) => f !== 'app.js').concat('gallery.js');
  const parts = readTemplate(options.templateDir || TEMPLATE_DIR, order);
  return assemble(parts, 'Concept Explainer kit', kit, 'bootGallery();', 'Icons, visuals, components and flow patterns for Concept Explainer.', { ...(options.context || {}), enums: pageEnums() }, options.fontBase);
}
