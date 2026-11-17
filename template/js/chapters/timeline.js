// Chapter: timeline (incidents). A time axis with one marker per event,
// shaped by kind: detect, act, fix, learn. Across when the events fit,
// down on phones. Events are evenly spaced in record order: `at` is the time
// as written in the record, so it is shown, never parsed.
// Deep link: #timeline/<index> (from 0).

const CH_EVENT_KINDS = {
  detect: { label: 'Detect', shape: () => s('circle', { cx: 7, cy: 7, r: 5 }) },
  act: { label: 'Act', shape: () => s('rect', { x: 2.5, y: 2.5, width: 9, height: 9 }) },
  fix: { label: 'Fix', shape: () => s('path', { d: 'M7 1.5 L12.5 7 L7 12.5 L1.5 7 Z' }) },
  learn: { label: 'Learn', shape: () => s('path', { d: 'M7 2 L12.5 12 H1.5 Z' }) },
};
const CH_EVENT_SLOT = 84;

function chEventMark(kind) {
  const entry = CH_EVENT_KINDS[kind];
  return s('svg', { class: `ch-event-mark is-${entry ? kind : 'none'}`, viewBox: '0 0 14 14', width: 14, height: 14, 'aria-hidden': 'true' },
    entry ? entry.shape() : s('circle', { cx: 7, cy: 7, r: 3 }));
}

function chEventButton(ev) {
  return h('button', {
    class: 'ch-event', type: 'button', 'aria-pressed': 'false',
    'aria-label': `${text(ev.at)}: ${text(ev.label)}${CH_EVENT_KINDS[ev.kind] ? `, ${CH_EVENT_KINDS[ev.kind].label}` : ''}`,
  },
  h('span', { class: 'ch-event-dot' }, chEventMark(ev.kind)),
  h('span', { class: 'ch-event-text' },
    h('span', { class: 'ch-event-at' }, softBreaks(text(ev.at))),
    truncatable(h('span', { class: 'ch-event-label' }, softBreaks(text(ev.label))), text(ev.label))));
}

function chEventDetail(ev, i, count) {
  const kind = CH_EVENT_KINDS[ev.kind];
  return [
    h('div', { class: 'step-top' }, h('span', { class: 'step-count' }, `Event ${i + 1} of ${count}`),
      kind && h('span', { class: 'ch-impact' }, chEventMark(ev.kind), kind.label)),
    h('p', { class: 'ch-event-at' }, softBreaks(text(ev.at))),
    h('h3', null, softBreaks(text(ev.label))),
    text(ev.detail) && h('p', null, softBreaks(ev.detail)),
  ];
}

// The legend and the axis; across only when every event gets CH_EVENT_SLOT pixels.
function chTimelinePanel(events, buttons) {
  const used = Object.keys(CH_EVENT_KINDS).filter((k) => events.some((ev) => ev.kind === k));
  const axis = h('ol', { class: 'ch-axis', style: `--events:${events.length}` }, buttons.map((b, i) => h('li', { class: i % 2 ? 'is-low' : 'is-high' }, b)));
  const panel = h('div', { class: 'panel ch-timeline' },
    used.length > 0 && h('p', { class: 'ch-legend', 'aria-hidden': 'true' }, used.map((k) => h('span', null, chEventMark(k), CH_EVENT_KINDS[k].label))),
    axis);
  chOnWidth(panel, (width) => axis.classList.toggle('is-across', width - 48 >= events.length * CH_EVENT_SLOT));
  return panel;
}

/**
 * @param {object} data explainer data (reads data.timeline)
 * @param {HTMLElement} mount the chapter body
 * @returns {{ open: (parts: string[]) => Element|null }|null}
 */
function chRenderTimeline(data, mount) {
  const events = list(data.timeline).filter((ev) => ev && typeof ev === 'object');
  if (!events.length) {
    mount.append(h('p', { class: 'empty' }, 'No events recorded.'));
    return null;
  }
  const detail = h('aside', { class: 'panel ch-detail', 'aria-live': 'polite' });
  const buttons = events.map(chEventButton);
  const select = chSelection({
    buttons, detail, chapter: 'timeline', noun: 'event',
    empty: () => chEmptyDetail('Pick an event', 'Events run in the order of the record. The marker shape says what kind of moment it was.'),
    describe: (i) => chEventDetail(events[i], i, events.length),
  });
  mount.append(h('div', { class: 'ch-stack' }, chTimelinePanel(events, buttons), detail));
  buttons.forEach((b, i) => riseIn(b, Math.min(i, 10) * 30));
  return chIndexOpener(select, events.length);
}
