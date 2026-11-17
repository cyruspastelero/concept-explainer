// library, install and config commands, plus publishing used by build.
import { resolve } from 'node:path';
import {
  ensureHub, libraryPaths, listExplainers, publishExplainer, readConfig, rebuildLibrary, removeExplainer, resolveHome, styleFor, writeConfig,
} from '../library.mjs';
import { installSkill, resolveConfigDir } from '../install.mjs';
import { CONFIG_DEFAULTS, setConfigValue } from '../config.mjs';
import { startLibraryServer } from '../serve.mjs';
import { localDay, today } from '../dates.mjs';
import { applyImport, createBundle, planImport, readBundleFile } from '../bundle.mjs';
import { openPath } from '../open.mjs';
import { validateExplainer } from '../validate.mjs';
import {
  out, err, oneLine, BIN, UsageError, asUsage, printJson, readJson, report, requirePositional, toJson, writeFile,
} from './io.mjs';

const home = () => resolveHome();

// The style for this run: --style when given, else the library default. Checked before any work.
export function chosenStyle(opts) {
  return asUsage(() => styleFor(home(), opts.style));
}

export function validated(file, opts) {
  const data = readJson(file);
  if (!report(validateExplainer(data, { repoRoot: opts.repo && resolve(opts.repo) }), opts.strict)) {
    process.exitCode = 1;
    return null;
  }
  return data;
}

export function publish(data, file, opts, style) {
  const result = publishExplainer(data, { home: home(), sourcePath: resolve(file), repoPath: opts.repo && resolve(opts.repo), style });
  if (result.recovered) err('  ⚠ library.json was corrupt; it was backed up and rebuilt\n');
  err(`✔ ${result.updated ? 'updated' : 'added'} ${result.slug} in the library\n  page: ${result.pagePath}\n  library: ${result.hubPath}\n`);
  return result;
}

