// `concept-explainer diff`: draft diff[] and node statuses for a PR or change
// from git. Summaries stay TODO: the agent writes them from the code and the
// PR description, never from guesses. Git runs with an argument array, no shell.
import { mapFilesToNodes } from './changes.mjs';
import { git } from './git.mjs';

const STATUS_CODES = { A: 'added', M: 'modified', D: 'removed', R: 'renamed', C: 'added', T: 'modified' };
const SAFE_REF = /^[^\s-][^\s]*$/;
const TODO_SUMMARY = 'TODO: what changed in this file and why';

function checkRef(ref, label) {
  if (typeof ref !== 'string' || !SAFE_REF.test(ref)) throw new Error(`diff: ${label} "${ref}" is not a git ref`);
  return ref;
}

/** Parse `git diff --numstat -M -z`. Binary files get null counts. */
export function parseNumstat(output) {
  const tokens = output.split('\0');
  const rows = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const match = tokens[i].match(/^(\d+|-)\t(\d+|-)\t(.*)$/);
    if (!match) continue;
    const count = (v) => (v === '-' ? null : Number(v));
    if (match[3] === '') {
      rows.push({ path: tokens[i + 2], from: tokens[i + 1], added: count(match[1]), removed: count(match[2]) });
      i += 2;
    } else {
      rows.push({ path: match[3], added: count(match[1]), removed: count(match[2]) });
    }
  }
  return rows;
}

/** Parse `git diff --name-status -M -z`. */
export function parseNameStatus(output) {
  const tokens = output.split('\0').filter((t, i, all) => t !== '' || i < all.length - 1);
  const rows = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const code = tokens[i].charAt(0);
    if (!STATUS_CODES[code]) continue;
    if (code === 'R' || code === 'C') {
      rows.push({ path: tokens[i + 2], from: tokens[i + 1], status: STATUS_CODES[code] });
      i += 2;
    } else {
      rows.push({ path: tokens[i + 1], status: STATUS_CODES[code] });
      i += 1;
    }
  }
  return rows;
}

const isFolder = (file) => file.endsWith('/');
const bare = (file) => file.replace(/[:#]L?\d+.*$/, '');

// added/removed only when every file the node names is a plain file that was
// added (or removed). Folders cannot prove that, so they say "changed".
function nodeStatus(node, entries) {
  const touched = entries.filter((e) => e.nodes.includes(node.id) || mapFilesToNodes([e.from || ''], [node]).length);
  if (!touched.length) return 'unchanged';
  const files = (node.files || []).map(bare);
  const all = (status) => files.length > 0 && files.every((f) => !isFolder(f) && entries.some((e) => (e.path === f || e.from === f) && e.status === status));
  if (all('added')) return 'added';
  if (all('removed')) return 'removed';
  return 'changed';
}

/**
 * @param {string} repo path to a git repo
 * @param {{ base?: string, head?: string, nodes?: object[] }} options
 * @returns {{ diff: object[], nodeStatuses: Record<string, string> }}
 */
export function collectDiff(repo, { base, head = 'HEAD', nodes = [] } = {}) {
  if (!base) throw new Error('diff: needs --base <ref> (the branch or commit the change starts from)');
  const range = `${checkRef(base, 'base')}...${checkRef(head, 'head')}`;
  const counts = new Map(parseNumstat(git(repo, ['diff', '--numstat', '-M', '-z', '--end-of-options', range, '--'])).map((r) => [r.path, r]));
  const diff = parseNameStatus(git(repo, ['diff', '--name-status', '-M', '-z', '--end-of-options', range, '--'])).map((row) => {
    const count = counts.get(row.path);
    const linked = mapFilesToNodes([row.path, ...(row.from ? [row.from] : [])], nodes);
    return {
      path: row.path,
      ...(row.from ? { from: row.from } : {}),
      status: row.status,
      summary: TODO_SUMMARY,
      ...(count && count.added !== null ? { lines: `+${count.added} -${count.removed}` } : {}),
      ...(linked.length ? { nodes: linked } : {}),
    };
  });
  const withNodes = diff.map((d) => ({ ...d, nodes: d.nodes || [] }));
  const nodeStatuses = Object.fromEntries(nodes.map((node) => [node.id, nodeStatus(node, withNodes)]));
  return { diff, nodeStatuses };
}

/**
 * A new explainer with the drafted diff merged in. Entries already in the file
 * keep what the agent wrote (summary, key); counts and status come from git.
 */
export function mergeDiff(data, drafted) {
  const existing = new Map((Array.isArray(data.diff) ? data.diff : []).map((d) => [d.path, d]));
  const diff = drafted.diff.map((d) => {
    const old = existing.get(d.path);
    if (!old) return d;
    const summary = typeof old.summary === 'string' && !/\bTODO\b/.test(old.summary) ? old.summary : d.summary;
    return { ...old, ...d, summary, ...(old.key !== undefined ? { key: old.key } : {}) };
  });
  const nodes = (Array.isArray(data.nodes) ? data.nodes : []).map((node) => (drafted.nodeStatuses[node.id] ? { ...node, status: drafted.nodeStatuses[node.id] } : node));
  return { ...data, diff, nodes };
}
