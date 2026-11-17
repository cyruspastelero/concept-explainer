// Measure what an estimate is about: a diff's size or a source document's length.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { git } from './git.mjs';

const TEXT_EXT = new Set(['.md', '.mdx', '.txt', '.rst', '.adoc', '.org', '.html', '.htm', '.json', '.yaml', '.yml', '.csv', '.log']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'vendor']);
const MAX_FILES = 2000;
const SAFE_REF = /^[^\s-][^\s]*$/;

function textFiles(path, found = []) {
  if (found.length >= MAX_FILES) return found;
  const stat = statSync(path);
  if (stat.isFile()) return TEXT_EXT.has(extname(path).toLowerCase()) ? [...found, path] : found;
  if (!stat.isDirectory()) return found;
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => !entry.isSymbolicLink() && !(entry.isDirectory() && SKIP_DIRS.has(entry.name)))
    .reduce((acc, entry) => textFiles(join(path, entry.name), acc), found);
}

/** Words in a source file, or in every text file under a folder. */
export function measureSource(path) {
  if (!existsSync(path)) throw new Error(`estimate: source ${path} not found`);
  const files = statSync(path).isFile() ? [path] : textFiles(path);
  const words = files.reduce((total, file) => total + (readFileSync(file, 'utf8').match(/\S+/g) || []).length, 0);
  return { words, files: files.length };
}

/** Changed lines (added plus removed) and files between two refs. */
export function measureDiff(repo, { base, head = 'HEAD' }) {
  [base, head].forEach((ref) => {
    if (!SAFE_REF.test(String(ref))) throw new Error(`estimate: "${ref}" is not a git ref`);
  });
  const rows = git(repo, ['diff', '--numstat', '--end-of-options', `${base}...${head}`, '--']).trim().split('\n').filter(Boolean);
  const lines = rows.reduce((total, row) => {
    const [added, removed] = row.split('\t');
    return total + (Number(added) || 0) + (Number(removed) || 0);
  }, 0);
  return { lines, files: rows.length };
}
