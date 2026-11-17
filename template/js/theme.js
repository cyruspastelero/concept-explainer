// The look: theme (system, light, dark), style (Clean, Playful), the
// switches that change them, and the credit that follows the style.
// ---------- Look: theme (system, light, dark) and style (clean, playful) ----------
// Shared by the explainer, the kit and the hub. Choices are per reader and
// live in localStorage; the page works when storage is blocked.
const THEME_KEY = 'concept-explainer:theme';
const STYLE_KEY = 'concept-explainer:style';
const THEME_CHOICES = [
  { choice: 'system', label: 'System' },
  { choice: 'light', label: 'Light' },
  { choice: 'dark', label: 'Dark' },
];
const STYLE_CHOICES = [
  { choice: 'clean', label: 'Clean' },
  { choice: 'playful', label: 'Playful' },
];
let pageDefaultStyle = 'clean';

function storedTheme() {
  const value = readStore(THEME_KEY);
  return THEME_CHOICES.some((t) => t.choice === value) ? value : 'system';
}

// "system" leaves data-theme off so the CSS media query decides.
function applyTheme(choice) {
  const root = document.documentElement;
  if (choice === 'light' || choice === 'dark') root.dataset.theme = choice;
  else delete root.dataset.theme;
}

// The page default comes from the build (context.style); a reader's own
// choice wins over it.
function setDefaultStyle(value) {
  pageDefaultStyle = value === 'playful' ? 'playful' : 'clean';
}

function storedStyle() {
  const value = readStore(STYLE_KEY);
  return STYLE_CHOICES.some((t) => t.choice === value) ? value : pageDefaultStyle;
}

function applyStyle(choice) {
  document.documentElement.dataset.style = choice === 'playful' ? 'playful' : 'clean';
}

function applyLook(context) {
  setDefaultStyle(context && context.style);
  applyTheme(storedTheme());
  applyStyle(storedStyle());
}

// One registry per page repaints every switch (sidebar and menu copies).
function themeRegistry() {
  const switches = [];
  const listeners = [];
  return {
    add: (entry) => switches.push(entry),
    onChange: (fn) => listeners.push(fn),
    paint: () => {
      switches.forEach(({ buttons, choices, read }) => {
        const picked = read();
        buttons.forEach((button, i) => {
          const on = choices[i].choice === picked;
          button.setAttribute('aria-checked', String(on));
          button.tabIndex = on ? 0 : -1;
        });
      });
    },
    changed: () => {
      listeners.forEach((fn) => fn());
      // A style switch changes fonts and paddings: re-measure cut text.
      if (typeof recheckTruncation === 'function') window.requestAnimationFrame(recheckTruncation);
    },
  };
}

// A radio group of buttons; arrow keys move and choose, one tab stop.
function choiceSwitch(registry, { choices, read, write, label, className, withIcons }) {
  const choose = (choice) => {
    write(choice);
    registry.paint();
    registry.changed();
  };
  const buttons = choices.map((option, index) => h('button', {
    class: 'ts-option', type: 'button', role: 'radio', 'data-label': option.label,
    'aria-label': withIcons ? `${option.label} ${label.toLowerCase()}` : null, title: withIcons ? `${option.label} ${label.toLowerCase()}` : null,
    onclick: () => choose(option.choice),
    onkeydown: (event) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      const next = (index + step + choices.length) % choices.length;
      choose(choices[next].choice);
      buttons[next].focus();
    },
  }, withIcons ? icon(option.choice) : option.label));
  registry.add({ buttons, choices, read });
  return h('div', { class: className, role: 'radiogroup', 'aria-label': label }, buttons);
}

function themeSwitch(registry) {
  return choiceSwitch(registry, {
    choices: THEME_CHOICES, read: storedTheme, label: 'Theme', className: 'theme-switch', withIcons: true,
    write: (choice) => { writeStore(THEME_KEY, choice); applyTheme(choice); },
  });
}

function styleSwitch(registry) {
  return choiceSwitch(registry, {
    choices: STYLE_CHOICES, read: storedStyle, label: 'Style', className: 'theme-switch style-switch', withIcons: false,
    write: (choice) => { writeStore(STYLE_KEY, choice); applyStyle(choice); },
  });
}




// The credit follows the style on screen: Clean owes its type and greys to
// Geist, Playful its palette and rounded type to Duolingo's design language.
const CREDIT_CLEAN = 'Lesson pacing inspired by Brilliant. Type and greys from Geist by Vercel. Not affiliated with either.';
const CREDIT_PLAYFUL = 'Lesson pacing inspired by Brilliant. Palette and rounded type (Nunito) inspired by Duolingo\'s design language. Not affiliated with either.';

function designCredit() {
  return h('p', { class: 'credit' }, h('span', { class: 'credit-clean' }, CREDIT_CLEAN), h('span', { class: 'credit-playful' }, CREDIT_PLAYFUL));
}
