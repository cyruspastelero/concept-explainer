// Commands that make or inspect one explainer.
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { buildExplainer, buildGallery } from '../build.mjs';
import { NODE_KINDS, EXPLAINER_TYPES } from '../schema.mjs';
import { validateExplainer } from '../validate.mjs';
import { scanRepo } from '../scan.mjs';
import { collectChanges } from '../changes.mjs';
import { collectDiff, mergeDiff } from '../diff.mjs';
import {
  createStarter, createTypedStarter, listPatterns, listPresets, listTypePresets,
} from '../init.mjs';
import { exportAllSvgs } from '../assets.mjs';
import { PRICING, estimateRun, formatEstimate, sizeOf } from '../estimate.mjs';
import { measureDiff, measureSource } from '../estimate-input.mjs';
import { readConfig, resolveHome } from '../library.mjs';
import { publicConfig } from '../config.mjs';
import { openPath } from '../open.mjs';
import { readSnippet } from '../snippet.mjs';
import {
  out, err, BIN, UsageError, asUsage, printJson, readJson, report, requirePositional, toJson, writeFile,
} from './io.mjs';
import { chosenStyle, flagsFor, publish, validated } from './library-commands.mjs';

// Sized by their source document. A migration is sized by its repo and its doc.
const DOC_ONLY = ['proposal', 'incident', 'concept'];
const CODE_SIZED = ['repo', 'migration'];
const DIFF_SIZED = ['pr', 'change'];

function typeOption(opts) {
  const type = opts.type || 'repo';
  if (!EXPLAINER_TYPES.includes(type)) throw new UsageError(`unknown type "${type}" (use ${EXPLAINER_TYPES.join(', ')})`);
  return type;
}

// What to size for this type: repo files, a diff, or source words.
function measureFor(type, input, opts) {
  const measure = {};
  const repo = input && !DOC_ONLY.includes(type) ? resolve(input) : null;
  if (repo && !existsSync(repo)) throw new UsageError(`estimate: ${input} not found`);
  if (CODE_SIZED.includes(type) && repo) measure.size = asUsage(() => sizeOf(scanRepo(repo)));
  if (DIFF_SIZED.includes(type) && opts.base) {
    Object.assign(measure, asUsage(() => measureDiff(repo || resolve('.'), { base: opts.base, head: opts.head })));
  }
  const source = opts.source || (DOC_ONLY.includes(type) ? input : null);
  if ((DOC_ONLY.includes(type) || type === 'migration') && source) measure.words = asUsage(() => measureSource(resolve(source))).words;
  return measure;
}

// The config can pin a model and a budget; the skill uses both to decide whether to ask.
function withConfig(run, config) {
  const recommended = config.model !== 'auto' && PRICING.models[config.model]
    ? { model: config.model, reason: 'Set as your model in config (config set model auto to let the estimate pick).' }
    : run.recommended;
  const pick = run.rows.find((r) => r.model === recommended.model);
  const budget = config.budgetUsd === null ? null : { usd: config.budgetUsd, fits: pick.cost.high <= config.budgetUsd };
  return { ...run, recommended, budget, confirmBeforeStart: config.confirmBeforeStart };
}

