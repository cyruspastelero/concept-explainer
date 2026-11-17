// Exact code for a walkthrough, read from the repo so it is never retyped
// from memory (`concept-explainer snippet <repo> <path:start-end>`). Refuses
// secret files, credential-looking lines and characters that hide or reorder
// text. Spec: docs/plans/2026-11-18-concept-explainer-types.md, section 9.
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, basename, isAbsolute, relative, resolve, sep } from 'node:path';

const REF = /^(.+):(\d+)(?:-(\d+))?$/;
// Snippets are small; a file this large is not source a reader walks through.
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/**
 * Parse "path:start-end" (1-based, inclusive) or "path:line".
 * @param {string} ref
 * @returns {{ path: string, start: number, end: number }}
 */
export function parseFileRef(ref) {
  const match = typeof ref === 'string' ? ref.trim().match(REF) : null;
  const start = match ? Number(match[2]) : 0;
  const end = match ? Number(match[3] || match[2]) : 0;
  if (!match || !match[1].trim() || start < 1 || end < start) throw new Error(`"${ref}" is not path:start-end (lines from 1, start <= end)`);
  const path = match[1].trim();
  if (isAbsolute(path) || /^[a-zA-Z]:[\\/]/.test(path) || path.split(/[\\/]/).includes('..')) {
    throw new Error(`"${path}" must be a relative path inside the repo`);
  }
  return { path, start, end };
}

const LANGS = {
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.jsx': 'jsx', '.ts': 'ts', '.tsx': 'tsx', '.mts': 'ts',
  '.py': 'python', '.rb': 'ruby', '.go': 'go', '.rs': 'rust', '.java': 'java', '.kt': 'kotlin', '.swift': 'swift',
  '.c': 'c', '.h': 'c', '.cc': 'cpp', '.cpp': 'cpp', '.hpp': 'cpp', '.cs': 'csharp', '.php': 'php', '.scala': 'scala',
  '.sh': 'sh', '.bash': 'sh', '.zsh': 'sh', '.sql': 'sql', '.prisma': 'prisma', '.graphql': 'graphql', '.proto': 'proto',
  '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml', '.json': 'json', '.css': 'css', '.scss': 'css', '.html': 'html',
  '.vue': 'vue', '.svelte': 'svelte', '.ex': 'elixir', '.exs': 'elixir', '.lua': 'lua', '.dart': 'dart', '.tf': 'hcl',
};
const NAMED = { dockerfile: 'dockerfile', makefile: 'make', gemfile: 'ruby', rakefile: 'ruby' };

/** The language name for a path, from its extension; "text" when unknown. */
export function detectLang(path) {
  const name = basename(String(path)).toLowerCase();
  return NAMED[name] || LANGS[extname(name)] || 'text';
}

// Files that hold secrets by convention. Example env files are fine.
const SECRET_NAMES = [
  /^\.env(\..+)?$/, /\.(pem|key|p12|pfx|jks|keystore|ppk|asc|gpg)$/, /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/,
  /^\.(npmrc|netrc|pypirc|htpasswd|pgpass)$/, /credentials?([._-].*)?\.json$/, /^secrets?\.(ya?ml|json|toml)$/,
];
const SAFE_ENV = /^\.env\.(example|sample|template|defaults)$/;

/** True when a path names a file that holds secrets by convention. */
export function isSecretPath(path) {
  const name = basename(String(path)).toLowerCase();
  return !SAFE_ENV.test(name) && SECRET_NAMES.some((re) => re.test(name));
}

// Lines that look like a real credential. A name alone (password, token) is
// fine; a long literal value assigned to it is not.
const SECRET_LINES = [
  ['a private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['an AWS access key', /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['a GitHub token', /\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  ['a Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['a Stripe key', /\b(sk|rk)_(live|test)_[A-Za-z0-9]{10,}/],
  ['an API key', /\bsk-[A-Za-z0-9_-]{20,}/],
  ['a Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['a credential assignment', /\b[\w-]*(pass(word|wd)?|secret|token|api[_-]?key|private[_-]?key|access[_-]?key|auth)\b["']?\s*[:=]\s*["'][^"'\s]{8,}["']/i],
  ['a URL with a password', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]{3,}@/i],
];

/**
 * Describe the first line that looks like a credential, or null.
 * @param {string} text
 * @returns {{ what: string, line: number } | null}
 */
export function findSecret(text) {
  const lines = String(text).split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const hit = SECRET_LINES.find(([, re]) => re.test(lines[i]));
    if (hit) return { what: hit[0], line: i + 1 };
  }
  return null;
}

// C0 and C1 controls except tab, bidi overrides and isolates, zero-width marks.
const HIDDEN = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/;

/** Split source into lines: CRLF and CR read as LF, a byte order mark dropped. */
export function sourceLines(text) {
  return String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
}

const normalise = (code) => sourceLines(code).map((line) => line.replace(/\s+$/, '')).join('\n').replace(/\n+$/, '');

/** True when two code texts differ only in trailing whitespace, line endings or a final newline. */
export function codeMatches(a, b) {
  return normalise(a) === normalise(b);
}

/**
 * Resolve a repo-relative path, refusing anything that leaves the repo,
 * symlinks included.
 */
export function resolveInRepo(repoRoot, path) {
  const root = realpathSync(resolve(repoRoot));
  const full = resolve(root, path);
  if (!existsSync(full)) throw new Error(`${path} not found in ${repoRoot}`);
  const real = realpathSync(full);
  const rel = relative(root, real);
  if (rel === '' || rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) throw new Error(`"${path}" must be a relative path inside the repo`);
  if (!statSync(real).isFile()) throw new Error(`${path} is not a file`);
  return real;
}

/**
 * Read the exact lines of a file for a walkthrough.
 * @param {string} repoRoot
 * @param {string} ref "path:start-end"
 * @param {{ lang?: string }} [options]
 * @returns {{ file: string, path: string, start: number, end: number, lang: string, code: string }}
 */
export function readSnippet(repoRoot, ref, { lang } = {}) {
  const { path, start, end } = parseFileRef(ref);
  if (isSecretPath(path)) throw new Error(`${path} is a secret file by name; walkthroughs never quote it`);
  const real = resolveInRepo(repoRoot, path);
  if (statSync(real).size > MAX_FILE_BYTES) throw new Error(`${path} is larger than 2 MB; pick a source file`);
  const lines = sourceLines(readFileSync(real, 'utf8'));
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  if (end > lines.length) throw new Error(`${path} has ${lines.length} lines; ${start}-${end} runs past the end`);
  const picked = lines.slice(start - 1, end);
  const hidden = picked.findIndex((line) => HIDDEN.test(line));
  if (hidden >= 0) throw new Error(`${path}: an invisible or control character on line ${start + hidden}; refusing to quote it`);
  const secret = findSecret(picked.join('\n'));
  if (secret) throw new Error(`${path}: what looks like a credential (${secret.what}) on line ${start + secret.line - 1}; pick lines without it`);
  return { file: `${path}:${start}-${end}`, path, start, end, lang: lang || detectLang(path), code: picked.join('\n') };
}
