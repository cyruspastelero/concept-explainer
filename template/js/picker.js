// Pickers in the design system, in place of native selects whose OS popups
// show raw values. Three shapes, one contract: { el, read(), focus() }.
// - optionGroup: a radiogroup of option cards or a segmented row (2 to 4 choices)
// - listboxPicker: a button and a popover listbox (WAI-ARIA listbox pattern)
// - comboPicker: a text field with suggestions and free entry (combobox)
// Each option is { value, label, desc? }; the value is what gets stored.
let pickerSerial = 0;

function pickerId(prefix) {
  pickerSerial += 1;
  return `${prefix}-${pickerSerial}`;
}

/**
 * Radio cards or a segmented row. Arrow keys move and choose; one tab stop.
 * @param {{ options: object[], value: string, labelledBy?: string, describedBy?: string, variant?: 'cards'|'segmented', onChange?: Function, render?: Function }} spec
 */
function optionGroup({ options, value, labelledBy, describedBy, variant = 'segmented', onChange, render }) {
  let current = options.some((o) => o.value === value) ? value : options[0].value;
  const buttons = options.map((option, index) => h('button', {
    type: 'button', role: 'radio', class: `pick-option${variant === 'cards' ? ' is-card' : ''}`, 'data-value': option.value,
    onclick: () => choose(option.value, true),
    onkeydown: (event) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      const jump = { Home: 0, End: options.length - 1 }[event.key];
      if (step === undefined && jump === undefined) return;
      event.preventDefault();
      const next = jump !== undefined ? jump : (index + step + options.length) % options.length;
      choose(options[next].value, true);
      buttons[next].focus();
    },
  },
  render ? render(option) : [
    h('span', { class: 'pick-option-label' }, option.label),
    option.desc && variant === 'cards' && h('span', { class: 'pick-option-desc' }, option.desc),
  ]));
  const el = h('div', {
    class: `pick-group is-${variant}`, role: 'radiogroup', 'aria-labelledby': labelledBy, 'aria-describedby': describedBy,
  }, buttons);

  function paint() {
    buttons.forEach((button, i) => {
      const on = options[i].value === current;
      button.setAttribute('aria-checked', String(on));
      button.tabIndex = on ? 0 : -1;
    });
  }

  function choose(next, fromUser) {
    if (next === current && fromUser) return;
    current = next;
    paint();
    if (onChange) onChange(current);
  }

  paint();
  return {
    el,
    read: () => current,
    focus: () => { const on = buttons.find((b) => b.getAttribute('aria-checked') === 'true'); if (on) on.focus(); },
    set: (next) => { if (options.some((o) => o.value === next)) { current = next; paint(); } },
  };
}

// Close the open picker on outside pointer or Escape, one at a time.
const PICKER = { open: null };
document.addEventListener('pointerdown', (event) => {
  if (PICKER.open && !PICKER.open.root.contains(event.target)) PICKER.open.close(false);
});

function placePanel(button, panel) {
  panel.classList.remove('is-up', 'is-end');
  const box = button.getBoundingClientRect();
  const height = panel.offsetHeight;
  if (box.bottom + 8 + height > window.innerHeight - 8 && box.top - 8 - height > 8) panel.classList.add('is-up');
  if (box.left + panel.offsetWidth > window.innerWidth - 8) panel.classList.add('is-end');
}

function optionRow(option, id, selected) {
  return h('div', { class: 'picker-option', role: 'option', id, 'aria-selected': String(selected), 'data-value': option.value },
    h('span', { class: 'picker-check', 'aria-hidden': 'true' }),
    h('span', { class: 'picker-text' },
      h('span', { class: 'picker-label' }, option.label),
      option.desc && h('span', { class: 'picker-desc' }, option.desc)));
}

