// The reader's side of the learning loop: a quiet "Was this clear?" control
// at the end of each chapter (and for the flow, idea, diagram or walkthrough
// on show), the Overview card "Changed since last time", and the Settings
// rows. Votes go to the recorder in signals.js; nothing here talks to a server.

const FB_CHOICES = [
  { vote: 'clear', label: 'Clear' },
  { vote: 'more', label: 'Explain more' },
  { vote: 'basic', label: 'Too basic' },
];
// Chapters whose items get their own control, and how to name the item on show.
const FB_ITEMS = {
  flows: { noun: 'This flow', items: (d) => list(d.flows).map((f) => [f.id, f.title]) },
  concepts: { noun: 'This idea', items: (d) => list(d.concepts).map((c, i) => [String(i), c.title]) },
  visuals: { noun: 'This diagram', items: (d) => list(d.diagrams).map((g) => [g.id, g.title]) },
  code: { noun: 'This walkthrough', items: (d) => list(d.walkthroughs).map((w) => [w.id, w.title]) },
};
const FB = { uid: 0 };

function fbUid(prefix) {
  FB.uid += 1;
  return `${prefix}-${FB.uid}`;
}

function fbStatusText(vote, recorder) {
  if (!vote) return 'Vote cleared.';
  return recorder.served()
    ? 'Thanks. It goes to the library when you leave this page.'
    : 'Thanks. Saved in this browser until you send it from Settings.';
}

/** The note field shown after Explain more or Too basic (one line, up to 140 characters). */
function fbNoteField(id, onSave) {
  const input = h('input', { class: 'fb-note-input', id, type: 'text', maxlength: 140, autocomplete: 'off', spellcheck: 'true' });
  const save = h('button', { class: 'btn small', type: 'button', onclick: () => onSave(input.value) }, 'Save note');
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); onSave(input.value); }
  });
  const wrap = h('div', { class: 'fb-note', hidden: true },
    h('label', { class: 'fb-note-label', for: id }, 'What would help? One line, optional.'), h('div', { class: 'fb-note-row' }, input, save));
  return { wrap, input };
}

/**
 * One "Was this clear?" row for whichever section route() names now.
 * @returns {{ el: HTMLElement, paint: () => void }}
 */
function fbControl(recorder, { route, label }) {
  const qid = fbUid('fb-q');
  const what = h('span', { class: 'fb-what' });
  const status = h('p', { class: 'fb-status', role: 'status', 'aria-live': 'polite' });
  const note = fbNoteField(fbUid('fb-note'), (value) => {
    const current = recorder.voteOf(route());
    if (!current || !current.now) return;
    recorder.vote(route(), current.now, value);
    fill(status, 'Note saved with your vote.');
  });
  const buttons = FB_CHOICES.map((choice) => h('button', { class: 'fb-choice', type: 'button', role: 'radio', 'aria-checked': 'false', 'data-vote': choice.vote }, choice.label));
  function choose(vote) {
    const current = recorder.voteOf(route());
    const next = current && current.now === vote ? null : vote;
    if (!recorder.vote(route(), next, '')) return;
    paint();
    fill(status, fbStatusText(next, recorder));
  }
  buttons.forEach((button, i) => {
    button.addEventListener('click', () => choose(FB_CHOICES[i].vote));
    button.addEventListener('keydown', (event) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      const next = (i + step + buttons.length) % buttons.length;
      buttons[next].focus();
      choose(FB_CHOICES[next].vote);
    });
  });
  function paint() {
    const current = recorder.voteOf(route());
    const vote = current ? current.now : null;
    fill(what, label());
    buttons.forEach((button, i) => {
      const on = FB_CHOICES[i].vote === vote;
      button.setAttribute('aria-checked', String(on));
      button.tabIndex = on || (!vote && i === 0) ? 0 : -1;
    });
    note.wrap.hidden = vote !== 'more' && vote !== 'basic';
    if (!note.wrap.hidden && document.activeElement !== note.input) note.input.value = (current && current.note) || '';
  }
  const el = h('div', { class: 'fb-row' },
    h('p', { class: 'fb-q', id: qid }, h('span', { class: 'fb-ask' }, 'Was this clear?'), what),
    h('div', { class: 'fb-choices', role: 'radiogroup', 'aria-labelledby': qid }, buttons),
    note.wrap, status);
  paint();
  return { el, paint };
}

