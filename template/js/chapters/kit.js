// Shared pieces for the v2 chapters (context, diff, options, risks, rollout,
// timeline, visuals) and the visuals kit. Every module shares one function
// scope, so names here start with ch (chapters) or viz (visuals).
// Status is ink text plus a small marker, never a saturated chip; orange
// (Playful: blue) only marks where the reader is.

const CH_STATUS_LABELS = {
  added: 'Added', modified: 'Modified', changed: 'Changed', removed: 'Removed', renamed: 'Renamed', unchanged: 'Unchanged',
};
// One glyph per status, so the marker reads without colour.
const CH_STATUS_GLYPHS = { added: '+', modified: '~', changed: '~', removed: '−', renamed: '→', unchanged: '' };

/** A small status marker (aria-hidden): the glyph in a hairline square. */
function chStatusMark(status) {
  const key = CH_STATUS_LABELS[status] ? status : 'unchanged';
  return h('span', { class: `ch-mark is-${key}`, 'aria-hidden': 'true' }, CH_STATUS_GLYPHS[key]);
}

/** Status as ink text with its small marker. */
function chStatusTag(status) {
  const key = CH_STATUS_LABELS[status] ? status : 'unchanged';
  return h('span', { class: `ch-status is-${key}` }, chStatusMark(key), CH_STATUS_LABELS[key]);
}

/** A 0-based index from a deep-link part, or null when it is not a valid one. */
function chIndexPart(raw, count) {
  if (raw === undefined || raw === null || !/^\d+$/.test(String(raw))) return null;
  const n = Number.parseInt(raw, 10);
  return n >= 0 && n < count ? n : null;
}

/**
 * Roving tabindex over a list of buttons: one tab stop, arrows and Home/End
 * move focus and call onMove(index). `axis` is "x", "y" or "both".
 */
function chRoving(buttons, { onMove, axis = 'both' } = {}) {
  const keys = {
    x: { ArrowRight: 1, ArrowLeft: -1 },
    y: { ArrowDown: 1, ArrowUp: -1 },
    both: { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 },
  }[axis] || {};
  buttons.forEach((button, index) => {
    button.tabIndex = index === 0 ? 0 : -1;
    button.addEventListener('keydown', (event) => {
      let next = null;
      if (keys[event.key]) next = (index + keys[event.key] + buttons.length) % buttons.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = buttons.length - 1;
      if (next === null) return;
      event.preventDefault();
      buttons[next].focus();
      if (onMove) onMove(next);
    });
  });
  return buttons;
}

/** Mark one button current: its tab stop, aria-pressed and the is-selected class. */
function chMarkCurrent(buttons, index) {
  buttons.forEach((button, i) => {
    const on = i === index;
    button.classList.toggle('is-selected', on);
    button.setAttribute('aria-pressed', String(on));
    button.tabIndex = on || (index === null && i === 0) ? 0 : -1;
  });
}

/** The tip shown in a detail panel before anything is picked. */
function chEmptyDetail(title, body) {
  return h('div', { class: 'ch-detail-empty' },
    h('p', { class: 'eyebrow quiet' }, 'Tip'),
    h('h3', null, title),
    h('p', null, body));
}

/** Back and Next buttons for stepping through parts in a detail panel. */
function chStepper(index, count, go, noun = 'part') {
  return h('div', { class: 'ch-stepper' },
    h('button', { class: 'btn small', type: 'button', disabled: index <= 0, onclick: () => { if (index > 0) go(index - 1); } }, 'Back'),
    h('span', { class: 'ch-stepper-count' }, `${index + 1} / ${count}`),
    h('button', { class: 'btn small', type: 'button', disabled: index >= count - 1, onclick: () => { if (index < count - 1) go(index + 1); } }, `Next ${noun}`));
}

/** A command with a Copy button (plain text, never run). */
function chCommand(command) {
  const copy = h('button', { class: 'btn small', type: 'button' }, 'Copy');
  copy.addEventListener('click', () => {
    const done = () => { copy.textContent = 'Copied'; copy.dataset.state = 'done'; };
    try {
      navigator.clipboard.writeText(command).then(done).catch(() => { copy.textContent = 'Select to copy'; });
    } catch (error) {
      copy.textContent = 'Select to copy';
    }
  });
  return h('div', { class: 'ch-command' }, codeBlock(command, 'sh'), copy);
}

/** A list of short texts with one marker each (goals, pros, cons). */
function chMarkedList(items, markClass, label) {
  const entries = list(items).filter((item) => typeof item === 'string' && item.trim());
  if (!entries.length) return null;
  return h('ul', { class: 'ch-marked', 'aria-label': label },
    entries.map((item) => h('li', null, h('span', { class: `ch-dot ${markClass}`, 'aria-hidden': 'true' }), h('span', null, softBreaks(item)))));
}

/** Count with a singular or plural noun. */
function chCount(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Re-run fn when the element's width changes by more than a few pixels. */
function chOnWidth(el, fn) {
  let last = -1;
  if (!('ResizeObserver' in window)) return;
  new ResizeObserver(() => {
    const width = el.clientWidth;
    if (Math.abs(width - last) < 4) return;
    last = width;
    fn(width);
  }).observe(el);
}

/**
 * One item selected at a time across a list of buttons: marks them (one tab
 * stop, arrows move), fills the detail panel with describe(index) and a
 * stepper, and writes the deep link. `order` maps button positions to item
 * indexes when the buttons are drawn in another order (risks: high first);
 * links always carry the item index.
 * @returns {(index: number|null, opts?: { link?: boolean }) => Element|null} select
 */
function chSelection({ buttons, detail, chapter, empty, describe, noun, order = null, hash = (i) => `${chapter}/${i}`, axis = 'both' }) {
  const itemAt = (k) => (order ? order[k] : k);
  const at = (index) => (order ? order.indexOf(index) : index);
  let selected = null;
  function select(index, { link = true } = {}) {
    selected = index;
    chMarkCurrent(buttons, index === null ? null : at(index));
    if (index === null) fill(detail, empty());
    else fill(detail, ...describe(index), chStepper(at(index), buttons.length, (k) => { select(itemAt(k)); buttons[k].focus(); }, noun));
    if (link) setDeepLink(index === null ? chapter : hash(index));
    return index === null ? null : buttons[at(index)];
  }
  buttons.forEach((button, k) => button.addEventListener('click', () => select(selected === itemAt(k) ? null : itemAt(k))));
  chRoving(buttons, { axis, onMove: (k) => select(itemAt(k)) });
  select(null, { link: false });
  return select;
}

/** The open() of a chapter whose deep link is an index from 0. */
function chIndexOpener(select, count) {
  return {
    open([raw] = []) {
      const index = chIndexPart(raw, count);
      return index === null ? null : select(index, { link: false });
    },
  };
}
