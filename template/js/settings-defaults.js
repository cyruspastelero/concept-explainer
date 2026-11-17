// Explainer defaults: the fields, their valid values (from the build) and
// the form that saves them or shows the commands.
// The valid values come from the build (context.enums, scripts/lib/page-enums.mjs),
// so the form never keeps its own list that can drift. The lists below are
// labels for people, and the values for a page built before enums existed.
// The CLI and the server check every value again.
const PAGE_ENUMS = (() => {
  const enums = readContext().enums;
  return enums && typeof enums === 'object' && !Array.isArray(enums) ? enums : {};
})();

function enumList(name, fallback) {
  const values = PAGE_ENUMS[name];
  return Array.isArray(values) && values.length && values.every((v) => typeof v === 'string') ? values : fallback;
}

function enumNumber(name, fallback) {
  const value = PAGE_ENUMS[name];
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

// Every value the build allows, labelled when the page has a label for it.
function enumOptions(name, labelled, lead = []) {
  const values = [...new Set([...lead, ...enumList(name, labelled.map((o) => o.value))])];
  return values.map((value) => labelled.find((o) => o.value === value) || opt(value, value));
}

const LANGUAGE_PATTERN = (() => {
  try {
    return typeof PAGE_ENUMS.languagePattern === 'string' ? new RegExp(PAGE_ENUMS.languagePattern) : null;
  } catch (error) {
    return null;
  }
})() || /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;

function opt(value, label, desc) {
  return { value, label, desc };
}
const ON_OFF = [opt('on', 'On'), opt('off', 'Off')];
const CONFIG_FIELDS = {
  style: { label: 'Style', kind: 'style', help: 'The look new explainers open in. Readers can still switch.',
    options: enumOptions('styles', [opt('clean', 'Clean', 'Calm greys and one orange accent.'), opt('playful', 'Playful', 'Bright, rounded and pressable.')]) },
  defaultType: { label: 'Explainer type', kind: 'list', help: 'What the skill makes when you do not say.',
    options: enumOptions('types', [
      opt('auto', 'Auto detect', 'The skill picks from what you point it at'),
      opt('repo', 'Repo', 'A whole codebase: parts, flows, data'),
      opt('pr', 'Pull request', 'One PR or MR, its diff and risks'),
      opt('change', 'Change', 'A commit range or a release'),
      opt('proposal', 'Proposal', 'An RFC or design doc and its options'),
      opt('migration', 'Migration', 'Moving from one system to another'),
      opt('incident', 'Incident', 'What broke, why, and the fix'),
      opt('concept', 'Concept', 'An idea or technique, no code needed'),
    ], ['auto']) },
  audience: { label: 'Audience', kind: 'cards', help: 'Sets tone, depth and how many terms get explained.',
    options: enumOptions('audience', [opt('newcomer', 'Newcomer', 'New to the code or the field'), opt('engineer', 'Engineer', 'Works in code day to day'), opt('expert', 'Expert', 'Wants the edges and trade-offs')]) },
  depth: { label: 'Depth', kind: 'cards', help: 'How many parts, flows and steps to trace.',
    options: enumOptions('depth', [opt('overview', 'Overview', 'The shape in a few minutes'), opt('standard', 'Standard', 'The main flows and parts'), opt('deep', 'Deep', 'Every important path')]) },
  language: { label: 'Language', kind: 'combo', help: 'A language tag, like en or pt-BR. Pick one or type your own.',
    options: [
      opt('en', 'en', 'English'), opt('en-GB', 'en-GB', 'English (UK)'), opt('es', 'es', 'Spanish'), opt('fr', 'fr', 'French'),
      opt('de', 'de', 'German'), opt('it', 'it', 'Italian'), opt('pt-BR', 'pt-BR', 'Portuguese (Brazil)'), opt('pt-PT', 'pt-PT', 'Portuguese (Portugal)'),
      opt('nl', 'nl', 'Dutch'), opt('sv', 'sv', 'Swedish'), opt('pl', 'pl', 'Polish'), opt('tr', 'tr', 'Turkish'),
      opt('ru', 'ru', 'Russian'), opt('uk', 'uk', 'Ukrainian'), opt('ja', 'ja', 'Japanese'), opt('ko', 'ko', 'Korean'),
      opt('zh-CN', 'zh-CN', 'Chinese (Simplified)'), opt('zh-TW', 'zh-TW', 'Chinese (Traditional)'), opt('hi', 'hi', 'Hindi'),
      opt('id', 'id', 'Indonesian'), opt('vi', 'vi', 'Vietnamese'), opt('fil', 'fil', 'Filipino'), opt('ar', 'ar', 'Arabic'), opt('he', 'he', 'Hebrew'),
    ] },
  visuals: { label: 'Preferred visuals', kind: 'multi', options: enumList('visualKinds', ['layers', 'cycle', 'state', 'compare', 'hierarchy', 'beforeAfter', 'quadrant', 'funnel', 'venn']), help: 'Picked first when a chapter can use a picture.' },
  codeWalkthrough: { label: 'Code walkthrough', kind: 'cards', help: 'A line-by-line tour of the few lines that carry the idea.',
    options: enumOptions('codeWalkthrough', [opt('auto', 'Auto', 'When the code is the point'), opt('always', 'Always', 'Add one to every explainer'), opt('never', 'Never', 'Leave it out')]) },
  quiz: { label: 'Quiz', kind: 'onoff', help: 'End explainers with a few questions.' },
  analogies: { label: 'Analogies', kind: 'onoff', help: 'Add a "think of it like" line to key ideas.' },
  model: { label: 'Model for estimates', kind: 'list', help: 'Used to price a run before it starts.',
    options: enumOptions('models', [opt('auto', 'Auto', 'Let the estimate pick'), opt('fable-5.2', 'Fable 5.2'), opt('opus-5.5', 'Opus 5.5'), opt('sonnet-5.5', 'Sonnet 5.5'), opt('haiku-5.5', 'Haiku 5.5')]) },
  budgetUsd: { label: 'Budget in US dollars', kind: 'number', help: 'Start without asking when the estimate fits. Leave empty to always ask.' },
  confirmBeforeStart: { label: 'Confirm before starting', kind: 'onoff', help: 'Show the estimate and wait for a yes.' },
  instructions: { label: 'House instructions', kind: 'textarea', help: 'Plain text added to every run: house style, terms to use. Never overrides the truth rules.' },
};
const optionValues = (field) => field.options.map((o) => (typeof o === 'string' ? o : o.value));
const CONFIG_FIELD_DEFAULTS = {
  style: 'clean', defaultType: 'auto', audience: 'engineer', depth: 'standard', language: 'en', visuals: [], chapters: {}, codeWalkthrough: 'auto',
  quiz: true, analogies: true, model: 'auto', budgetUsd: null, confirmBeforeStart: true, instructions: '',
};
const INSTRUCTIONS_LIMIT = enumNumber('instructionsLimit', 2000);
const CLI_NAME = 'concept-explainer';

// ---------- Explainer defaults ----------
function normalizeDefaults(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return Object.fromEntries(Object.entries(CONFIG_FIELD_DEFAULTS).map(([key, fallback]) => {
    const value = source[key];
    return [key, value === undefined || fieldErrors(key, value).length ? JSON.parse(JSON.stringify(fallback)) : value];
  }));
}

function fieldErrors(key, value) {
  const field = CONFIG_FIELDS[key];
  if (key === 'chapters') return value && typeof value === 'object' && !Array.isArray(value) ? [] : ['Must be a list of chapters per type.'];
  if (!field) return [];
  if (['style', 'list', 'cards'].includes(field.kind)) return optionValues(field).includes(value) ? [] : ['Pick one of the listed choices.'];
  if (field.kind === 'onoff') return typeof value === 'boolean' ? [] : ['Must be on or off.'];
  if (field.kind === 'multi') return Array.isArray(value) && value.every((v) => field.options.includes(v)) ? [] : ['Pick from the listed kinds.'];
  if (key === 'language') return typeof value === 'string' && LANGUAGE_PATTERN.test(value) ? [] : ['Use a language tag like en or pt-BR.'];
  if (key === 'budgetUsd') return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0) ? [] : ['Use a number of 0 or more, or leave it empty.'];
  if (key === 'instructions') {
    if (typeof value !== 'string') return ['Must be text.'];
    if (value.length > INSTRUCTIONS_LIMIT) return [`${value.length} characters. Keep it to ${INSTRUCTIONS_LIMIT}.`];
    // eslint-disable-next-line no-control-regex
    return /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) ? ['Remove control characters. Use plain text.'] : [];
  }
  return [];
}