const LIBRARY = {
  list() {
    const entries = listExplainers({ home: home() });
    if (!entries.length) {
      out(`The library is empty. Run \`${BIN} build <explainer.json>\` to add one.\n`);
      return;
    }
    const width = Math.max(...entries.map((e) => e.slug.length)) + 2;
    entries.forEach((e) => out(`${e.slug.padEnd(width)}${e.type.padEnd(11)}${oneLine(e.title)}  (${localDay(e.publishedAt)})\n`));
    out(`\n${entries.length} explainer(s). Hub: ${libraryPaths(home()).hub}\n`);
  },
  path() {
    out(`${libraryPaths(home()).hub}\n`);
  },
  add(positionals, opts) {
    const file = requirePositional(positionals, '<explainer.json>');
    const style = chosenStyle(opts);
    const data = validated(file, opts);
    if (data) publish(data, file, opts, style);
  },
  remove(positionals) {
    const slug = requirePositional(positionals, '<slug>');
    asUsage(() => removeExplainer(slug, { home: home() }));
    err(`✔ removed ${slug}\n  library: ${libraryPaths(home()).hub}\n`);
  },
  rebuild(_positionals, opts) {
    const { rebuilt, skipped, hubPath } = rebuildLibrary({ home: home(), style: chosenStyle(opts) });
    skipped.forEach((slug) => err(`  ⚠ dropped ${slug}: its explainer.json is missing or broken\n`));
    err(`✔ rebuilt ${rebuilt.length} explainer(s)\n  library: ${hubPath}\n`);
  },
  open() {
    openPath(ensureHub({ home: home() }));
  },
  style(positionals) {
    if (!positionals[0]) {
      out(`${readConfig(home()).style}\n`);
      return;
    }
    const config = asUsage(() => writeConfig(home(), { style: positionals[0] }));
    err(`✔ default style: ${config.style}\n  run \`${BIN} library rebuild\` to restyle pages already in the library\n`);
  },
  async serve(_positionals, opts) {
    const port = opts.port === undefined ? 0 : Number(opts.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new UsageError(`--port "${opts.port}" is not a port number`);
    ensureHub({ home: home() });
    const served = await startLibraryServer({ home: home(), port });
    out(`Serving ${home()} on 127.0.0.1 only.\nOpen: ${served.url}\nSettings can save while this runs. Press Ctrl+C to stop.\n`);
    process.once('SIGINT', () => {
      served.close().then(() => err('\n✔ stopped\n'));
    });
  },
};

const CONFIG = {
  show(_positionals, opts) {
    const config = readConfig(home());
    if (opts.json) return printJson(config);
    Object.entries(config).forEach(([key, value]) => {
      out(`${key.padEnd(20)}${typeof value === 'string' ? value || '(empty)' : JSON.stringify(value)}\n`);
    });
    out(`\nSaved in ${libraryPaths(home()).config}\n`);
    return undefined;
  },
  get(positionals) {
    const key = requirePositional(positionals, '<key>');
    const config = readConfig(home());
    if (!(key in config)) throw new UsageError(`unknown setting "${key}" (use ${Object.keys(config).join(', ')})`);
    const value = config[key];
    out(`${typeof value === 'string' ? value : JSON.stringify(value)}\n`);
  },
  set(positionals) {
    const [key, ...rest] = positionals;
    if (!key || !rest.length) throw new UsageError(`usage: ${BIN} config set <key> <value>`);
    const next = asUsage(() => setConfigValue(readConfig(home()), key, rest.join(' ')));
    asUsage(() => writeConfig(home(), next));
    err(`✔ ${key} = ${JSON.stringify(key.startsWith('chapters.') ? next.chapters : next[key])}\n  run \`${BIN} library rebuild\` to show it in pages already built\n`);
  },
  reset() {
    writeConfig(home(), CONFIG_DEFAULTS);
    err('✔ config reset to the defaults\n');
  },
};

export const LIBRARY_COMMANDS = {
  library(positionals, opts) {
    const [sub = 'list', ...rest] = positionals;
    const run = LIBRARY[sub];
    if (!run) throw new UsageError(`unknown library command "${sub}". Use list, path, add, remove, rebuild, open, style or serve`);
    return run(rest, opts);
  },

  config(positionals, opts) {
    const [sub = 'show', ...rest] = positionals;
    const run = CONFIG[sub];
    if (!run) throw new UsageError(`unknown config command "${sub}". Use get, set or reset, or no command to print`);
    return run(rest, opts);
  },

  export(positionals, opts) {
    const selectors = { slugs: positionals, type: opts.type, tag: opts.tag, stack: opts.stack, search: opts.search };
    const { bundle, slugs } = asUsage(() => createBundle(home(), selectors));
    const out = opts.out || `explainers-${today()}.explainers.json`;
    writeFile(out, toJson(bundle));
    err(`✔ exported ${slugs.length} explainer(s): ${slugs.join(', ')}\n  data only: no pages, no config, no local paths\n`);
  },

  import(positionals, opts) {
    const file = requirePositional(positionals, '<bundle.explainers.json>');
    const bundle = asUsage(() => readBundleFile(file));
    const options = { onConflict: opts['on-conflict'] };
    // Planning checks the options; a real import plans again inside the lock.
    const plan = asUsage(() => planImport(home(), bundle, options));
    const summary = opts['dry-run'] ? plan.summary : applyImport(home(), bundle, options);
    const line = (verb, item) => `  ${verb.padEnd(8)}${item.slug || `#${item.index}`}${item.title ? `  ${oneLine(item.title)}` : ''}${item.note ? `  (${oneLine(item.note)})` : ''}${item.reason ? `  (${oneLine(item.reason)})` : ''}\n`;
    out(summary.dryRun ? 'Dry run: nothing was written.\n' : 'Imported.\n');
    summary.added.forEach((item) => out(line('add', item)));
    summary.replaced.forEach((item) => out(line('replace', item)));
    summary.skipped.forEach((item) => out(line('skip', item)));
    summary.rejected.forEach((item) => out(`${line('reject', item)}${item.reasons.map((r) => `            ${oneLine(r)}\n`).join('')}`));
    out(`${summary.added.length} added, ${summary.replaced.length} replaced, ${summary.skipped.length} skipped, ${summary.rejected.length} rejected.\n`);
    if (!summary.dryRun) out(`Library: ${libraryPaths(home()).hub}\n`);
  },

  install(_positionals, opts, context) {
    const actions = asUsage(() => installSkill({ skillDir: context.skillDir, configDir: resolveConfigDir(), force: Boolean(opts.force) }));
    actions.forEach((line) => err(`✔ ${line}\n`));
    err(`  library: ${libraryPaths(home()).hub}\n`);
  },
};
