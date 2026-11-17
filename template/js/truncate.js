// ---------- Long names: soft breaks, truncation and the "?" hint ----------
const SOFT_BREAK_MIN = 12;
// Tokens longer than this (in characters, so it is deterministic) are shown
// shortened in the middle with a "?" hint holding the full token.
const TOKEN_MAX = 24;

function breakToken(token) {
  const marked = token
    .replace(/([a-z])(?=[A-Z])/g, '$1\u0000')
    .replace(/([A-Z])(?=[A-Z][a-z])/g, '$1\u0000')
    .replace(/([/._\-:@])(?=[^\s/._\-:@])/g, '$1\u0000')
    .replace(/([A-Za-z])(?=\d)|(\d)(?=[A-Za-z])/g, '$1$2\u0000');
  // Never leave a piece under 3 characters on its own line ("Factory|B").
  const parts = marked.split('\u0000').reduce((acc, part) => {
    if (acc.length && (part.length < 3 || acc[acc.length - 1].length < 3)) return [...acc.slice(0, -1), acc[acc.length - 1] + part];
    return [...acc, part];
  }, []);
  return parts.flatMap((part, i) => (i ? [h('wbr'), part] : [part]));
}

// Keep both ends: "AbstractSingleton…Implementation", "packages/…/handler.ts",
// "@scope/…implementation".
function shortenToken(token) {
  const cut = (value, keepHead, keepTail) => `${value.slice(0, keepHead)}…${value.slice(value.length - keepTail)}`;
  if (token.includes('/')) {
    const parts = token.split('/').filter(Boolean);
    const first = parts[0].length > 16 ? `${parts[0].slice(0, 14)}…` : parts[0];
    const last = parts[parts.length - 1];
    const tail = last.length > 18 ? cut(last, 6, 10) : last;
    return parts.length > 1 ? `${first}/…/${tail}`.replace('…/…', '…') : cut(token, 12, 10);
  }
  const pieces = token.split(/(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|(?<=[._:-])/);
  if (pieces.length < 3) return cut(token, 12, 10);
  let head = '';
  let i = 0;
  while (i < pieces.length && head.length < 12) { head += pieces[i]; i += 1; }
  let tail = '';
  let j = pieces.length - 1;
  while (j >= i && tail.length < 10) { tail = pieces[j] + tail; j -= 1; }
  if (head.length > 18) head = head.slice(0, 16);
  if (tail.length > 16) tail = tail.slice(tail.length - 14);
  return head.length + tail.length + 1 < token.length ? `${head}…${tail}` : cut(token, 12, 10);
}

// The shortened token: visible short form (not read, not copied), the full
// token for screen readers and copy, and the hint.
function shortToken(token) {
  // The hidden full token goes first: as an out-of-flow box it can mark a
  // line break, and at the front that break never shows.
  return h('span', { class: 'token-short' },
    h('span', { class: 'sr-only token-full' }, token),
    h('span', { class: 'token-visible', 'aria-hidden': 'true' }, shortenToken(token).split('…').flatMap((part, i) => (i ? [h('wbr'), '…', ...breakToken(part)] : breakToken(part)))),
    tokenHint(token));
}

// Text with <wbr> at natural joints of long tokens: camelCase humps
// (fooBar, HTTPServer), after / . _ - : @, and between letters and digits.
// Tokens over TOKEN_MAX are shortened instead. overflow-wrap: anywhere in
// CSS stays only as the last resort.
function softBreaks(value) {
  return String(value ?? '').split(/(\s+)/).flatMap((token) => {
    if (token.length < SOFT_BREAK_MIN || /^\s+$/.test(token)) return [token];
    const core = token.match(/^([("'“‘[]*)(.*?)([)"'”’\].,;:!?]*)$/);
    const [, lead, body, trail] = core || ['', '', token, ''];
    if (body.length > TOKEN_MAX) return [lead, shortToken(body), trail].filter(Boolean);
    return [lead, ...breakToken(body), trail].filter((part) => part !== '');
  });
}

// Shorter forms of a path or slug, longest first: keep the first segment and
// the file name with its :line; for a plain slug keep the start and the end.
function middleForms(full) {
  const parts = full.split('/');
  if (parts.length > 2) {
    const tails = Array.from({ length: parts.length - 2 }, (_, i) => parts.slice(parts.length - 1 - (parts.length - 3 - i)).join('/'));
    return [...tails.map((tail) => `${parts[0]}/…/${tail}`), `…/${parts[parts.length - 1]}`];
  }
  const cuts = [];
  for (let keep = full.length - 4; keep > 8; keep -= Math.max(2, Math.round(keep / 8))) {
    const head = Math.ceil(keep * 0.4);
    cuts.push(`${full.slice(0, head)}…${full.slice(full.length - (keep - head))}`);
  }
  return cuts;
}

const TRUNC_SWEEP_EVERY = 200;
const TRUNC = { watched: new Set(), observer: null, tip: null, anchor: null, pinned: false, nestedWatch: null, nextSweep: TRUNC_SWEEP_EVERY };

function truncTip() {
  if (TRUNC.tip) return TRUNC.tip;
  const tip = h('div', { class: 'trunc-tip', id: 'trunc-tip', role: 'tooltip', hidden: true });
  if (typeof tip.showPopover === 'function') tip.setAttribute('popover', 'manual');
  document.body.append(tip);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') hideTip(); });
  document.addEventListener('pointerdown', (event) => {
    if (TRUNC.anchor && !TRUNC.anchor.contains(event.target)) hideTip();
  });
  window.addEventListener('scroll', () => { if (!TRUNC.pinned) hideTip(); }, { passive: true });
  TRUNC.tip = tip;
  return tip;
}

function showTip(anchor, full, pinned = false) {
  const tip = truncTip();
  tip.textContent = full;
  tip.hidden = false;
  if (tip.showPopover && !tip.matches(':popover-open')) tip.showPopover();
  const box = anchor.getBoundingClientRect();
  const width = Math.min(tip.offsetWidth, window.innerWidth - 16);
  const left = Math.min(Math.max(8, box.left + box.width / 2 - width / 2), window.innerWidth - width - 8);
  const below = box.bottom + 6 + tip.offsetHeight <= window.innerHeight - 8;
  tip.style.left = `${left}px`;
  tip.style.top = `${below ? box.bottom + 6 : Math.max(8, box.top - 6 - tip.offsetHeight)}px`;
  if (TRUNC.anchor && TRUNC.anchor !== anchor) TRUNC.anchor.setAttribute('aria-expanded', 'false');
  TRUNC.anchor = anchor;
  TRUNC.pinned = pinned;
  if (anchor.tagName === 'BUTTON') anchor.setAttribute('aria-expanded', 'true');
}

function hideTip() {
  const tip = TRUNC.tip;
  if (!tip || tip.hidden) return;
  if (tip.hidePopover && tip.matches(':popover-open')) tip.hidePopover();
  tip.hidden = true;
  if (TRUNC.anchor && TRUNC.anchor.tagName === 'BUTTON') TRUNC.anchor.setAttribute('aria-expanded', 'false');
  TRUNC.anchor = null;
  TRUNC.pinned = false;
}

// The hint for a shortened token. It starts as a button; inside a link or
// button (known only once attached) it becomes a plain marker instead.
function tokenHint(full) {
  const button = h('button', {
    class: 'trunc-hint token-hint', type: 'button', 'aria-label': 'Show full name', 'aria-expanded': 'false', 'aria-describedby': 'trunc-tip',
  }, '?');
  wireHintButton(button, full);
  button.dataset.full = full;
  watchNestedHints();
  return button;
}

function wireHintButton(button, full) {
  button.addEventListener('mouseenter', () => showTip(button, full));
  button.addEventListener('mouseleave', () => { if (!TRUNC.pinned) hideTip(); });
  button.addEventListener('focus', () => showTip(button, full));
  button.addEventListener('blur', () => { if (!TRUNC.pinned) hideTip(); });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (TRUNC.anchor === button && TRUNC.pinned) hideTip(); else showTip(button, full, true);
  });
}

// A button inside a link or button is invalid: swap such token hints for
// plain markers as soon as they are attached.
function fixNestedHints(root) {
  const hints = root.matches && root.matches('button.token-hint') ? [root] : [...(root.querySelectorAll ? root.querySelectorAll('button.token-hint') : [])];
  hints.forEach((button) => {
    const host = button.parentElement && button.parentElement.closest('a, button, [role="button"], [role="radio"], [role="option"]');
    if (!host) return;
    const mark = h('span', { class: 'trunc-hint token-hint', 'aria-hidden': 'true' }, '?');
    const full = button.dataset.full;
    mark.addEventListener('mouseenter', () => showTip(mark, full));
    mark.addEventListener('mouseleave', () => { if (!TRUNC.pinned) hideTip(); });
    button.replaceWith(mark);
  });
}

function watchNestedHints() {
  if (TRUNC.nestedWatch || !('MutationObserver' in window)) return;
  TRUNC.nestedWatch = new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
    if (node.nodeType === 1) fixNestedHints(node);
  })));
  TRUNC.nestedWatch.observe(document.documentElement, { childList: true, subtree: true });
}

