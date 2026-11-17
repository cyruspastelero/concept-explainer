import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildExplainer, buildGallery, buildLibrary, escapeHtml, inlineSafe, serializeForScript, TEMPLATE_DIR } from '../scripts/lib/build.mjs';
import { NODE_KINDS } from '../scripts/lib/schema.mjs';
import { listPatterns } from '../scripts/lib/init.mjs';

const example = JSON.parse(readFileSync(new URL('../examples/taskflow.explainer.json', import.meta.url), 'utf8'));

function embeddedJson(html) {
  const match = html.match(/<script type="application\/json" id="explainer-data">([\s\S]*?)<\/script>/);
  assert.ok(match, 'data script tag present');
  return JSON.parse(match[1]);
}

test('build produces one self-contained page with every placeholder filled', () => {
  const html = buildExplainer(example);
  assert.match(html, /^<!doctype html>/);
  assert.doesNotMatch(html, /__TITLE__|__EXPLAINER_DATA__|\/\*__STYLES__\*\/|\/\*__SCRIPTS__\*\//);
  assert.match(html, /<title>Taskflow, explained · Concept Explainer<\/title>/);
  assert.match(html, /boot\(\);/);
  assert.match(html, /<meta name="description" content="A team to-do app\./);
  assert.deepEqual(embeddedJson(html), example);
});

test('repo content cannot break out of the data script tag', () => {
  const hostile = { meta: { title: '</script><script>alert(1)</script>', summary: '<!-- & \u2028 \u2029' } };
  const html = buildExplainer(hostile);
  const templateTags = (readFileSync(join(TEMPLATE_DIR, 'explainer.html'), 'utf8').match(/<\/script>/g) || []).length;
  assert.equal((html.match(/<\/script>/g) || []).length, templateTags, 'only the template\'s own closing tags');
  assert.deepEqual(embeddedJson(html), hostile);
  assert.match(html, /<title>&lt;\/script&gt;/);
  assert.match(html, /<meta property="og:title" content="&lt;\/script&gt;/);
});

test('replacement patterns in data are inserted literally', () => {
  const data = { meta: { title: 'Costs $& and $1', summary: "$' $`" } };
  assert.deepEqual(embeddedJson(buildExplainer(data)), data);
});

test('serializeForScript escapes <, >, & and line separators', () => {
  const out = serializeForScript({ s: '<a>&\u2028' });
  assert.doesNotMatch(out, /[<>&\u2028]/);
  assert.deepEqual(JSON.parse(out), { s: '<a>&\u2028' });
});

test('escapeHtml covers the five significant characters', () => {
  assert.equal(escapeHtml(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
});

test('gallery builds with its own boot and without the explainer boot', () => {
  const html = buildGallery({ kinds: NODE_KINDS, patterns: listPatterns(), version: '0.0.0' });
  assert.match(html, /bootGallery\(\);/);
  assert.doesNotMatch(html, /\nboot\(\);/);
  assert.equal(embeddedJson(html).patterns.length, listPatterns().length);
});

test('placeholder names inside data are never expanded a second time', () => {
  const data = { meta: { title: 'x __EXPLAINER_DATA__ /*__SCRIPTS__*/', summary: '__TITLE__ "quoted"' } };
  const html = buildExplainer(data);
  assert.match(html, /<title>x __EXPLAINER_DATA__ \/\*__SCRIPTS__\*\/ · Concept Explainer<\/title>/);
  assert.match(html, /<meta name="description" content="__TITLE__ &quot;quoted&quot;">/);
  const baseline = (buildExplainer(example).match(/<script>/g) || []).length;
  assert.equal((html.match(/<script>/g) || []).length, baseline, 'no second script block injected');
  assert.deepEqual(embeddedJson(html), data);
});

// Library context: a separate JSON tag the explainer reads to show a "Library" link.
function templateWithContextTag() {
  const dir = mkdtempSync(join(tmpdir(), 'rx-tpl-'));
  cpSync(TEMPLATE_DIR, dir, { recursive: true });
  const html = readFileSync(join(dir, 'explainer.html'), 'utf8');
  if (!html.includes('__CONTEXT__')) {
    writeFileSync(join(dir, 'explainer.html'), html.replace('</body>', '<script type="application/json" id="explainer-context">__CONTEXT__</script>\n</body>'));
  }
  return dir;
}

function contextJson(html) {
  const match = html.match(/<script type="application\/json" id="explainer-context">([\s\S]*?)<\/script>/);
  assert.ok(match, 'context script tag present');
  return JSON.parse(match[1]);
}

test('standalone builds get an empty context, library builds get theirs', () => {
  const templateDir = templateWithContextTag();
  // The build always adds the shown chapters and the settings enums (see build-context.test.mjs).
  const own = (html) => {
    const { chapters, enums, ...rest } = contextJson(html);
    assert.ok(Array.isArray(chapters) && enums && typeof enums === 'object');
    return rest;
  };
  assert.deepEqual(own(buildExplainer(example, { templateDir })), {});
  const context = { libraryHref: '../../index.html', slug: 'acme-taskflow' };
  const html = buildExplainer(example, { templateDir, context });
  assert.deepEqual(own(html), context);
  assert.doesNotMatch(html, /id="explainer-context">__CONTEXT__</, 'the tag itself is filled');
});

test('context is escaped like the data', () => {
  const templateDir = templateWithContextTag();
  const html = buildExplainer(example, { templateDir, context: { slug: '</script><script>alert(1)</script>' } });
  assert.equal(contextJson(html).slug, '</script><script>alert(1)</script>');
  assert.doesNotMatch(html, /<\/script><script>alert/);
});

test('a template without the context tag still builds', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rx-tpl-'));
  cpSync(TEMPLATE_DIR, dir, { recursive: true });
  const html = readFileSync(join(dir, 'explainer.html'), 'utf8').replace(/<script type="application\/json" id="explainer-context">__CONTEXT__<\/script>\n?/, '');
  writeFileSync(join(dir, 'explainer.html'), html);
  assert.deepEqual(embeddedJson(buildExplainer(example, { templateDir: dir, context: { slug: 'x' } })), example);
});

test('buildLibrary embeds the manifest and index and boots the hub', () => {
  const manifest = { version: 1, updatedAt: 't', explainers: [{ slug: 'a', title: '</script>' }] };
  const index = [{ slug: 'a', type: 'explainer', title: '</script>', text: '', href: 'explainers/a/index.html' }];
  const html = buildLibrary(manifest, index);
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /bootLibrary\(\);/);
  assert.doesNotMatch(html, /\nboot\(\);/);
  // Scripts may mention placeholder names (an unfilled-tag guard); only the slots must be filled.
  assert.doesNotMatch(html, /<title>__TITLE__|>__EXPLAINER_DATA__<|>__CONTEXT__<|^\/\*__STYLES__\*\/$|^\/\*__SCRIPTS__\*\/$/m);
  assert.deepEqual(embeddedJson(html), { style: 'clean', manifest, index });
  const context = html.match(/id="explainer-context">([\s\S]*?)<\/script>/);
  if (context) {
    const { enums, ...rest } = JSON.parse(context[1]);
    assert.deepEqual(rest, { style: 'clean' });
    assert.ok(enums && Array.isArray(enums.styles));
  }
  assert.equal(embeddedJson(buildLibrary(manifest, index, { style: 'playful' })).style, 'playful');
  const templateTags = (readFileSync(join(TEMPLATE_DIR, 'library.html'), 'utf8').match(/<\/script>/g) || []).length;
  assert.equal((html.match(/<\/script>/g) || []).length, templateTags, 'only the template\'s own closing tags');
});

test('template code that mentions </script> cannot end the inline script block', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rx-tpl-'));
  cpSync(TEMPLATE_DIR, dir, { recursive: true });
  writeFileSync(join(dir, 'js', 'app.js'), `${readFileSync(join(dir, 'js', 'app.js'), 'utf8')}\nconst saved = \`<script>x</script>\` + '</SCRIPT >';\n`);
  const html = buildExplainer(example, { templateDir: dir });
  const tags = (readFileSync(join(dir, 'explainer.html'), 'utf8').match(/<\/script>/gi) || []).length;
  assert.equal((html.match(/<\/script/gi) || []).length, tags);
  assert.ok(html.includes('<script>x<\\/script>'), 'the closing tag in code is escaped');
  assert.equal(inlineSafe('a </style> b', 'style'), 'a <\\/style> b');
});
