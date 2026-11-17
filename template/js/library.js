// Library hub: every explainer in the library, searchable in one place.
// Data contract: { manifest, index } as documented in references/library.md.
// Every string goes through text nodes; hrefs must point inside explainers/.
const LIBRARY_HREF = /^explainers\/[a-z0-9]+(?:-[a-z0-9]+)*\/index\.html(?:#[^\s]*)?$/;
const RESULT_LIMIT = 60;
const STACK_FACETS = 10;
const TYPE_LABELS = {
  explainer: 'Explainer', node: 'Part', flow: 'Flow', step: 'Step', change: 'Change', entity: 'Data', concept: 'Idea',
  glossary: 'Term', file: 'File', run: 'Command', diff: 'Diff', option: 'Option', risk: 'Risk', rollout: 'Rollout',
  event: 'Event', visual: 'Visual', question: 'Question', code: 'Code',
};
const TYPE_ORDER = ['explainer', 'node', 'flow', 'step', 'code', 'option', 'diff', 'risk', 'rollout', 'event', 'entity', 'change', 'concept', 'visual', 'question', 'glossary', 'file', 'run'];
// What each explainer is about (manifest `type`), in words people use.
const KIND_LABELS = {
  repo: 'Repo', pr: 'Pull request', change: 'Change', proposal: 'Proposal', migration: 'Migration', incident: 'Incident', concept: 'Concept',
};
const TAG_FACETS = 10;
const HUB_AUTHORS = [{ id: 'all', label: 'Everyone' }, { id: 'agent', label: 'Agents' }, { id: 'human', label: 'Humans' }];

function libraryHref(value) {
  return typeof value === 'string' && LIBRARY_HREF.test(value) ? value : null;
}

function explainerHref(slug) {
  return libraryHref(`explainers/${slug}/index.html`);
}

// ---------- Pieces ----------
function layerMarkers(layers) {
  const items = list(layers).filter((l) => l && l.label);
  if (!items.length) return null;
  return h('span', { class: 'lib-layers', 'aria-label': `Layers: ${items.map((l) => l.label).join(', ')}` },
    items.slice(0, 8).map((l) => h('span', { class: 'layer-dot', title: l.label, style: layerStyle(l.color) })));
}

function stackTags(stack, max = 4) {
  const items = list(stack).map(String);
  if (!items.length) return null;
  return h('span', { class: 'lib-stack' },
    items.slice(0, max).map((item) => tag(item)),
    items.length > max && h('span', { class: 'tag', title: items.slice(max).join(', ') }, `+${items.length - max}`));
}

function countsLine(counts) {
  const c = counts || {};
  return [
    c.nodes && plural(c.nodes, 'part'), c.flows && plural(c.flows, 'flow'), c.changes && plural(c.changes, 'change'),
  ].filter(Boolean).join(' · ');
}

function explainerCard(explainer) {
  const href = explainerHref(explainer.slug);
  const dated = displayDate(explainer.generatedAt) || displayDate(explainer.publishedAt);
  const parts = [
    h('span', { class: 'top-row' }, h('span', null, KIND_LABELS[explainer.type] || 'Repo', explainer.origin === 'import' && h('span', { class: 'tag tag-imported' }, 'Imported')),
      h('span', null, dated || 'Undated')),
    cardThumb(explainer.thumb),
    h('span', { class: `card-title ${fitClass(explainer.title)}` }, softBreaks(text(explainer.title, explainer.slug))),
    explainer.repo && truncatable(h('span', { class: 'lib-repo' }), explainer.repo, { mode: 'middle' }),
    text(explainer.summary) && h('span', { class: 'line lib-summary' }, wordBreaks(explainer.summary)),
    (explainer.status || list(explainer.tags).length > 0) && h('span', { class: 'lib-stack' },
      explainer.status && tag(explainer.status, 'tag-status'), list(explainer.tags).slice(0, 3).map((t) => tag(`#${t}`))),
    stackTags(explainer.stack),
    layerMarkers(explainer.layers),
    h('span', { class: 'card-foot' }, h('span', { class: 'lib-counts' }, countsLine(explainer.counts)), h('span', { class: 'card-open' }, 'Open')),
  ];
  return href ? h('a', { class: 'card lib-card', href }, parts) : h('div', { class: 'card lib-card' }, parts);
}

function emptyLibrary() {
  return h('section', { class: 'panel lib-empty' },
    h('p', { class: 'eyebrow quiet' }, 'No explainers yet'),
    h('h2', null, 'Build one and it lands here'),
    h('p', null, 'Every explainer you build is added to this library. From a repo with an explainer.json, run:'),
    codeBlock('concept-explainer build <explainer.json>', 'sh'),
    h('p', null, 'Then reload this page.'));
}

function changeRow(entry, titles) {
  const href = libraryHref(entry.href);
  const isAgent = entry.authorType === 'agent';
  const body = [
    h('span', { class: 'row-date' }, displayDate(entry.date) || 'Undated'),
    h('span', { class: 'result-text' },
      h('span', { class: 'row-title' }, softBreaks(text(entry.title, 'Untitled'))),
      h('span', { class: 'result-snippet' }, softBreaks(titles.get(entry.slug) || entry.slug))),
    h('span', { class: 'hub-change-tags' },
      entry.authorType && tag(isAgent ? 'Agent' : 'Human', isAgent ? 'tag-agent' : 'tag-human'),
      entry.kind && tag(entry.kind)),
  ];
  return h('li', null, href ? h('a', { class: 'row-link hub-change', href }, body) : h('span', { class: 'row-link hub-change' }, body));
}

// ---------- Shell ----------
function hubNav(views, explainers, links, kitHref) {
  const item = (key, label, count) => {
    const a = h('a', { href: `#${key}`, 'data-nav': key }, h('span', { class: 'nav-label' }, label), h('span', { class: 'nav-count' }, String(count)));
    links.push(a);
    return h('li', null, a);
  };
  return h('nav', { class: 'links', 'aria-label': 'Library' },
    h('ul', null, views.map((v) => item(v.key, v.nav, v.count)),
      kitHref && h('li', null, h('a', { href: kitHref, class: 'nav-external' }, h('span', { class: 'nav-label' }, 'Design kit')))),
    explainers.length > 0 && [h('p', { class: 'side-label' }, 'Explainers'),
      h('ul', { class: 'hub-repos' }, explainers.map((e) => {
        const href = explainerHref(e.slug);
        const label = h('span', { class: 'nav-label' }, wordBreaks(text(e.title, e.slug)));
        return h('li', null, href ? h('a', { href }, label) : label);
      }))]);
}

function hubShell(views, explainers, updatedAt, registry, kitHref) {
  const links = [];
  const foot = () => {
    const gear = settingsLink('#settings');
    links.push(gear.querySelector('a'));
    return [
      footMeta([plural(explainers.length, 'explainer'), updatedAt]),
      h('div', { class: 'foot-row' }, gear, themeSwitch(registry)),
    ];
  };
  const side = h('aside', { class: 'side', 'aria-label': 'Sidebar' },
    h('a', { class: 'brand', href: '#all' }, brandMark(), h('span', { class: 'name' }, 'Concept Explainer')),
    h('div', { class: 'side-repo' }, h('b', null, 'Explainer library'), h('span', { class: 'mono' }, plural(explainers.length, 'explainer'))),
    hubNav(views, explainers, links, kitHref),
    h('div', { class: 'side-foot' }, foot()));
  const closeButton = h('button', { class: 'btn sheet-close', type: 'button' }, h('span', { class: 'close-icon', 'aria-hidden': 'true' }), 'Close');
  const sheet = h('dialog', { class: 'sheet', 'aria-label': 'Menu' },
    h('div', { class: 'sheet-head' }, h('span', { class: 'name' }, 'Explainer library'), closeButton),
    hubNav(views, explainers, links, kitHref),
    h('div', { class: 'sheet-foot' }, foot()));
  closeButton.addEventListener('click', () => sheet.close());
  sheet.addEventListener('click', (event) => {
    if (event.target === sheet || event.target.closest('a')) sheet.close();
  });
  const barView = h('span', { class: 'bar-view' });
  const top = h('header', { class: 'top' }, h('div', { class: 'bar' },
    h('a', { class: 'brand', href: '#all', 'aria-label': 'All explainers' }, brandMark(),
      h('span', { class: 'bar-names' }, h('span', { class: 'name' }, 'Explainer library'), barView)),
    h('div', { class: 'bar-actions' },
      quickTheme(registry),
      h('button', { class: 'btn menu-button', type: 'button', 'aria-haspopup': 'dialog', onclick: () => sheet.showModal() },
        h('span', { class: 'menu-icon', 'aria-hidden': 'true' }), 'Menu'))));
  return { side, sheet, top, links, barView };
}

// ---------- Views ----------
function readHubHash() {
  const raw = window.location.hash.replace(/^#/, '');
  if (raw === 'changes') return { view: 'changes', query: '' };
  if (raw === 'settings') return { view: 'settings', query: '' };
  const match = raw.match(/^search\/(.*)$/);
  if (!match) return { view: 'all', query: '' };
  try {
    return { view: 'all', query: decodeURIComponent(match[1]) };
  } catch (error) {
    return { view: 'all', query: match[1] };
  }
}

function moveFocus(container, step) {
  const items = [...container.querySelectorAll('a.result-link')];
  const index = items.indexOf(document.activeElement);
  const next = items[Math.min(Math.max(index + step, 0), items.length - 1)];
  if (next) next.focus();
  return next;
}

// ---------- The hub's data and filters (pure) ----------
function hubModel(data, context) {
  const manifest = (data && data.manifest) || {};
  const explainers = list(manifest.explainers).filter((e) => e && typeof e.slug === 'string');
  const index = list(data && data.index).filter((e) => e && typeof e.slug === 'string');
  const changes = index.filter((e) => e.type === 'change').sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return {
    context, manifest, explainers, index, changes,
    titles: new Map(explainers.map((e) => [e.slug, text(e.title, e.slug)])),
    facets: { stacks: stackFacets(explainers), presets: presetFacets(explainers), kinds: typeFacets(explainers), tags: tagFacets(explainers) },
    views: [
      { key: 'all', nav: 'All explainers', count: explainers.length },
      { key: 'changes', nav: 'Recent changes', count: changes.length },
    ],
  };
}

// The slugs the facets allow (search narrows further).
function hubAllowed(explainers, state) {
  return new Set(explainers
    .filter((e) => (!state.stack || list(e.stack).map(String).includes(state.stack)) && (!state.preset || e.preset === state.preset)
      && (!state.type || (e.type || 'repo') === state.type) && (!state.tag || list(e.tags).map(String).includes(state.tag)))
    .map((e) => e.slug));
}

// ---------- The hub's views ----------
function hubElements() {
  return {
    input: h('input', {
      class: 'search hub-search', type: 'search', placeholder: 'Search every explainer', 'aria-label': 'Search every explainer',
      'aria-describedby': 'hub-search-hint', autocomplete: 'off', spellcheck: 'false',
    }),
    hint: h('span', { class: 'search-hint', id: 'hub-search-hint' }, 'Press ', h('kbd', null, '/'), ' to search, ', h('kbd', null, '↓'), ' to move through results.'),
    status: h('p', { class: 'hub-status', 'aria-live': 'polite' }),
    filters: h('div', { class: 'hub-filters' }),
    results: h('div', { class: 'hub-results' }),
    grid: h('ul', { class: 'cards lib-grid' }),
    pickBar: h('div', { class: 'pick-bar' }),
    changesList: h('ul', { class: 'rows' }),
    authorBar: h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter by author' }),
  };
}

function hubAllView({ explainers }, ui) {
  return h('section', { class: 'view hub-view', 'data-view': 'all', 'aria-labelledby': 'view-all-title' },
    h('header', { class: 'view-head' },
      h('p', { class: 'eyebrow quiet' }, 'Library'),
      h('h1', { id: 'view-all-title', tabindex: '-1' }, 'Explainer library'),
      h('p', { class: 'view-lead' }, explainers.length
        ? `${plural(explainers.length, 'explainer')}. Search inside all of them, or open one.`
        : 'Explainers you build show up here.')),
    explainers.length > 0 && h('div', { class: 'hub-search-wrap' }, ui.input, ui.hint),
    explainers.length > 1 && ui.filters,
    ui.status, ui.results,
    explainers.length > 0 && ui.pickBar,
    explainers.length ? ui.grid : emptyLibrary());
}

function hubChangesView({ changes }, ui) {
  return h('section', { class: 'view hub-view', 'data-view': 'changes', hidden: true, 'aria-labelledby': 'view-changes-title' },
    h('header', { class: 'view-head' },
      h('p', { class: 'eyebrow quiet' }, 'Across every explainer'),
      h('h1', { id: 'view-changes-title', tabindex: '-1' }, 'Recent changes'),
      h('p', { class: 'view-lead' }, 'Every recorded change, newest first. Open one to see it in its explainer.')),
    changes.length ? [ui.authorBar, h('div', { class: 'panel' }, ui.changesList)] : h('p', { class: 'empty' }, 'No changes recorded yet.'));
}

// The facet rows; pick(key, value) sets one facet.
function hubFacets({ facets }, state, pick) {
  return [
    facets.kinds.length > 1 && facetGroup('Type', facets.kinds, state.type, (value) => pick('type', value), (v) => KIND_LABELS[v] || v),
    facetGroup('Tag', facets.tags, state.tag, (value) => pick('tag', value), (v) => `#${v}`),
    facetGroup('Stack', facets.stacks, state.stack, (value) => pick('stack', value)),
    facetGroup('Preset', facets.presets, state.preset, (value) => pick('preset', value)),
  ];
}

// Search results replace the card grid while there is a query.
function hubPaintResults(model, ui, query, allowed, shownCount) {
  if (query) {
    const hits = searchEntries(model.index, query, allowed);
    const groups = groupBySlug(hits);
    ui.status.textContent = hits.length
      ? `${plural(hits.length, 'result')} in ${plural(groups.size, 'explainer')}${hits.length === RESULT_LIMIT ? ', showing the best' : ''}.`
      : `Nothing matches "${query}".`;
    fill(ui.results, ...resultGroups(groups, model.titles, queryWords(query)));
    ui.grid.hidden = true;
    return;
  }
  ui.status.textContent = model.explainers.length && shownCount !== model.explainers.length ? `${plural(shownCount, 'explainer')} match these filters.` : '';
  fill(ui.results);
  ui.grid.hidden = false;
}

// Pick explainers to export. The box sits beside the card link, not in it.
function hubPickBox(explainer, selected, onChange) {
  const box = h('input', {
    type: 'checkbox', class: 'pick-input', checked: selected.has(explainer.slug), 'aria-label': `Pick ${text(explainer.title, explainer.slug)} to export`,
    onchange: () => { if (box.checked) selected.add(explainer.slug); else selected.delete(explainer.slug); onChange(); },
  });
  return h('label', { class: 'card-pick' }, box);
}

function hubPickBar(selected, shown, renderAll) {
  return [
    h('span', { class: 'pick-count' }, selected.size ? `${plural(selected.size, 'explainer')} picked` : 'Pick explainers to export them'),
    h('button', { class: 'link', type: 'button', onclick: () => { shown.forEach((e) => selected.add(e.slug)); renderAll(); } }, `Pick all ${shown.length} shown`),
    selected.size > 0 && h('button', { class: 'link', type: 'button', onclick: () => { selected.clear(); renderAll(); } }, 'Clear'),
    h('a', { class: 'link', href: '#settings' }, selected.size ? 'Export them' : 'Export or import'),
  ];
}

function hubPaintChanges(model, ui, author, setAuthor) {
  fill(ui.authorBar, ...HUB_AUTHORS.map((a) => h('button', {
    class: 'seg-option', type: 'button', 'aria-pressed': String(author === a.id), onclick: () => setAuthor(a.id),
  }, a.label)));
  const rows = model.changes.filter((c) => author === 'all' || c.authorType === author);
  fill(ui.changesList, ...(rows.length ? rows.map((c) => changeRow(c, model.titles)) : [h('li', { class: 'empty' }, 'Nothing matches this filter.')]));
}

// Show one view, name it in the bar and the title, and move focus to it.
function hubShowView(view, { allView, changesView, settings, shell }) {
  allView.hidden = view !== 'all';
  changesView.hidden = view !== 'changes';
  settings.section.hidden = view !== 'settings';
  setNavCurrent(shell.links, view);
  const viewName = { changes: 'Recent changes', settings: 'Settings' }[view] || 'All explainers';
  shell.barView.textContent = viewName;
  document.title = `${view === 'all' ? 'Explainer library' : viewName} · Concept Explainer`;
  return ({ changes: changesView, settings: settings.section }[view] || allView).querySelector('h1');
}

// Export exactly what the hub shows: the picked cards, else every explainer
// the search and filters leave on screen, else the whole library.
function hubExportSelection({ explainers, index }, input, selected, getState) {
  const shownSlugs = () => {
    const allowed = hubAllowed(explainers, getState());
    const query = input.value.trim();
    return query ? [...groupBySlug(searchEntries(index, query, allowed)).keys()] : explainers.map((e) => e.slug).filter((slug) => allowed.has(slug));
  };
  const getSelection = () => {
    const state = getState();
    const filtered = Boolean(state.stack || state.preset || state.type || state.tag || input.value.trim());
    const slugs = selected.size ? [...selected] : filtered ? shownSlugs() : [];
    const label = selected.size ? plural(slugs.length, 'picked explainer') : filtered ? plural(slugs.length, 'explainer') : 'the whole library';
    return { slugs, args: slugs.map(shellQuote).join(' '), label, none: (selected.size > 0 || filtered) && !slugs.length };
  };
  return { shownSlugs, getSelection };
}

// After a route: search when "/" asked for it, else the view's heading.
function hubFocusAfterRoute(input, heading, { searchNext, skipHeading }) {
  if (searchNext) {
    input.focus();
    input.select();
  } else if (!skipHeading && heading) heading.focus({ preventScroll: true });
}

// ---------- Search keys ----------
function wireHubSearch(ui, { onQuery, onClear }) {
  const { input, results } = ui;
  input.addEventListener('input', onQuery);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' && moveFocus(results, 1)) event.preventDefault();
    if (event.key === 'Escape' && input.value) onClear();
  });
  results.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); moveFocus(results, 1); }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const items = [...results.querySelectorAll('a.result-link')];
      if (items.indexOf(document.activeElement) <= 0) input.focus(); else moveFocus(results, -1);
    }
    if (event.key === 'Escape') { event.preventDefault(); input.focus(); }
  });
}