// Inside a link or button a nested button is invalid, so the hint is a plain
// marker there, shown on hover and when the link itself has focus.
function truncHint(el, full) {
  const host = el.parentElement && el.parentElement.closest('a, button, [role="button"]');
  if (host) {
    const mark = h('span', { class: 'trunc-hint', 'aria-hidden': 'true' }, '?');
    mark.addEventListener('mouseenter', () => showTip(mark, full));
    mark.addEventListener('mouseleave', () => { if (!TRUNC.pinned) hideTip(); });
    host.addEventListener('focus', () => { if (mark.isConnected) showTip(mark, full); });
    host.addEventListener('blur', () => { if (TRUNC.anchor === mark) hideTip(); });
    return mark;
  }
  const button = h('button', {
    class: 'trunc-hint', type: 'button', 'aria-label': 'Show full name', 'aria-expanded': 'false', 'aria-describedby': 'trunc-tip',
  }, '?');
  wireHintButton(button, full);
  return button;
}

function isCut(el) {
  return el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight + 1;
}

// Exact width of the visible text against the content box: CSS ellipsis
// appears at any sub-pixel overflow, which rounded scrollWidth can miss.
function textFits(el, span) {
  const style = getComputedStyle(el);
  // Fractional widths: clientWidth rounds and would call an exact fit a cut.
  const room = el.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
  // Ellipsis shows on any real overflow; a box sized to its text is equal.
  return span.getBoundingClientRect().width <= room + 0.05;
}

