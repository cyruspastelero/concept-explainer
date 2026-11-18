import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONFIG_DEFAULTS, CONFIG_KEYS, normalizeConfig, parseConfigValue, setConfigValue, validateConfig } from '../scripts/lib/config.mjs';
import { readConfig, writeConfig, publishExplainer, libraryPaths } from '../scripts/lib/library.mjs';

const tempHome = () => mkdtempSync(join(tmpdir(), 'rx-config-'));

test('defaults cover every documented key', () => {
  assert.deepEqual(Object.keys(CONFIG_DEFAULTS).sort(), [...CONFIG_KEYS].sort());
  assert.deepEqual(CONFIG_DEFAULTS, {
    style: 'clean', defaultType: 'auto', audience: 'engineer', depth: 'standard', language: 'en', visuals: [],
    chapters: {}, quiz: true, analogies: true, codeWalkthrough: 'auto', model: 'auto', budgetUsd: null, confirmBeforeStart: true, instructions: '',
    servePort: null, serveIdleMinutes: null, deviceTokenDays: 30, pwa: true,
  });
});

test('the serve port and idle minutes are checked', () => {
  assert.deepEqual(validateConfig({ servePort: 5000, serveIdleMinutes: 30 }).errors, []);
  assert.deepEqual(validateConfig({ serveIdleMinutes: null }).errors, []);
  ['servePort', 'serveIdleMinutes'].forEach((key) => {
    [-1, 1.5, 'x', 70000].forEach((value) => assert.ok(validateConfig({ [key]: value }).errors.some((e) => e.startsWith(key)), `${key}=${value}`));
  });
  assert.ok(validateConfig({ servePort: 80 }).errors.some((e) => /1024 to 65535/.test(e)));
  assert.ok(validateConfig({ serveIdleMinutes: 2000 }).errors.some((e) => /0 to 1440/.test(e)));
  assert.equal(parseConfigValue('servePort', '5000'), 5000);
  assert.equal(parseConfigValue('serveIdleMinutes', 'none'), null);
  assert.equal(parseConfigValue('pwa', 'off'), false);
});

test('validateConfig accepts good values and names every bad one', () => {
  assert.deepEqual(validateConfig({ style: 'playful', visuals: ['venn', 'cycle'], budgetUsd: 2.5, chapters: { pr: { risks: false } } }).errors, []);
  const { errors } = validateConfig({
    style: 'neon', defaultType: 'essay', audience: 'kids', depth: 'huge', language: 'english please', visuals: ['pie'],
    chapters: { pr: { map: 'off' }, essay: {} }, quiz: 'yes', model: 'gpt', budgetUsd: -1, confirmBeforeStart: 1,
    instructions: 'x'.repeat(2001), theme: 'dark',
  });
  ['style', 'defaultType', 'audience', 'depth', 'language', 'visuals[0]', 'chapters.pr.map', 'chapters.essay', 'quiz', 'model', 'budgetUsd', 'confirmBeforeStart', 'instructions', 'theme']
    .forEach((key) => assert.ok(errors.some((e) => e.startsWith(`${key}:`)), `${key}: ${errors.join(' | ')}`));
  assert.ok(validateConfig(null).errors.length > 0);
  assert.ok(validateConfig({ chapters: { pr: { bogus: true } } }).errors.some((e) => e.startsWith('chapters.pr.bogus')));
});

test('instructions are plain text: no control characters, newlines allowed', () => {
  assert.deepEqual(validateConfig({ instructions: 'Use British spelling.\nSay "client", not "customer".' }).errors, []);
  assert.ok(validateConfig({ instructions: 'bad \u0007 bell' }).errors.some((e) => e.startsWith('instructions')));
});

test('normalizeConfig keeps good values, drops bad ones and fills defaults', () => {
  const config = normalizeConfig({ style: 'playful', audience: 'kids', extra: 1, visuals: ['venn', 'pie'] });
  assert.equal(config.style, 'playful');
  assert.equal(config.audience, 'engineer');
  assert.deepEqual(config.visuals, ['venn']);
  assert.ok(!('extra' in config));
  assert.deepEqual(normalizeConfig('nope'), CONFIG_DEFAULTS);
});

