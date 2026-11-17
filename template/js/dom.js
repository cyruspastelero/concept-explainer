// DOM helpers. Every string from the data file goes through text nodes or
// setAttribute, never innerHTML, so repo content cannot inject markup.
const SVG_NS = 'http://www.w3.org/2000/svg';

function applyAttrs(el, attrs) {
  Object.entries(attrs || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === false) return;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'dataset') {
      Object.entries(value).forEach(([name, v]) => { el.dataset[name] = v; });
    } else {
      el.setAttribute(key === 'className' ? 'class' : key, value === true ? '' : String(value));
    }
  });
  return el;
}

function appendChildren(el, children) {
  children.flat(Infinity).forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });
  return el;
}

// replaceChildren() would stringify skipped (undefined/false) slots.
// A re-render drops the old nodes: forget the truncation watchers among them
// (after appending, so nodes moved back in stay watched).
function fill(el, ...children) {
  el.replaceChildren();
  appendChildren(el, children);
  if (TRUNC.watched.size) pruneTruncation();
  return el;
}

function h(tag, attrs, ...children) {
  return appendChildren(applyAttrs(document.createElement(tag), attrs), children);
}

function s(tag, attrs, ...children) {
  return appendChildren(applyAttrs(document.createElementNS(SVG_NS, tag), attrs), children);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function truncate(value, max) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// The device setting, or the reader's own Motion choice in Settings.
function reducedMotion() {
  return document.documentElement.dataset.motion === 'reduce' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// "1 step", "2 steps": a count with its noun, everywhere a page prints one.
function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function byId(items) {
  return new Map(list(items).map((item) => [item.id, item]));
}

function emit(name, detail) {
  document.dispatchEvent(new CustomEvent(`explainer:${name}`, { detail }));
}

function on(name, handler) {
  document.addEventListener(`explainer:${name}`, (event) => handler(event.detail));
}

// Only http(s) links render; anything else (javascript:, data:) becomes text.
// Control characters and spaces can hide a scheme ("java\tscript:"), so any
// link holding one is refused outright.
const UNSAFE_URL_CHARS = /[\u0000-\u0020\u007f]/;

function safeUrl(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) && !UNSAFE_URL_CHARS.test(trimmed) ? trimmed : null;
}

// A path with soft break points after each "/", so it wraps at folder
// boundaries. <wbr> adds no characters, so copying gives the exact path.
function breakablePath(path) {
  return String(path).split(/(?<=\/)/).flatMap((part, i) => {
    const pieces = part.length > TOKEN_MAX ? softBreaks(part) : [part];
    return i ? [h('wbr'), ...pieces] : pieces;
  });
}

// A file:line citation. Long paths keep the first folder and the file name.
function fileChip(path) {
  return truncatable(h('span', { class: 'chip-file' }), path, { mode: 'middle' });
}

// Browser storage is a per-reader convenience only: it can be missing or
// throw (private windows, file:// rules), and the page works without it.
// Keys were renamed from repo-explainer:* to concept-explainer:*. An old
// value is read once, moved to the new key, and the old key removed.
const STORE_PREFIX = 'concept-explainer:';
const LEGACY_PREFIX = 'repo-explainer:';

function readStore(key) {
  try {
    const value = window.localStorage.getItem(key);
    if (value !== null || !key.startsWith(STORE_PREFIX)) return value;
    const legacyKey = `${LEGACY_PREFIX}${key.slice(STORE_PREFIX.length)}`;
    const legacy = window.localStorage.getItem(legacyKey);
    if (legacy !== null) {
      window.localStorage.setItem(key, legacy);
      window.localStorage.removeItem(legacyKey);
    }
    return legacy;
  } catch (error) {
    return null;
  }
}

function writeStore(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (error) {
    return false;
  }
}

// Record where the reader is inside a view (a node, a step) without adding a
// history entry: Back still goes to the previous view.
function setDeepLink(hash) {
  const next = `#${hash}`;
  if (window.location.hash === next) return;
  try {
    window.history.replaceState(window.history.state, '', next);
  } catch (error) {
    // Some file:// contexts refuse history writes; the view still works.
  }
}

function linkPart(value) {
  return encodeURIComponent(String(value));
}

// A small mono label: kinds, authors, PK/FK. Never coloured fills.
function tag(label, extra = '') {
  return truncatable(h('span', { class: `tag${extra ? ` ${extra}` : ''}` }, softBreaks(label)), label);
}

// Display titles step down a size when their longest word is long, so an
// identifier like AbstractSingletonProxyFactoryBean breaks cleanly.
function fitClass(value) {
  // Long tokens are shown shortened (softBreaks), so size by what is shown.
  const shown = (word) => (word.length > TOKEN_MAX ? shortenToken(word).length : word.length);
  const longest = String(value || '').split(/\s+/).reduce((max, word) => Math.max(max, shown(word)), 0);
  if (longest > 32) return 'fit-xlong';
  if (longest > 18) return 'fit-long';
  return '';
}

// Tiny, safe highlighter: tokenises into spans, never parses HTML.
const CODE_TOKEN = /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(const|let|var|function|return|async|await|export|import|from|class|def|if|else|for|while|new|throw|try|catch|func|go|type|interface|struct|public|private|select|insert|update|delete|where|SELECT|INSERT|UPDATE|DELETE|WHERE|FROM)\b/g;

function codeBlock(code, lang) {
  const pre = h('pre', { class: 'code', 'data-lang': lang || '' });
  const source = String(code);
  let last = 0;
  source.replace(CODE_TOKEN, (match, comment, str, keyword, offset) => {
    if (offset > last) pre.append(document.createTextNode(source.slice(last, offset)));
    const cls = comment ? 'cm' : str ? 'st' : 'hl';
    pre.append(h('span', { class: cls }, match));
    last = offset + match.length;
    return match;
  });
  if (last < source.length) pre.append(document.createTextNode(source.slice(last)));
  return pre;
}

// Motion helpers (Web Animations API). All motion is skipped for users who
// ask for reduced motion; nothing depends on an animation finishing.
const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

function motion(el, keyframes, options) {
  if (reducedMotion() || !el.animate) return null;
  return el.animate(keyframes, { duration: 240, easing: EASE_OUT, ...options });
}

function slideIn(el, direction = 1) {
  return motion(el, [{ opacity: 0, transform: `translateX(${direction * 14}px)` }, { opacity: 1, transform: 'none' }]);
}

function riseIn(el, delay = 0) {
  return motion(el, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { delay, fill: 'backwards' });
}

function pop(el) {
  return motion(el, [{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }, { transform: 'scale(1)' }], { duration: 320 });
}

function shake(el) {
  return motion(el, [{ transform: 'none' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-2px)' }, { transform: 'none' }], { duration: 320, easing: 'ease-in-out' });
}

// Draw an SVG path from start to end, then reveal its arrowhead.
function drawPath(path, marker) {
  const anim = motion(path, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 420 });
  if (!anim) {
    path.setAttribute('marker-end', marker);
    return;
  }
  path.setAttribute('pathLength', '1');
  path.style.strokeDasharray = '1';
  anim.onfinish = () => {
    path.style.strokeDasharray = '';
    path.removeAttribute('pathLength');
    path.setAttribute('marker-end', marker);
  };
}

// ---------- Page context (library builds) ----------
// The library context is optional: missing, broken or unfilled means standalone.
function readContext() {
  const el = document.getElementById('explainer-context');
  const raw = el ? el.textContent.trim() : '';
  if (!raw || raw === '__CONTEXT__') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
}

// A relative link (../../index.html) or an http(s) one. No other schemes.
// A link from the build (library, kit): resolved against this page, and
// kept only when it lands on http(s), or on a file next to this file page.
function safeHref(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || UNSAFE_URL_CHARS.test(trimmed) || trimmed.startsWith('//') || trimmed.startsWith('\\')) return null;
  let url;
  try {
    url = new URL(trimmed, window.location.href);
  } catch (error) {
    return null;
  }
  if (url.protocol === 'http:' || url.protocol === 'https:') return trimmed;
  if (url.protocol === 'file:' && window.location.protocol === 'file:' && url.host === window.location.host) return trimmed;
  return null;
}

// The skip link moves focus only; a "#main" hash would read as a view name.
function wireSkipLink(main) {
  const skip = document.querySelector('.skip');
  if (!skip || !main) return;
  skip.addEventListener('click', (event) => {
    event.preventDefault();
    main.focus();
  });
}



// ---------- Navigation state, shared by the explainer, the hub and the kit ----------
// Mark the current item in every nav copy; in a visible sidebar, bring it
// into view inside the nav (a reader action, never on scroll).
function setNavCurrent(links, key) {
  links.forEach((a) => {
    if (a.dataset.nav === key) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const current = links.find((a) => a.dataset.nav === key && a.closest('.side') && a.getClientRects().length);
  if (!current) return;
  current.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  // Web fonts can change row heights after the first paint: check again then.
  if (document.fonts) document.fonts.ready.then(() => { if (current.getAttribute('aria-current') === 'page') current.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
}

// data-more="below" while the nav has rows under its bottom edge.
function watchNavMore(nav) {
  if (!nav) return;
  const paint = () => {
    const more = nav.scrollTop + nav.clientHeight < nav.scrollHeight - 2;
    if (more) nav.dataset.more = 'below'; else delete nav.dataset.more;
  };
  nav.addEventListener('scroll', paint, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(paint).observe(nav);
  paint();
}

// ---------- Dates ----------
// A date-only value (2026-11-17) is a calendar day: show that day wherever
// the reader is. A value with a time is a moment: show the reader's own day
// for it, so 2026-11-17T20:00Z reads Nov 18 in Manila.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function displayDate(value, { year = true, fallback = '' } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const raw = String(value).trim();
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return fallback;
  const options = { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) };
  return date.toLocaleDateString(undefined, DATE_ONLY.test(raw) ? { ...options, timeZone: 'UTC' } : options);
}
