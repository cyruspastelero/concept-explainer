import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TOKEN_HEADER, startLibraryServer } from '../scripts/lib/serve.mjs';
import { buildExplainer } from '../scripts/lib/build.mjs';
import { libraryPaths, publishExplainer, writeConfig } from '../scripts/lib/library.mjs';
import { buildHash, sectionsFor } from '../scripts/lib/sections.mjs';
import { SIGNALS_FORMAT } from '../scripts/lib/signals.mjs';
import { readInsights } from '../scripts/lib/insights.mjs';
import { writeNotes } from '../scripts/lib/notes.mjs';
import { createPairCode, redeemPairCode } from '../scripts/lib/pairing.mjs';

const taskflow = JSON.parse(readFileSync(new URL('../examples/taskflow.explainer.json', import.meta.url), 'utf8'));
const context = (html) => JSON.parse(html.match(/id="explainer-context">([\s\S]*?)<\/script>/)[1]);
const hubData = (html) => JSON.parse(html.match(/id="explainer-data">([\s\S]*?)<\/script>/)[1]);
let home;
let served;
let ids = 0;

before(async () => {
  home = join(mkdtempSync(join(tmpdir(), 'rx-learn-')), 'home');
  publishExplainer(taskflow, { home });
  writeNotes(home, { subject: 'acme/taskflow', conventions: ['Rules live in the service.'] });
  served = await startLibraryServer({ home, port: 0 });
});
after(() => served.close());

function send({ method = 'GET', path = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    let answered = null;
    const req = request({ host: '127.0.0.1', port: served.port, method, path, headers: { host: `127.0.0.1:${served.port}`, ...headers } }, (res) => {
      let data = '';
      answered = { status: res.statusCode, headers: res.headers };
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ ...answered, body: data }));
    });
    req.on('error', (e) => (answered ? resolve({ ...answered, body: '' }) : reject(e)));
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const origin = () => `http://127.0.0.1:${served.port}`;
const batch = (sections) => JSON.stringify({
  format: SIGNALS_FORMAT, version: 1, batchId: (ids += 1).toString(16).padStart(32, '0'), date: '2026-11-18',
  explainers: [{ key: 'acme-taskflow', build: buildHash(taskflow), sections, quiz: {}, lookups: { glossary: {}, hints: {} } }],
});
const more = { 'concepts/1': { fp: sectionsFor(taskflow)['concepts/1'], vote: { from: null, to: 'more' }, note: 'Show the queue.', views: 1, finished: 1, time: '2-10m' } };
const post = (body, headers = {}) => send({
  method: 'POST', path: '/api/signals', body,
  headers: { origin: origin(), 'content-type': 'application/json', [TOKEN_HEADER]: served.token, ...headers },
});

test('every built page carries its section keys, build hash and explainer key', () => {
  const standalone = context(buildExplainer(taskflow, { context: { style: 'clean' } }));
  assert.deepEqual(standalone.sections, sectionsFor(taskflow));
  assert.equal(standalone.build, buildHash(taskflow));
  assert.equal(standalone.key, 'acme/taskflow|Taskflow, explained');
  assert.equal(standalone.style, 'clean');
  const page = context(readFileSync(join(home, 'explainers', 'acme-taskflow', 'index.html'), 'utf8'));
  assert.equal(page.key, 'acme-taskflow');
  assert.deepEqual(page.sections, sectionsFor(taskflow));
});

test('POST /api/signals merges a batch with the token, and acknowledges a repeat', async () => {
  const body = batch(more);
  const res = await post(body);
  assert.equal(res.status, 200, res.body);
  assert.deepEqual(JSON.parse(res.body), { ok: true, duplicate: false, merged: ['acme-taskflow'], dropped: { explainers: 0, sections: 0, quiz: 0, lookups: 0, notes: 0 } });
  assert.equal(JSON.parse((await post(body)).body).duplicate, true);
  assert.equal(readInsights(home, 'acme-taskflow').sections['concepts/1'].votes.more, 1);
});

test('a paired device token can send signals too', async () => {
  const token = redeemPairCode(home, createPairCode(home));
  assert.equal((await post(batch(more), { [TOKEN_HEADER]: token })).status, 200);
});

test('signals need the token, the origin, JSON and a good batch under 64 KB', async () => {
  assert.equal((await post(batch(more), { [TOKEN_HEADER]: 'wrong' })).status, 403);
  assert.equal((await post(batch(more), { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post(batch(more), { 'content-type': 'text/plain' })).status, 415);
  const bad = await post(JSON.stringify({ format: 'nope' }));
  assert.equal(bad.status, 400);
  assert.match(JSON.parse(bad.body).error, /signals:/);
  assert.equal((await post('x'.repeat(70 * 1024))).status, 413);
  assert.equal((await send({ method: 'GET', path: '/api/signals' })).status, 405);
});

test('GET /api/insights returns the hub summary to a token holder only', async () => {
  assert.equal((await send({ path: '/api/insights' })).status, 403);
  const res = await send({ path: '/api/insights', headers: { [TOKEN_HEADER]: served.token } });
  assert.equal(res.status, 200);
  const summary = JSON.parse(res.body).insights;
  assert.equal(summary.explainMore[0].href, 'explainers/acme-taskflow/index.html#concepts/1');
  assert.doesNotMatch(res.body, /struggles":\[\{"term".*knows|_reader/);
});

test('the hub embeds the insights summary after a rebuild', () => {
  publishExplainer(taskflow, { home });
  const data = hubData(readFileSync(libraryPaths(home).hub, 'utf8'));
  assert.equal(data.insights.explainMore[0].slug, 'acme-taskflow');
  assert.ok(data.insights.explainMore[0].notes.includes('Show the queue.'));
  assert.ok(!('knows' in data.insights), 'never the raw reader profile');
});

test('insights and notes files are never served', async () => {
  for (const path of ['/insights/acme-taskflow.json', '/insights/_reader.json', '/insights/_batches.json', '/notes/acme-taskflow.json', '/notes/acme-taskflow.md']) {
    assert.equal((await send({ path, headers: { [TOKEN_HEADER]: served.token } })).status, 404, path);
  }
});

test('with learning off, signals are refused and the hub shows no insights', async () => {
  writeConfig(home, { learning: false });
  try {
    const res = await post(batch(more));
    assert.equal(res.status, 403);
    assert.match(JSON.parse(res.body).error, /learning is off/);
    publishExplainer(taskflow, { home });
    assert.equal(hubData(readFileSync(libraryPaths(home).hub, 'utf8')).insights, null);
  } finally {
    writeConfig(home, { learning: true });
  }
});