function shellQuote(value) {
  const textValue = String(value);
  return /^[\w.,:@/-]+$/.test(textValue) ? textValue : `'${textValue.replace(/'/g, "'\\''")}'`;
}

function commandValue(key, value) {
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  if (key === 'budgetUsd') return value === null ? 'none' : String(value);
  if (key === 'visuals') return shellQuote(value.join(','));
  if (key === 'chapters') return shellQuote(JSON.stringify(value));
  return shellQuote(value);
}

function copyButton(getText, label = 'Copy') {
  const button = h('button', { class: 'btn small', type: 'button' }, label);
  button.addEventListener('click', () => {
    navigator.clipboard.writeText(getText())
      .then(() => { button.textContent = 'Copied'; button.dataset.state = 'done'; })
      .catch(() => { button.textContent = 'Select to copy'; });
  });
  return button;
}

function downloadBlob(filename, content, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = h('a', { href: url, download: filename, hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A small picture of each style, drawn with the style's own colours.
function stylePreview(option) {
  return [
    h('span', { class: `style-preview is-${option.value}`, 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
    h('span', { class: 'pick-option-label' }, option.label),
    h('span', { class: 'pick-option-desc' }, option.desc),
  ];
}

// One control per field, all with the same shape: { el, read(), focus() }.
function fieldControl(key, value, id, describedBy) {
  const field = CONFIG_FIELDS[key];
  const labelledBy = `${id}-label`;
  if (field.kind === 'style') return optionGroup({ options: field.options, value, labelledBy, describedBy, variant: 'cards', render: stylePreview });
  if (field.kind === 'cards') return optionGroup({ options: field.options, value, labelledBy, describedBy, variant: 'cards' });
  if (field.kind === 'onoff') {
    const group = optionGroup({ options: ON_OFF, value: value ? 'on' : 'off', labelledBy, describedBy });
    return { ...group, read: () => group.read() === 'on' };
  }
  if (field.kind === 'list') return listboxPicker({ options: field.options, value, labelledBy, describedBy });
  if (field.kind === 'combo') return comboPicker({ options: field.options, value, id, describedBy });
  if (field.kind === 'multi') {
    const el = h('div', { class: 'multi', role: 'group', 'aria-labelledby': labelledBy, 'aria-describedby': describedBy },
      field.options.map((option) => h('label', { class: 'multi-option' },
        h('input', { type: 'checkbox', name: key, value: option, checked: value.includes(option) }), h('span', null, option))));
    return { el, read: () => [...el.querySelectorAll('input:checked')].map((input) => input.value), focus: () => el.querySelector('input').focus() };
  }
  if (field.kind === 'number') {
    const el = h('input', { class: 'field', type: 'number', id, min: '0', step: '0.5', inputmode: 'decimal', value: value === null ? '' : String(value), 'aria-describedby': describedBy });
    return { el, read: () => (el.value.trim() === '' ? null : Number(el.value.trim())), focus: () => el.focus() };
  }
  const el = h('textarea', { class: 'field', id, rows: '5', maxlength: String(INSTRUCTIONS_LIMIT * 2), 'aria-describedby': describedBy }, value);
  return { el, read: () => el.value, focus: () => el.focus() };
}

// One row per config field: label, control, hint and its error line.
function defaultsRow(key, value) {
  const id = `cfg-${key}`;
  const errorId = `${id}-error`;
  const field = CONFIG_FIELDS[key];
  const control = fieldControl(key, value, id, `${id}-hint ${errorId}`);
  const error = h('p', { class: 'field-error', id: errorId });
  const label = ['number', 'textarea', 'combo'].includes(field.kind)
    ? h('label', { class: 'setting-label', for: id, id: `${id}-label` }, field.label)
    : h('span', { class: 'setting-label', id: `${id}-label` }, field.label);
  const wide = ['textarea', 'multi', 'style', 'cards'].includes(field.kind);
  const el = h('div', { class: `setting-row${wide ? ' is-wide' : ''}`, 'data-field': key },
    label, control.el, h('p', { class: 'setting-hint', id: `${id}-hint` }, field.help), error);
  return { el, error, control };
}

// Marks every bad field and returns the first one's control, or null.
function markInvalid(fields, values) {
  let firstBad = null;
  Object.keys(CONFIG_FIELDS).forEach((key) => {
    const problems = fieldErrors(key, values[key]);
    const { error, control } = fields[key];
    error.textContent = problems.join(' ');
    const target = control.el.matches('input, textarea') ? control.el : control.el.querySelector('input, [role="radiogroup"], .picker-button') || control.el;
    target.setAttribute('aria-invalid', String(problems.length > 0));
    if (problems.length && !firstBad) firstBad = control;
  });
  return firstBad;
}

// The instructions box shows how much of its limit is used.
function wireInstructionsCount(instructions) {
  const counter = h('span', { class: 'setting-count', 'aria-live': 'polite' });
  const paintCount = () => { counter.textContent = `${instructions.value.length} / ${INSTRUCTIONS_LIMIT}`; };
  instructions.after(counter);
  instructions.addEventListener('input', paintCount);
  paintCount();
}

// Without the server, the page shows the config set commands to copy.
function showConfigCommands(commands, status, changed, values) {
  const lines = changed.map((key) => `${CLI_NAME} config set ${key} ${commandValue(key, values[key])}`);
  status.textContent = `This page cannot write files. Run ${lines.length === 1 ? 'this command' : 'these commands'}, or download config.json.`;
  fill(commands,
    h('ul', { class: 'command-list' }, lines.map((line) => h('li', null, h('code', null, line), copyButton(() => line)))),
    lines.length > 1 && copyButton(() => lines.join('\n'), 'Copy all'));
}

// Long enough to read "Saved", short enough not to wait on.
const RELOAD_DELAY_MS = 900;

// One save at a time: a second press while the first runs does nothing.
// The server rebuilds the pages with the new defaults, so the page reloads.
function saveConfig(context, { submit, status }, changed, values, onSaved) {
  if (submit.disabled) return;
  submit.disabled = true;
  status.textContent = 'Saving…';
  serveFetch(context, serveApi(context, 'config'), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(Object.fromEntries(changed.map((key) => [key, values[key]]))),
  }).then(({ json: body }) => {
    onSaved(body && body.config ? body.config : values);
    status.textContent = `Saved ${plural(changed.length, 'setting')}. Reloading with the new defaults.`;
    window.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
  }).catch((error) => {
    submit.disabled = false;
    status.textContent = `Could not save: ${error.message}`;
  });
}

function defaultsGroup(context, initialConfig) {
  let saved = normalizeDefaults(initialConfig);
  const serve = context && context.serve && typeof context.serve.token === 'string' ? context.serve : null;
  const status = h('p', { class: 'settings-status', role: 'status', 'aria-live': 'polite' });
  const commands = h('div', { class: 'settings-commands' });
  const fields = Object.fromEntries(Object.keys(CONFIG_FIELDS).map((key) => [key, defaultsRow(key, saved[key])]));
  const current = () => ({ ...saved, ...Object.fromEntries(Object.keys(CONFIG_FIELDS).map((key) => [key, fields[key].control.read()])) });
  const submit = h('button', { class: 'btn primary', type: 'submit' }, serve ? 'Save' : 'Show the commands');
  if (serve) needsServer(submit);
  const form = h('form', { class: 'settings-form', novalidate: true }, Object.values(fields).map((f) => f.el),
    h('p', { class: 'setting-hint' }, 'Chapters per type are set from the command line: ',
      h('code', null, `${CLI_NAME} config set chapters '{"repo":{"quiz":false}}'`)),
    h('div', { class: 'settings-actions' },
      submit,
      h('button', { class: 'btn', type: 'button', onclick: () => downloadBlob('config.json', `${JSON.stringify(current(), null, 2)}\n`) }, icon('download'), 'Download config.json'),
      status),
    commands);
  wireInstructionsCount(fields.instructions.control.el);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = current();
    const bad = markInvalid(fields, values);
    if (bad) { status.textContent = 'Fix the marked fields first.'; bad.focus(); return; }
    const changed = Object.keys(values).filter((key) => JSON.stringify(values[key]) !== JSON.stringify(saved[key]));
    if (!changed.length) { status.textContent = 'Nothing changed.'; fill(commands); return; }
    if (serve) saveConfig(context, { submit, status }, changed, values, (config) => { saved = normalizeDefaults(config); });
    else showConfigCommands(commands, status, changed, values);
  });

  return h('section', { class: 'panel settings-group', 'aria-labelledby': 'settings-defaults-title' },
    h('div', { class: 'settings-legend' }, h('h2', { id: 'settings-defaults-title' }, 'Explainer defaults'),
      h('span', { class: 'eyebrow quiet' }, serve ? 'Saved to config.json' : 'Read from config.json')),
    h('p', { class: 'setting-hint' }, 'What the skill uses for the next explainer you build.'),
    form);
}

// Explainer defaults always show: the built-in defaults merged with what the
// page carries (never the free-text instructions). Under `library serve` the
// real config, instructions included, comes from GET /api/config.
function defaultsSlot(context, config) {
  const slot = h('div', { class: 'settings-slot' }, defaultsGroup(context, config || {}));
  const serve = context && context.serve && typeof context.serve.token === 'string' ? context.serve : null;
  if (serve) {
    serveFetch(context, serveApi(context, 'config'))
      .then(({ json }) => { if (json && json.config) fill(slot, defaultsGroup(context, json.config)); })
      .catch(() => { /* keep the embedded values; Save reports any server problem */ });
  }
  return slot;
}

/**
 * The Settings view. `config` holds the current explainer defaults, when the
 * page has them (context.config on explainer pages, data.config on the hub).
 * @returns {{ key: string, title: string, nav: string, section: HTMLElement, controller: object }}
 */
