// Code walkthroughs (walkthroughs[]): optional for every type, never required.
// Shape and limits always; with --repo, the code must equal the cited lines.
// Documented in references/code-walkthrough.md: keep them in sync.
import { readFileSync } from 'node:fs';
import { LIMITS, TYPE_RULES, WALK_STEP_KINDS } from './schema.mjs';
import { codeMatches, findSecret, parseFileRef, resolveInRepo, sourceLines } from './snippet.mjs';
import {
  arr, checkCount, checkOneOf, checkUniqueIds, isObject, isText, listAt, optionalText, requireText, sentences,
} from './validate-util.mjs';

const LINES = /^(\d+)(?:-(\d+))?$/;

/** "3" or "3-5" as { from, to }, or null. */
export function parseLines(value) {
  const match = typeof value === 'string' ? value.trim().match(LINES) : null;
  if (!match) return null;
  const from = Number(match[1]);
  const to = Number(match[2] || match[1]);
  return from >= 1 && to >= from ? { from, to } : null;
}

/** The file line range a walkthrough shows: from its file ref, or 1..n when illustrative. */
export function walkRange(walk) {
  const count = isText(walk.code) ? sourceLines(walk.code).length : 0;
  if (walk.illustrative === true) return { path: null, start: 1, end: count };
  try {
    const { path, start, end } = parseFileRef(walk.file);
    return { path, start, end };
  } catch (error) {
    return null;
  }
}

function checkRefs(report, path, refs, ctx) {
  if (refs === undefined) return;
  if (!isObject(refs)) {
    report.error(path, 'must be { node?, flow?, step?, concept?, glossary? }');
    return;
  }
  if (refs.node !== undefined && !ctx.nodeIds.has(refs.node)) report.error(`${path}.node`, `"${refs.node}" is not a node id`);
  const flow = refs.flow === undefined ? null : ctx.flows.find((f) => isObject(f) && f.id === refs.flow);
  if (refs.flow !== undefined && !flow) report.error(`${path}.flow`, `"${refs.flow}" is not a flow id`);
  if (refs.step !== undefined) {
    const count = flow ? arr(flow.steps).length : 0;
    if (!flow) report.error(`${path}.step`, 'needs refs.flow to say which flow');
    else if (!Number.isInteger(refs.step) || refs.step < 1 || refs.step > count) report.error(`${path}.step`, `must be a step of "${flow.id}", counted from 1 (1 to ${count})`);
  }
  if (refs.concept !== undefined && !(Number.isInteger(refs.concept) && refs.concept >= 0 && refs.concept < ctx.concepts)) {
    report.error(`${path}.concept`, `must be a concept index from 0 (0 to ${Math.max(ctx.concepts - 1, 0)})`);
  }
  if (refs.glossary !== undefined && !ctx.terms.has(refs.glossary)) report.error(`${path}.glossary`, `"${refs.glossary}" is not a glossary term`);
}

function checkSteps(report, path, walk, range, ctx) {
  const steps = listAt(report, `${path}.steps`, walk.steps);
  if (!steps.length) {
    report.error(`${path}.steps`, 'needs at least one step: the important lines, in reading order');
    return;
  }
  checkCount(report, `${path}.steps`, steps, LIMITS.walkSteps, { what: 'steps' });
  let last = null;
  steps.forEach((step, j) => {
    const at = `${path}.steps[${j}]`;
    if (!isObject(step)) return report.error(at, 'must be { lines, note, why?, kind?, refs? }');
    const lines = parseLines(step.lines);
    if (!lines) report.error(`${at}.lines`, 'must be "N" or "N-M" (file line numbers)');
    else if (range && (lines.from < range.start || lines.to > range.end)) report.error(`${at}.lines`, `"${step.lines}" is outside ${range.start}-${range.end}, the lines this walkthrough shows`);
    else if (last) {
      if (lines.from < last.from) report.warn(`${at}.lines`, 'steps should follow reading order (top to bottom)');
      else if (lines.from <= last.to) report.warn(`${at}.lines`, `overlap the step before (${last.from}-${last.to}). Give each line one step`);
    }
    if (lines) last = lines;
    requireText(report, `${at}.note`, step.note);
    if (sentences(step.note) > LIMITS.noteSentences) report.warn(`${at}.note`, `keep a note to ${LIMITS.noteSentences} sentences. Put the reason in why`);
    optionalText(report, `${at}.why`, step.why);
    checkOneOf(report, `${at}.kind`, step.kind, WALK_STEP_KINDS);
    checkRefs(report, `${at}.refs`, step.refs, ctx);
    return undefined;
  });
}

