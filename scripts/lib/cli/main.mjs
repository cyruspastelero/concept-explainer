// CLI entry: parse options, move an old library home once, run a command.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { migrateLegacyHome } from '../library.mjs';
import { HELP } from './help.mjs';
import { UsageError, err, out } from './io.mjs';
import { EXPLAIN_COMMANDS } from './explain-commands.mjs';
import { LIBRARY_COMMANDS } from './library-commands.mjs';

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const OPTIONS = {
  out: { type: 'string', short: 'o' },
  preset: { type: 'string', short: 'p' },
  type: { type: 'string', short: 't' },
  repo: { type: 'string', short: 'r' },
  data: { type: 'string' },
  base: { type: 'string' },
  head: { type: 'string' },
  source: { type: 'string' },
  since: { type: 'string' },
  limit: { type: 'string' },
  remote: { type: 'string' },
  style: { type: 'string' },
  port: { type: 'string' },
  idle: { type: 'string' },
  node: { type: 'string' },
  'launcher-dir': { type: 'string' },
  home: { type: 'string' },
  'forget-devices': { type: 'boolean' },
  launcher: { type: 'boolean' },
  tag: { type: 'string' },
  stack: { type: 'string' },
  search: { type: 'string' },
  lang: { type: 'string' },
  'on-conflict': { type: 'string' },
  'dry-run': { type: 'boolean' },
  merges: { type: 'boolean' },
  write: { type: 'boolean' },
  strict: { type: 'boolean' },
  open: { type: 'boolean' },
  json: { type: 'boolean' },
  force: { type: 'boolean' },
  'no-library': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
};

const COMMANDS = { ...EXPLAIN_COMMANDS, ...LIBRARY_COMMANDS };

// Only commands that read or write the library may move an old one. Checks
// and throwaway builds (npm run check) must never touch the real home.
const USES_LIBRARY = new Set(['library', 'config', 'export', 'import', 'install', 'uninstall', 'estimate', 'launch']);
const usesLibrary = (command, values) => USES_LIBRARY.has(command) || (command === 'build' && !values['no-library']);

export async function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  } catch (error) {
    throw new UsageError(`${error.message}. Run \`concept-explainer --help\``);
  }
  const { values, positionals } = parsed;
  const [command, ...rest] = positionals;
  if (!command || values.help) {
    out(HELP);
    return;
  }
  const run = COMMANDS[command];
  if (!run) throw new UsageError(`unknown command "${command}". Run \`concept-explainer --help\``);
  // --home picks the library for this run (the launcher bakes it in).
  if (values.home) process.env.CONCEPT_EXPLAINER_HOME = resolve(values.home);
  if (usesLibrary(command, values)) {
    try {
      const moved = migrateLegacyHome();
      if (moved) err(`✔ ${moved}\n`);
    } catch (error) {
      err(`  ⚠ ${error.message}\n`);
    }
  }
  await run(rest, values, { skillDir: SKILL_DIR });
}

/** Run the CLI and set the exit code; usage errors print without a stack. */
export async function runCli(argv) {
  try {
    await main(argv);
  } catch (error) {
    err(`✖ ${error instanceof UsageError ? error.message : `concept-explainer failed: ${error.message}`}\n`);
    process.exitCode = 1;
  }
}
