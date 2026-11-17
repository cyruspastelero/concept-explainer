// Boot: read the embedded data and library context, build the dashboard
// shell (sidebar, phone bar, menu sheet) and show one view per hash.
const CHAPTERS = [
  { key: 'context', nav: 'Context', title: 'Why this exists', lead: 'The problem first, then what this aims for and what it leaves out.', count: (d) => list(d.context && d.context.goals).length, unit: ['goal', 'goals'], has: (d) => Boolean(d.context && d.context.problem), render: chRenderContext },
  { key: 'diff', nav: 'Files changed', title: 'What the change touches', lead: 'Each bar is one file, as long as its changed lines. Pick one to read what changed and which part it belongs to.', count: (d) => list(d.diff).length, unit: ['file', 'files'], has: (d) => list(d.diff).length > 0, render: chRenderDiff },
  { key: 'options', nav: 'Options', title: 'The options, side by side', lead: 'Every option on the same rows, pros and cons drawn as marks. The chosen one is marked.', count: (d) => list(d.options).length, unit: ['option', 'options'], has: (d) => list(d.options).length > 0, render: chRenderOptions },
  { key: 'risks', nav: 'Risks', title: 'What could go wrong', lead: 'Risks in rows by impact, the worst at the top. Pick one to see how it is handled.', count: (d) => list(d.risks).length, unit: ['risk', 'risks'], has: (d) => list(d.risks).length > 0, render: chRenderRisks },
  { key: 'rollout', nav: 'Rollout', title: 'How it ships', lead: 'The steps in order. Filled steps are done; the ringed one is next.', count: (d) => list(d.rollout).length, unit: ['step', 'steps'], has: (d) => list(d.rollout).length > 0, render: chRenderRollout },
  { key: 'timeline', nav: 'Timeline', title: 'What happened, when', lead: 'Events in the order of the record. The marker shape says what kind of moment it was.', count: (d) => list(d.timeline).length, unit: ['event', 'events'], has: (d) => list(d.timeline).length > 0, render: chRenderTimeline },
  { key: 'visuals', nav: 'Diagrams', title: 'The idea, drawn', lead: 'Each diagram answers one question. Pick a part to see what it does.', count: (d) => list(d.diagrams).length, unit: ['diagram', 'diagrams'], has: (d) => list(d.diagrams).length > 0, render: chRenderVisuals },
  { key: 'map', nav: 'Architecture', title: 'The big picture', lead: 'Every box is one part of the system. Pick one to see what it does and who it talks to.', count: (d) => list(d.nodes).length, unit: ['part', 'parts'], has: (d) => list(d.nodes).length > 0, render: renderMap },
  { key: 'flows', nav: 'Flows', title: 'Follow it end to end', lead: 'Pick a flow and press Continue. Each step is one hop, with the exact file that does the work.', count: (d) => list(d.flows).length, unit: ['flow', 'flows'], has: (d) => list(d.flows).length > 0, render: renderFlows },
  { key: 'code', nav: 'Code walkthrough', title: 'The code, line by line', lead: 'The few lines that carry the idea, one step at a time. Each step says what the lines do and why.', count: (d) => list(d.walkthroughs).length, unit: ['walkthrough', 'walkthroughs'], has: (d) => list(d.walkthroughs).length > 0, render: chRenderCode },
  { key: 'changes', nav: 'Changes', title: 'What changed, and why', lead: 'Recent merges from people and agents, each with its reason. Show them on the map to see which parts moved.', count: (d) => list(d.changes).length, unit: ['change', 'changes'], has: (d) => list(d.changes).length > 0, render: renderChanges },
  { key: 'tree', nav: 'Where things live', title: 'Where things live', lead: 'The folders worth knowing. Key ones are where most changes happen.', count: (d) => list(d.tree).length, unit: ['path', 'paths'], has: (d) => list(d.tree).length > 0, render: renderTree },
  { key: 'data', nav: 'Data model', title: 'The data', lead: 'What the system stores and how the pieces relate.', count: (d) => list(d.dataModel).length, unit: ['entity', 'entities'], has: (d) => list(d.dataModel).length > 0, render: renderModels },
  { key: 'concepts', nav: 'Key ideas', title: 'Key ideas', lead: 'The few patterns you need to read this code with confidence. One idea at a time.', count: (d) => list(d.concepts).length, unit: ['idea', 'ideas'], has: (d) => list(d.concepts).length > 0, render: renderConcepts },
  { key: 'quiz', nav: 'Check yourself', title: 'Check yourself', lead: 'A few quick questions. If you can answer these, you can find your way around.', count: (d) => list(d.quiz).length, unit: ['question', 'questions'], has: (d) => list(d.quiz).length > 0, render: renderQuiz },
  { key: 'glossary', nav: 'Glossary', title: 'Glossary', lead: 'Words this codebase uses in its own way.', count: (d) => list(d.glossary).length, unit: ['term', 'terms'], has: (d) => list(d.glossary).length > 0, render: renderGlossary },
  { key: 'run', nav: 'Run it', title: 'Run it yourself', lead: 'Commands to get it running on your machine.', count: (d) => list(d.runbook).length, unit: ['command', 'commands'], has: (d) => list(d.runbook).length > 0, render: renderRunbook },
];

