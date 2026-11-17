// Time and cost before starting, for every explainer type. Pure: the input
// is measured by estimate-input.mjs. Ranges on purpose: an agent run varies
// with how much it reads, so a single number would be false precision.
import { EXPLAINER_TYPES } from './schema.mjs';
import { PRICING, USAGE } from './estimate.mjs';

// Wall-clock assumptions, per model: output tokens written per minute, and
// seconds per tool turn (a read, a command, a build). Estimates, not measured
// guarantees; documented in references/estimate.md.
export const SPEED = {
  'fable-5.2': { outputPerMinute: 1800, secondsPerTurn: 12 },
  'opus-5.5': { outputPerMinute: 2400, secondsPerTurn: 10 },
  'sonnet-5.5': { outputPerMinute: 3600, secondsPerTurn: 7 },
  'haiku-5.5': { outputPerMinute: 6000, secondsPerTurn: 4 },
};
const TOKENS_PER_TURN = 5000;
const BASE_TURNS = 10;
export const RANGE = { cost: [0.75, 1.5], time: [0.7, 1.6] };

// Inputs assumed when nothing was measured.
export const TYPICAL = {
  repo: { size: 'medium' },
  pr: { lines: 300, files: 10 },
  change: { lines: 80, files: 3 },
  doc: { words: 3000 },
};

const DOC_OUTPUT = { proposal: 0.012, incident: 0.01, concept: 0.014, migration: 0.012 };
const M = 1e6;
const TOKENS_PER_WORD = 1.35;

function withPeak(usage) {
  return { ...usage, peakContext: Math.round(Math.min(400000, 40000 + usage.fresh * M * 0.5)) };
}

function diffUsage(type, { lines, files }) {
  const big = type === 'pr';
  const fresh = (big ? 0.03 : 0.015) + files * (big ? 0.003 : 0.002) + Math.min(lines, 20000) * 0.00002;
  return withPeak({ fresh, cacheRead: fresh * (big ? 14 : 10), output: (big ? 0.008 : 0.005) + files * (big ? 0.0004 : 0.0003) });
}

function docUsage(type, { words }) {
  const doc = (words * TOKENS_PER_WORD) / M;
  const fresh = 0.02 + doc * 1.5;
  return withPeak({ fresh, cacheRead: fresh * 10, output: DOC_OUTPUT[type] + doc * 0.05 });
}

/**
 * Millions of tokens one run uses: fresh input, cached re-reads and output.
 * @param {string} type
 * @param {{ size?: string, lines?: number, files?: number, words?: number }} measure
 */
export function usageFor(type, measure = {}) {
  if (type === 'repo') return USAGE[measure.size || TYPICAL.repo.size];
  if (type === 'pr' || type === 'change') return diffUsage(type, { ...TYPICAL[type], ...measure });
  if (type === 'migration') {
    const code = USAGE[measure.size || TYPICAL.repo.size];
    const doc = docUsage(type, { ...TYPICAL.doc, ...measure });
    return {
      fresh: code.fresh * 0.6 + doc.fresh,
      cacheRead: code.cacheRead * 0.6 + doc.cacheRead,
      output: code.output * 0.6 + doc.output,
      peakContext: Math.max(code.peakContext, doc.peakContext),
    };
  }
  return docUsage(type, { ...TYPICAL.doc, ...measure });
}

function costFor(usage, model) {
  const base = PRICING.models[model];
  const rate = base.longContext && usage.peakContext > base.longContext.above ? base.longContext : base;
  return usage.fresh * rate.input + usage.cacheRead * rate.cacheRead + usage.output * rate.output;
}

function minutesFor(usage, model) {
  const { outputPerMinute, secondsPerTurn } = SPEED[model];
  const turns = BASE_TURNS + (usage.fresh * M) / TOKENS_PER_TURN;
  return (usage.output * M) / outputPerMinute + (turns * secondsPerTurn) / 60;
}

const n = (value) => Number(value).toLocaleString('en-US');

