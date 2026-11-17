// Chapter: code walkthrough (walkthroughs[]). One real snippet, its important
// lines annotated in reading order, one step at a time with Back / Continue,
// then the takeaway. Deep links: #code/<id>, #code/<id>/<n> (steps counted
// from 1, like flow steps) and #code/<id>/done (the takeaway).

const CH_CODE_KINDS = { what: 'What it does', why: 'Why', gotcha: 'Watch out', input: 'Input', output: 'Output' };
const CH_CODE_HASH = new Set(['python', 'ruby', 'sh', 'yaml', 'toml', 'dockerfile', 'make', 'elixir', 'hcl', 'r', 'perl']);
const CH_CODE_DASH = new Set(['sql', 'lua', 'haskell']);
const CH_CODE_KEYWORDS = new Set(('abstract as async await break case catch class const continue def defer del do elif else enum except '
  + 'export extends false final finally fn for from func function go if impl implements import in instanceof interface is lambda '
  + 'let loop match mod module mut new nil none not null of or and package pass private protected pub public raise return '
  + 'select self static struct super switch this throw throws trait true try type typeof use var void where while with yield '
  + 'SELECT FROM WHERE INSERT INTO UPDATE DELETE JOIN LEFT INNER ON AND OR NOT NULL ORDER BY GROUP LIMIT VALUES SET CREATE TABLE INDEX AS '
  + 'True False None').split(' '));
const CH_CODE_STICKY = 96;

/** "3" or "3-5" as { from, to }, or null. */
function chCodeLines(value) {
  const match = typeof value === 'string' ? value.trim().match(/^(\d+)(?:-(\d+))?$/) : null;
  if (!match) return null;
  const from = Number(match[1]);
  const to = Number(match[2] || match[1]);
  return to >= from ? { from, to } : null;
}

/** Where a walkthrough's lines start and end in its file (1..n when illustrative). */
function chCodeRange(walk) {
  const count = String(walk.code || '').replace(/\r\n?/g, '\n').split('\n').length;
  const match = walk.illustrative !== true && typeof walk.file === 'string' ? walk.file.match(/^(.+):(\d+)(?:-(\d+))?$/) : null;
  const start = match ? Number(match[2]) : 1;
  return { path: match ? match[1] : null, start, end: start + count - 1 };
}

/**
 * Split one line into [className|null, text] pieces: comments, strings and
 * keywords only. `state.block` carries an open block comment to the next line.
 */
function chCodeTokens(line, lang, state) {
  const parts = [];
  const push = (cls, value) => {
    if (!value) return;
    const last = parts[parts.length - 1];
    if (last && last[0] === cls) last[1] += value; else parts.push([cls, value]);
  };
  const hash = CH_CODE_HASH.has(lang);
  const dash = CH_CODE_DASH.has(lang);
  let i = 0;
  while (i < line.length) {
    if (state.block) {
      const close = line.indexOf('*/', i);
      const end = close < 0 ? line.length : close + 2;
      push('cm', line.slice(i, end));
      if (close >= 0) state.block = false;
      i = end;
    } else if (!hash && line.startsWith('/*', i)) {
      state.block = true;
    } else if ((!hash && !dash && line.startsWith('//', i)) || (hash && line[i] === '#') || (dash && line.startsWith('--', i))) {
      push('cm', line.slice(i));
      i = line.length;
    } else if (line[i] === '"' || line[i] === "'" || line[i] === '`') {
      const quote = line[i];
      let j = i + 1;
      while (j < line.length && line[j] !== quote) j += line[j] === '\\' ? 2 : 1;
      push('st', line.slice(i, Math.min(j + 1, line.length)));
      i = Math.min(j + 1, line.length);
    } else {
      const word = line.slice(i).match(/^[A-Za-z_$][\w$]*/);
      if (word) {
        push(CH_CODE_KEYWORDS.has(word[0]) ? 'kw' : null, word[0]);
        i += word[0].length;
      } else {
        push(null, line[i]);
        i += 1;
      }
    }
  }
  return parts;
}

/** The index of the first step that covers a file line, or -1. */
function chCodeStepAt(walk, line) {
  return list(walk.steps).findIndex((step) => {
    const lines = chCodeLines(step && step.lines);
    return lines && line >= lines.from && line <= lines.to;
  });
}