// "/" or Cmd/Ctrl+K anywhere jumps to search, from any view.
function wireSearchShortcut(ui, shell, hasExplainers, onOtherView) {
  document.addEventListener('keydown', (event) => {
    const typing = event.target.closest && event.target.closest('input, textarea, [contenteditable="true"]');
    const wantsSearch = (event.key === '/' && !typing) || (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey));
    if (!wantsSearch || !hasExplainers) return;
    event.preventDefault();
    if (shell.sheet.open) shell.sheet.close();
    if (readHubHash().view !== 'all') { onOtherView(); return; }
    ui.input.focus();
    ui.input.select();
  });
}

// Typing searches (and keeps the query in the address); Escape clears.
function wireHubKeys(ui, shell, hasExplainers, renderAll, onOtherView) {
  const { input } = ui;
  wireHubSearch(ui, {
    onQuery: () => { const query = input.value.trim(); setDeepLink(query ? `search/${encodeURIComponent(query)}` : 'all'); renderAll(); },
    onClear: () => { input.value = ''; setDeepLink('all'); renderAll(); },
  });
  wireSearchShortcut(ui, shell, hasExplainers, onOtherView);
}

// ---------- Boot ----------
// Parse the embedded data; on failure show why and return null.
function loadHubData(app, pageContext) {
  try {
    return JSON.parse(document.getElementById('explainer-data').textContent);
  } catch (error) {
    withServe(pageContext);
    fill(app, h('div', { class: 'fatal', role: 'alert' }, h('h1', null, 'The library could not load'),
      h('p', null, 'Its data is not valid JSON. Run "concept-explainer library rebuild" to write it again.')));
    return null;
  }
}