function describeInput(type, measure) {
  const assumed = (text, flag) => `assumed ${text} (no ${flag} given)`;
  if (type === 'repo') {
    return measure.size ? `a ${measure.size} repo` : assumed(`a ${TYPICAL.repo.size} repo`, 'repo path');
  }
  if (type === 'pr' || type === 'change') {
    const { lines, files } = { ...TYPICAL[type], ...measure };
    const text = `${n(lines)} changed lines in ${n(files)} files`;
    return measure.lines !== undefined ? text : assumed(text, '--base');
  }
  const words = measure.words !== undefined ? `${n(measure.words)} words of source` : assumed(`${n(TYPICAL.doc.words)} words of source`, '--source');
  if (type !== 'migration') return words;
  return `${measure.size ? `a ${measure.size} repo` : `a ${TYPICAL.repo.size} repo (assumed)`} plus ${words}`;
}

function recommend(type, measure) {
  const size = measure.size || TYPICAL.repo.size;
  if ((type === 'repo' || type === 'migration') && size === 'large') {
    return { model: 'opus-5.5', reason: 'A large codebase rewards the stronger model: fewer wrong turns while tracing flows.' };
  }
  if ((type === 'change' && (measure.lines ?? TYPICAL.change.lines) <= 150) || (type === 'repo' && size === 'update')) {
    return { model: 'haiku-5.5', reason: 'A small, well-bounded job: the cheapest model reads it reliably.' };
  }
  return { model: 'sonnet-5.5', reason: 'A good balance of care and cost for a job this size.' };
}

/**
 * @param {{ type?: string, measure?: object }} input
 * @returns {{ type: string, input: string, usage: object, rows: object[], recommended: object, assumptions: string, prices: object }}
 */
export function estimateRun({ type = 'repo', measure = {} } = {}) {
  if (!EXPLAINER_TYPES.includes(type)) throw new Error(`estimate: unknown type "${type}" (use ${EXPLAINER_TYPES.join(', ')})`);
  const usage = usageFor(type, measure);
  const rows = Object.keys(PRICING.models).map((model) => {
    const cost = costFor(usage, model);
    const minutes = minutesFor(usage, model);
    return {
      model,
      label: PRICING.models[model].label,
      tokensIn: Math.round((usage.fresh + usage.cacheRead) * M),
      tokensOut: Math.round(usage.output * M),
      cost: { low: cost * RANGE.cost[0], high: cost * RANGE.cost[1] },
      minutes: { low: minutes * RANGE.time[0], high: minutes * RANGE.time[1] },
    };
  });
  return {
    type,
    input: describeInput(type, measure),
    usage,
    rows,
    recommended: recommend(type, measure),
    assumptions: 'Most re-read context comes from the prompt cache; time counts agent minutes only (writing speed plus one tool turn per 5K tokens read), not your review.',
    prices: { source: PRICING.source, checkedAt: PRICING.checkedAt },
  };
}

const tokens = (value) => (value >= M ? `${(value / M).toFixed(1)}M` : `${Math.round(value / 1000)}K`);
const usd = (value) => (value < 0.1 ? `$${value.toFixed(3)}` : `$${value.toFixed(2)}`);

/** The run as a small table people can read before saying go. */
export function formatEstimate(run) {
  const pad = (v, w) => String(v).padEnd(w);
  const lines = [
    `Estimate for a ${run.type} explainer: ${run.input}`,
    '',
    `${pad('Model', 12)}${pad('Tokens in', 11)}${pad('Tokens out', 12)}${pad('Cost', 20)}Time`,
    ...run.rows.map((r) => `${pad(r.label, 12)}${pad(tokens(r.tokensIn), 11)}${pad(tokens(r.tokensOut), 12)}${pad(`${usd(r.cost.low)} to ${usd(r.cost.high)}`, 20)}${Math.max(1, Math.round(r.minutes.low))} to ${Math.max(2, Math.round(r.minutes.high))} min`),
    '',
    `Recommended: ${run.rows.find((r) => r.model === run.recommended.model).label}. ${run.recommended.reason}`,
    `Assumptions: ${run.assumptions}`,
    `Estimates, not quotes. Prices from ${run.prices.source} (checked ${run.prices.checkedAt}).`,
  ];
  return `${lines.join('\n')}\n`;
}