/**
 * The deep link to a walkthrough covering a cited file line ("path:42" or
 * "path:40-44"), at the step that covers it, or null. For flow steps with
 * code and concepts with a file: "Walk through this code".
 */
function chWalkthroughFor(data, fileRef) {
  const match = typeof fileRef === 'string' ? fileRef.match(/^(.+?):(\d+)(?:-\d+)?$/) : null;
  if (!match) return null;
  const line = Number(match[2]);
  const walks = list(data && data.walkthroughs);
  for (let i = 0; i < walks.length; i += 1) {
    const walk = walks[i];
    if (walk && walk.illustrative !== true && text(walk.id)) {
      const range = chCodeRange(walk);
      if (range.path === match[1] && line >= range.start && line <= range.end) {
        const step = chCodeStepAt(walk, line);
        return `#code/${linkPart(walk.id)}/${step >= 0 ? step + 1 : 1}`;
      }
    }
  }
  return null;
}

/** A "Walk through this code" link for a cited file line, or null. */
function chWalkthroughLink(data, fileRef) {
  const href = chWalkthroughFor(data, fileRef);
  return href ? h('a', { class: 'link ch-walk-link', href }, 'Walk through this code') : null;
}

function chCodeRefs(refs, data) {
  if (!refs || typeof refs !== 'object') return null;
  const nodes = byId(data.nodes);
  const flow = list(data.flows).find((f) => f && f.id === refs.flow);
  const concept = Number.isInteger(refs.concept) ? list(data.concepts)[refs.concept] : null;
  const items = [
    refs.node !== undefined && nodes.has(refs.node) && ['On the map', `#map/${linkPart(refs.node)}`, text(nodes.get(refs.node).label, refs.node)],
    flow && ['In the flow', `#flows/${linkPart(flow.id)}${Number.isInteger(refs.step) ? `/${refs.step}` : ''}`,
      `${text(flow.title, flow.id)}${Number.isInteger(refs.step) ? `, step ${refs.step}` : ''}`],
    concept && ['Key idea', `#concepts/${refs.concept}`, text(concept.title)],
    typeof refs.glossary === 'string' && refs.glossary && ['Term', `#glossary/${linkPart(refs.glossary)}`, refs.glossary],
  ].filter(Boolean);
  if (!items.length) return null;
  return h('ul', { class: 'ch-code-refs', 'aria-label': 'See also' }, items.map(([label, href, name]) => h('li', null,
    h('span', { class: 'detail-label' }, label), h('a', { class: 'link', href }, softBreaks(name)))));
}

function chCodeDots(count, current, go) {
  return h('div', { class: 'ch-code-dots' }, Array.from({ length: count }, (_, i) => h('button', {
    type: 'button', class: i === current ? 'is-current' : i < current ? 'is-done' : '', 'aria-label': `Go to step ${i + 1}`,
    'aria-current': i === current ? 'step' : null, onclick: () => go(i),
  })));
}

function chCodeHead(walk) {
  return [
    h('h2', { class: 'ch-code-title' }, softBreaks(text(walk.title))),
    text(walk.why) && h('p', { class: 'ch-code-why' }, softBreaks(walk.why)),
    h('div', { class: 'ch-code-meta' },
      walk.illustrative === true ? tag('Illustrative, not from a repo', 'ch-illustrative') : text(walk.file) && fileChip(walk.file),
      text(walk.lang) && tag(walk.lang)),
  ];
}

/** The line gutter and code: one row per line, numbers that a step covers jump to it. */
function chCodeRows(walk, go) {
  const range = chCodeRange(walk);
  const tokens = { block: false };
  const lang = text(walk.lang, 'text').toLowerCase();
  return String(walk.code).replace(/\r\n?/g, '\n').split('\n').map((line, k) => {
    const number = range.start + k;
    const step = chCodeStepAt(walk, number);
    const num = step >= 0
      ? h('button', { class: 'ch-code-num', type: 'button', 'aria-label': `Line ${number}, step ${step + 1}`, onclick: () => go(step) }, String(number))
      : h('span', { class: 'ch-code-num', 'aria-hidden': 'true' }, String(number));
    const textEl = h('span', { class: 'ch-code-text' }, line ? chCodeTokens(line, lang, tokens).map(([cls, value]) => (cls ? h('span', { class: cls }, value) : value)) : ' ');
    return h('div', { class: `ch-code-row${step >= 0 ? ' is-covered' : ''}`, 'data-line': String(number) }, num, textEl);
  });
}

