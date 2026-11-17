// library, install and config commands, plus publishing used by build.
import { resolve } from 'node:path';
import {
  ensureHub, libraryPaths, listExplainers, publishExplainer, readConfig, rebuildLibrary, removeExplainer, resolveHome, styleFor, writeConfig,
} from '../library.mjs';
import { installSkill, resolveConfigDir } from '../install.mjs';
import { CONFIG_DEFAULTS, setConfigValue } from '../config.mjs';
import { localDay, today } from '../dates.mjs';
import { startOrReuse } from '../serve-state.mjs';
import { createPairCode, forgetDevices } from '../pairing.mjs';
import { launch } from '../launch.mjs';
import { NEW_PORT_NOTE, ensureServePort, newServePort } from '../serve-port.mjs';
import { installLauncher, uninstallLauncherAsync } from '../launcher.mjs';
import { readFileSync as readPackage } from 'node:fs';
import { applyImport, createBundle, planImport, readBundleFile } from '../bundle.mjs';
import { notifyUser, openPath } from '../open.mjs';
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

async function installLauncherCommand(opts) {
  const { version } = JSON.parse(readPackage(new URL('../../../package.json', import.meta.url), 'utf8'));
  // The library's own random port, before anything is tied to it.
  const { port, created } = await ensureServePort(home());
  const result = asUsage(() => installLauncher({
    home: home(), nodePath: opts.node, targetDir: opts['launcher-dir'], force: Boolean(opts.force), version,
  }));
  result.files.forEach((path) => err(`✔ wrote ${path}\n`));
  result.warnings.forEach((w) => err(`  ⚠ ${w}\n`));
  err(`  ${created ? 'picked' : 'uses'} port ${port} for the library (kept in config.json; other accounts cannot read it)\n`);
  err('  click it to open your library; it starts the server and stops it after 30 idle minutes\n');
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
    const config = readConfig(home());
    if (opts['new-port'] && opts.port !== undefined) throw new UsageError('use --new-port or --port, not both');
    if (opts['new-port']) {
      const { port: fresh } = await newServePort(home());
      err(`${NEW_PORT_NOTE(fresh)}\n`);
    }
    // An explicit --port is used as given; otherwise the library's own random
    // port (picked and stored on first use), with a one-run fallback if taken.
    const explicit = opts.port !== undefined;
    const port = explicit ? Number(opts.port) : (await ensureServePort(home())).port;
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new UsageError(`--port "${opts.port}" is not a port number (0 picks a free one)`);
    const idleMinutes = opts.idle === undefined ? (config.serveIdleMinutes ?? 0) : Number(opts.idle);
    if (!Number.isInteger(idleMinutes) || idleMinutes < 0 || idleMinutes > 1440) throw new UsageError(`--idle "${opts.idle}" must be whole minutes from 0 to 1440`);
    if (opts['forget-devices']) {
      forgetDevices(home());
      err('✔ forgot every paired device; pages must pair again to save\n');
    }
    ensureHub({ home: home() });
    const served = await startOrReuse({ home: home(), port, idleMinutes, fallback: !explicit });
    if (served.reused) {
      // A pairing link only to a person at a terminal, never into a log file.
      const link = process.stdout.isTTY ? `http://127.0.0.1:${served.port}/index.html#pair=${createPairCode(home())}` : `http://127.0.0.1:${served.port}/index.html (run \`${BIN} launch\` to pair)`;
      out(`The library is already being served on 127.0.0.1:${served.port}.\nOpen: ${link}\n`);
      return;
    }
    if (served.warning) err(`  ⚠ ${served.warning}\n`);
    out(`Serving ${home()} on 127.0.0.1 only.\nOpen: ${served.url}\nSettings can save while this runs. ${idleMinutes ? `Stops after ${idleMinutes} idle minutes, or` : 'Press'} Ctrl+C to stop.\n`);
    const stop = () => served.close();
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    served.stopped.then(() => err('✔ stopped\n'));
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
  async launch() {
    let result;
    try {
      result = await launch({ home: home() });
    } catch (error) {
      // From the app icon there is no terminal: show it in a dialog too.
      if (!process.stdout.isTTY) notifyUser(error.message.replace(/^launch: /, ''));
      throw error;
    }
    out(`${result.started ? 'Started' : 'Reused'} the library server and opened http://127.0.0.1:${result.port}/index.html\n`);
  },

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
    if (opts.launcher) return installLauncherCommand(opts);
    const actions = asUsage(() => installSkill({ skillDir: context.skillDir, configDir: resolveConfigDir(), force: Boolean(opts.force) }));
    actions.forEach((line) => err(`✔ ${line}\n`));
    err(`  library: ${libraryPaths(home()).hub}\n`);
    return undefined;
  },

  async uninstall(_positionals, opts) {
    if (!opts.launcher) throw new UsageError('uninstall needs --launcher (the skill and rule are removed by hand)');
    const result = await uninstallLauncherAsync({ home: home() });
    result.removed.forEach((path) => err(`✔ removed ${path}\n`));
    result.kept.forEach((path) => err(`  ⚠ kept ${path}: it changed since install\n`));
    if (result.stopped) err('✔ stopped the library server the launcher started\n');
  },

};
