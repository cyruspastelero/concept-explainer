// Dates read as the reader's own day: a timestamp late on Nov 17 UTC is
// Nov 18 in Manila, and a date-only value stays the day it names everywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const domPath = fileURLToPath(new URL('../template/js/dom.js', import.meta.url));
const source = readFileSync(domPath, 'utf8');
const helper = source.slice(source.indexOf('const DATE_ONLY'), source.indexOf('\n}\n', source.indexOf('function displayDate')) + 3);

// Each case runs in its own process, since the time zone is fixed at start.
function show(tz, value, options) {
  const script = `${helper}\nprocess.stdout.write(displayDate(${JSON.stringify(value)}, ${JSON.stringify(options || {})}));`;
  return execFileSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: tz, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' } }).toString();
}

test('the helper is in dom.js and the old UTC copies are gone', () => {
  assert.match(helper, /function displayDate/);
  for (const file of ['library.js', 'changes.js', 'app.js', 'sections.js']) {
    const js = readFileSync(fileURLToPath(new URL(`../template/js/${file}`, import.meta.url)), 'utf8');
    assert.doesNotMatch(js, /timeZone|function (hubDate|formatDate)/, `${file} formats dates itself`);
  }
});

test('a timestamp shows the reader\'s local day in Manila', () => {
  assert.match(show('Asia/Manila', '2026-11-17T20:00:00Z'), /Nov 18, 2026/);
  assert.match(show('Asia/Manila', '2026-11-17T03:00:00Z'), /Nov 17, 2026/);
});

test('a timestamp shows the reader\'s local day in Los Angeles', () => {
  assert.match(show('America/Los_Angeles', '2026-11-17T03:00:00Z'), /Nov 16, 2026/);
  assert.match(show('America/Los_Angeles', '2026-11-17T20:00:00Z'), /Nov 17, 2026/);
});

test('a date-only value is the same calendar day in every zone', () => {
  for (const tz of ['Asia/Manila', 'America/Los_Angeles', 'UTC', 'Pacific/Kiritimati']) {
    assert.match(show(tz, '2026-11-17'), /Nov 17, 2026/, tz);
  }
});

test('the short form drops the year, and bad values use the fallback', () => {
  assert.equal(show('Asia/Manila', '2026-11-17', { year: false }), 'Nov 17');
  assert.equal(show('Asia/Manila', 'not a date', { fallback: 'undated' }), 'undated');
  assert.equal(show('Asia/Manila', '', {}), '');
});