/** The item a chapter shows now (from the address), else its first one. */
function fbItemRoute(chapter, data, recorder) {
  const now = recorder.routesNow().find((r) => r.startsWith(`${chapter}/`));
  if (now) return now;
  const first = FB_ITEMS[chapter].items(data).find(([id]) => recorder.fingerprint(`${chapter}/${linkPart(id)}`));
  return first ? `${chapter}/${linkPart(first[0])}` : null;
}

function fbItemLabel(chapter, data, route) {
  const id = decodeURIComponent(String(route).split('/')[1] || '');
  const found = FB_ITEMS[chapter].items(data).find(([key]) => String(key) === id);
  return `${FB_ITEMS[chapter].noun}: ${text(found && found[1], id)}`;
}

/**
 * The feedback panel at the end of a chapter view: the item on show (for
 * flows, ideas, diagrams and walkthroughs) and the chapter. Null where
 * nothing is recorded (a hosted copy, learning off, or no section key).
 */
function fbChapterPanel(chapter, data, recorder) {
  if (!recorder || !recorder.active() || !recorder.fingerprint(chapter)) return null;
  const rows = [];
  if (FB_ITEMS[chapter] && fbItemRoute(chapter, data, recorder)) {
    const route = () => fbItemRoute(chapter, data, recorder);
    rows.push(fbControl(recorder, { route, label: () => fbItemLabel(chapter, data, route()) }));
  }
  rows.push(fbControl(recorder, { route: () => chapter, label: () => 'This chapter' }));
  recorder.onRoute(() => rows.forEach((row) => row.paint()));
  return h('section', { class: 'fb-panel', 'aria-label': 'Was this clear?' }, rows.map((row) => row.el));
}

// ---------- Overview: changed since last time ----------
const FB_BECAUSE = { readers: 'Readers asked', source: 'The source changed', notes: 'From the last run' };

/** The Overview card listing what this build changed and why; null without changesSinceLast. */
function lrnChangedCard(data) {
  const since = data && data.changesSinceLast;
  const items = list(since && since.items).filter((item) => item && text(item.what));
  const kept = list(since && since.kept).filter((item) => item && text(item.reason));
  if (!items.length && !kept.length) return null;
  return h('section', { class: 'panel lrn-changed', 'aria-labelledby': 'lrn-changed-title' },
    h('div', { class: 'panel-bar' }, h('h2', { id: 'lrn-changed-title' }, 'Changed since last time'), h('span', null, plural(items.length, 'change'))),
    h('ul', { class: 'lrn-list' }, items.map((item) => h('li', { class: 'lrn-item' },
      h('span', { class: `lrn-because is-${FB_BECAUSE[item.because] ? item.because : 'source'}` }, FB_BECAUSE[item.because] || 'Changed'),
      h('span', { class: 'lrn-what' }, softBreaks(item.what)),
      text(item.route) && h('a', { class: 'link lrn-open', href: `#${item.route}` }, 'Open')))),
    kept.length > 0 && h('div', { class: 'lrn-kept' }, h('p', { class: 'detail-label' }, 'Kept as it was'),
      h('ul', { class: 'lrn-list' }, kept.map((item) => h('li', { class: 'lrn-item' }, h('span', { class: 'lrn-what' }, softBreaks(item.reason)))))));
}

// ---------- Settings ----------
const LRN_CHOICES = [{ choice: 'on', label: 'On' }, { choice: 'off', label: 'Off' }];

