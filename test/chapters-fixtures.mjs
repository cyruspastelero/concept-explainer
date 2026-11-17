// Shared data and helpers for the chapter tests (chapters-*.test.mjs).
import { readFileSync } from 'node:fs';
import { walk } from './chapters-fake-dom.mjs';

export const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
export const EXAMPLES = {
  pr: read('../examples/pr-cursor-paging.explainer.json'),
  proposal: read('../examples/proposal-live-updates.explainer.json'),
  concept: read('../examples/concept-idempotency-keys.explainer.json'),
  taskflow: read('../examples/taskflow.explainer.json'),
  all: read('./fixtures/chapters-all.explainer.json'),
};

// Parts per kind, as in the Parts column of references/visuals.md.
export const PARTS = {
  layers: (v) => v.items.length,
  cycle: (v) => v.items.length,
  funnel: (v) => v.items.length,
  state: (v) => v.states.length,
  compare: (v) => v.rows.length,
  hierarchy: (v) => v.nodes.length,
  beforeAfter: (v) => v.before.items.length + v.after.items.length,
  quadrant: (v) => v.points.length,
  venn: (v) => v.items.length,
};

export function allVisuals() {
  return Object.entries(EXAMPLES).flatMap(([name, data]) => [
    ...(data.diagrams || []).map((d) => [`${name}:${d.id}`, d]),
    ...(data.concepts || []).filter((c) => c.visual).map((c, i) => [`${name}:concept${i}`, c.visual]),
  ]);
}

export function parts(root) {
  return walk(root).filter((el) => el.getAttribute('role') === 'option');
}

export function mountIn(env, el) {
  env.document.body.append(el);
  return el;
}

export function renderChapter(env, fn, data) {
  const mount = env.document.createElement('div');
  env.document.body.append(mount);
  const controller = env.ctx[fn](data, mount);
  return { mount, controller };
}

export const pressed = (mount, cls) => walk(mount).filter((el) => el.classList.contains(cls) && el.getAttribute('aria-pressed') === 'true');

export const plain = (v) => JSON.parse(JSON.stringify(v));
