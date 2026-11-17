// Settings: one view shared by the explainer pages, the kit and the hub.
// Reading choices live in this browser (localStorage, in try/catch). Explainer
// defaults live in <home>/config.json: saved through `library serve` when the
// page was opened that way, else shown as `config set` commands to copy.
const READING_PREFS = [
  {
    key: 'motion', label: 'Motion', storeKey: 'concept-explainer:motion', fallback: 'system',
    hint: 'Reduced stops sliding cards, drawing arrows and moving dots.',
    choices: [{ choice: 'system', label: 'System' }, { choice: 'reduce', label: 'Reduced' }],
  },
  {
    key: 'text', label: 'Text size', storeKey: 'concept-explainer:text', fallback: 'default',
    hint: 'Large makes every page about an eighth bigger.',
    choices: [{ choice: 'default', label: 'Default' }, { choice: 'large', label: 'Large' }],
  },
  {
    key: 'density', label: 'Density', storeKey: 'concept-explainer:density', fallback: 'comfortable',
    hint: 'Compact fits more on the screen.',
    choices: [{ choice: 'comfortable', label: 'Comfortable' }, { choice: 'compact', label: 'Compact' }],
  },
];

function readingValue(pref) {
  const value = readStore(pref.storeKey);
  return pref.choices.some((c) => c.choice === value) ? value : pref.fallback;
}

// data-motion, data-text, data-density on <html>; defaults leave them off.
function applyReading() {
  const root = document.documentElement;
  READING_PREFS.forEach((pref) => {
    const value = readingValue(pref);
    if (value === pref.fallback) delete root.dataset[pref.key];
    else root.dataset[pref.key] = value;
  });
}

function readingSwitch(registry, pref) {
  return choiceSwitch(registry, {
    choices: pref.choices, read: () => readingValue(pref), label: pref.label, className: 'theme-switch style-switch', withIcons: false,
    write: (choice) => { writeStore(pref.storeKey, choice); applyReading(); },
  });
}

// `library serve` opens pages with #token=<t>. Keep it for this tab only and
// clear it from the address before the router reads the hash.
const SERVE_TOKEN_KEY = 'concept-explainer:serve-token';

function withServe(context) {
  const served = /^https?:$/.test(window.location.protocol);
  const match = window.location.hash.match(/^#token=([A-Za-z0-9_-]{8,256})$/);
  let token = null;
  if (match) {
    token = match[1];
    try {
      window.sessionStorage.setItem(SERVE_TOKEN_KEY, token);
    } catch (error) {
      // Without session storage the token still works until reload.
    }
    try {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
    } catch (error) {
      window.location.hash = '';
    }
  } else if (served) {
    try {
      token = window.sessionStorage.getItem(SERVE_TOKEN_KEY);
    } catch (error) {
      token = null;
    }
  }
  // A paired browser (the app launcher) keeps its device token instead.
  const device = !token && served ? deviceToken() : null;
  if (!served || !(token || device)) return context;
  return { ...context, serve: { ...(context.serve || {}), token: token || device, device: Boolean(device) } };
}

// ---------- Quick theme: a small menu by the gear, and Shift+D ----------
const THEME_ICON_OPTIONS = THEME_CHOICES.map((t) => ({ value: t.choice, label: t.label }));

function setTheme(registry, choice) {
  writeStore(THEME_KEY, choice);
  applyTheme(choice);
  registry.paint();
  registry.changed();
}

// The theme menu, kept in sync with every other theme control on the page.
function quickTheme(registry) {
  const picker = listboxPicker({
    options: THEME_ICON_OPTIONS, value: storedTheme(), ariaLabel: 'Theme',
    buttonContent: (value) => icon(value), onChange: (choice) => setTheme(registry, choice),
  });
  registry.onChange(() => picker.set(storedTheme()));
  return h('div', { class: 'quick-theme' }, picker.el);
}

// Shift+D cycles light, dark, system. Ignored while typing.
function installThemeShortcut(registry) {
  const live = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  document.body.append(live);
  const order = ['light', 'dark', 'system'];
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'D' || !event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target.closest && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    event.preventDefault();
    const next = order[(order.indexOf(storedTheme()) + 1) % order.length];
    setTheme(registry, next);
    live.textContent = `${THEME_CHOICES.find((t) => t.choice === next).label} theme`;
  });
}

// One compact line of facts for the sidebar footer, cut with a hint if long.
function footMeta(parts) {
  const line = parts.filter(Boolean).join(' · ');
  return truncatable(h('p', { class: 'side-stamp' }, line), line);
}

// The gear item for the sidebar and menu footers.
function settingsLink(href) {
  return h('div', { class: 'side-util' },
    h('a', { class: 'util', href, 'data-nav': 'settings' }, h('span', { class: 'util-ic' }, icon('settings')), 'Settings'));
}

function settingRow(id, label, control, hint) {
  return h('div', { class: 'setting-row' },
    h('span', { class: 'setting-label', id: `${id}-label` }, label),
    control,
    hint && h('p', { class: 'setting-hint', id: `${id}-hint` }, hint));
}

function readingGroup(registry) {
  const labelled = (el, id) => {
    el.setAttribute('aria-labelledby', `${id}-label`);
    el.setAttribute('aria-describedby', `${id}-hint`);
    el.removeAttribute('aria-label');
    return el;
  };
  return h('fieldset', { class: 'panel settings-group' },
    h('legend', { class: 'settings-legend' }, h('span', null, 'Reading'), h('span', { class: 'eyebrow quiet' }, 'This browser only')),
    settingRow('set-theme', 'Theme', labelled(themeSwitch(registry), 'set-theme'), 'System follows your device.'),
    settingRow('set-style', 'Style', labelled(styleSwitch(registry), 'set-style'), 'Clean is calm and grey. Playful is bright and rounded.'),
    READING_PREFS.map((pref) => settingRow(`set-${pref.key}`, pref.label, labelled(readingSwitch(registry, pref), `set-${pref.key}`), pref.hint)));
}

function settingsView(registry, { context = {}, config = null, extra = [] } = {}) {
  const section = h('section', { class: 'view settings-view', 'data-view': 'settings', hidden: true, 'aria-labelledby': 'view-settings-title' },
    h('header', { class: 'view-head' },
      h('p', { class: 'eyebrow quiet' }, 'Settings'),
      h('h1', { id: 'view-settings-title', tabindex: '-1' }, 'Settings'),
      h('p', { class: 'view-lead' }, 'Reading choices stay in this browser. Explainer defaults shape the next explainer you build.')),
    h('div', { class: 'settings-body' },
      readingGroup(registry),
      defaultsSlot(context, config),
      extra,
      pairedGroup()));
  return { key: 'settings', title: 'Settings', nav: 'Settings', section, controller: null };
}

// Settings > This browser, only when the app launcher paired it.
function pairedGroup() {
  const row = pairedRow();
  if (!row) return null;
  return h('section', { class: 'panel settings-group', 'aria-labelledby': 'settings-device-title' },
    h('div', { class: 'settings-legend' }, h('h2', { id: 'settings-device-title' }, 'This browser'), h('span', { class: 'eyebrow quiet' }, 'Paired by the app')),
    row);
}
