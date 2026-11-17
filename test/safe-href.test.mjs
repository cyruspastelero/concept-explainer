import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// safeUrl and safeHref (template/js/dom.js) guard every link that comes from
// data or the build. Run the real functions against hostile inputs.
const source = readFileSync(new URL('../template/js/dom.js', import.meta.url), 'utf8');

function load(href) {
  const location = new URL(href);
  const context = vm.createContext({ URL, window: { location } });
  vm.runInContext(`${source}\n;globalThis.__api = { safeUrl, safeHref };`, context);
  return context.__api;
}

const HOSTILE = [
  'javascript:alert(1)', 'JAVASCRIPT:alert(1)', '\u0001javascript:alert(1)', 'java\tscript:alert(1)', 'java\nscript:alert(1)',
  ' javascript:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:msgbox(1)', '//evil.example/x', 'https://ok.example/\u0000x',
  'https://ok.example/a b', '',
];

test('safeHref refuses scripts, hidden schemes and control characters', () => {
  const { safeHref } = load('file:///home/me/lib/explainers/a/index.html');
  HOSTILE.forEach((value) => assert.equal(safeHref(value), null, JSON.stringify(value)));
});

test('safeHref keeps relative links and http(s) links', () => {
  const { safeHref } = load('file:///home/me/lib/explainers/a/index.html');
  assert.equal(safeHref('../../index.html'), '../../index.html');
  assert.equal(safeHref('kit.html'), 'kit.html');
  assert.equal(safeHref('https://example.com/x'), 'https://example.com/x');
});

test('a file link is kept only on a file page', () => {
  assert.equal(load('file:///home/me/lib/index.html').safeHref('file:///home/me/lib/kit.html'), 'file:///home/me/lib/kit.html');
  assert.equal(load('http://127.0.0.1:4000/index.html').safeHref('file:///etc/passwd'), null);
  assert.equal(load('http://127.0.0.1:4000/index.html').safeHref('kit.html'), 'kit.html');
});

test('safeUrl allows only plain http(s) links', () => {
  const { safeUrl } = load('file:///x/index.html');
  HOSTILE.forEach((value) => assert.equal(safeUrl(value), null, JSON.stringify(value)));
  assert.equal(safeUrl(' https://github.com/acme/app/pull/1 '), 'https://github.com/acme/app/pull/1');
});
