// Shared CLI plumbing: usage errors, JSON files and the validation report.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const BIN = 'concept-explainer';

// Text from explainers and bundles can carry escape sequences, bidi overrides
// and invisible marks. Nothing printed may drive the terminal, so every write
// goes through these. Newline and tab are kept; one-line fields lose them too.
const UNSAFE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;
export const terminalSafe = (text) => String(text).replace(UNSAFE, '\uFFFD');
export const oneLine = (text) => terminalSafe(String(text).replace(/[\n\t]+/g, ' '));
// JSON output stays valid and exact, with risky characters as \u escapes.
export const jsonSafe = (value) => JSON.stringify(value, null, 2)
  .replace(/[\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
export const out = (text) => process.stdout.write(terminalSafe(text));
export const err = (text) => process.stderr.write(terminalSafe(text));

/** A mistake in how the CLI was called. Printed without a stack. */
export class UsageError extends Error {}

export function readJson(path) {
  if (!existsSync(path)) throw new UsageError(`file not found: ${path}`);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new UsageError(`could not parse ${path}: ${error.message}`);
  }
}

export function writeFile(path, content) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, content);
  err(`✔ wrote ${path}\n`);
}

export const toJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

export function printJson(value) {
  process.stdout.write(`${jsonSafe(value)}\n`);
}

export function report({ errors, warnings }, strict) {
  warnings.forEach((w) => err(`  ⚠ ${oneLine(w)}\n`));
  errors.forEach((e) => err(`  ✖ ${oneLine(e)}\n`));
  const failed = errors.length > 0 || (strict && warnings.length > 0);
  err(`${failed ? '✖' : '✔'} ${errors.length} error(s), ${warnings.length} warning(s)\n`);
  return !failed;
}

export function requirePositional(positionals, label) {
  if (!positionals[0]) throw new UsageError(`missing ${label}. Run \`${BIN} --help\``);
  return positionals[0];
}

/** Run `fn`, turning a thrown error into a UsageError (for bad input, not bugs). */
export function asUsage(fn) {
  try {
    return fn();
  } catch (error) {
    throw new UsageError(error.message);
  }
}