// The hub's data may name the serve endpoints; the token comes from the URL.
function hubContext(data, pageContext) {
  const dataServe = data && data.serve && typeof data.serve === 'object' ? { serve: { ...data.serve, ...(pageContext.serve || {}) } } : {};
  return withServe({ ...pageContext, ...dataServe });
}

function hubCards(shown, selected, onPick) {
  return shown.length
    ? shown.map((e) => h('li', { class: 'lib-item' }, explainerCard(e), hubPickBox(e, selected, onPick)))
    : [h('li', { class: 'empty' }, 'No explainer matches these filters.')];
}

function mountHub(app, shell, registry, views) {
  const main = h('main', { id: 'main', class: 'main-col', tabindex: '-1' }, shell.top,
    h('div', { class: 'wrap' }, ...views,
      h('footer', { class: 'site-footer' }, h('p', null, 'Built by concept-explainer. Rebuild every page with "concept-explainer library rebuild".'))));
  fill(app, h('div', { class: 'app' }, shell.side, main), shell.sheet);
  app.removeAttribute('aria-busy');
  registry.paint();
  installThemeShortcut(registry);
  watchNavMore(shell.side.querySelector(':scope > .links'));
  wireSkipLink(main);
}

function bootLibrary() {
  const pageContext = readContext();
  applyLook(pageContext);
  applyReading();
  const app = document.getElementById('app');
  const data = loadHubData(app, pageContext);
  if (!data) return;
  const context = hubContext(data, pageContext);
  const model = hubModel(data, context);
  const { explainers } = model;
  const [registry, ui, selected] = [themeRegistry(), hubElements(), new Set()];
  const shell = hubShell(model.views, explainers, displayDate(model.manifest.updatedAt, { year: false }), registry, safeHref(data && data.kitHref));
  const { input } = ui;
  let state = { stack: null, preset: null, type: null, tag: null, author: 'all' };
  let focusSearchNext = false;
  const { shownSlugs, getSelection } = hubExportSelection(model, input, selected, () => state);
  const settings = settingsView(registry, {
    context, config: context.config || (data && data.config) || null, extra: [hubShareGroup(context, getSelection)],
  });
  const [allView, changesView] = [hubAllView(model, ui), hubChangesView(model, ui)];
  const paintPicks = (shown = explainers.filter((e) => shownSlugs().includes(e.slug))) => fill(ui.pickBar, ...hubPickBar(selected, shown, renderAll));

  function renderAll() {
    const allowed = hubAllowed(explainers, state);
    fill(ui.filters, ...hubFacets(model, state, (key, value) => { state = { ...state, [key]: value }; renderAll(); }));
    const shown = explainers.filter((e) => allowed.has(e.slug));
    hubPaintResults(model, ui, input.value.trim(), allowed, shown.length);
    fill(ui.grid, ...hubCards(shown, selected, () => paintPicks()));
    paintPicks(shown);
  }

  const renderChanges = () => hubPaintChanges(model, ui, state.author, (author) => { state = { ...state, author }; renderChanges(); });

  function route({ initial = false } = {}) {
    const { view, query } = readHubHash();
    const heading = hubShowView(view, { allView, changesView, settings, shell });
    if (view === 'all' && input.value !== query) input.value = query;
    if (view === 'all') renderAll(); else if (view === 'changes') renderChanges();
    if (initial && !window.location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    hubFocusAfterRoute(input, heading, { searchNext: focusSearchNext, skipHeading: initial && query });
    focusSearchNext = false;
  }

  wireHubKeys(ui, shell, explainers.length > 0, renderAll, () => { focusSearchNext = true; window.location.hash = 'all'; });
  mountHub(app, shell, registry, [allView, changesView, settings.section]);
  window.addEventListener('hashchange', () => route());
  route({ initial: true });
  if (readHubHash().query) input.focus();
}
