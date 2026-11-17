import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  codeMatches, detectLang, findSecret, isSecretPath, parseFileRef, readSnippet,
} from '../scripts/lib/snippet.mjs';

// Fake credentials are assembled at run time, so this file never holds one.
const FAKE = {
  aws: ['AKIA', 'ABCDEFGHIJKLMNOP'].join(''),
  github: ['ghp_', 'a'.repeat(36)].join(''),
  pem: ['-----BEGIN ', 'RSA PRIVATE KEY-----'].join(''),
  assign: ['api_key = "', 'sk_live_0123456789abcdef', '"'].join(''),
};

function repo(files) {
  const root = mkdtempSync(join(tmpdir(), 'snippet-'));
  Object.entries(files).forEach(([path, content]) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), content);
  });
  return root;
}

const LINES = Array.from({ length: 30 }, (_, i) => `const line${i + 1} = ${i + 1};`).join('\n');

test('a file ref is path:start-end with 1-based inclusive lines', () => {
  assert.deepEqual(parseFileRef('src/a.ts:3-9'), { path: 'src/a.ts', start: 3, end: 9 });
  assert.deepEqual(parseFileRef('src/a.ts:7'), { path: 'src/a.ts', start: 7, end: 7 });
  ['src/a.ts', 'src/a.ts:0-3', 'src/a.ts:9-3', ':1-2', 'a.ts:x-y'].forEach((bad) => assert.throws(() => parseFileRef(bad), /path:start-end/, bad));
  ['/etc/passwd:1-2', '../up.ts:1-2', 'src/../../x.ts:1-2', 'C:\\x.ts:1-2'].forEach((bad) => assert.throws(() => parseFileRef(bad), /inside the repo/, bad));
});

test('the language comes from the extension', () => {
  assert.equal(detectLang('a/b.tsx'), 'tsx');
  assert.equal(detectLang('a/b.py'), 'python');
  assert.equal(detectLang('Dockerfile'), 'dockerfile');
  assert.equal(detectLang('a/b.unknown'), 'text');
});

test('readSnippet returns the exact lines, with CRLF read as LF', () => {
  const root = repo({ 'src/app.js': LINES.replace(/\n/g, '\r\n') });
  const snip = readSnippet(root, 'src/app.js:3-7');
  assert.equal(snip.file, 'src/app.js:3-7');
  assert.equal(snip.lang, 'javascript');
  assert.equal(snip.code, 'const line3 = 3;\nconst line4 = 4;\nconst line5 = 5;\nconst line6 = 6;\nconst line7 = 7;');
  assert.equal(readSnippet(root, 'src/app.js:3-7', { lang: 'ts' }).lang, 'ts');
  assert.throws(() => readSnippet(root, 'src/app.js:28-40'), /has 30 lines/);
  assert.throws(() => readSnippet(root, 'src/missing.js:1-5'), /not found/);
});

test('secret files are refused by name', () => {
  ['.env', '.env.local', 'config/.env.production', 'keys/server.pem', 'id_rsa', 'deploy/id_ed25519.pub', 'a.key', 'cert.p12', '.npmrc', '.netrc', 'credentials.json', 'gcp-credentials.json']
    .forEach((path) => assert.ok(isSecretPath(path), path));
  ['.env.example', '.env.sample', '.env.template', 'src/env.ts', 'docs/keys.md', 'src/keyboard.ts'].forEach((path) => assert.ok(!isSecretPath(path), path));
  const root = repo({ '.env': 'A=1\nB=2\nC=3\nD=4\nE=5\n' });
  assert.throws(() => readSnippet(root, '.env:1-5'), /secret/);
});

test('lines that look like credentials are refused, and named', () => {
  Object.entries(FAKE).forEach(([name, value]) => assert.ok(findSecret(`x\n${value}\ny`), name));
  assert.equal(findSecret('const password = process.env.DB_PASSWORD;\nconst token = req.headers.authorization;'), null);
  assert.equal(findSecret('const apiKeyName = "header";'), null);
  const root = repo({ 'src/config.js': `const a = 1;\nconst b = 2;\n${FAKE.assign}\nconst c = 3;\nconst d = 4;\n` });
  assert.throws(() => readSnippet(root, 'src/config.js:1-5'), /credential.*line 3/);
  assert.ok(readSnippet(root, 'src/config.js:4-5'), 'the lines around it are fine');
});

test('control characters and bidi overrides are refused (Trojan Source)', () => {
  const root = repo({
    'src/bidi.js': `const a = 1;\nconst b = "\u202e";\nconst c = 3;\n`,
    'src/esc.js': 'const a = 1;\nconst b = "\u001b[31m";\nconst c = 3;\n',
    'src/tab.js': 'function f() {\n\treturn 1;\n}\n',
  });
  assert.throws(() => readSnippet(root, 'src/bidi.js:1-3'), /invisible or control character.*line 2/);
  assert.throws(() => readSnippet(root, 'src/esc.js:1-3'), /control character/);
  assert.equal(readSnippet(root, 'src/tab.js:1-3').code, 'function f() {\n\treturn 1;\n}');
});

test('a symlink that leaves the repo is refused', () => {
  const outside = repo({ 'secret.js': LINES });
  const root = repo({ 'src/a.js': LINES });
  symlinkSync(join(outside, 'secret.js'), join(root, 'src/link.js'));
  assert.throws(() => readSnippet(root, 'src/link.js:1-5'), /inside the repo/);
});

test('code matches when only trailing whitespace and a final newline differ', () => {
  assert.ok(codeMatches('a\n  b  \nc', 'a\n  b\nc\n'));
  assert.ok(codeMatches('a\r\nb', 'a\nb'));
  assert.ok(!codeMatches('a\nb', 'a\n b'), 'leading whitespace counts');
  assert.ok(!codeMatches('a\nb', 'a\nB'));
});

test('the snippet command prints JSON to paste, and refuses secrets with a clear error', () => {
  const root = repo({ 'src/app.js': LINES, '.env': 'A=1\n' });
  const bin = new URL('../bin/concept-explainer.mjs', import.meta.url).pathname;
  const ok = spawnSync(process.execPath, [bin, 'snippet', root, 'src/app.js:2-6'], { encoding: 'utf8', env: { ...process.env, CONCEPT_EXPLAINER_HOME: join(root, 'home') } });
  assert.equal(ok.status, 0, ok.stderr);
  const printed = JSON.parse(ok.stdout);
  assert.equal(printed.file, 'src/app.js:2-6');
  assert.equal(printed.code.split('\n').length, 5);
  const bad = spawnSync(process.execPath, [bin, 'snippet', root, '.env:1-1'], { encoding: 'utf8', env: { ...process.env, CONCEPT_EXPLAINER_HOME: join(root, 'home') } });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /secret/);
  const usage = spawnSync(process.execPath, [bin, 'snippet', root], { encoding: 'utf8', env: { ...process.env, CONCEPT_EXPLAINER_HOME: join(root, 'home') } });
  assert.equal(usage.status, 1);
  assert.match(usage.stderr, /path:start-end/);
});