function checkWalk(report, path, walk, ctx, citesCode) {
  requireText(report, `${path}.title`, walk.title);
  requireText(report, `${path}.why`, walk.why);
  requireText(report, `${path}.takeaway`, walk.takeaway);
  optionalText(report, `${path}.lang`, walk.lang);
  if (!isText(walk.code)) report.error(`${path}.code`, 'must be the exact lines, from concept-explainer snippet');
  if (walk.illustrative !== undefined && typeof walk.illustrative !== 'boolean') report.error(`${path}.illustrative`, 'must be true or false');
  if (walk.illustrative === true) {
    if (walk.file !== undefined) report.error(`${path}.file`, 'illustrative code has no file. Drop file, or cite real code and drop illustrative');
    else if (citesCode) report.warn(`${path}.illustrative`, 'this type cites code: show real code from the repo, not illustrative code');
  } else {
    try {
      parseFileRef(walk.file);
    } catch (error) {
      report.error(`${path}.file`, error.message.replace(/^"undefined" is not/, 'is required as'));
    }
  }
  const range = walkRange(walk);
  const count = isText(walk.code) ? sourceLines(walk.code).length : 0;
  if (count) {
    if (range && walk.illustrative !== true && count !== range.end - range.start + 1) {
      report.error(`${path}.code`, `has ${count} lines but the file range has ${range.end - range.start + 1}. Paste the output of concept-explainer snippet`);
    }
    if (count > LIMITS.codeLines.hard) report.error(`${path}.code`, `${count} lines. A walkthrough shows at most ${LIMITS.codeLines.hard}; pick the ${LIMITS.codeLines.min} to ${LIMITS.codeLines.max} that carry the idea`);
    else if (count < LIMITS.codeLines.min || count > LIMITS.codeLines.max) report.warn(`${path}.code`, `${count} lines. Aim for ${LIMITS.codeLines.min} to ${LIMITS.codeLines.max}`);
    const secret = findSecret(walk.code);
    if (secret) report.error(`${path}.code`, `line ${secret.line} of the snippet looks like ${secret.what} (a credential). Never quote secrets`);
  }
  checkSteps(report, path, walk, range, ctx);
}

/**
 * Check walkthroughs[]. Absent is fine for every type: nothing is reported.
 * @param {{ error: Function, warn: Function }} report
 * @param {object} data explainer data
 * @param {Set<string>} nodeIds
 * @param {string} type the explainer's type
 */
export function checkWalkthroughs(report, data, nodeIds, type) {
  if (data.walkthroughs === undefined) return;
  const walks = listAt(report, 'walkthroughs', data.walkthroughs);
  checkCount(report, 'walkthroughs', walks, { max: LIMITS.walkthroughs }, { what: 'walkthroughs' });
  checkUniqueIds(report, 'walkthroughs', walks);
  const ctx = {
    nodeIds,
    flows: arr(data.flows),
    concepts: arr(data.concepts).length,
    terms: new Set(arr(data.glossary).filter(isObject).map((g) => g.term)),
  };
  walks.forEach((walk, i) => {
    if (!isObject(walk)) report.error(`walkthroughs[${i}]`, 'must be an object');
    else checkWalk(report, `walkthroughs[${i}]`, walk, ctx, TYPE_RULES[type].citesCode);
  });
}

/**
 * With --repo: each cited snippet must equal the file's lines (trailing
 * whitespace and line endings aside). A mismatch warns, so --strict fails.
 */
export function checkWalkthroughSources(report, data, repoRoot) {
  arr(data.walkthroughs).forEach((walk, i) => {
    if (!isObject(walk) || walk.illustrative === true || !isText(walk.code)) return;
    const path = `walkthroughs[${i}]`;
    let ref;
    try {
      ref = parseFileRef(walk.file);
    } catch (error) {
      return;
    }
    let lines;
    try {
      lines = sourceLines(readFileSync(resolveInRepo(repoRoot, ref.path), 'utf8'));
    } catch (error) {
      report.error(`${path}.file`, error.message);
      return;
    }
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    if (ref.end > lines.length) {
      report.error(`${path}.file`, `${ref.path} has ${lines.length} lines; ${ref.start}-${ref.end} runs past the end`);
      return;
    }
    const shown = sourceLines(walk.code);
    const actual = lines.slice(ref.start - 1, ref.end);
    if (codeMatches(shown.join('\n'), actual.join('\n'))) return;
    const first = actual.findIndex((line, k) => !codeMatches(line, shown[k] ?? ''));
    report.warn(`${path}.code`, `does not match ${ref.path} line ${ref.start + Math.max(first, 0)}. Paste the output of concept-explainer snippet again`);
  });
}
