// The learning loop from the command line: insights (what readers needed)
// and notes (what one run leaves the next). Both read as evidence, never
// instructions. Contract: references/learning-loop.md.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readConfig, resolveHome } from '../library.mjs';
import { forgetReader, insightsReport, mergeSignals, resetInsights } from '../insights.mjs';
import { MAX_BATCH_BYTES, parseSignalBatch } from '../signals.mjs';
import { readNotes, removeNotes, writeNotes } from '../notes.mjs';
import { slugify } from '../library-model.mjs';
import {
  UsageError, asUsage, err, oneLine, out, printJson, readJson, requirePositional,
} from './io.mjs';

const home = () => resolveHome();
const learningOn = () => readConfig(home()).learning !== false;
const LABELS = { more: 'Explain more', basic: 'Too basic', quiz: 'Weak quiz item', term: 'Term looked up' };

function showReport(report) {
  if (!report.explainers.length) out('No reader insights yet.\n');
  report.explainers.forEach((e) => {
    out(`${e.slug}  ${oneLine(e.title)}\n`);
    const open = e.flags.filter((f) => f.state === 'open');
    if (!open.length) out('  no open flags\n');
    open.forEach((f) => {
      out(`  ${LABELS[f.kind]} on ${f.route} (n = ${f.evidence.n})  ${f.id}\n`);
      (f.evidence.notes || []).forEach((n) => out(`      "${oneLine(n)}"\n`));
    });
    e.flags.filter((f) => f.state !== 'open').forEach((f) => out(`  ${f.state}: ${LABELS[f.kind]} on ${f.route}${f.reason ? ` (${oneLine(f.reason)})` : ''}\n`));
  });
  if (report.reader) {
    if (report.reader.struggles.length) out(`\nTerms you keep looking up: ${report.reader.struggles.map((s) => `${oneLine(s.term)} (n = ${s.n})`).join(', ')}\n`);
    if (report.reader.depthHint) out(`Depth hint (n = ${report.reader.depthHint.n}): ${report.reader.depthHint.command}\n`);
  }
}

const INSIGHTS = {
  import(positionals) {
    if (!learningOn()) throw new UsageError('insights: learning is off (concept-explainer config set learning on)');
    const file = resolve(requirePositional(positionals, '<file.signals.json>'));
    if (!existsSync(file)) throw new UsageError(`file not found: ${file}`);
    if (statSync(file).size > MAX_BATCH_BYTES) throw new UsageError('signals: the batch is larger than 64 KB');
    const batch = asUsage(() => parseSignalBatch(readFileSync(file, 'utf8')));
    const result = asUsage(() => mergeSignals(home(), batch));
    if (result.duplicate) { out('This feedback was already imported.\n'); return; }
    result.merged.forEach((slug) => out(`merged ${slug}\n`));
    const dropped = Object.entries(result.dropped).filter(([, n]) => n);
    if (dropped.length) out(`dropped: ${dropped.map(([k, n]) => `${n} ${k}`).join(', ')} (unknown or rewritten since)\n`);
  },
  reset(positionals, opts) {
    if (!positionals[0] && !opts.all) throw new UsageError('insights reset needs a slug or --all');
    resetInsights(home(), opts.all ? { all: true } : { slug: slugify(positionals[0]) });
    err(`✔ reset ${opts.all ? 'every explainer\'s' : `${positionals[0]}'s`} insights\n`);
  },
  'forget-reader': () => {
    forgetReader(home());
    err('✔ forgot the terms this reader looked up, and the profile made from them\n');
  },
};

export const LEARNING_COMMANDS = {
  insights(positionals, opts) {
    const [first, ...rest] = positionals;
    if (first && INSIGHTS[first]) return INSIGHTS[first](rest, opts);
    if (!learningOn()) {
      if (opts.json) return printJson({ untrusted: true, learning: false, explainers: [], reader: null });
      out('Reader learning is off: nothing is recorded or read. Turn it on with concept-explainer config set learning on.\n');
      return undefined;
    }
    const report = insightsReport(home(), { slug: first ? slugify(first) : undefined, subject: opts.subject });
    return opts.json ? printJson(report) : showReport(report);
  },

  notes(positionals, opts) {
    const [first, ...rest] = positionals;
    if (first === 'write') {
      const subject = requirePositional(rest, '<subject>');
      if (!opts.data) throw new UsageError('notes write needs --data <notes.json>');
      const notes = readJson(opts.data);
      if (notes && typeof notes === 'object' && notes.subject !== undefined && notes.subject !== subject) {
        throw new UsageError(`notes write: the file's subject "${notes.subject}" is not "${subject}"`);
      }
      const written = asUsage(() => writeNotes(home(), { ...notes, subject }));
      err(`✔ wrote ${written.json}\n✔ wrote ${written.markdown}\n`);
      return undefined;
    }
    if (first === 'rm') {
      const subject = requirePositional(rest, '<subject>');
      const removed = removeNotes(home(), subject);
      removed.forEach((p) => err(`✔ removed ${p}\n`));
      if (!removed.length) err(`  no notes for ${subject}\n`);
      return undefined;
    }
    const subject = requirePositional(positionals, '<subject>');
    const read = readNotes(home(), subject);
    if (opts.json) return printJson(read);
    if (read.learning === false) { out('Reader learning is off: notes are not read.\n'); return undefined; }
    const md = join(home(), 'notes', `${slugify(subject)}.md`);
    out(existsSync(md) ? readFileSync(md, 'utf8') : `No notes for ${subject}.\n`);
    return undefined;
  },
};
