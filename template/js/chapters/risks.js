// Chapter: risks. An impact grid: high, medium and low rows, each risk a
// card in its row. Picking one shows its mitigation and owner.
// Deep link: #risks/<index> (from 0, in data order).

const CH_IMPACTS = [['high', 'High', 3], ['medium', 'Medium', 2], ['low', 'Low', 1]];

function chImpactMeter(level) {
  return h('span', { class: 'ch-meter', 'aria-hidden': 'true' }, [1, 2, 3].map((n) => h('i', { class: n <= level ? 'is-on' : '' })));
}

// Button positions, high impact first; each holds a data index.
function chRiskOrder(risks) {
  return CH_IMPACTS.flatMap(([key]) => risks.map((risk, i) => [risk, i]).filter(([risk]) => chImpactOf(risk) === key).map(([, i]) => i));
}

function chImpactOf(risk) {
  return CH_IMPACTS.some(([key]) => key === risk.impact) ? risk.impact : 'medium';
}

function chRiskCard(risk) {
  return h('button', { class: 'ch-risk', type: 'button', 'aria-pressed': 'false' },
    h('span', { class: 'ch-risk-text' }, softBreaks(text(risk.risk))), text(risk.owner) && h('span', { class: 'ch-risk-owner' }, softBreaks(risk.owner)));
}

function chRiskDetail(risk) {
  const [, label, level] = CH_IMPACTS.find(([key]) => key === chImpactOf(risk));
  return [
    h('div', { class: 'step-top' }, h('span', { class: 'ch-impact' }, chImpactMeter(level), `${label} impact`)),
    h('h3', null, softBreaks(text(risk.risk))),
    h('div', { class: 'why why-risk' }, h('p', { class: 'eyebrow quiet' }, 'How it is handled'), h('p', null, softBreaks(text(risk.mitigation, 'No mitigation recorded.')))),
    text(risk.owner) && h('p', { class: 'ch-owner' }, h('span', { class: 'detail-label' }, 'Owner'), softBreaks(risk.owner)),
  ];
}

// Three rows, high to low; each row holds the cards of its impact.
function chRiskGrid(risks, order, buttons) {
  return h('div', { class: 'panel ch-impact-grid', role: 'group', 'aria-label': 'Risks by impact' }, CH_IMPACTS.map(([key, label, level]) => {
    const inRow = order.map((i, k) => [i, k]).filter(([i]) => chImpactOf(risks[i]) === key);
    return h('div', { class: `ch-impact-row is-${key}` },
      h('div', { class: 'ch-impact-head' }, chImpactMeter(level), h('span', { class: 'ch-impact-name' }, label), h('span', { class: 'ch-impact-count' }, String(inRow.length))),
      h('div', { class: 'ch-impact-cells' }, inRow.length ? inRow.map(([, k]) => buttons[k]) : h('span', { class: 'ch-ctx-none' }, 'None')));
  }));
}

/**
 * @param {object} data explainer data (reads data.risks)
 * @param {HTMLElement} mount the chapter body
 * @returns {{ open: (parts: string[]) => Element|null }|null}
 */
function chRenderRisks(data, mount) {
  const risks = list(data.risks).filter((r) => r && typeof r === 'object');
  if (!risks.length) {
    mount.append(h('p', { class: 'empty' }, 'No risks listed.'));
    return null;
  }
  const detail = h('aside', { class: 'panel ch-detail', 'aria-live': 'polite' });
  // Visual order: high first; the deep-link index stays the data index.
  const order = chRiskOrder(risks);
  const buttons = order.map((i) => chRiskCard(risks[i]));
  const select = chSelection({
    buttons, detail, order, chapter: 'risks', noun: 'risk',
    empty: () => chEmptyDetail('Pick a risk', 'Risks sit in rows by impact, the worst at the top. Each one shows how it is handled.'),
    describe: (i) => chRiskDetail(risks[i]),
  });
  mount.append(h('div', { class: 'ch-cq' }, h('div', { class: 'ch-split' }, chRiskGrid(risks, order, buttons), detail)));
  buttons.forEach((card, k) => riseIn(card, Math.min(k, 8) * 30));
  return chIndexOpener(select, risks.length);
}
