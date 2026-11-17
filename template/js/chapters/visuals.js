// Chapter: visuals (diagrams[]). Pick a diagram, then pick its parts.
// Deep links: #visuals/<diagramId> and #visuals/<diagramId>/<part>, parts
// counted from 0 in the order of references/visuals.md.

function chDiagramId(diagram, index) {
  return text(diagram && typeof diagram.id === 'string' ? diagram.id : '', String(index));
}

function chVisualPick(diagram, i) {
  return h('button', { class: 'ch-pick', type: 'button', 'aria-pressed': 'false' },
    h('span', { class: 'ch-pick-top' }, h('span', null, String(i + 1).padStart(2, '0')), h('span', null, VIZ_KIND_NAMES[diagram.kind] || text(diagram.kind, 'Visual'))),
    h('span', { class: 'ch-pick-title' }, softBreaks(text(diagram.title, chDiagramId(diagram, i)))));
}

// Figures are drawn the first time they are shown, then kept. A part pick
// writes #visuals/<id>/<part> only while that figure is the one on show.
function chVisualFigures(diagrams, stage, isCurrent) {
  const figures = new Map();
  return {
    get(i) {
      if (!figures.has(i)) {
        const id = chDiagramId(diagrams[i], i);
        const figure = vizFigure(diagrams[i], {
          headingLevel: 'h2',
          onSelect: (part) => { if (isCurrent(i)) setDeepLink(part === null ? `visuals/${linkPart(id)}` : `visuals/${linkPart(id)}/${part}`); },
        });
        figures.set(i, figure);
        stage.append(figure.root);
      }
      return figures.get(i);
    },
    showOnly(i) { figures.forEach((f, j) => { f.root.hidden = j !== i; }); },
  };
}

/**
 * @param {object} data explainer data (reads data.diagrams)
 * @param {HTMLElement} mount the chapter body
 * @returns {{ open: (parts: string[]) => Element|null }|null}
 */
function chRenderVisuals(data, mount) {
  const diagrams = list(data.diagrams).filter((d) => d && typeof d === 'object');
  if (!diagrams.length) {
    mount.append(h('p', { class: 'empty' }, 'No diagrams in this explainer.'));
    return null;
  }
  const stage = h('div', { class: 'ch-viz-stage' });
  let current = 0;
  const figures = chVisualFigures(diagrams, stage, (i) => current === i);
  const picks = diagrams.map(chVisualPick);
  function show(i, { link = true } = {}) {
    current = i;
    const figure = figures.get(i);
    figures.showOnly(i);
    chMarkCurrent(picks, i);
    if (link) setDeepLink(`visuals/${linkPart(chDiagramId(diagrams[i], i))}`);
    return figure;
  }
  picks.forEach((pick, i) => pick.addEventListener('click', () => show(i)));
  chRoving(picks, { onMove: (i) => show(i) });
  show(0, { link: false });
  mount.append(h('div', { class: 'ch-visuals' },
    diagrams.length > 1 && h('div', { class: 'ch-pick-list', role: 'group', 'aria-label': 'Diagrams' }, picks),
    stage));
  return {
    open([id, part] = []) {
      const index = id === undefined ? -1 : diagrams.findIndex((d, i) => chDiagramId(d, i) === id);
      if (index < 0) return null;
      const figure = show(index, { link: false });
      return figure.select(chIndexPart(part, figure.count()), { silent: true }) || figure.root;
    },
  };
}
