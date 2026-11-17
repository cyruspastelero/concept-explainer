// The hub's Insights view (#insights): what readers needed explained more.
// The hub embeds counts only (data.insights; null when learning is off).
// Reader notes, prompts, terms and commands come from GET /api/insights with
// the per-run or device token; without one the view shows the counts and the
// command to run. Every number names what it counts. A title that failed the
// untrusted-text rules arrives withheld: the slug is shown instead.

const INS_TOTALS = [
  ['explainMore', 'Explain more', 'section', 'sections'],
  ['weakQuiz', 'Weak quiz items', 'question', 'questions'],
  ['terms', 'Terms looked up', 'term', 'terms'],
  ['refreshes', 'Suggested refreshes', 'explainer', 'explainers'],
];

const insNumber = (value) => (Number.isInteger(value) && value >= 0 ? value : 0);

/** The name to show: the slug when the title was withheld. */
function insName(item, titles) {
  if (item.withheld === true || !text(item.title)) return text(titles && titles.get(item.slug), item.slug);
  return item.title;
}

/** Only links into this library: a relative explainers/<slug>/… address. */
function insHref(value) {
  return typeof value === 'string' && /^explainers\/[a-z0-9]+(-[a-z0-9]+)*\/index\.html(#[A-Za-z0-9%._~/-]*)?$/.test(value) ? value : null;
}

function insTotals(summary) {
  const totals = (summary && summary.totals) || {};
  return h('dl', { class: 'glance-grid ins-totals' }, INS_TOTALS.map(([key, label, one, many]) => h('div', null,
    h('dt', null, label), h('dd', null, String(insNumber(totals[key]))), h('p', { class: 'ins-unit' }, plural(insNumber(totals[key]), one, many).replace(/^\d+ /, '')))));
}

function insExplainerRows(summary, titles) {
  const rows = list(summary && summary.explainers).filter((e) => e && typeof e.slug === 'string');
  if (!rows.length) return h('p', { class: 'empty' }, 'No open flags and no refresh due.');
  return h('ul', { class: 'rows ins-rows' }, rows.map((e) => h('li', { class: 'ins-row' },
    h('span', { class: 'row-title' }, softBreaks(text(titles.get(e.slug), e.slug))),
    h('span', { class: 'ins-facts' },
      h('span', null, `${plural(insNumber(e.explainMore), 'section')} to explain more (${plural(insNumber(e.explainMoreVotes), 'vote')})`),
      h('span', null, plural(insNumber(e.weakQuiz), 'weak question')),
      h('span', null, plural(insNumber(e.openFlags), 'open flag')),
      e.refresh === true && h('span', { class: 'ins-due' }, 'Refresh due')))));
}

function insSection(title, items, render, emptyText) {
  return h('section', { class: 'panel ins-block' },
    h('div', { class: 'panel-bar' }, h('h2', null, title), h('span', null, String(items.length))),
    items.length ? h('ul', { class: 'rows' }, items.map((item) => h('li', { class: 'ins-item' }, render(item)))) : h('p', { class: 'ins-empty' }, emptyText));
}

function insOpen(item) {
  const href = insHref(item.href);
  return href ? h('a', { class: 'link', href }, 'Open the section') : null;
}

function insMoreItem(item, titles) {
  return [
    h('p', { class: 'ins-head' }, h('b', null, softBreaks(insName(item, titles))), h('span', { class: 'ins-n' }, plural(insNumber(item.n), 'vote')), insOpen(item)),
    h('p', { class: 'ins-route mono' }, softBreaks(text(item.route))),
    list(item.notes).length > 0 && h('ul', { class: 'ins-notes', 'aria-label': 'Reader notes' }, list(item.notes).filter((n) => typeof n === 'string').map((n) => h('li', null, softBreaks(n)))),
  ];
}

function insQuizItem(item, titles) {
  const picked = Number.isInteger(item.mostPicked) ? `Most picked wrong option: ${item.mostPicked + 1}.` : '';
  return [
    h('p', { class: 'ins-head' }, h('b', null, softBreaks(insName(item, titles))), h('span', { class: 'ins-n' }, plural(insNumber(item.n), 'answer')), insOpen(item)),
    h('p', null, `${insNumber(item.firstWrong)} of ${plural(insNumber(item.n), 'answer')} wrong on the first try. ${picked}`.trim()),
  ];
}

function insTermItem(item) {
  return [h('p', { class: 'ins-head' }, h('b', null, softBreaks(text(item.term))),
    h('span', { class: 'ins-n' }, `${plural(insNumber(item.n), 'lookup')} in ${plural(insNumber(item.explainers), 'explainer')}`))];
}

function insRefreshItem(item, titles) {
  return [
    h('p', { class: 'ins-head' }, h('b', null, softBreaks(insName(item, titles))), h('span', { class: 'ins-n' }, plural(insNumber(item.openFlags), 'open flag'))),
    list(item.reasons).length > 0 && h('p', null, list(item.reasons).filter((r) => typeof r === 'string').join('. ')),
    h('div', { class: 'btn-row' },
      text(item.prompt) && copyButton(() => item.prompt, 'Copy the agent prompt'),
      text(item.command) && copyButton(() => item.command, 'Copy the command')),
    text(item.command) && h('p', null, h('code', null, item.command)),
  ];
}

/** The detail lists from GET /api/insights. */
function insDetail(insights, titles) {
  const d = insights || {};
  return [
    insSection('Explain more', list(d.explainMore), (item) => insMoreItem(item, titles), 'No reader asked for more.'),
    insSection('Weak quiz items', list(d.weakQuiz), (item) => insQuizItem(item, titles), 'No question trips readers yet.'),
    insSection('Terms you keep looking up', list(d.terms), insTermItem, 'No term looked up often enough yet.'),
    insSection('Suggested refreshes', list(d.refreshes), (item) => insRefreshItem(item, titles), 'Nothing to refresh.'),
  ];
}

function insNoToken() {
  return h('section', { class: 'panel ins-block ins-offline' },
    h('div', { class: 'panel-bar' }, h('h2', null, 'Details')),
    h('div', { class: 'ins-offline-body' },
      h('p', null, 'Reader notes, the sections to open, and the prompts to refresh an explainer show when this hub is opened by the library. From here, run:'),
      commandBlock([`${CLI_NAME} insights`])));
}

/**
 * The Insights view, or null when learning is off (data.insights is null).
 * @returns {{ section: HTMLElement, count: number, refresh: () => void }|null}
 */
function insMount(data, context, titles) {
  const summary = data && data.insights;
  if (!summary || typeof summary !== 'object') return null;
  const detail = h('div', { class: 'ins-detail', 'aria-live': 'polite' });
  const totals = h('div', { class: 'ins-totals-slot' }, insTotals(summary));
  const section = h('section', { class: 'view hub-view ins-view', 'data-view': 'insights', hidden: true, 'aria-labelledby': 'view-insights-title' },
    h('header', { class: 'view-head' },
      h('p', { class: 'eyebrow quiet' }, 'Library'),
      h('h1', { id: 'view-insights-title', tabindex: '-1' }, 'Insights'),
      h('p', { class: 'view-lead' }, 'Where readers needed more, from this library only. Each number says what it counts.')),
    h('div', { class: 'view-body' }, totals,
      h('p', { class: 'ins-asof' }, `Per explainer, as of the last library rebuild${summary.updatedAt ? ` (${displayDate(summary.updatedAt)})` : ''}.`),
      insExplainerRows(summary, titles), detail));
  function refresh() {
    const token = context && context.serve && context.serve.token ? context.serve.token : readStore('concept-explainer:device');
    if (!token || !/^https?:$/.test(window.location.protocol)) { fill(detail, insNoToken()); return; }
    fill(detail, h('p', { class: 'ins-loading' }, 'Loading the details.'));
    const withToken = { ...context, serve: { ...(context.serve || {}), token } };
    serveFetch(withToken, serveApi(withToken, 'insights'))
      .then(({ json }) => {
        const live = (json && json.insights) || {};
        // The tiles follow the live detail, which is newer than the embedded counts.
        fill(totals, insTotals({ totals: Object.fromEntries(INS_TOTALS.map(([key]) => [key, list(live[key]).length])) }));
        fill(detail, ...insDetail(live, titles));
      })
      .catch((error) => fill(detail, h('p', { class: 'ins-error', role: 'status' }, `The details could not load: ${error.message}`), insNoToken()));
  }
  return { section, count: insNumber(summary.totals && summary.totals.explainMore), refresh };
}
