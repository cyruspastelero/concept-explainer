import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// Every printed count takes the right noun: "1 walkthrough", "2 walkthroughs".
const jsDir = new URL('../template/js/', import.meta.url);
const read = (file) => readFileSync(new URL(file, jsDir), 'utf8');
const app = read('app.js');
const dom = read('dom.js');

// The shared helper, run as written.
const pluralSource = dom.match(/function plural\(n, one, many = `\$\{one\}s`\) \{[\s\S]*?\n\}/)[0];
const plural = new Function(`${pluralSource}; return plural;`)();
const units = [...app.matchAll(/\{ key: '(\w+)'[^\n]*?unit: \['([\w ]+)', '([\w ]+)'\]/g)].map(([, key, one, many]) => ({ key, one, many }));

test('every chapter names its unit as a singular and plural pair', () => {
  const keys = [...app.matchAll(/^\s*\{ key: '(\w+)', nav:/gm)].map((m) => m[1]);
  assert.ok(keys.length >= 17, 'the chapter table is read');
  assert.deepEqual(units.map((u) => u.key), keys, 'each chapter has a unit pair');
  units.forEach(({ key, one, many }) => assert.notEqual(one, many, `${key}: singular and plural differ`));
});

test('a count of one reads singular for every chapter, and other counts plural', () => {
  units.forEach(({ key, one, many }) => {
    assert.equal(plural(1, one, many), `1 ${one}`, key);
    assert.equal(plural(2, one, many), `2 ${many}`, key);
    assert.equal(plural(0, one, many), `0 ${many}`, key);
  });
  assert.equal(plural(1, 'walkthrough', 'walkthroughs'), '1 walkthrough');
  assert.equal(plural(1, 'entity', 'entities'), '1 entity');
});

test('no page prints a bare number before a plural noun', () => {
  const files = [...readdirSync(jsDir).filter((f) => f.endsWith('.js')), ...readdirSync(new URL('chapters/', jsDir)).map((f) => `chapters/${f}`)];
  const nouns = 'steps|parts|flows|walkthroughs|results|matches|questions|ideas|terms|files|lines|options|risks|events|changes|explainers|commands|diagrams|entities|paths|goals';
  const bare = new RegExp(`\\$\\{[^}]+\\} (${nouns})\\b`);
  files.forEach((file) => assert.doesNotMatch(read(file), bare, `${file} prints a count with a fixed plural`));
  assert.doesNotMatch(read('sections.js'), /chapter\.unit\}/, 'chapter counts go through chapterCount');
});