/** Reading rows: the learning toggle and "Delete what this browser recorded". */
function lrnReadingRows(registry) {
  const status = h('p', { class: 'setting-hint', role: 'status', 'aria-live': 'polite' });
  const toggle = choiceSwitch(registry, {
    choices: LRN_CHOICES, read: () => (sigLearningOn() ? 'on' : 'off'), label: 'Help improve future explainers', className: 'theme-switch style-switch', withIcons: false,
    write: (choice) => {
      writeStore(SIG_LEARNING_KEY, choice);
      fill(status, choice === 'off' ? 'Nothing new is recorded. What this browser already recorded stays until you delete it.' : 'Recording again, in this browser only.');
    },
  });
  toggle.setAttribute('aria-labelledby', 'set-learning-label');
  toggle.setAttribute('aria-describedby', 'set-learning-hint');
  toggle.removeAttribute('aria-label');
  const forget = h('button', {
    class: 'btn small', type: 'button',
    onclick: () => fill(status, `Deleted ${plural(sigForgetAll(), 'record')} from this browser.`),
  }, 'Delete what this browser recorded');
  return [
    settingRow('set-learning', 'Help improve future explainers', toggle,
      'Counts which parts you open, how long, your quiz tries and your "Was this clear?" votes, in this browser only. The library uses them to explain more where readers needed it.'),
    h('div', { class: 'setting-row lrn-forget' }, forget, status),
  ];
}

function lrnSummaryLine(summary) {
  if (!summary.batch) return 'Nothing is waiting to be sent.';
  return `Waiting to send: ${plural(summary.sections, 'section')}, ${plural(summary.votes, 'vote')}, ${plural(summary.quiz, 'quiz answer')}, ${plural(summary.lookups, 'lookup')}.`;
}

/** Served pages: Send now. file:// pages: the exact batch, a download and the import command. */
function lrnSendGroup(recorder) {
  if (!recorder) return null;
  const line = h('p', { class: 'setting-hint lrn-waiting' });
  const status = h('p', { class: 'lrn-send-status', role: 'status', 'aria-live': 'polite' });
  const body = h('div', { class: 'lrn-send-body' });
  const refresh = () => {
    const summary = recorder.summary();
    fill(line, lrnSummaryLine(summary));
    fill(body, ...(recorder.served() ? lrnServedControls(recorder, status, refresh) : lrnFileControls(recorder, summary)));
  };
  window.addEventListener('hashchange', () => { if (window.location.hash === '#settings') refresh(); });
  refresh();
  return h('fieldset', { class: 'panel settings-group lrn-send' },
    h('legend', { class: 'settings-legend' }, h('span', null, 'Feedback for the library'), h('span', { class: 'eyebrow quiet' }, 'Counts only')),
    line, body, status);
}

function lrnServedControls(recorder, status, refresh) {
  const button = h('button', { class: 'btn small', type: 'button' }, 'Send now');
  button.addEventListener('click', () => {
    button.disabled = true;
    fill(status, 'Sending.');
    recorder.send().then((out) => {
      button.disabled = false;
      fill(status, h('span', { class: `lrn-mark ${out.ok ? 'is-ok' : 'is-wait'}`, 'aria-hidden': 'true' }), out.message);
      refresh();
    });
  });
  return [h('div', { class: 'btn-row' }, button)];
}

function lrnFileControls(recorder, summary) {
  if (!summary.batch) return [];
  const json = JSON.stringify(summary.batch, null, 2);
  const name = recorder.fileName();
  return [
    h('details', { class: 'lrn-preview' }, h('summary', null, 'Send feedback to the library: see exactly what goes'),
      h('pre', { class: 'code lrn-json' }, json)),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn small', type: 'button', onclick: () => downloadBlob(name, `${json}\n`) }, 'Download feedback file')),
    h('p', { class: 'setting-hint' }, 'Then run this where your library lives:'),
    commandBlock([`${CLI_NAME} insights import ${name}`]),
  ];
}