export const EXPLAIN_COMMANDS = {
  scan(positionals) {
    printJson(asUsage(() => scanRepo(resolve(requirePositional(positionals, '<repo>')))));
  },

  estimate(positionals, opts) {
    const type = typeOption(opts);
    const run = withConfig(estimateRun({ type, measure: measureFor(type, positionals[0], opts) }), readConfig(resolveHome()));
    if (opts.json) return printJson(run);
    out(formatEstimate(run));
    if (run.recommended.reason.startsWith('Set as your model')) out(`Your config picks ${run.recommended.model}.\n`);
    if (run.budget) out(`Budget: $${run.budget.usd} (${run.budget.fits ? 'fits' : 'may not fit'} the recommended model's high end).\n`);
    return undefined;
  },

  init(positionals, opts) {
    const type = typeOption(opts);
    const out = opts.out || 'explainer.json';
    if (existsSync(out)) throw new UsageError(`${out} already exists. Pass --out to choose another path`);
    if (type !== 'repo') {
      writeFile(out, toJson(asUsage(() => createTypedStarter(type, { ref: positionals[0] }))));
      err(`  type: ${type}\n  next: fill the TODOs, then \`${BIN} build ${out} --strict\`\n`);
      return;
    }
    const repo = resolve(requirePositional(positionals, '<repo>'));
    const scan = asUsage(() => scanRepo(repo));
    const preset = opts.preset || scan.suggestedPreset;
    writeFile(out, toJson(asUsage(() => createStarter(preset, scan))));
    err(`  preset: ${preset}${opts.preset ? '' : ' (suggested by scan)'}\n  next: fill the TODOs, then \`${BIN} build ${out} --repo ${repo}\`\n`);
  },

  changes(positionals, opts) {
    const repo = resolve(requirePositional(positionals, '<repo>'));
    const data = opts.data ? readJson(opts.data) : null;
    const drafted = collectChanges(repo, {
      since: opts.since, limit: opts.limit ? Number(opts.limit) : undefined, mergesOnly: opts.merges,
      nodes: data ? data.nodes : [], remoteUrl: opts.remote,
    });
    if (!opts.write) return printJson(drafted);
    if (!data) throw new UsageError('--write needs --data <explainer.json>');
    const known = new Set((data.changes || []).map((c) => c.id));
    const merged = { ...data, changes: [...(data.changes || []), ...drafted.filter((c) => !known.has(c.id))] };
    writeFile(opts.data, toJson(merged));
    err(`  added ${merged.changes.length - (data.changes || []).length} change(s); fill each "why"\n`);
    return undefined;
  },

  // Exact lines for a code walkthrough, as JSON to paste: never retyped from memory.
  snippet(positionals, opts) {
    const repo = resolve(requirePositional(positionals, '<repo>'));
    if (!positionals[1]) throw new UsageError(`missing <path:start-end>. Usage: ${BIN} snippet <repo> <path:start-end> [--lang x]`);
    printJson(asUsage(() => readSnippet(repo, positionals[1], { lang: opts.lang })));
  },

  diff(positionals, opts) {
    const repo = resolve(requirePositional(positionals, '<repo>'));
    const data = opts.data ? readJson(opts.data) : null;
    const drafted = asUsage(() => collectDiff(repo, { base: opts.base, head: opts.head, nodes: data && Array.isArray(data.nodes) ? data.nodes : [] }));
    if (!opts.write) return printJson(drafted);
    if (!data) throw new UsageError('--write needs --data <explainer.json>');
    writeFile(opts.data, toJson(mergeDiff(data, drafted)));
    const todo = drafted.diff.filter((d) => /TODO/.test(d.summary)).length;
    err(`  ${drafted.diff.length} file(s) in diff; write each TODO summary from the code and the PR (${todo} drafted)\n`);
    return undefined;
  },

  validate(positionals, opts) {
    const file = requirePositional(positionals, '<file>');
    const data = readJson(file);
    const ok = report(validateExplainer(data, { repoRoot: opts.repo && resolve(opts.repo), flags: flagsFor(data, file, opts) }), opts.strict);
    if (!ok) process.exitCode = 1;
  },

  build(positionals, opts) {
    const file = requirePositional(positionals, '<file>');
    const style = chosenStyle(opts);
    const data = validated(file, opts);
    if (!data) return;
    const out = opts.out || join(dirname(file), `${basename(file).replace(/(\.explainer)?\.json$/, '')}.html`);
    // A throwaway build stays independent of the library, config included.
    const context = opts['no-library'] ? { style } : { style, config: publicConfig(readConfig(resolveHome())) };
    writeFile(out, buildExplainer(data, { context }));
    if (!opts['no-library']) {
      try {
        publish(data, file, opts, style);
      } catch (error) {
        throw new Error(`built ${out}, but publishing to the library failed: ${error.message}`);
      }
    }
    if (opts.open) openPath(out);
  },

  presets() {
    out('Types (concept-explainer init --type <type>)\n');
    out(`${'repo'.padEnd(16)} A whole codebase. Pick a stack preset below.\n`);
    listTypePresets().forEach((p) => out(`${p.type.padEnd(16)} ${p.whenToUse}\n`));
    out('\nRepo stack presets (concept-explainer init <repo> --preset <id>)\n');
    listPresets().forEach((p) => out(`${p.id.padEnd(16)} ${p.name}\n${' '.repeat(17)}${p.whenToUse}\n`));
  },

  patterns(positionals) {
    const all = listPatterns();
    if (!positionals[0]) {
      all.forEach((p) => out(`${p.id.padEnd(18)} ${p.use}\n`));
      return;
    }
    const pattern = all.find((p) => p.id === positionals[0]);
    if (!pattern) throw new UsageError(`unknown pattern "${positionals[0]}"`);
    printJson(pattern);
  },

  gallery(_positionals, opts) {
    const pkg = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
    writeFile(opts.out || 'gallery.html', buildGallery({ kinds: NODE_KINDS, patterns: listPatterns(), version: pkg.version }));
  },

  assets(_positionals, opts) {
    const out = opts.out || 'concept-explainer-assets';
    exportAllSvgs().forEach(({ path, svg }) => writeFile(join(out, path), svg));
  },
};
