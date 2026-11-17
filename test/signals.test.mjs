import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_BATCH_BYTES, SIGNALS_FORMAT, TIME_BUCKETS, VOTES, parseSignalBatch } from '../scripts/lib/signals.mjs';

const batch = (explainer = {}, extra = {}) => ({
  format: SIGNALS_FORMAT, version: 1, batchId: 'a'.repeat(32), date: '2026-11-18',
  explainers: [{ key: 'acme-taskflow', build: 'b'.repeat(64), sections: {}, quiz: {}, lookups: { glossary: {}, hints: {} }, ...explainer }],
  ...extra,
});
const parse = (value) => parseSignalBatch(typeof value === 'string' ? value : JSON.stringify(value));

test('a good batch parses, with votes, notes, views, time buckets, quiz and lookups', () => {
  const parsed = parse(batch({
    sections: {
      'concepts/1': { fp: '0123abcd', vote: { from: null, to: 'more' }, note: 'What is a keyset?', views: 2, finished: 1, time: '2-10m' },
      map: { fp: 'deadbeef', views: 1, finished: 0, time: '<30s' },
    },
    quiz: { 2: { fp: 'cafebabe', answers: 1, firstWrong: 1, misses: 2, wrong: [0, 2] } },
    lookups: { glossary: { Cursor: 2 }, hints: { 'Why a queue?': 1 } },
  }));
  assert.equal(parsed.explainers[0].sections['concepts/1'].vote.to, 'more');
  assert.equal(parsed.explainers[0].quiz['2'].misses, 2);
  assert.deepEqual(VOTES, ['clear', 'more', 'basic']);
  assert.deepEqual(TIME_BUCKETS, ['<30s', '30s-2m', '2-10m', '>10m']);
});

test('format, version, batch id, date and size are checked', () => {
  assert.throws(() => parse({ ...batch(), format: 'other' }), /signals: not a concept-explainer-signals batch/);
  assert.throws(() => parse({ ...batch(), version: 2 }), /signals: version 2/);
  assert.throws(() => parse({ ...batch(), batchId: 'short' }), /batchId/);
  assert.throws(() => parse({ ...batch(), date: '2026-11-18T10:00:00Z' }), /date/, 'a date, never a time');
  assert.throws(() => parse('{ nope'), /signals: not JSON/);
  assert.throws(() => parseSignalBatch('x'.repeat(MAX_BATCH_BYTES + 1)), /larger than 64 KB/);
  assert.throws(() => parse({ ...batch(), explainers: Array.from({ length: 51 }, () => batch().explainers[0]) }), /50 explainers/);
});

test('notes are one line of at most 140 characters with no hidden characters', () => {
  const withNote = (note) => batch({ sections: { map: { fp: 'deadbeef', vote: { from: null, to: 'more' }, note, views: 1, finished: 0, time: '<30s' } } });
  assert.throws(() => parse(withNote('x'.repeat(141))), /note.*140/);
  assert.throws(() => parse(withNote('line one\nline two')), /note.*one line/);
  ['\u001b[2J', 'a\u0085b', 'safe ‮ exe', 'zero​width', 'iso⁦late'].forEach((note) => {
    assert.throws(() => parse(withNote(note)), /control or invisible/, JSON.stringify(note));
  });
  assert.throws(() => parse(batch({ sections: { map: { fp: 'deadbeef', note: 'no vote', views: 1, finished: 0, time: '<30s' } } })), /note needs a vote/);
});

test('routes, fingerprints, votes, buckets and counts must have the documented shape', () => {
  const bad = [
    [{ sections: { '../x': { fp: 'deadbeef', views: 1, finished: 0, time: '<30s' } } }, /route/],
    [{ sections: { 'nope/1': { fp: 'deadbeef', views: 1, finished: 0, time: '<30s' } } }, /route/],
    [{ sections: { map: { fp: 'XYZ', views: 1, finished: 0, time: '<30s' } } }, /fp/],
    [{ sections: { map: { fp: 'deadbeef', vote: { from: null, to: 'love' }, views: 1, finished: 0, time: '<30s' } } }, /vote/],
    [{ sections: { map: { fp: 'deadbeef', views: 1, finished: 0, time: '1h' } } }, /time/],
    [{ sections: { map: { fp: 'deadbeef', views: -1, finished: 0, time: '<30s' } } }, /views/],
    [{ sections: { map: { fp: 'deadbeef', views: 1.5, finished: 0, time: '<30s' } } }, /views/],
    [{ sections: { map: { fp: 'deadbeef', views: 1, finished: 0, time: '<30s', url: 'https://x' } } }, /unknown field "url"/],
    [{ quiz: { 0: { fp: 'deadbeef', answers: 1, firstWrong: 0, misses: 0, wrong: [] } } }, /quiz/],
    [{ quiz: { 1: { fp: 'deadbeef', answers: 1, firstWrong: 0, misses: 10, wrong: [] } } }, /misses/],
    [{ quiz: { 1: { fp: 'deadbeef', answers: 1, firstWrong: 2, misses: 0, wrong: [] } } }, /firstWrong/],
    [{ lookups: { glossary: { 'bad\u001bterm': 1 }, hints: {} } }, /control or invisible/],
    [{ key: '' }, /key/],
    [{ build: 'nothex' }, /build/],
    [{ userAgent: 'Mozilla' }, /unknown field "userAgent"/],
  ];
  bad.forEach(([explainer, pattern]) => assert.throws(() => parse(batch(explainer)), pattern, pattern.source));
});

test('prototype keys are dropped at every depth', () => {
  const text = JSON.stringify(batch({ sections: { map: { fp: 'deadbeef', views: 1, finished: 0, time: '<30s' } } }))
    .replace('"sections":{', '"sections":{"__proto__":{"polluted":1},').replace('"format"', '"constructor":{"x":1},"format"');
  const parsed = parseSignalBatch(text);
  assert.equal(({}).polluted, undefined);
  assert.deepEqual(Object.keys(parsed.explainers[0].sections), ['map']);
});
