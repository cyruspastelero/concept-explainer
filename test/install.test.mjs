import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, symlinkSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installSkill, resolveConfigDir, LEGACY_RULE_SHA256 } from '../scripts/lib/install.mjs';
import { createHash } from 'node:crypto';

const SKILL_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)));
const RULE = readFileSync(join(SKILL_DIR, 'rules', 'concept-explainer.md'), 'utf8');
const tempConfig = () => mkdtempSync(join(tmpdir(), 'rx-claude-'));
const skillLink = (config) => join(config, 'skills', 'concept-explainer');
const ruleFile = (config) => join(config, 'rules', 'concept-explainer.md');
const oldLink = (config) => join(config, 'skills', 'repo-explainer');
const oldRule = (config) => join(config, 'rules', 'repo-explainer.md');

test('config dir comes from CLAUDE_CONFIG_DIR, else ~/.claude', () => {
  assert.equal(resolveConfigDir({ CLAUDE_CONFIG_DIR: '/tmp/c' }), '/tmp/c');
  assert.equal(resolveConfigDir({}), join(homedir(), '.claude'));
});

test('install links the skill as concept-explainer and copies the rule', () => {
  const config = tempConfig();
  const actions = installSkill({ skillDir: SKILL_DIR, configDir: config });
  assert.ok(lstatSync(skillLink(config)).isSymbolicLink());
  assert.equal(realpathSync(skillLink(config)), realpathSync(SKILL_DIR));
  assert.equal(readFileSync(ruleFile(config), 'utf8'), RULE);
  assert.equal(actions.length, 2);
  assert.match(actions[0], /linked/);
  assert.match(actions[1], /wrote/);
});

test('install is idempotent', () => {
  const config = tempConfig();
  installSkill({ skillDir: SKILL_DIR, configDir: config });
  const again = installSkill({ skillDir: SKILL_DIR, configDir: config });
  assert.match(again[0], /already linked/);
  assert.match(again[1], /up to date/);
  assert.deepEqual(readdirSync(join(config, 'skills')), ['concept-explainer']);
});

test('a symlink pointing elsewhere is replaced only with --force', () => {
  const config = tempConfig();
  mkdirSync(join(config, 'skills'), { recursive: true });
  const elsewhere = tempConfig();
  symlinkSync(elsewhere, skillLink(config));
  assert.throws(() => installSkill({ skillDir: SKILL_DIR, configDir: config }), /points to .*--force/s);
  assert.equal(realpathSync(skillLink(config)), realpathSync(elsewhere), 'left alone');
  const [action] = installSkill({ skillDir: SKILL_DIR, configDir: config, force: true });
  assert.match(action, /relinked/);
  assert.equal(realpathSync(skillLink(config)), realpathSync(SKILL_DIR));
});

test('a real skill folder or edited rule is never replaced without --force', () => {
  const config = tempConfig();
  mkdirSync(skillLink(config), { recursive: true });
  writeFileSync(join(skillLink(config), 'SKILL.md'), 'mine');
  assert.throws(() => installSkill({ skillDir: SKILL_DIR, configDir: config }), /is a real folder.*--force/s);
  assert.equal(readFileSync(join(skillLink(config), 'SKILL.md'), 'utf8'), 'mine');
  assert.ok(!existsSync(ruleFile(config)), 'nothing written after a refusal');

  const other = tempConfig();
  mkdirSync(join(other, 'rules'), { recursive: true });
  writeFileSync(ruleFile(other), 'my own rule');
  assert.throws(() => installSkill({ skillDir: SKILL_DIR, configDir: other }), /differs.*--force/s);
  assert.equal(readFileSync(ruleFile(other), 'utf8'), 'my own rule');
  assert.ok(!existsSync(skillLink(other)), 'nothing linked after a refusal');
});

test('--force moves the real folder and rule aside, then installs', () => {
  const config = tempConfig();
  mkdirSync(skillLink(config), { recursive: true });
  writeFileSync(join(skillLink(config), 'SKILL.md'), 'mine');
  mkdirSync(join(config, 'rules'), { recursive: true });
  writeFileSync(ruleFile(config), 'my own rule');
  const actions = installSkill({ skillDir: SKILL_DIR, configDir: config, force: true });
  assert.ok(lstatSync(skillLink(config)).isSymbolicLink());
  assert.equal(readFileSync(ruleFile(config), 'utf8'), RULE);
  assert.deepEqual(readdirSync(join(config, 'skills')), ['concept-explainer'], 'no backup left in skills/, where it would load as a skill');
  const backups = readdirSync(join(config, 'backups'));
  const skillBackup = backups.find((f) => f.startsWith('skill-concept-explainer.backup-'));
  assert.ok(skillBackup, backups.join(', '));
  assert.equal(readFileSync(join(config, 'backups', skillBackup, 'SKILL.md'), 'utf8'), 'mine');
  assert.ok(backups.some((f) => f.startsWith('rule-concept-explainer.md.backup-')));
  assert.deepEqual(readdirSync(join(config, 'rules')), ['concept-explainer.md'], 'no backup left in rules/, where it would load as a rule');
  assert.ok(actions.some((a) => /moved/.test(a)));
});

test('a skill cloned straight into the skills folder counts as installed', () => {
  const config = tempConfig();
  mkdirSync(join(config, 'skills'), { recursive: true });
  symlinkSync(SKILL_DIR, skillLink(config));
  const [action] = installSkill({ skillDir: skillLink(config), configDir: config });
  assert.match(action, /already/);
  assert.equal(readlinkSync(skillLink(config)), SKILL_DIR);
});

test('the old repo-explainer link and rule are removed only when provably ours', () => {
  const legacyRule = 'stand-in for the old rule';
  const config = tempConfig();
  mkdirSync(join(config, 'skills'), { recursive: true });
  mkdirSync(join(config, 'rules'), { recursive: true });
  symlinkSync(SKILL_DIR, oldLink(config));
  writeFileSync(oldRule(config), legacyRule);
  const hash = createHash('sha256').update(legacyRule).digest('hex');
  const actions = installSkill({ skillDir: SKILL_DIR, configDir: config, legacyRuleHashes: [hash] });
  assert.ok(!existsSync(oldLink(config)));
  assert.ok(!existsSync(oldRule(config)));
  assert.ok(actions.some((a) => /removed the old link/.test(a)));
  assert.ok(actions.some((a) => /removed the old rule/.test(a)));
});

test('an old link to somewhere else, or an edited old rule, is left alone', () => {
  const config = tempConfig();
  mkdirSync(join(config, 'skills'), { recursive: true });
  mkdirSync(join(config, 'rules'), { recursive: true });
  const elsewhere = tempConfig();
  symlinkSync(elsewhere, oldLink(config));
  writeFileSync(oldRule(config), 'my edited copy');
  const actions = installSkill({ skillDir: SKILL_DIR, configDir: config });
  assert.ok(lstatSync(oldLink(config)).isSymbolicLink());
  assert.equal(readFileSync(oldRule(config), 'utf8'), 'my edited copy');
  assert.ok(actions.some((a) => /left .*repo-explainer.* not ours/.test(a)));
  const real = tempConfig();
  mkdirSync(oldLink(real), { recursive: true });
  installSkill({ skillDir: SKILL_DIR, configDir: real });
  assert.ok(existsSync(oldLink(real)), 'a real old folder is never touched');
});

test('the known hash of the shipped old rule is recorded', () => {
  assert.deepEqual(LEGACY_RULE_SHA256, ['8bf92c4d5419587c9ce92e740bcea531acf0b7a3d6661b14eede62328f3f6767']);
});
