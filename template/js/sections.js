// Views without heavy interaction: the overview dashboard, where things
// live (tree), glossary and runbook. Each returns { open(parts) } for the
// router; open() returns the element a deep link points at, if any.

// Rough reading time, Brilliant style: a cue for how long the tour takes.
function tourMinutes(data) {
  const steps = list(data.flows).reduce((n, f) => n + list(f.steps).length, 0);
  const minutes = 2 + steps * 0.35 + list(data.concepts).length * 0.6 + list(data.quiz).length * 0.5 + list(data.changes).length * 0.3;
  return Math.max(3, Math.round(minutes));
}

function citedFiles(data) {
  const files = [
    ...list(data.nodes).flatMap((n) => list(n.files)),
    ...list(data.flows).flatMap((f) => list(f.steps).map((st) => st.file)),
    ...list(data.changes).flatMap((c) => list(c.files)),
    ...list(data.concepts).map((c) => c.file),
  ].filter((f) => typeof f === 'string' && f.trim());
  return new Set(files.map((f) => f.replace(/:\d+(-\d+)?$/, ''))).size;
}

function padNumber(n) {
  return String(n).padStart(2, '0');
}

function renderOverview(data, mount, ctx) {
  const meta = data.meta;
  const chapters = ctx.chapters;
  const nextSlot = h('div', { class: 'ov-next' });
  const progressSlot = h('div', { class: 'ov-progress' });
  const cards = chapters.map((chapter, i) => chapterCard(data, chapter, i));

  function refresh() {
    const keys = chapters.map((c) => c.key);
    const next = chapters.find((c) => !ctx.viewed.has(c.key));
    fill(nextSlot, nextUpCard(data, chapters, next));
    fill(progressSlot, progressCard(data, ctx.viewed.size(keys), keys.length));
    cards.forEach((card, i) => card.classList.toggle('is-viewed', ctx.viewed.has(chapters[i].key)));
  }

  mount.append(h('div', { class: 'overview' },
    h('header', { class: 'ov-head' },
      h('p', { class: 'eyebrow' }, softBreaks(text(meta.repo, 'Repository'))),
      h('h1', { id: 'view-overview-title', tabindex: '-1', class: fitClass(meta.title) }, softBreaks(meta.title)),
      meta.summary && h('p', { class: 'lede' }, softBreaks(meta.summary)),
      list(meta.stack).length > 0 && h('ul', { class: 'stack', 'aria-label': 'Built with' },
        list(meta.stack).map((item) => h('li', null, tag(item))))),
    nextSlot,
    progressSlot,
    glancePanel(data),
    chapters.length > 0 && h('section', { class: 'ov-chapters', 'aria-labelledby': 'ov-chapters-title' },
      h('div', { class: 'ov-section-head' }, h('h2', { id: 'ov-chapters-title' }, 'Chapters'),
        h('a', { class: 'eyebrow quiet', href: `#${chapters[0].key}` }, 'Start at chapter 1')),
      h('ul', { class: 'cards' }, cards.map((card) => h('li', null, card)))),
    latestChanges(data)));
  refresh();
  return { open: () => { refresh(); return null; } };
}

function nextUpCard(data, chapters, next) {
  if (!chapters.length) return null;
  const done = !next;
  const chapter = next || chapters[0];
  const index = chapters.indexOf(chapter);
  return h('article', { class: 'panel next-up' },
    h('p', { class: 'eyebrow' }, done ? 'All chapters viewed' : 'Next up'),
    h('p', { class: 'next-kicker' }, `Chapter ${index + 1} · ${chapterCount(chapter, data)}`),
    h('h2', { class: 'next-title' }, chapter.title),
    h('p', { class: 'next-line' }, chapter.lead),
    h('div', { class: 'next-actions' },
      h('a', { class: 'btn primary', href: `#${chapter.key}` }, done ? 'Start again' : `Open ${chapter.nav}`)));
}

function progressCard(data, viewedCount, total) {
  const meta = data.meta;
  const rows = [
    ['Tour', `${tourMinutes(data)} min`],
    meta.generatedAt && ['Generated', displayDate(meta.generatedAt)],
    meta.commit && ['Commit', String(meta.commit).slice(0, 7)],
  ].filter(Boolean);
  return h('article', { class: 'panel progress-card' },
    h('p', { class: 'eyebrow quiet' }, 'Your progress'),
    h('p', { class: 'prog-figure' }, h('span', { class: 'prog-done' }, String(viewedCount)), `of ${total} viewed`),
    h('div', { class: 'meter', 'aria-hidden': 'true' }, h('span', { style: `--share:${total ? viewedCount / total : 0}` })),
    h('dl', { class: 'prog-break' }, rows.map(([label, value]) => h('div', null, h('dt', null, label), h('dd', null, value)))),
    h('p', { class: 'prog-note' }, 'Only this browser remembers it.'));
}

