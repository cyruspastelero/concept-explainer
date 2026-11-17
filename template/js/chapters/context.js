// Chapter: context. The problem leads to the goals; the non goals sit
// outside the scope line. A picture of the brief, not paragraphs.
// Deep link: #context.

/**
 * @param {object} data explainer data (reads data.context)
 * @param {HTMLElement} mount the chapter body
 * @returns {{ open: () => Element|null }|null}
 */
function chRenderContext(data, mount) {
  const context = data.context && typeof data.context === 'object' ? data.context : null;
  if (!context || !text(context.problem)) {
    mount.append(h('p', { class: 'empty' }, 'No context given.'));
    return null;
  }
  const goals = list(context.goals).filter((g) => typeof g === 'string' && g.trim());
  const nonGoals = list(context.nonGoals).filter((g) => typeof g === 'string' && g.trim());
  const meta = data.meta || {};
  const status = text(meta.status);

  const numbered = (items, cls) => h('ol', { class: `ch-ctx-list ${cls}` }, items.map((item, i) => h('li', null,
    h('span', { class: 'ch-ctx-n', 'aria-hidden': 'true' }, String(i + 1)),
    h('span', null, softBreaks(item)))));

  const problem = h('section', { class: 'panel ch-ctx-box ch-ctx-problem', 'aria-labelledby': 'ch-ctx-problem' },
    h('p', { class: 'eyebrow quiet', id: 'ch-ctx-problem' }, h('span', { class: 'ch-ctx-icon is-problem', 'aria-hidden': 'true' }), 'The problem'),
    h('p', { class: 'ch-ctx-problem-text' }, softBreaks(context.problem)),
    text(context.background) && h('div', { class: 'why' }, h('p', { class: 'eyebrow quiet' }, 'Background'), h('p', null, softBreaks(context.background))));

  const scope = h('div', { class: 'ch-ctx-scope' },
    h('section', { class: 'panel ch-ctx-box ch-ctx-goals', 'aria-labelledby': 'ch-ctx-goals' },
      h('p', { class: 'eyebrow quiet', id: 'ch-ctx-goals' }, h('span', { class: 'ch-ctx-icon is-goal', 'aria-hidden': 'true' }), `Goals · ${goals.length}`),
      goals.length ? numbered(goals, 'is-goals') : h('p', { class: 'ch-ctx-none' }, 'No goals listed.')),
    nonGoals.length > 0 && h('section', { class: 'ch-ctx-box ch-ctx-out', 'aria-labelledby': 'ch-ctx-out' },
      h('p', { class: 'eyebrow quiet', id: 'ch-ctx-out' }, h('span', { class: 'ch-ctx-icon is-out', 'aria-hidden': 'true' }), `Out of scope · ${nonGoals.length}`),
      numbered(nonGoals, 'is-out')));

  const diagram = h('div', { class: 'ch-context', role: 'group', 'aria-label': 'Problem, goals and what is out of scope' },
    problem,
    h('div', { class: 'ch-ctx-arrow', 'aria-hidden': 'true' }, h('span', null, 'so we aim for')),
    scope);
  mount.append(h('div', { class: 'ch-cq' }, diagram),
    status && h('p', { class: 'ch-ctx-status' }, h('span', { class: 'eyebrow quiet' }, 'Status'), chStatusWord(status)));
  riseIn(problem);
  riseIn(scope, 120);
  return { open: () => null };
}

const CH_STATUS_WORDS = {
  draft: 'Draft', proposed: 'Proposed, not decided', accepted: 'Accepted', rejected: 'Rejected', 'in-progress': 'In progress', merged: 'Merged', done: 'Done',
};

/** meta.status as ink text with a small marker: filled when settled, a ring while open. */
function chStatusWord(status) {
  const settled = ['accepted', 'merged', 'done', 'rejected'].includes(status);
  return h('span', { class: `ch-state${settled ? ' is-settled' : ''}` },
    h('span', { class: 'ch-state-mark', 'aria-hidden': 'true' }), CH_STATUS_WORDS[status] || status);
}