/** Mark the current step's lines; the panel dims the rest while a step is shown. */
function chCodePaintRows(panel, rows, step) {
  const lines = step ? chCodeLines(step.lines) : null;
  panel.classList.toggle('has-step', Boolean(lines));
  rows.forEach((row) => {
    const n = Number(row.dataset.line);
    row.classList.toggle('is-current', Boolean(lines) && n >= lines.from && n <= lines.to);
  });
}

/** The annotation card for one step: lines, note, why, links, progress and controls. */
function chCodeStepCard(walk, index, data, go) {
  const steps = list(walk.steps);
  const step = steps[index];
  const lines = chCodeLines(step.lines);
  return [
    h('div', { class: 'step-top' },
      h('span', { class: 'step-count' }, `Step ${index + 1} of ${steps.length}`),
      CH_CODE_KINDS[step.kind] && tag(CH_CODE_KINDS[step.kind], `ch-code-kind is-${step.kind}`)),
    h('p', { class: 'ch-code-lines' }, lines ? (lines.from === lines.to ? `Line ${lines.from}` : `Lines ${lines.from} to ${lines.to}`) : text(step.lines)),
    h('p', { class: 'ch-code-note' }, softBreaks(text(step.note))),
    text(step.why) && h('div', { class: 'why' }, h('p', { class: 'eyebrow quiet' }, 'Why it is written this way'), h('p', null, softBreaks(step.why))),
    chCodeRefs(step.refs, data),
    h('div', { class: 'step-controls' },
      chCodeDots(steps.length, index, go),
      h('button', { class: 'btn', type: 'button', disabled: index === 0, onclick: () => go(index - 1) }, 'Back'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => go(index + 1) }, index === steps.length - 1 ? 'Takeaway' : 'Continue')),
    h('p', { class: 'kbd-hint' }, 'Tip: ', h('kbd', null, '→'), ' or ', h('kbd', null, 'j'), ' for the next step, ', h('kbd', null, '←'), ' or ', h('kbd', null, 'k'), ' to go back.'),
  ];
}

/** The takeaway card, with Replay and, when there is one, Next walkthrough. */
function chCodeDoneCard(walk, lineCount, { replay, next }) {
  return [h('div', { class: 'ch-code-done' },
    h('p', { class: 'eyebrow quiet' }, 'Takeaway'),
    h('h3', null, softBreaks(text(walk.takeaway, text(walk.title)))),
    h('p', { class: 'ch-code-done-line' }, `${chCount(list(walk.steps).length, 'step')} through ${chCount(lineCount, 'line')} of code.`),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', onclick: replay }, 'Replay'),
      next && h('button', { class: 'btn primary', type: 'button', onclick: next }, 'Next walkthrough')))];
}

/** Arrow keys and j / k step through, outside fields, pickers and the progress bar. */
function chCodeKeys(root, view) {
  root.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || (event.target.closest && event.target.closest('input, textarea, .ch-pick, .ch-code-dots'))) return;
    const { done, step } = view.state();
    if (event.key === 'ArrowRight' || event.key === 'j') { event.preventDefault(); if (!done) view.go(step + 1); }
    if (event.key === 'ArrowLeft' || event.key === 'k') { event.preventDefault(); view.go(done ? view.stepCount() - 1 : step - 1); }
  });
}

/** Re-fill a card and keep keyboard focus inside it (the old buttons are gone). */
function chCodeRefill(card, children) {
  const hadFocus = card.contains(document.activeElement);
  fill(card, ...children);
  if (!hadFocus) return;
  const target = [...card.querySelectorAll('.btn.primary, .btn')].find((b) => !b.disabled);
  if (target) target.focus({ preventScroll: true });
}

/** The picker for several walkthroughs. */
function chCodePicks(walks, onPick) {
  const picks = walks.map((walk, i) => h('button', { class: 'ch-pick', type: 'button', 'aria-pressed': 'false', onclick: () => onPick(i) },
    h('span', { class: 'ch-pick-top' }, h('span', null, String(i + 1).padStart(2, '0')), h('span', null, chCount(list(walk.steps).length, 'step'))),
    h('span', { class: 'ch-pick-title' }, softBreaks(text(walk.title, text(walk.id))))));
  chRoving(picks, { onMove: onPick });
  return picks;
}