// The button, the popover and its rows. Compact pickers (an icon button)
// name themselves with aria-label.
function listboxParts({ options, current, labelOf, labelledBy, describedBy, ariaLabel, buttonContent }) {
  const buttonId = pickerId('picker-button');
  const listId = pickerId('picker-list');
  const valueText = h('span', { class: 'picker-value' }, buttonContent ? buttonContent(current) : labelOf(current));
  const naming = ariaLabel ? { 'aria-label': `${ariaLabel}: ${labelOf(current)}` } : { 'aria-labelledby': `${labelledBy} ${buttonId}` };
  const button = h('button', {
    class: `picker-button${buttonContent ? ' is-compact' : ''}`, type: 'button', id: buttonId, 'aria-haspopup': 'listbox', 'aria-expanded': 'false',
    'aria-controls': listId, 'aria-describedby': describedBy, ...naming,
  }, valueText, !buttonContent && h('span', { class: 'picker-chevron', 'aria-hidden': 'true' }));
  const rows = options.map((option, i) => optionRow(option, `${listId}-${i}`, option.value === current));
  const panel = h('div', {
    class: 'picker-panel', role: 'listbox', id: listId, tabindex: '-1', hidden: true,
    ...(ariaLabel ? { 'aria-label': ariaLabel } : { 'aria-labelledby': labelledBy }),
  }, rows);
  return { valueText, button, rows, panel, root: h('div', { class: 'picker' }, button, panel) };
}

const TYPEAHEAD_PAUSE_MS = 600;

// Typing letters jumps to the first label that starts with them; a pause
// starts a new search. Returns the matching index, or -1.
function typeaheadFind(options, typeahead, key) {
  const now = Date.now();
  typeahead.typed = now - typeahead.at > TYPEAHEAD_PAUSE_MS ? key.toLowerCase() : typeahead.typed + key.toLowerCase();
  typeahead.at = now;
  return options.findIndex((o) => o.label.toLowerCase().startsWith(typeahead.typed));
}

// Keys inside the open listbox. nav: { active, count, move(i), choose(i), close(focus) }.
function listboxKeys(event, options, typeahead, nav) {
  const moves = { ArrowDown: nav.active + 1, ArrowUp: nav.active - 1, Home: 0, End: nav.count - 1 };
  if (event.key in moves) {
    event.preventDefault();
    nav.move(Math.min(Math.max(moves[event.key], 0), nav.count - 1));
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    nav.choose(nav.active);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    nav.close(true);
  } else if (event.key === 'Tab') {
    nav.close(false);
  } else if (event.key.length === 1 && /\S/.test(event.key)) {
    const found = typeaheadFind(options, typeahead, event.key);
    if (found >= 0) nav.move(found);
  }
}

const LISTBOX_OPEN_KEYS = ['ArrowDown', 'ArrowUp', 'Enter', ' '];

// One popover open at a time on the page.
function showPopover(api, trigger, panel) {
  if (PICKER.open && PICKER.open !== api) PICKER.open.close(false);
  panel.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  placePanel(trigger, panel);
  PICKER.open = api;
}

function hidePopover(api, trigger, panel) {
  panel.hidden = true;
  trigger.setAttribute('aria-expanded', 'false');
  if (PICKER.open === api) PICKER.open = null;
}

function paintListboxActive(rows, panel, active) {
  rows.forEach((row, i) => row.classList.toggle('is-active', i === active));
  panel.setAttribute('aria-activedescendant', rows[active].id);
}

// The button shows the chosen label (or icon); the rows mark the choice.
function showListboxValue({ valueText, button, rows }, options, current, { labelOf, ariaLabel, buttonContent }) {
  fill(valueText, buttonContent ? buttonContent(current) : labelOf(current));
  if (ariaLabel) button.setAttribute('aria-label', `${ariaLabel}: ${labelOf(current)}`);
  rows.forEach((row, j) => row.setAttribute('aria-selected', String(options[j].value === current)));
}

/**
 * A button that opens a listbox popover. Up/Down, Home/End, typeahead,
 * Enter/Space choose, Escape closes and returns focus to the button.
 * @param {{ options: object[], value: string, labelledBy: string, describedBy?: string, onChange?: Function }} spec
 */
function listboxPicker({ options, value, labelledBy, describedBy, onChange, ariaLabel, buttonContent }) {
  let current = options.some((o) => o.value === value) ? value : options[0].value;
  let active = 0;
  const typeahead = { typed: '', at: 0 };
  const labelOf = (v) => (options.find((o) => o.value === v) || options[0]).label;
  const { valueText, button, rows, panel, root } = listboxParts({ options, current, labelOf, labelledBy, describedBy, ariaLabel, buttonContent });
  const api = { root, close };
  const paintActive = () => paintListboxActive(rows, panel, active);

  function open() {
    active = Math.max(0, options.findIndex((o) => o.value === current));
    showPopover(api, button, panel);
    paintActive();
    panel.focus({ preventScroll: true });
  }

  function close(returnFocus = true) {
    if (panel.hidden) return;
    hidePopover(api, button, panel);
    if (returnFocus) button.focus();
  }

  const show = (next) => { current = next; showListboxValue({ valueText, button, rows }, options, current, { labelOf, ariaLabel, buttonContent }); };

  function choose(i) {
    show(options[i].value);
    close(true);
    if (onChange) onChange(current);
  }

  button.addEventListener('click', () => (panel.hidden ? open() : close()));
  button.addEventListener('keydown', (event) => {
    if (!LISTBOX_OPEN_KEYS.includes(event.key)) return;
    event.preventDefault();
    open();
  });
  const move = (i) => { active = i; paintActive(); };
  panel.addEventListener('keydown', (event) => listboxKeys(event, options, typeahead, { active, count: options.length, move, choose, close }));
  rows.forEach((row, i) => {
    row.addEventListener('click', () => choose(i));
    row.addEventListener('pointermove', () => { if (active !== i) move(i); });
  });

  const set = (next) => { if (options.some((o) => o.value === next) && next !== current) show(next); };
  return { el: root, read: () => current, focus: () => button.focus(), set };
}