// Default chapter order per explainer type, copied from presets/types/*.json
// (and TYPE_RULES.repo); test/type-chapters.test.mjs keeps them in step.
// "1 walkthrough", "3 walkthroughs": a chapter's count with its noun.
function chapterCount(chapter, data) {
  const [one, many] = chapter.unit;
  return plural(chapter.count(data), one, many);
}

// The build embeds the chapter list (context.chapters, from the one rule in
// scripts/lib/chapters.mjs), so the page never keeps its own copy. A page
// without it (an older build) falls back to meta.chapters, else every chapter
// with data in table order. Either way each key shows once, and only with data.
function chooseChapters(data, context) {
  const embedded = list(context && context.chapters).filter((key) => typeof key === 'string');
  const requested = list(data.meta && data.meta.chapters).filter((key) => typeof key === 'string');
  const order = embedded.length ? embedded : requested.length ? requested : CHAPTERS.map((c) => c.key);
  return [...new Set(order)]
    .map((key) => CHAPTERS.find((c) => c.key === key))
    .filter((chapter) => chapter && chapter.has(data))
    .map((chapter) => {
      const intro = (data.intros || {})[chapter.key];
      return { ...chapter, title: text(intro && intro.title, chapter.title), lead: text(intro && intro.lead, chapter.lead) };
    });
}

// ---------- Viewed chapters (this browser only) ----------
function viewedStore(meta) {
  const key = `concept-explainer:viewed:${text(meta.repo, meta.title)}:${text(meta.commit, '')}`;
  let viewed = new Set();
  try {
    viewed = new Set(list(JSON.parse(readStore(key) || '[]')).filter((v) => typeof v === 'string'));
  } catch (error) {
    viewed = new Set();
  }
  return {
    has: (k) => viewed.has(k),
    add: (k) => {
      if (viewed.has(k)) return;
      viewed = new Set([...viewed, k]);
      writeStore(key, JSON.stringify([...viewed]));
    },
    size: (keys) => keys.filter((k) => viewed.has(k)).length,
  };
}

// ---------- Shell ----------
function navList(chapters, data, links) {
  const item = (key, label, count) => {
    const a = h('a', { href: `#${key}`, 'data-nav': key },
      h('span', { class: 'nav-label' }, label),
      count !== null && h('span', { class: 'nav-count' }, String(count)));
    links.push(a);
    return h('li', null, a);
  };
  return h('nav', { class: 'links', 'aria-label': 'Explainer' },
    h('ul', null, item('overview', 'Overview', null)),
    h('p', { class: 'side-label' }, 'Chapters'),
    h('ul', null, chapters.map((c) => item(c.key, c.nav, c.count(data)))));
}

function footBits(meta, context, registry, progressLines, links) {
  const gear = settingsLink('#settings');
  links.push(gear.querySelector('a'));
  const library = safeHref(context.libraryHref);
  const progress = h('p', { class: 'side-progress' });
  progressLines.push(progress);
  return [
    progress,
    library && h('div', { class: 'side-util' }, h('a', { class: 'util', href: library }, h('span', { class: 'util-ic' }, icon('library_shelf')), 'Library')),
    h('div', { class: 'foot-row' }, gear, themeSwitch(registry)),
    (meta.generatedAt || meta.commit) && footMeta([meta.generatedAt && displayDate(meta.generatedAt), meta.commit && String(meta.commit).slice(0, 7)]),
  ];
}

function brandRow() {
  return h('a', { class: 'brand', href: '#overview' }, brandMark(), h('span', { class: 'name' }, 'Concept Explainer'));
}

