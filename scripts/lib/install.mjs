// `concept-explainer install`: link this skill into Claude's skills folder and
// copy the library rule into its rules folder. Safe to run again: it never
// replaces a real folder or an edited rule unless `force` is set, and even
// then it moves the old one aside instead of deleting it. It also removes the
// old repo-explainer link and rule, but only when they are provably ours.
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync } from 'node:fs';
import { linkDir } from './link.mjs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { writeAtomic } from './library.mjs';

export const SKILL_NAME = 'concept-explainer';
const RULE_NAME = 'concept-explainer.md';
const RULE_SOURCE = join('rules', RULE_NAME);
const LEGACY_SKILL_NAME = 'repo-explainer';
const LEGACY_RULE_NAME = 'repo-explainer.md';
// sha256 of every rules/repo-explainer.md this project ever shipped. An old
// rule file with one of these exact contents is ours to remove.
export const LEGACY_RULE_SHA256 = ['8bf92c4d5419587c9ce92e740bcea531acf0b7a3d6661b14eede62328f3f6767'];

/** Claude config folder: $CLAUDE_CONFIG_DIR, else ~/.claude. */
export function resolveConfigDir(env = process.env) {
  return env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}

const lstatOrNull = (path) => {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
};

const realOrNull = (path) => {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
};

// Backups go to <config>/backups/, never beside the original, where Claude
// would load an old skill folder or rule as if it were live.
function backupPath(configDir, kind, name) {
  mkdirSync(join(configDir, 'backups'), { recursive: true });
  return join(configDir, 'backups', `${kind}-${name}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`);
}

// Decide what to do with the skill link before touching anything.
function planSkill(skillDir, target, force) {
  const stat = lstatOrNull(target);
  if (!stat) return { kind: 'link' };
  if (realOrNull(target) === realOrNull(skillDir)) return { kind: 'noop' };
  if (stat.isSymbolicLink()) {
    if (!force) throw new Error(`install: ${target} points to ${readlinkSync(target)}, not this skill. Rerun with --force to relink it`);
    return { kind: 'relink' };
  }
  if (!force) {
    const what = stat.isDirectory() ? 'a real folder' : 'a real file';
    throw new Error(`install: ${target} is ${what}, not a link to this skill. Move it away or rerun with --force (it will be kept as a backup)`);
  }
  return { kind: 'replace' };
}

function planRule(ruleText, target, force) {
  if (!existsSync(target)) return { kind: 'write' };
  const stat = lstatSync(target);
  if (!stat.isSymbolicLink() && readFileSync(target, 'utf8') === ruleText) return { kind: 'noop' };
  if (!stat.isSymbolicLink() && !force) {
    throw new Error(`install: ${target} differs from this skill's rule. Rerun with --force to replace it (it will be kept as a backup)`);
  }
  return { kind: stat.isSymbolicLink() ? 'unlink' : 'replace' };
}

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

// The old link goes only when it points at this skill; the old rule only when
// it is byte for byte a rule we shipped. Anything else is reported and kept.
function removeLegacy(source, configDir, ruleHashes) {
  const actions = [];
  const link = join(configDir, 'skills', LEGACY_SKILL_NAME);
  const linkStat = lstatOrNull(link);
  if (linkStat && linkStat.isSymbolicLink()) {
    if (realOrNull(link) === realOrNull(source)) {
      rmSync(link);
      actions.push(`removed the old link ${link}`);
    } else {
      actions.push(`left ${link} alone: it is not ours (it points somewhere else)`);
    }
  }
  const rule = join(configDir, 'rules', LEGACY_RULE_NAME);
  const ruleStat = lstatOrNull(rule);
  if (ruleStat && ruleStat.isFile()) {
    if (ruleHashes.includes(sha256(rule))) {
      rmSync(rule);
      actions.push(`removed the old rule ${rule}`);
    } else {
      actions.push(`left ${rule} alone: it is not ours (it was edited)`);
    }
  }
  return actions;
}

/**
 * @param {{ skillDir: string, configDir?: string, force?: boolean, legacyRuleHashes?: string[] }} options
 * @returns {string[]} one line per thing done
 */
export function installSkill({ skillDir, configDir = resolveConfigDir(), force = false, legacyRuleHashes = LEGACY_RULE_SHA256 }) {
  const source = resolve(skillDir);
  const skillTarget = join(configDir, 'skills', SKILL_NAME);
  const ruleTarget = join(configDir, 'rules', RULE_NAME);
  const ruleText = readFileSync(join(source, RULE_SOURCE), 'utf8');

  // Plan both first, so a refusal leaves nothing half done.
  const skill = planSkill(source, skillTarget, force);
  const rule = planRule(ruleText, ruleTarget, force);
  const actions = [];

  if (skill.kind === 'noop') {
    actions.push(`skill already linked: ${skillTarget}`);
  } else {
    mkdirSync(join(configDir, 'skills'), { recursive: true });
    if (skill.kind === 'replace') {
      const backup = backupPath(configDir, 'skill', SKILL_NAME);
      renameSync(skillTarget, backup);
      actions.push(`moved the old skill folder to ${backup}`);
    }
    // A relink renames the new link over the old one; it never removes it first.
    linkDir(source, skillTarget);
    actions.push(`${skill.kind === 'relink' ? 'relinked' : 'linked'} ${skillTarget} -> ${source}`);
  }

  if (rule.kind === 'noop') {
    actions.push(`rule up to date: ${ruleTarget}`);
  } else {
    if (rule.kind === 'unlink') rmSync(ruleTarget);
    if (rule.kind === 'replace') {
      const backup = backupPath(configDir, 'rule', RULE_NAME);
      renameSync(ruleTarget, backup);
      actions.push(`moved the old rule to ${backup}`);
    }
    writeAtomic(ruleTarget, ruleText);
    actions.push(`wrote ${ruleTarget}`);
  }
  return [...actions, ...removeLegacy(source, configDir, legacyRuleHashes)];
}