/** Steps from 1 in the hash, or "done" for the takeaway. */
function chCodeLink(walk, index, state) {
  setDeepLink(`code/${linkPart(text(walk.id, String(index)))}/${state.done ? 'done' : state.step + 1}`);
}

/** #code/<id>, #code/<id>/<n> (steps from 1) and #code/<id>/done. */
function chCodeOpener(walks, card, view) {
  return {
    open([id, n] = []) {
      const index = id === undefined ? -1 : walks.findIndex((w, i) => text(w.id, String(i)) === id);
      if (index < 0) return null;
      if (index !== view.current()) view.pickWalk(index, { linkIt: false });
      const count = list(walks[index].steps).length;
      const wanted = Number.parseInt(n, 10);
      if (n === 'done') view.go(count, { linkIt: false });
      else view.go(Number.isInteger(wanted) && wanted >= 1 && wanted <= count ? wanted - 1 : 0, { linkIt: false });
      return card;
    },
  };
}

/** Draw a walkthrough's head and code; returns the line rows. */
function chCodeDrawWalk(walk, head, panel, go) {
  fill(head, ...chCodeHead(walk));
  const rows = chCodeRows(walk, go);
  const range = chCodeRange(walk);
  fill(panel, h('div', { class: 'ch-code', role: 'group', 'aria-label': `Code, lines ${range.start} to ${range.end}` }, rows));
  return rows;
}

/** The card follows the reader only while it fits on screen: no inner scroll areas. */
function chCodeStickyCard(card) {
  if (!('ResizeObserver' in window)) return;
  new ResizeObserver(() => card.classList.toggle('is-static', card.offsetHeight > window.innerHeight - CH_CODE_STICKY)).observe(card);
}

/**
 * @param {object} data explainer data (reads data.walkthroughs)
 * @param {HTMLElement} mount the chapter body
 * @returns {{ open: (parts: string[]) => Element|null }|null}
 */
function chRenderCode(data, mount) {
  const walks = list(data.walkthroughs).filter((w) => w && typeof w === 'object' && text(w.code) && list(w.steps).length);
  if (!walks.length) {
    mount.append(h('p', { class: 'empty' }, 'No code walkthroughs in this explainer.'));
    return null;
  }
  const head = h('div', { class: 'ch-code-head' });
  const card = h('div', { class: 'panel ch-code-card', 'aria-live': 'polite' });
  const panel = h('div', { class: 'panel ch-code-panel' });
  let state = { walk: 0, step: 0, done: false };
  let rows = [];
  const walkOf = () => walks[state.walk];
  const steps = () => list(walkOf().steps);

  function render(direction = 0) {
    chCodeRefill(card, state.done
      ? chCodeDoneCard(walkOf(), rows.length, { replay: () => go(0), next: state.walk + 1 < walks.length ? () => pickWalk(state.walk + 1) : null })
      : chCodeStepCard(walkOf(), state.step, data, go));
    chCodePaintRows(panel, rows, state.done ? null : steps()[state.step]);
    if (direction) slideIn(card.firstElementChild, direction);
  }

  function go(index, { linkIt = true } = {}) {
    const before = state.done ? steps().length : state.step;
    state = index >= steps().length ? { ...state, done: true } : { ...state, step: Math.max(0, index), done: false };
    const after = state.done ? steps().length : state.step;
    render(Math.sign(after - before));
    if (linkIt) chCodeLink(walkOf(), state.walk, state);
  }

  function pickWalk(i, { linkIt = true } = {}) {
    state = { walk: i, step: 0, done: false };
    rows = chCodeDrawWalk(walkOf(), head, panel, go);
    chMarkCurrent(picks, i);
    render();
    if (linkIt) chCodeLink(walkOf(), i, state);
  }

  const picks = chCodePicks(walks, (i) => pickWalk(i));
  const root = h('div', { class: 'ch-code-chapter' },
    walks.length > 1 && h('div', { class: 'ch-pick-list', role: 'group', 'aria-label': 'Walkthroughs' }, picks),
    head, h('div', { class: 'ch-cq' }, h('div', { class: 'ch-code-layout' }, panel, card)));
  chCodeKeys(root, { state: () => state, go, stepCount: () => steps().length });
  chCodeStickyCard(card);
  pickWalk(0, { linkIt: false });
  mount.append(root);
  return chCodeOpener(walks, card, { current: () => state.walk, pickWalk, go });
}