function buildShell(data, chapters, context, registry) {
  const meta = data.meta;
  const links = [];
  const progressLines = [];
  const side = h('aside', { class: 'side', 'aria-label': 'Sidebar' },
    brandRow(),
    h('div', { class: 'side-repo' }, truncatable(h('b', null, softBreaks(meta.title)), meta.title),
      meta.repo && truncatable(h('span', { class: 'mono' }), meta.repo, { mode: 'middle' })),
    navList(chapters, data, links),
    h('div', { class: 'side-foot' }, footBits(meta, context, registry, progressLines, links)));

  const closeButton = h('button', { class: 'btn sheet-close', type: 'button' }, h('span', { class: 'close-icon', 'aria-hidden': 'true' }), 'Close');
  const sheet = h('dialog', { class: 'sheet', 'aria-label': 'Menu' },
    h('div', { class: 'sheet-head' }, truncatable(h('span', { class: 'name' }, softBreaks(meta.title)), meta.title), closeButton),
    navList(chapters, data, links),
    h('div', { class: 'sheet-foot' }, footBits(meta, context, registry, progressLines, links)));
  closeButton.addEventListener('click', () => sheet.close());
  sheet.addEventListener('click', (event) => {
    if (event.target === sheet || event.target.closest('a[href^="#"]')) sheet.close();
  });

  const barView = h('span', { class: 'bar-view' });
  const library = safeHref(context.libraryHref);
  const menuButton = h('button', { class: 'btn menu-button', type: 'button', 'aria-haspopup': 'dialog', onclick: () => sheet.showModal() },
    h('span', { class: 'menu-icon', 'aria-hidden': 'true' }), 'Menu');
  const top = h('header', { class: 'top' }, h('div', { class: 'bar' },
    h('a', { class: 'brand', href: '#overview', 'aria-label': 'Overview' }, brandMark(),
      h('span', { class: 'bar-names' }, truncatable(h('span', { class: 'name' }, softBreaks(meta.title)), meta.title), barView)),
    h('div', { class: 'bar-actions' },
      library && h('a', { class: 'btn bar-library', href: library }, 'Library'),
      quickTheme(registry),
      menuButton)));
  return { side, sheet, top, links, progressLines, barView };
}

// ---------- Views ----------
function viewHead(key, eyebrow, title, lead) {
  return h('header', { class: 'view-head' },
    h('p', { class: 'eyebrow quiet' }, eyebrow),
    h('h1', { id: `view-${key}-title`, tabindex: '-1' }, title),
    lead && h('p', { class: 'view-lead' }, lead));
}

function pager(chapters, index) {
  const prev = index > 0 ? chapters[index - 1] : { key: 'overview', nav: 'Overview' };
  const next = chapters[index + 1];
  const cell = (chapter, label, cls) => h('a', { class: `pager-link ${cls}`, href: `#${chapter.key}` },
    h('span', { class: 'eyebrow quiet' }, label), h('span', { class: 'pager-title' }, chapter.nav));
  return h('nav', { class: 'pager', 'aria-label': 'Chapters' },
    cell(prev, 'Previous', 'is-prev'),
    next ? cell(next, 'Next', 'is-next') : cell({ key: 'overview', nav: 'Overview' }, 'Done', 'is-next'));
}

function chapterView(chapter, index, chapters, data, ctx) {
  const body = h('div', { class: 'view-body' });
  const section = h('section', { class: 'view', 'data-view': chapter.key, hidden: true, 'aria-labelledby': `view-${chapter.key}-title` },
    viewHead(chapter.key, `Chapter ${index + 1} of ${chapters.length}`, chapter.title, chapter.lead),
    body,
    pager(chapters, index));
  let controller = null;
  try {
    controller = chapter.render(data, body, ctx) || null;
  } catch (error) {
    body.append(h('p', { class: 'empty' }, `This chapter could not be drawn: ${error.message}`));
  }
  return { key: chapter.key, title: chapter.title, nav: chapter.nav, section, controller };
}

function overviewView(data, ctx) {
  const body = h('div', { class: 'view-body' });
  const section = h('section', { class: 'view view-overview', 'data-view': 'overview', hidden: true, 'aria-labelledby': 'view-overview-title' }, body);
  const controller = renderOverview(data, body, ctx);
  return { key: 'overview', title: 'Overview', nav: 'Overview', section, controller };
}

