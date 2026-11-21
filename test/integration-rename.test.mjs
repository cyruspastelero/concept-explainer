import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Repo Explainer is now Concept Explainer. The old name may stay only where it
// must: the GitHub repo URL (not renamed yet), the legacy storage keys, home
// folder, alias bin and install names that are migrated, and the few lines
// that explain the rename. Anything else is a missed rename.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
// Case matters: "a repo explainer" (an explainer of type repo) is fine.
const OLD = /Repo Explainer|repo-explainer|REPO_EXPLAINER/;

// Whole files where the old name is history, not a mistake.
const SKIP = [/^CHANGELOG\.md$/, /^docs\/plans\//, /^test\//, /^NOTICE$/];

// Uses that are correct anywhere.
const ALLOWED = [
  /"repo-explainer": "bin\/repo-explainer\.mjs"/g, // the alias bin in package.json
  /cyruspastelero\/repo-explainer/g, // old GitHub URL (GitHub redirects it), allowed only in history
  /cyvid7-darus10\.github\.io\/repo-explainer/g,
  /repo-explainer:/g, // legacy browser storage keys, read once and moved
  /~?\/?\.repo-explainer\b/g, // the old library home, moved on first run
  /bin\/repo-explainer\.mjs/g, // the deprecated alias
  /REPO_EXPLAINER_HOME/g, // still read as a fallback
  /'repo-explainer(\.md)?'/g, // legacy install names removed when provably ours
  /(rules|skills)\/repo-explainer(\.md)?/g,
];

// Lines that explain the rename, in the files meant to explain it.
const NARRATIVE_FILES = [/^README\.md$/, /^references\//, /^CONTRIBUTING\.md$/, /^scripts\/lib\//, /^bin\/repo-explainer\.mjs$/, /^\.github\/workflows\//, /^template\/js\/dom\.js$/];
const NARRATIVE = /was called|formerly|is now concept-explainer|is now Concept Explainer|old (`?repo-explainer`?|name)|alias|keeps its old name|renamed from|Moving from/i;

function trackedFiles() {
  return execFileSync('git', ['-C', ROOT, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
    .filter((f) => !SKIP.some((re) => re.test(f)))
    .filter((f) => !/\.(png|ico|icns|woff2|gif|jpg|svg)$/.test(f));
}

// Lines of one file that use the old name outside the allowed places.
function missesIn(file, source) {
  if (!OLD.test(source)) return [];
  return source.split('\n').flatMap((line, i) => {
    if (!OLD.test(line)) return [];
    const rest = ALLOWED.reduce((text, re) => text.replace(re, ''), line);
    if (!OLD.test(rest)) return [];
    if (NARRATIVE_FILES.some((re) => re.test(file)) && NARRATIVE.test(line)) return [];
    return [`${file}:${i + 1}: ${line.trim().slice(0, 120)}`];
  });
}

test('the old name appears only where it must', () => {
  const misses = trackedFiles().flatMap((file) => {
    try {
      return missesIn(file, readFileSync(`${ROOT}/${file}`, 'utf8'));
    } catch {
      return [];
    }
  });
  assert.deepEqual(misses, [], `missed renames:\n${misses.join('\n')}`);
});

test('the sweep catches a missed rename and lets the allowed uses through', () => {
  assert.equal(missesIn('template/js/app.js', "const TITLE = 'Repo Explainer';").length, 1);
  assert.equal(missesIn('SKILL.md', 'Run repo-explainer build.').length, 1);
  assert.equal(missesIn('SKILL.md', 'Formerly Repo Explainer.').length, 1, 'narrative lines only in the files that explain the rename');
  assert.deepEqual(missesIn('template/js/dom.js', "const LEGACY_PREFIX = 'repo-explainer:';"), []);
  assert.deepEqual(missesIn('README.md', 'npx github:cyruspastelero/repo-explainer estimate'), []);
  assert.deepEqual(missesIn('README.md', 'Explain a repo explainer for a new engineer.'), []);
});

test('the package, the skill and page titles use the new name', () => {
  const pkg = JSON.parse(readFileSync(`${ROOT}/package.json`, 'utf8'));
  assert.equal(pkg.name, 'concept-explainer');
  assert.ok(pkg.bin['concept-explainer']);
  assert.match(readFileSync(`${ROOT}/SKILL.md`, 'utf8'), /^---\nname: concept-explainer\n/);
  ['template/explainer.html', 'template/library.html'].forEach((f) => assert.doesNotMatch(readFileSync(`${ROOT}/${f}`, 'utf8'), /<title>[^<]*Repo Explainer/));
});