const COMBO_SHOWN = 8;

// Suggestions: values that start with the text, or labels that contain it.
function comboMatches(options, typed) {
  const q = String(typed).trim().toLowerCase();
  return options.filter((o) => !q || o.value.toLowerCase().startsWith(q) || o.label.toLowerCase().includes(q)).slice(0, COMBO_SHOWN);
}

// Keys in the combobox. nav: { open, step(by), take() -> taken, close() }.
function comboKeys(event, nav) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    nav.step(event.key === 'ArrowDown' ? 1 : -1);
  } else if (event.key === 'Enter' && nav.open) {
    if (nav.take()) event.preventDefault();
  } else if (event.key === 'Escape' && nav.open) {
    event.preventDefault();
    event.stopPropagation();
    nav.close();
  }
}

function comboParts(id, value, describedBy) {
  const listId = pickerId('combo-list');
  const input = h('input', {
    class: 'field picker-input', type: 'text', id, value: String(value ?? ''), role: 'combobox', autocomplete: 'off', spellcheck: 'false',
    'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': listId, 'aria-describedby': describedBy,
  });
  const panel = h('div', { class: 'picker-panel', role: 'listbox', id: listId, hidden: true });
  return { listId, input, panel, root: h('div', { class: 'picker' }, input, panel) };
}

function paintComboActive(panel, input, active) {
  [...panel.children].forEach((row, i) => row.classList.toggle('is-active', i === active));
  if (active >= 0 && panel.children[active]) input.setAttribute('aria-activedescendant', panel.children[active].id);
  else input.removeAttribute('aria-activedescendant');
}

// A click on a suggestion lands before the blur closes the list.
const COMBO_BLUR_CLOSE_MS = 120;

/**
 * A text field with suggestions (combobox). Free entry is allowed; the
 * caller validates it. Down opens and moves, Enter takes the active one.
 * @param {{ options: object[], value: string, id: string, describedBy?: string }} spec
 */
function comboPicker({ options, value, id, describedBy }) {
  const { listId, input, panel, root } = comboParts(id, value, describedBy);
  let active = -1;
  let shown = [];
  const api = { root, close: () => close() };
  const paintActive = () => paintComboActive(panel, input, active);

  function render() {
    shown = comboMatches(options, input.value);
    fill(panel, ...shown.map((option, i) => optionRow(option, `${listId}-${i}`, option.value === input.value.trim())));
    [...panel.children].forEach((row, i) => row.addEventListener('pointerdown', (event) => { event.preventDefault(); take(i); }));
    if (!shown.length) { close(); return; }
    active = Math.min(active, shown.length - 1);
    paintActive();
  }

  function open() {
    render();
    if (shown.length) showPopover(api, input, panel);
  }

  function close() {
    hidePopover(api, input, panel);
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }

  function take(i) {
    input.value = shown[i].value;
    close();
    input.focus();
  }

  input.addEventListener('input', () => { active = -1; open(); });
  input.addEventListener('focus', () => open());
  input.addEventListener('blur', () => window.setTimeout(close, COMBO_BLUR_CLOSE_MS));
  input.addEventListener('keydown', (event) => comboKeys(event, {
    open: panel.hidden === false,
    step: (by) => {
      if (panel.hidden) open();
      active = Math.min(Math.max(active + by, 0), shown.length - 1);
      paintActive();
    },
    take: () => { if (active >= 0) take(active); else return false; return true; },
    close,
  }));

  return { el: root, read: () => input.value.trim(), focus: () => input.focus() };
}
