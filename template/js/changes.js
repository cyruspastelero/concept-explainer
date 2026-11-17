// Chapter: what changed and why. Built for repos where many humans and
// agents merge every day. Each change carries its reason and the parts of
// the system it touched, so readers can re-sync their mental model fast.
const AUTHOR_FILTERS = [
  { id: 'all', label: 'Everyone' },
  { id: 'agent', label: 'Agents' },
  { id: 'human', label: 'Humans' },
];

// The deep-link key for a change: its id, else its position in the data.
function changeKey(change, index) {
  return text(change && change.id, String(index));
}

// Newest first, each with its deep-link key.
function sortedChanges(data) {
  return list(data.changes)
    .map((change, i) => ({ ...change, key: changeKey(change, i) }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function visibleChanges(changes, state) {
  return changes.filter((c) => (state.author === 'all' || c.authorType === state.author)
    && (state.kind === 'all' || c.kind === state.kind));
}

function changesToolbar(state, kinds, setState) {
  return [
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter by author' },
      AUTHOR_FILTERS.map((f) => filterChip(f.label, state.author === f.id, () => setState({ author: f.id })))),
    kinds.length > 2 && h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter by type' },
      kinds.map((k) => filterChip(k === 'all' ? 'All types' : k, state.kind === k, () => setState({ kind: k })))),
    h('button', {
      class: 'btn small changes-map', type: 'button',
      onclick: () => { emit('highlight-changes', { enabled: true }); window.location.hash = 'map'; },
    }, 'Show on map'),
  ];
}

function renderChanges(data, mount) {
  const changes = sortedChanges(data);
  if (!changes.length) {
    mount.append(h('p', { class: 'empty' }, 'No recent changes recorded.'));
    return null;
  }
  const nodeIndex = byId(data.nodes);
  const kinds = ['all', ...new Set(changes.map((c) => c.kind).filter(Boolean))];
  const toolbar = h('div', { class: 'changes-toolbar' });
  const timeline = h('ol', { class: 'timeline' });
  let state = { author: 'all', kind: 'all', target: null };

  function setState(next, { animate = true } = {}) {
    state = { ...state, ...next };
    render();
    if (animate) [...timeline.children].slice(0, 8).forEach((item, i) => riseIn(item, i * 35));
  }

  function render() {
    fill(toolbar, ...changesToolbar(state, kinds, setState));
    const items = visibleChanges(changes, state);
    fill(timeline, ...(items.length
      ? items.map((change) => changeItem(change, nodeIndex, change.key === state.target))
      : [h('li', { class: 'empty' }, 'Nothing matches these filters.')]));
  }

  render();
  mount.append(changeStats(changes), toolbar, timeline);
  return {
    open([key] = []) {
      const match = key !== undefined && changes.find((c) => c.key === key);
      setState({ author: 'all', kind: 'all', target: match ? match.key : null }, { animate: false });
      return match ? timeline.querySelector('.change.is-target') : null;
    },
  };
}

function filterChip(label, pressed, onclick) {
  return h('button', { class: 'seg-option', type: 'button', 'aria-pressed': String(pressed), onclick }, label);
}

function changeStats(changes) {
  const agents = changes.filter((c) => c.authorType === 'agent').length;
  const touched = new Set(changes.flatMap((c) => list(c.nodes))).size;
  const stat = (value, label) => h('div', null, h('dt', null, label), h('dd', null, String(value)));
  return h('dl', { class: 'panel glance-grid changes-stats' },
    stat(changes.length, 'Changes'),
    stat(agents, 'By agents'),
    stat(changes.length - agents, 'By humans'),
    stat(touched, 'Parts touched'));
}

function changeItem(change, nodeIndex, isTarget) {
  const isAgent = change.authorType === 'agent';
  const url = safeUrl(change.url);
  return h('li', { class: `change ${isAgent ? 'is-agent' : 'is-human'}${isTarget ? ' is-target' : ''}`, 'data-change': change.key },
    h('div', { class: 'change-dot', 'aria-hidden': 'true' }, icon(isAgent ? 'robot' : 'user')),
    h('article', { class: 'panel change-card' },
      h('div', { class: 'change-top' },
        h('span', null, displayDate(change.date, { fallback: 'undated' })),
        change.ref && (url
          ? h('a', { class: 'link', href: safeUrl(change.url), target: '_blank', rel: 'noopener noreferrer' }, softBreaks(change.ref))
          : h('span', null, softBreaks(change.ref))),
        tag(isAgent ? 'Agent' : 'Human', isAgent ? 'tag-agent' : 'tag-human'),
        change.author && h('span', null, softBreaks(change.author)),
        change.kind && tag(change.kind)),
      h('h3', null, softBreaks(change.title)),
      change.what && h('p', null, softBreaks(change.what)),
      change.why && h('div', { class: 'why' }, h('p', { class: 'eyebrow quiet' }, 'Why'), h('p', null, softBreaks(change.why))),
      change.risk && h('div', { class: 'why why-risk' }, h('p', { class: 'eyebrow quiet' }, 'Risk'), h('p', null, softBreaks(change.risk))),
      list(change.nodes).length > 0 && h('div', { class: 'change-nodes' }, list(change.nodes).map((id) => {
        const node = nodeIndex.get(id);
        return h('a', { class: 'chip', href: `#map/${linkPart(id)}` }, truncatable(h('span', { class: 'chip-text' }, softBreaks(node ? node.label : id)), node ? node.label : id));
      })),
      list(change.files).length > 0 && h('div', { class: 'change-nodes' }, list(change.files).slice(0, 6).map(fileChip))));
}