// ---------- Routing (deep-link contract: references/library.md) ----------
function decodePart(part) {
  try {
    return decodeURIComponent(part);
  } catch (error) {
    return part;
  }
}

function parseHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw) return { view: 'overview', parts: [] };
  const [head, ...rest] = raw.split('/');
  return { view: decodePart(head), parts: rest.map(decodePart).filter((p) => p !== '') };
}

function createRouter(views, shell, chapters, viewed, meta) {
  const chapterKeys = chapters.map((c) => c.key);
  function paintProgress() {
    const line = `${viewed.size(chapterKeys)} / ${chapterKeys.length} viewed`;
    shell.progressLines.forEach((el) => { el.textContent = line; });
    shell.links.forEach((a) => a.classList.toggle('is-viewed', viewed.has(a.dataset.nav)));
  }

  function show(view) {
    views.forEach((v) => { v.section.hidden = v !== view; });
    setNavCurrent(shell.links, view.key);
    shell.barView.textContent = view.nav;
    document.title = view.key === 'overview' ? `${meta.title} · Concept Explainer` : `${view.title} · ${meta.title}`;
    if (view.key !== 'overview') viewed.add(view.key);
    paintProgress();
  }

  function route({ initial = false } = {}) {
    const { view: key, parts } = parseHash(window.location.hash);
    const view = views.find((v) => v.key === key) || views[0];
    show(view);
    let target = null;
    try {
      target = view.controller && view.controller.open ? view.controller.open(view.key === key ? parts : []) : null;
    } catch (error) {
      target = null;
    }
    if (initial && !window.location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    // A deep link to an item scrolls to it and focuses it (a reader action,
    // never an observer); otherwise focus goes to the view's heading.
    if (target && target.scrollIntoView) {
      if (!target.matches('a, button, input, select, textarea, [tabindex]')) target.setAttribute('tabindex', '-1');
      target.scrollIntoView({ block: 'center', behavior: 'instant' });
      target.focus({ preventScroll: true });
      return;
    }
    const heading = view.section.querySelector('h1');
    if (heading) heading.focus({ preventScroll: true });
  }

  window.addEventListener('hashchange', () => route());
  return { route };
}

function fatal(app, message) {
  fill(app, h('div', { class: 'fatal', role: 'alert' }, h('h1', null, 'This explainer could not load'), h('p', null, message)));
}

function boot() {
  if (deferBoot(boot)) return;
  // The serve token leaves the address bar before the router reads it.
  const context = withServe(readContext());
  applyLook(context);
  applyReading();
  const app = document.getElementById('app');
  let data;
  try {
    data = JSON.parse(document.getElementById('explainer-data').textContent);
  } catch (error) {
    fatal(app, `The embedded data is not valid JSON (${error.message}). Rebuild it with concept-explainer build.`);
    return;
  }
  if (!data || !data.meta || !data.meta.title) {
    fatal(app, 'The embedded data has no meta.title. Run concept-explainer validate to see what is missing.');
    return;
  }
  const chapters = chooseChapters(data, context);
  const viewed = viewedStore(data.meta);
  const registry = themeRegistry();
  const shell = buildShell(data, chapters, context, registry);
  const ctx = { chapters, viewed, context };
  const views = [overviewView(data, ctx), ...chapters.map((c, i) => chapterView(c, i, chapters, data, ctx)),
    settingsView(registry, { context, config: context.config || null, extra: [explainerShareGroup(data, context)] })];
  const meta = data.meta;
  const stamp = [meta.generatedAt && `Generated ${displayDate(meta.generatedAt)}`, meta.commit && `at ${String(meta.commit).slice(0, 7)}`].filter(Boolean).join(' ');
  const main = h('main', { id: 'main', class: 'main-col', tabindex: '-1' },
    shell.top,
    h('div', { class: 'wrap' }, views.map((v) => v.section),
      h('footer', { class: 'site-footer' },
        h('p', null, `${stamp ? `${stamp} ` : ''}with concept-explainer.`),
        designCredit())));
  fill(app, h('div', { class: 'app' }, shell.side, main), shell.sheet);
  app.removeAttribute('aria-busy');
  registry.paint();
  installThemeShortcut(registry);
  watchNavMore(shell.side.querySelector(':scope > .links'));
  wireSkipLink(main);
  createRouter(views, shell, chapters, viewed, data.meta).route({ initial: true });
}
