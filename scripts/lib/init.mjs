import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA_VERSION, TYPE_RULES } from './schema.mjs';
import { today } from './dates.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PRESETS_DIR = join(ROOT, 'presets');
export const PATTERNS_DIR = join(ROOT, 'patterns');
export const TYPE_PRESETS_DIR = join(PRESETS_DIR, 'types');

function readJsonDir(dir) {
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
}

export function listPresets() {
  return readJsonDir(PRESETS_DIR);
}

/** One preset per non-repo type (pr, change, proposal, migration, incident, concept). */
export function listTypePresets() {
  return readJsonDir(TYPE_PRESETS_DIR);
}

export function loadTypePreset(type) {
  const preset = listTypePresets().find((p) => p.type === type);
  if (!preset) throw new Error(`unknown type "${type}" (available: repo, ${listTypePresets().map((p) => p.type).join(', ')})`);
  return preset;
}

export function listPatterns() {
  return readJsonDir(PATTERNS_DIR);
}

export function loadPreset(id) {
  const preset = listPresets().find((p) => p.id === id);
  if (!preset) throw new Error(`unknown preset "${id}" (available: ${listPresets().map((p) => p.id).join(', ')})`);
  return preset;
}

/**
 * Build a starter explainer from a preset and (optionally) scan facts.
 * Every TODO is intentional: validate warns until the agent replaces them.
 * @param {string} presetId
 * @param {object} [scan] output of scanRepo()
 */
export function createStarter(presetId, scan = {}) {
  const preset = loadPreset(presetId);
  const day = today();
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: {
      type: 'repo',
      title: `${scan.name || 'This repo'}, explained`,
      repo: scan.name || 'TODO: owner/repo',
      summary: 'TODO: two plain sentences. What this does, and for whom.',
      stack: (scan.frameworks || []).slice(0, 8),
      preset: preset.id,
      generatedAt: day,
      chapters: preset.chapters,
    },
    layers: preset.layers,
    nodes: preset.starterNodes.map((node) => ({ ...node, summary: 'TODO: one sentence on what this part does', files: [] })),
    edges: [],
    flows: preset.mustTrace.slice(0, 1).map((goal, i) => ({
      id: `flow-${i + 1}`, title: 'TODO: flow name', trigger: 'TODO: what starts it', summary: goal, steps: [],
    })),
    changes: [],
    tree: (scan.topLevel || []).filter((t) => t.path.endsWith('/')).slice(0, 12).map((t) => ({ path: t.path, note: 'TODO' })),
    dataModel: [],
    concepts: [],
    quiz: [],
    glossary: [],
    runbook: (scan.scripts || []).filter((sc) => /^(dev|start|test|build)$/.test(sc.name)).slice(0, 4)
      .map((sc) => ({ label: sc.name, command: `npm run ${sc.name}`, note: sc.command })),
  };
}

const URL_REF = /^https?:\/\//i;

function sourceFor(preset, ref) {
  if (!ref) return { kind: preset.sourceKind, ref: 'TODO: where this comes from' };
  if (!URL_REF.test(ref)) return { kind: preset.sourceKind, ref };
  const kind = ['doc', 'notes'].includes(preset.sourceKind) ? 'url' : preset.sourceKind;
  return { kind, ref, url: ref };
}

/**
 * A starter for a non-repo type, from presets/types/<type>.json.
 * Every TODO is intentional: validate warns until the agent replaces them.
 * @param {string} type one of pr, change, proposal, migration, incident, concept
 * @param {{ ref?: string }} [input] what is being explained: a PR url, a SHA range, a doc path
 */
export function createTypedStarter(type, input = {}) {
  const preset = loadTypePreset(type);
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: {
      type,
      title: 'TODO: what this is, explained',
      summary: 'TODO: two plain sentences. What it is, and why it matters.',
      source: sourceFor(preset, input.ref),
      ...(preset.status ? { status: preset.status } : {}),
      tags: [],
      generatedAt: today(),
      chapters: TYPE_RULES[type].chapters,
    },
    ...structuredClone(preset.starter),
  };
}
