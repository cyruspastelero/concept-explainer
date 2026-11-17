// Chapter: rollout. A stepped track: done steps filled, the next step ringed,
// the rest hollow. Across when the steps fit, down otherwise.
// Deep link: #rollout/<index> (from 0).

const CH_TRACK_STEP = 132;

const CH_STEP_WORDS = { done: 'Done', next: 'Next up', todo: 'Not started' };

// Each step's state: done, the first not done (next), or not started.
function chRolloutStates(steps) {
  const next = steps.findIndex((st) => st.done !== true);
  return steps.map((st, i) => (st.done === true ? 'done' : i === next ? 'next' : 'todo'));
}

function chRolloutButton(step, i, state) {
  return h('button', {
    class: `ch-step is-${state}`, type: 'button', 'aria-pressed': 'false', 'aria-label': `Step ${i + 1}: ${text(step.label)}, ${CH_STEP_WORDS[state]}`,
  },
  h('span', { class: 'ch-step-node', 'aria-hidden': 'true' }, state === 'done' ? '✓' : String(i + 1)),
  h('span', { class: 'ch-step-text' },
    h('span', { class: 'ch-step-state' }, CH_STEP_WORDS[state]),
    h('span', { class: 'ch-step-label' }, softBreaks(text(step.label)))));
}

function chRolloutDetail(step, i, count, state) {
  return [
    h('div', { class: 'step-top' }, h('span', { class: 'step-count' }, `Step ${i + 1} of ${count}`),
      h('span', { class: `ch-state${state === 'done' ? ' is-settled' : ''}${state === 'next' ? ' is-next' : ''}` }, h('span', { class: 'ch-state-mark', 'aria-hidden': 'true' }), CH_STEP_WORDS[state])),
    h('h3', null, softBreaks(text(step.label))),
    text(step.detail) && h('p', null, softBreaks(step.detail)),
    text(step.command) && chCommand(step.command),
  ];
}

// Progress and the track; across only when every step gets CH_TRACK_STEP pixels.
function chRolloutPanel(steps, buttons, states) {
  const done = states.filter((st) => st === 'done').length;
  const track = h('ol', { class: 'ch-track', style: `--steps:${steps.length}` }, buttons.map((b, i) => h('li', { class: `is-${states[i]}` }, b)));
  const panel = h('div', { class: 'panel ch-track-panel' },
    h('div', { class: 'ch-progress' },
      h('p', null, h('b', null, `${done} of ${steps.length}`), ' steps done'),
      h('div', { class: 'meter', 'aria-hidden': 'true' }, h('span', { style: `--share:${done / steps.length}` }))),
    track);
  chOnWidth(panel, (width) => track.classList.toggle('is-across', width - 48 >= steps.length * CH_TRACK_STEP));
  return panel;
}

/**
 * @param {object} data explainer data (reads data.rollout)
 * @param {HTMLElement} mount the chapter body
 * @returns {{ open: (parts: string[]) => Element|null }|null}
 */
function chRenderRollout(data, mount) {
  const steps = list(data.rollout).filter((st) => st && typeof st === 'object');
  if (!steps.length) {
    mount.append(h('p', { class: 'empty' }, 'No rollout steps listed.'));
    return null;
  }
  const states = chRolloutStates(steps);
  const next = states.indexOf('next');
  const detail = h('aside', { class: 'panel ch-detail', 'aria-live': 'polite' });
  const buttons = steps.map((step, i) => chRolloutButton(step, i, states[i]));
  const select = chSelection({
    buttons, detail, chapter: 'rollout', noun: 'step',
    empty: () => chEmptyDetail(next >= 0 ? `Next: ${text(steps[next].label)}` : 'Every step is done', 'Pick a step on the track to see what it involves and how to run it.'),
    describe: (i) => chRolloutDetail(steps[i], i, steps.length, states[i]),
  });
  mount.append(h('div', { class: 'ch-stack' }, chRolloutPanel(steps, buttons, states), detail));
  buttons.forEach((b, i) => riseIn(b, Math.min(i, 8) * 40));
  return chIndexOpener(select, steps.length);
}