function glancePanel(data) {
  const stats = [
    ['Layers', list(data.layers).length],
    ['Components', list(data.nodes).length],
    ['Flows', list(data.flows).length],
    ['Changes', list(data.changes).length],
    ['Files', citedFiles(data)],
  ].filter(([, value]) => value > 0);
  // A PR or a concept has no changes log or layers: show what it has.
  if (!stats.length) return null;
  return h('section', { class: 'panel glance', 'aria-label': 'At a glance' },
    h('p', { class: 'panel-bar' }, h('span', null, 'At a glance'), h('span', null, `${tourMinutes(data)} min tour`)),
    h('dl', { class: 'glance-grid' }, stats.map(([label, value]) => h('div', null,
      h('dt', null, label), h('dd', null, String(value))))));
}

function chapterCard(data, chapter, index) {
  return h('a', { class: 'card', href: `#${chapter.key}` },
    h('span', { class: 'top-row' }, h('span', null, padNumber(index + 1)),
      h('span', { class: 'card-count' }, chapterCount(chapter, data))),
    h('span', { class: `card-title ${fitClass(chapter.title)}` }, softBreaks(chapter.title)),
    h('span', { class: 'line' }, chapter.lead),
    h('span', { class: 'card-foot' }, h('span', { class: 'card-viewed' }, 'Viewed'), h('span', { class: 'card-open' }, 'Open')));
}

function latestChanges(data) {
  const changes = list(data.changes)
    .map((change, i) => ({ change, key: changeKey(change, i) }))
    .sort((a, b) => String(b.change.date).localeCompare(String(a.change.date)))
    .slice(0, 3);
  if (!changes.length) return null;
  return h('section', { class: 'panel ov-changes', 'aria-labelledby': 'ov-changes-title' },
    h('div', { class: 'panel-bar' }, h('h2', { id: 'ov-changes-title' }, 'Latest changes'),
      h('a', { href: '#changes' }, 'All changes')),
    h('ul', { class: 'rows' }, changes.map(({ change, key }) => h('li', null,
      h('a', { class: 'row-link', href: `#changes/${linkPart(key)}` },
        h('span', { class: 'row-date' }, displayDate(change.date, { fallback: 'undated' })),
        h('span', { class: 'row-title' }, softBreaks(change.title)),
        tag(change.authorType === 'agent' ? 'Agent' : 'Human'))))));
}

function renderTree(data, mount) {
  const entries = list(data.tree);
  const rows = entries.map((entry) => {
    const depth = String(entry.path).replace(/\/$/, '').split('/').length - 1;
    const isDir = String(entry.path).endsWith('/');
    return h('li', { class: entry.key ? 'is-key' : '', 'data-path': entry.path },
      h('span', { class: 'path', style: `padding-left:${Math.min(depth, 4) * 18}px` }, icon(isDir ? 'folder' : 'file'), h('span', { class: 'path-text' }, breakablePath(entry.path))),
      h('span', { class: 'note' }, entry.key && tag('Key', 'tag-key'), softBreaks(text(entry.note))));
  });
  mount.append(h('div', { class: 'panel' }, h('ul', { class: 'tree' }, rows)));
  return {
    open([path] = []) {
      const want = text(path).replace(/\/$/, '');
      const match = rows.find((row) => String(row.dataset.path).replace(/\/$/, '') === want);
      rows.forEach((row) => row.classList.toggle('is-target', row === match));
      return match || null;
    },
  };
}

function renderGlossary(data, mount) {
  const terms = list(data.glossary);
  const input = h('input', { class: 'search', type: 'search', placeholder: 'Search terms', 'aria-label': 'Search glossary' });
  const items = terms.map((term) => ({ term, el: h('div', null, h('dt', null, softBreaks(term.term)), h('dd', null, softBreaks(term.definition))) }));
  const filter = () => {
    const q = input.value.trim().toLowerCase();
    items.forEach(({ term, el }) => {
      el.hidden = Boolean(q) && !`${term.term} ${term.definition}`.toLowerCase().includes(q);
    });
  };
  input.addEventListener('input', filter);
  mount.append(h('div', { class: 'glossary-wrap' }, input, h('dl', { class: 'glossary' }, items.map((item) => item.el))));
  return {
    open([word] = []) {
      const want = text(word).toLowerCase();
      const match = want ? items.find(({ term }) => String(term.term).toLowerCase() === want) : null;
      if (match) {
        input.value = '';
        filter();
      }
      items.forEach(({ el }) => el.classList.toggle('is-target', Boolean(match) && el === match.el));
      return match ? match.el : null;
    },
  };
}

function renderRunbook(data, mount) {
  mount.append(h('div', { class: 'runbook' }, list(data.runbook).map((item, i) => {
    const copy = h('button', { class: 'btn small', type: 'button' }, 'Copy');
    copy.addEventListener('click', () => {
      navigator.clipboard.writeText(item.command)
        .then(() => { copy.textContent = 'Copied'; copy.dataset.state = 'done'; })
        .catch(() => { copy.textContent = 'Select to copy'; });
    });
    return h('article', { class: 'panel run-item' },
      h('div', { class: 'run-head' }, h('span', { class: 'run-n' }, padNumber(i + 1)), h('h3', null, softBreaks(item.label)), item.command && copy),
      item.note && h('p', { class: 'run-note' }, softBreaks(item.note)),
      item.command && codeBlock(item.command, 'sh'));
  })));
}