// Stop watching an element that left the page (a re-render replaced it), so
// the observer and the set do not keep old views alive.
function forgetTruncation(el) {
  TRUNC.watched.delete(el);
  if (TRUNC.observer) TRUNC.observer.unobserve(el);
}

// Elements are made before they are attached: only one that has been on the
// page (state.seen) and is gone now is dropped.
function pruneTruncation() {
  TRUNC.watched.forEach((el) => { if (el.__trunc && el.__trunc.seen && !el.isConnected) forgetTruncation(el); });
}

function checkTruncation(el) {
  const state = el.__trunc;
  if (!state) return;
  if (!el.isConnected) {
    if (state.seen) forgetTruncation(el);
    return;
  }
  state.seen = true;
  if (!el.getClientRects().length) return;
  el.classList.remove('is-truncated');
  if (state.hint) state.hint.remove();
  if (state.mode === 'middle') state.visible.textContent = state.full;
  let cut = state.mode === 'middle' ? !textFits(el, state.visible) : isCut(el);
  if (cut) {
    el.classList.add('is-truncated');
    if (state.mode === 'middle') {
      const forms = middleForms(state.full);
      const fits = forms.find((form) => { state.visible.textContent = form; return textFits(el, state.visible); });
      if (!fits) state.visible.textContent = forms[forms.length - 1] || state.full;
    }
    cut = true;
    state.hint = state.hint || truncHint(el, state.full);
    el.append(state.hint);
  }
  el.dataset.truncated = String(cut);
}

/**
 * Mark an element whose text may be cut (CSS ellipsis or line clamp, or
 * mode "middle" for paths). A "?" hint with the full text appears only while
 * the text is really cut.
 */
function truncatable(el, full, { mode = 'end' } = {}) {
  const text = String(full ?? '');
  el.removeAttribute('title');
  el.classList.add('truncatable');
  if (mode === 'middle') {
    const visible = h('span', { class: 'trunc-visible', 'aria-hidden': 'true' }, text);
    fill(el, visible, h('span', { class: 'sr-only' }, text));
    el.__trunc = { full: text, mode, visible, hint: null };
  } else {
    el.__trunc = { full: text, mode, hint: null };
  }
  if (!TRUNC.observer && 'ResizeObserver' in window) {
    TRUNC.observer = new ResizeObserver((entries) => entries.forEach((entry) => checkTruncation(entry.target)));
    // Web fonts load after first render; widths change when they land.
    if (document.fonts) {
      document.fonts.ready.then(recheckTruncation);
      document.fonts.addEventListener('loadingdone', recheckTruncation);
    }
  }
  // Sweep now and then, so long sessions of re-renders stay flat.
  if (TRUNC.watched.size >= TRUNC.nextSweep) {
    pruneTruncation();
    TRUNC.nextSweep = TRUNC.watched.size + TRUNC_SWEEP_EVERY;
  }
  TRUNC.watched.add(el);
  if (TRUNC.observer) TRUNC.observer.observe(el);
  return el;
}

// Re-check every watched element, for example after a style switch.
function recheckTruncation() {
  TRUNC.watched.forEach((el) => {
    if (el.isConnected) checkTruncation(el);
    else if (el.__trunc && el.__trunc.seen) forgetTruncation(el);
  });
}

// Break points only (no shortening), for text that wraps or is clamped.
function wordBreaks(value) {
  return String(value ?? '').split(/(\s+)/).flatMap((token) => (token.length < SOFT_BREAK_MIN || /^\s+$/.test(token) ? [token] : breakToken(token)));
}