test('parseConfigValue turns command-line text into typed values', () => {
  assert.equal(parseConfigValue('quiz', 'off'), false);
  assert.equal(parseConfigValue('confirmBeforeStart', 'true'), true);
  assert.equal(parseConfigValue('budgetUsd', '3.50'), 3.5);
  assert.equal(parseConfigValue('budgetUsd', 'none'), null);
  assert.deepEqual(parseConfigValue('visuals', 'venn, cycle'), ['venn', 'cycle']);
  assert.deepEqual(parseConfigValue('visuals', ''), []);
  assert.equal(parseConfigValue('style', 'playful'), 'playful');
  assert.throws(() => parseConfigValue('budgetUsd', 'lots'), /budgetUsd: "lots" is not a number/);
  assert.throws(() => parseConfigValue('quiz', 'maybe'), /quiz: use on or off/);
  assert.throws(() => parseConfigValue('theme', 'dark'), /unknown setting "theme"/);
});

test('setConfigValue sets one key, including one chapter of one type', () => {
  const base = normalizeConfig({});
  const next = setConfigValue(base, 'chapters.pr.risks', 'off');
  assert.deepEqual(next.chapters, { pr: { risks: false } });
  assert.deepEqual(base.chapters, {}, 'input untouched');
  assert.equal(setConfigValue(base, 'audience', 'expert').audience, 'expert');
  assert.throws(() => setConfigValue(base, 'chapters.pr.bogus', 'off'), /chapters.pr.bogus/);
  assert.throws(() => setConfigValue(base, 'audience', 'kids'), /audience: "kids"/);
});

test('the library reads and writes the full config, tolerating a broken file', () => {
  const home = tempHome();
  assert.deepEqual(readConfig(home), CONFIG_DEFAULTS);
  writeConfig(home, { audience: 'newcomer' });
  writeConfig(home, { style: 'playful' });
  assert.equal(readConfig(home).audience, 'newcomer', 'a partial write merges');
  assert.equal(readConfig(home).style, 'playful');
  assert.throws(() => writeConfig(home, { theme: 'dark' }), /unknown setting "theme"/);
  writeFileSync(libraryPaths(home).config, '{ nope');
  assert.deepEqual(readConfig(home), CONFIG_DEFAULTS);
});

test('pages and the hub carry the current config', () => {
  const home = tempHome();
  writeConfig(home, { audience: 'expert', instructions: 'Short words.' });
  const example = JSON.parse(readFileSync(new URL('../examples/taskflow.explainer.json', import.meta.url), 'utf8'));
  const { pagePath } = publishExplainer(example, { home });
  const tag = (html, id) => JSON.parse(html.match(new RegExp(`id="${id}">([\\s\\S]*?)</script>`))[1]);
  const context = tag(readFileSync(pagePath, 'utf8'), 'explainer-context');
  assert.equal(context.config.audience, 'expert');
  assert.equal('instructions' in context.config, false, 'instructions may be private: never embedded in a page');
  const hub = readFileSync(libraryPaths(home).hub, 'utf8');
  assert.equal(tag(hub, 'explainer-data').config.audience, 'expert');
  assert.doesNotMatch(hub, /Short words/);
  const kit = readFileSync(libraryPaths(home).kit, 'utf8');
  assert.equal(tag(kit, 'explainer-context').config.audience, 'expert');
  assert.doesNotMatch(kit + readFileSync(pagePath, 'utf8'), /Short words/);
});

test('codeWalkthrough is auto, always or never, and code is a valid optional chapter per type', () => {
  assert.equal(CONFIG_DEFAULTS.codeWalkthrough, 'auto');
  assert.deepEqual(validateConfig({ ...CONFIG_DEFAULTS, codeWalkthrough: 'never' }).errors, []);
  assert.match(validateConfig({ ...CONFIG_DEFAULTS, codeWalkthrough: 'sometimes' }).errors.join(), /codeWalkthrough/);
  assert.deepEqual(validateConfig({ ...CONFIG_DEFAULTS, chapters: { concept: { code: false }, pr: { code: true } } }).errors, []);
});
