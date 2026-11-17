// Chapter: diff. A bar chart of the files a change touches: one row per
// file with its status marker and +/- lines, linked to the map nodes it
// belongs to. Deep link: #diff/<path> (the path as one encoded segment).

const CH_LINES = /^\+(\d+) -(\d+)$/;

function chParseLines(value) {
  const match = typeof value === 'string' ? value.trim().match(CH_LINES) : null;
  return match ? { add: Number(match[1]), del: Number(match[2]) } : null;
}

function chDiffTotals(entries) {
  return entries.reduce((acc, entry) => {
    const lines = chParseLines(entry.lines);
    return { add: acc.add + (lines ? lines.add : 0), del: acc.del + (lines ? lines.del : 0) };
  }, { add: 0, del: 0 });
}

function chDiffBar(lines, max) {
  if (!lines) return h('span', { class: 'ch-bar is-empty' }, h('span', { class: 'ch-bar-none' }, 'lines not given'));
  const share = (n) => (max ? Math.max(n ? 0.02 : 0, n / max) : 0);
  return h('span', { class: 'ch-bar', 'aria-hidden': 'true' },
    h('span', { class: 'ch-bar-track' },
      h('i', { class: 'ch-bar-add', style: `--share:${share(lines.add)}` }),
      h('i', { class: 'ch-bar-del', style: `--share:${share(lines.del)}` })),
    h('span', { class: 'ch-bar-num' }, `+${lines.add} −${lines.del}`));
}

function chDiffRow(entry, max) {
  const lines = chParseLines(entry.lines);
  return h('button', {
    class: `ch-file is-${CH_STATUS_LABELS[entry.status] ? entry.status : 'modified'}`, type: 'button', 'aria-pressed': 'false', 'data-path': entry.path,
    'aria-label': `${entry.path}, ${CH_STATUS_LABELS[entry.status] || 'Changed'}${lines ? `, ${lines.add} added and ${lines.del} removed lines` : ''}${entry.key ? ', key file' : ''}`,
    style: `--size:${lines ? (lines.add + lines.del) / max : 0}`,
  },
  chStatusMark(entry.status),
  h('span', { class: 'ch-file-name' }, truncatable(h('span', { class: 'ch-file-path' }), entry.path, { mode: 'middle' }),
    entry.key && h('span', { class: 'tag tag-key' }, 'Key')),
  chDiffBar(lines, max));
}

function chDiffNodeLink(id, nodeIndex) {
  const node = nodeIndex.get(id);
  return h('li', null, h('a', { class: 'ch-node-link', href: `#map/${linkPart(id)}` },
    node && node.status && node.status !== 'unchanged' ? chStatusMark(node.status) : null,
    softBreaks(text(node && node.label, String(id)))));
}

function chDiffDetail(entry, nodeIndex) {
  const lines = chParseLines(entry.lines);
  return [
    h('div', { class: 'step-top' }, chStatusTag(entry.status), entry.key && tag('Key file', 'tag-key'), lines && h('span', { class: 'ch-bar-num' }, `+${lines.add} −${lines.del}`)),
    h('h3', { class: 'ch-detail-path' }, breakablePath(entry.path)),
    entry.status === 'renamed' && text(entry.from) && h('p', { class: 'ch-from' }, 'Was ', h('code', null, breakablePath(entry.from))),
    h('p', null, softBreaks(text(entry.summary, 'No summary yet.'))),
    list(entry.nodes).length > 0 && [h('div', { class: 'detail-label' }, 'Part of'), h('ul', { class: 'ch-node-links' }, list(entry.nodes).map((id) => chDiffNodeLink(id, nodeIndex)))],
  ];
}

// The totals, files per status, and the bar legend.
function chDiffSummary(entries) {
  const totals = chDiffTotals(entries);
  const counts = Object.keys(CH_STATUS_LABELS).filter((key) => key !== 'changed' && key !== 'unchanged')
    .map((key) => [key, entries.filter((e) => e.status === key).length]).filter(([, n]) => n > 0);
  return h('div', { class: 'ch-diff-summary' },
    h('p', { class: 'ch-diff-total' }, h('b', null, chCount(entries.length, 'file')), h('span', { class: 'ch-bar-num' }, `+${totals.add} −${totals.del}`)),
    h('ul', { class: 'ch-legend', 'aria-label': 'Files by status' }, counts.map(([key, n]) => h('li', null, chStatusMark(key), `${n} ${CH_STATUS_LABELS[key].toLowerCase()}`))),
    h('p', { class: 'ch-legend ch-legend-bars', 'aria-hidden': 'true' }, h('span', null, h('i', { class: 'ch-swatch is-add' }), 'Added lines'), h('span', null, h('i', { class: 'ch-swatch is-del' }), 'Removed lines')));
}

/**
 * @param {object} data explainer data (reads data.diff, data.nodes)
 * @param {HTMLElement} mount the chapter body
 * @returns {{ open: (parts: string[]) => Element|null }|null}
 */
function chRenderDiff(data, mount) {
  const entries = list(data.diff).filter((entry) => entry && typeof entry === 'object' && text(entry.path));
  if (!entries.length) {
    mount.append(h('p', { class: 'empty' }, 'No files in this change.'));
    return null;
  }
  const nodeIndex = byId(data.nodes);
  const max = Math.max(1, ...entries.map((e) => { const l = chParseLines(e.lines); return l ? l.add + l.del : 0; }));
  const detail = h('aside', { class: 'panel ch-detail', 'aria-live': 'polite' });
  const rows = entries.map((entry) => chDiffRow(entry, max));
  const select = chSelection({
    buttons: rows, detail, chapter: 'diff', noun: 'file', axis: 'y', hash: (i) => `diff/${linkPart(entries[i].path)}`,
    empty: () => chEmptyDetail('Pick a file', 'Each bar is one file, as long as its changed lines. Key files are the ones a reviewer must read.'),
    describe: (i) => chDiffDetail(entries[i], nodeIndex),
  });
  mount.append(h('div', { class: 'ch-cq' }, h('div', { class: 'ch-split' },
    h('div', { class: 'panel ch-diff' }, chDiffSummary(entries), h('div', { class: 'ch-file-list', role: 'group', 'aria-label': 'Changed files' }, rows)),
    detail)));
  rows.forEach((row, i) => riseIn(row, Math.min(i, 8) * 30));
  return {
    open(parts = []) {
      const index = parts.length ? entries.findIndex((e) => e.path === parts.join('/')) : -1;
      return index >= 0 ? select(index, { link: false }) : null;
    },
  };
}
