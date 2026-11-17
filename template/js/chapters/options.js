// Chapter: options. A comparison matrix: one column per option, rows for
// summary, pros, cons and why, the chosen column marked. A score strip on
// top draws pros and cons as marks; on phones it picks the one column shown.
// Deep link: #options/<index> (from 0).

function chMarks(count, cls) {
  return h('span', { class: `ch-marks ${cls}`, 'aria-hidden': 'true' }, Array.from({ length: Math.min(count, 5) }, () => h('i')));
}

function chOptionScore(option, i) {
  const pros = list(option.pros).length;
  const cons = list(option.cons).length;
  return h('button', {
    class: `ch-score${option.chosen === true ? ' is-chosen' : ''}`, type: 'button', 'aria-pressed': 'false',
    'aria-label': `${text(option.title)}: ${chCount(pros, 'pro')}, ${chCount(cons, 'con')}${option.chosen === true ? ', chosen' : ''}`,
  },
  h('span', { class: 'ch-score-title' }, softBreaks(text(option.title, `Option ${i + 1}`))),
  h('span', { class: 'ch-score-marks' }, chMarks(pros, 'is-pro'), h('span', { class: 'ch-score-axis' }), chMarks(cons, 'is-con')),
  option.chosen === true && h('span', { class: 'ch-chosen' }, 'Chosen'));
}

// One matrix column: the same five rows for every option.
function chOptionColumn(option, i) {
  const section = (label, body) => h('div', { class: 'ch-opt-cell' }, h('p', { class: 'detail-label' }, label), body);
  return h('article', { class: `ch-opt-col${option.chosen === true ? ' is-chosen' : ''}`, 'aria-label': text(option.title, `Option ${i + 1}`) },
    h('header', { class: 'ch-opt-head' },
      h('span', { class: 'step-count' }, `Option ${i + 1}`),
      h('h3', null, softBreaks(text(option.title))),
      option.chosen === true && h('span', { class: 'ch-chosen' }, 'Chosen')),
    section('In short', h('p', null, softBreaks(text(option.summary)))),
    section(`Pros · ${list(option.pros).length}`, chMarkedList(option.pros, 'is-pro', 'Pros') || h('p', { class: 'ch-ctx-none' }, 'None listed.')),
    section(`Cons · ${list(option.cons).length}`, chMarkedList(option.cons, 'is-con', 'Cons') || h('p', { class: 'ch-ctx-none' }, 'None listed.')),
    h('div', { class: 'ch-opt-cell' }, text(option.why) && [h('p', { class: 'detail-label' }, 'Why this one'), h('p', null, softBreaks(option.why))],
      safeUrl(option.url) && h('a', { class: 'link', href: safeUrl(option.url), rel: 'noopener noreferrer', target: '_blank' }, 'Read more')));
}

// The strip's head: the chosen option, or the status while undecided, and the legend.
function chOptionHead(options, chosen, status) {
  const decision = chosen >= 0
    ? h('p', { class: 'ch-decision' }, h('span', { class: 'ch-chosen' }, 'Chosen'), softBreaks(text(options[chosen].title)))
    : h('p', { class: 'ch-decision' }, chStatusWord(status || 'proposed'), 'No option is chosen yet.');
  return h('div', { class: 'ch-strip-head' }, decision,
    h('p', { class: 'ch-legend', 'aria-hidden': 'true' }, h('span', null, chMarks(1, 'is-pro'), 'Pro'), h('span', null, chMarks(1, 'is-con'), 'Con')));
}

/**
 * @param {object} data explainer data (reads data.options, data.meta.status)
 * @param {HTMLElement} mount the chapter body
 * @returns {{ open: (parts: string[]) => Element|null }|null}
 */
function chRenderOptions(data, mount) {
  const options = list(data.options).filter((o) => o && typeof o === 'object');
  if (!options.length) {
    mount.append(h('p', { class: 'empty' }, 'No options listed.'));
    return null;
  }
  const chosen = options.findIndex((o) => o.chosen === true);
  const strip = options.map(chOptionScore);
  const columns = options.map(chOptionColumn);
  function select(index, { link = true } = {}) {
    chMarkCurrent(strip, index);
    columns.forEach((col, i) => col.classList.toggle('is-selected', i === index));
    if (link) setDeepLink(`options/${index}`);
    return columns[index];
  }
  strip.forEach((button, i) => button.addEventListener('click', () => select(i)));
  chRoving(strip, { axis: 'y', onMove: (i) => select(i) });
  mount.append(h('div', { class: 'ch-cq' }, h('div', { class: 'ch-options' },
    h('div', { class: 'panel ch-strip' }, chOptionHead(options, chosen, text(data.meta && data.meta.status)),
      h('div', { class: 'ch-strip-rows', role: 'group', 'aria-label': 'Options' }, strip)),
    h('div', { class: 'ch-matrix', style: `--opts:${options.length}` }, columns))));
  select(chosen >= 0 ? chosen : 0, { link: false });
  return chIndexOpener(select, options.length);
}
