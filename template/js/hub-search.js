// Hub search: scoring, grouping, facets and the result rows.
// ---------- Search ----------
// Every word must appear in the title or text. Title hits rank first, then
// the kind of thing (an explainer before a file).
function scoreEntry(entry, words, phrase) {
  const title = text(entry.title).toLowerCase();
  const hay = `${title} ${text(entry.text).toLowerCase()}`;
  if (!words.every((word) => hay.includes(word))) return null;
  const typeRank = TYPE_ORDER.indexOf(entry.type);
  return (title === phrase ? 20 : 0) + (title.startsWith(phrase) ? 8 : 0)
    + words.filter((word) => title.includes(word)).length * 3 - (typeRank < 0 ? 10 : typeRank) * 0.1;
}

function searchEntries(index, query, allowed) {
  const phrase = query.trim().toLowerCase();
  const words = phrase.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return index
    .filter((entry) => allowed.has(entry.slug))
    .map((entry) => ({ entry, score: scoreEntry(entry, words, phrase) }))
    .filter((hit) => hit.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, RESULT_LIMIT)
    .map((hit) => hit.entry);
}

function groupBySlug(entries) {
  return entries.reduce((groups, entry) => {
    const existing = groups.get(entry.slug) || [];
    return new Map([...groups, [entry.slug, [...existing, entry]]]);
  }, new Map());
}

// ---------- Facets ----------
function stackFacets(explainers) {
  const counts = explainers.flatMap((e) => list(e.stack).map(String)).reduce((map, item) => map.set(item, (map.get(item) || 0) + 1), new Map());
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, STACK_FACETS).map(([name]) => name);
}

function typeFacets(explainers) {
  return [...new Set(explainers.map((e) => e.type || 'repo'))].sort();
}

function tagFacets(explainers) {
  const counts = explainers.flatMap((e) => list(e.tags).map(String)).reduce((map, item) => map.set(item, (map.get(item) || 0) + 1), new Map());
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, TAG_FACETS).map(([name]) => name);
}

function presetFacets(explainers) {
  return [...new Set(explainers.map((e) => e.preset).filter((p) => typeof p === 'string' && p))].sort();
}

function facetGroup(label, options, current, onPick, labelOf = (v) => v) {
  if (!options.length) return null;
  const chip = (value, name) => h('button', {
    class: 'facet', type: 'button', 'aria-pressed': String(current === value), onclick: () => onPick(value),
  }, truncatable(h('span', { class: 'facet-text' }, softBreaks(name)), name));
  return h('div', { class: 'facet-group', role: 'group', 'aria-label': label },
    h('span', { class: 'eyebrow quiet' }, label),
    h('span', { class: 'facet-chips' }, chip(null, 'Any'), options.map((option) => chip(option, labelOf(option)))));
}

// ---------- Results ----------
// Wrap each query word found in the text in <mark>, as text nodes only.
function highlight(value, words) {
  const source = String(value);
  const lower = source.toLowerCase();
  const ranges = words.flatMap((word) => {
    const found = [];
    for (let at = lower.indexOf(word); at >= 0 && word; at = lower.indexOf(word, at + word.length)) found.push([at, at + word.length]);
    return found;
  }).sort((a, b) => a[0] - b[0])
    .reduce((merged, range) => {
      const last = merged[merged.length - 1];
      return last && range[0] <= last[1] ? [...merged.slice(0, -1), [last[0], Math.max(last[1], range[1])]] : [...merged, range];
    }, []);
  const parts = [];
  let cursor = 0;
  ranges.forEach(([start, end]) => {
    if (start > cursor) parts.push(...softBreaks(source.slice(cursor, start)));
    parts.push(h('mark', null, softBreaks(source.slice(start, end))));
    cursor = end;
  });
  if (cursor < source.length) parts.push(...softBreaks(source.slice(cursor)));
  return parts;
}

function queryWords(query) {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function resultRow(entry, words) {
  const href = libraryHref(entry.href);
  const body = [
    h('span', { class: 'tag result-type' }, TYPE_LABELS[entry.type] || text(entry.type, 'Item')),
    h('span', { class: 'result-text' },
      h('span', { class: 'result-title' }, highlight(text(entry.title, 'Untitled'), words)),
      text(entry.text) && truncatable(h('span', { class: 'result-snippet' }, highlight(entry.text, words)), entry.text)),
  ];
  return h('li', null, href ? h('a', { class: 'result-link', href }, body) : h('span', { class: 'result-link is-plain' }, body));
}

function resultGroups(groups, titles, words) {
  return [...groups.entries()].map(([slug, entries]) => h('section', { class: 'panel result-group', 'aria-label': titles.get(slug) || slug },
    h('div', { class: 'panel-bar' }, truncatable(h('span', { class: 'result-group-title' }, softBreaks(titles.get(slug) || slug)), titles.get(slug) || slug), h('span', null, plural(entries.length, 'match', 'matches'))),
    h('ul', { class: 'rows' }, entries.map((entry) => resultRow(entry, words)))));
}
