// Reader signals: what this browser saw readers do, as counts and buckets,
// for the next explainer run. Contract: references/learning-loop.md.
// Recorded only on file:// and http://127.0.0.1:<port>, only while Settings >
// Reading > "Help improve future explainers" is on. Kept in localStorage
// (concept-explainer:signals:<key>, 32 KB) as pending deltas plus a random
// batchId; sent to POST /api/signals under serve, downloaded from file://.
// The state functions are pure (they return a new state); sigStart wires them.

const SIG_PREFIX = 'concept-explainer:signals:';
const SIG_LEARNING_KEY = 'concept-explainer:learning';
const SIG_FORMAT = 'concept-explainer-signals';
const SIG_CAP_BYTES = 32 * 1024;
const SIG_BUCKETS = ['<30s', '30s-2m', '2-10m', '>10m'];
const SIG_VOTES = ['clear', 'more', 'basic'];
const SIG_NOTE_MAX = 140;
const SIG_MAX_MISSES = 9;
const SIG_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// Controls, bidi overrides and isolates, zero-width marks: never in a note.
const SIG_HIDDEN = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;

/** Recording is for this machine only: file:// pages and the local library. */
function sigAllowedOrigin(loc) {
  if (!loc) return false;
  if (loc.protocol === 'file:') return true;
  return loc.protocol === 'http:' && loc.hostname === '127.0.0.1';
}

/** The Reading toggle, default on. */
function sigLearningOn() {
  return readStore(SIG_LEARNING_KEY) !== 'off';
}

function sigBucket(ms) {
  if (ms < 30 * 1000) return SIG_BUCKETS[0];
  if (ms < 2 * 60 * 1000) return SIG_BUCKETS[1];
  if (ms < 10 * 60 * 1000) return SIG_BUCKETS[2];
  return SIG_BUCKETS[3];
}

const sigLarger = (a, b) => (SIG_BUCKETS.indexOf(a) >= SIG_BUCKETS.indexOf(b) ? a : b);

function sigBatchId() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else bytes.forEach((_, i) => { bytes[i] = Math.floor(Math.random() * 256); });
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function sigEmptyPending() {
  return { sections: {}, quiz: {}, glossary: {}, hints: {} };
}

function sigFresh(build) {
  return { v: 1, build, batchId: sigBatchId(), pending: sigEmptyPending(), votes: {}, quizSeen: {} };
}

/** A note as the server takes it: one line, at most 140 characters, no hidden characters. */
function sigCleanNote(value) {
  const note = String(value || '').replace(/[\r\n\t]+/g, ' ').replace(SIG_HIDDEN, '').trim();
  return note ? note.slice(0, SIG_NOTE_MAX) : '';
}

/**
 * Load this explainer's state. A different build keeps only the votes whose
 * section kept its fingerprint, so a rewritten item never inherits old ones.
 */
function sigLoad(context) {
  let saved = null;
  try {
    saved = JSON.parse(readStore(`${SIG_PREFIX}${context.key}`) || 'null');
  } catch (error) {
    saved = null;
  }
  if (!saved || saved.v !== 1 || typeof saved.batchId !== 'string') return sigFresh(context.build);
  if (saved.build === context.build) return { ...sigFresh(context.build), ...saved };
  const sections = context.sections || {};
  const votes = Object.fromEntries(Object.entries(saved.votes || {}).filter(([route, v]) => v && sections[route] === v.fp));
  return { ...sigFresh(context.build), votes };
}

/** One more view of a section; time is filled when the visit ends. */
function sigView(state, route) {
  const old = state.pending.sections[route] || { views: 0, finished: 0, time: null };
  return { ...state, pending: { ...state.pending, sections: { ...state.pending.sections, [route]: { ...old, views: old.views + 1 } } } };
}

/** A visit ended after `ms`: keep the largest bucket of the batch. */
function sigTime(state, route, ms) {
  const old = state.pending.sections[route] || { views: 0, finished: 0, time: null };
  const time = old.time ? sigLarger(old.time, sigBucket(ms)) : sigBucket(ms);
  return { ...state, pending: { ...state.pending, sections: { ...state.pending.sections, [route]: { ...old, time } } } };
}

function sigFinished(state, route) {
  const old = state.pending.sections[route] || { views: 0, finished: 0, time: null };
  return { ...state, pending: { ...state.pending, sections: { ...state.pending.sections, [route]: { ...old, finished: old.finished + 1 } } } };
}

/** The reader's vote now (null clears it) and an optional note for more or basic. */
function sigVote(state, route, fp, vote, note = '') {
  const old = state.votes[route] && state.votes[route].fp === fp ? state.votes[route] : { fp, sent: null, now: null };
  const now = SIG_VOTES.includes(vote) ? vote : null;
  const kept = now === 'more' || now === 'basic' ? sigCleanNote(note) : '';
  return { ...state, votes: { ...state.votes, [route]: { fp, sent: old.sent, now, ...(kept ? { note: kept } : {}) } } };
}

function sigLookup(state, kind, label) {
  const bucket = state.pending[kind] || {};
  return { ...state, pending: { ...state.pending, [kind]: { ...bucket, [label]: (bucket[label] || 0) + 1 } } };
}

/**
 * Fold the quiz's saved answers into the pending counts. A question counts
 * once, when it is resolved: answers, wrong first tries, misses and the wrong
 * options picked. A reset quiz starts its questions over.
 */
function sigQuiz(state, saved, questions) {
  const answers = list(saved && saved.answers);
  let next = state;
  questions.forEach((question, i) => {
    const n = String(i + 1);
    const answer = answers[i] || { tries: [], status: 'open' };
    const resolved = answer.status === 'right' || answer.status === 'missed';
    const seen = next.quizSeen[n] || { resolved: false };
    if (!resolved || seen.resolved) {
      if (!resolved && seen.resolved) next = { ...next, quizSeen: { ...next.quizSeen, [n]: { resolved: false } } };
      return;
    }
    const tries = list(answer.tries).filter(Number.isInteger);
    const wrong = tries.filter((t) => t !== question.answer);
    const old = next.pending.quiz[n] || { answers: 0, firstWrong: 0, misses: 0, wrong: [] };
    const item = {
      answers: old.answers + 1,
      firstWrong: old.firstWrong + (tries.length && tries[0] !== question.answer ? 1 : 0),
      misses: Math.min(SIG_MAX_MISSES, old.misses + wrong.length),
      wrong: [...old.wrong, ...wrong].slice(0, SIG_MAX_MISSES),
    };
    next = { ...next, pending: { ...next.pending, quiz: { ...next.pending.quiz, [n]: item } }, quizSeen: { ...next.quizSeen, [n]: { resolved: true } } };
  });
  return next;
}

/** Keep the store under 32 KB: drop the oldest counters first, votes last. */
function sigCap(state, max = SIG_CAP_BYTES) {
  let next = state;
  const size = (s) => JSON.stringify(s).length;
  const dropFirst = (kind) => {
    const keys = Object.keys(next.pending[kind]);
    if (!keys.length) return false;
    const rest = { ...next.pending[kind] };
    delete rest[keys[0]];
    next = { ...next, pending: { ...next.pending, [kind]: rest } };
    return true;
  };
  while (size(next) > max) {
    if (!['hints', 'glossary', 'sections', 'quiz'].some(dropFirst)) break;
  }
  return next;
}

/** The section routes with something to send, in a stable order. */
function sigRoutes(state, sections) {
  const changedVotes = Object.entries(state.votes).filter(([, v]) => v.now !== v.sent).map(([route]) => route);
  return [...new Set([...Object.keys(state.pending.sections), ...changedVotes])].filter((route) => typeof sections[route] === 'string');
}

/**
 * The batch for this explainer, exactly as the server takes it, or null when
 * there is nothing to send.
 * @param {object} state this explainer's state
 * @param {{ key: string, build: string, slug?: string, sections: object }} context the page context
 * @param {string} date YYYY-MM-DD
 */
function sigBatch(state, context, date) {
  const sections = context.sections || {};
  const out = {};
  sigRoutes(state, sections).forEach((route) => {
    const counted = state.pending.sections[route] || { views: 0, finished: 0, time: null };
    const vote = state.votes[route] && state.votes[route].fp === sections[route] && state.votes[route].now !== state.votes[route].sent ? state.votes[route] : null;
    out[route] = {
      fp: sections[route], views: counted.views, finished: counted.finished, time: counted.time || SIG_BUCKETS[0],
      ...(vote ? { vote: { from: vote.sent, to: vote.now } } : {}),
      ...(vote && vote.note && (vote.now === 'more' || vote.now === 'basic') ? { note: vote.note } : {}),
    };
  });
  const quiz = Object.fromEntries(Object.entries(state.pending.quiz)
    .filter(([n]) => typeof sections[`quiz/${n}`] === 'string')
    .map(([n, q]) => [n, { fp: sections[`quiz/${n}`], ...q }]));
  const lookups = {
    ...(Object.keys(state.pending.glossary).length ? { glossary: state.pending.glossary } : {}),
    ...(Object.keys(state.pending.hints).length ? { hints: state.pending.hints } : {}),
  };
  if (!Object.keys(out).length && !Object.keys(quiz).length && !Object.keys(lookups).length) return null;
  const explainer = {
    key: context.key, ...(SIG_SLUG.test(String(context.slug || '')) ? { slug: context.slug } : {}), build: context.build,
    sections: out, quiz, lookups,
  };
  return { format: SIG_FORMAT, version: 1, batchId: state.batchId, date, explainers: [explainer] };
}

/** After the library answered 200: what was sent is settled, a new batch starts. */
function sigAcked(state, batch) {
  const sent = batch ? batch.explainers[0].sections : {};
  const votes = Object.fromEntries(Object.entries(state.votes).map(([route, v]) => (sent[route] && sent[route].vote
    ? [route, { ...v, sent: sent[route].vote.to }]
    : [route, v])));
  return { ...state, votes, pending: sigEmptyPending(), batchId: sigBatchId() };
}

/** How much is waiting, for Settings. */
function sigPendingSummary(state, context) {
  const batch = sigBatch(state, context, sigToday());
  if (!batch) return { sections: 0, votes: 0, quiz: 0, lookups: 0, batch: null };
  const ex = batch.explainers[0];
  const lookups = Object.values(ex.lookups).reduce((sum, bucket) => sum + Object.values(bucket).reduce((a, b) => a + b, 0), 0);
  return {
    sections: Object.keys(ex.sections).length, votes: Object.values(ex.sections).filter((s) => s.vote).length,
    quiz: Object.keys(ex.quiz).length, lookups, batch,
  };
}

function sigToday() {
  return new Date().toISOString().slice(0, 10);
}

/** The device token (paired app) or the per-run token from the address. */
function sigToken(context) {
  return (context.serve && context.serve.token) || readStore('concept-explainer:device') || null;
}

/** Download name: the key as a file-safe slug. */
function sigFileName(context) {
  const base = String(context.key || 'explainer').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'explainer';
  return `${base}.signals.json`;
}

/** Every key this origin recorded, deleted (Settings: "Delete what this browser recorded"). */
function sigForgetAll() {
  try {
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(SIG_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
    return keys.length;
  } catch (error) {
    return 0;
  }
}

// ---------- Wiring: route visits, quiz, lookups, sending ----------

/** The section keys the current address names: the chapter, and the item when it has a key. */
function sigRoutesNow(sections, hash) {
  const parts = String(hash || '').replace(/^#/, '').split('/').filter(Boolean);
  if (!parts.length) return [];
  const keys = [parts[0], parts.length > 1 ? `${parts[0]}/${parts[1]}` : null].filter((k) => k && typeof sections[k] === 'string');
  return [...new Set(keys)];
}

function sigTerm(data, hash) {
  const match = String(hash || '').match(/^#glossary\/([^/]+)$/);
  if (!match) return null;
  let term = match[1];
  try { term = decodeURIComponent(term); } catch (error) { return null; }
  return list(data.glossary).some((g) => g && g.term === term) ? term : null;
}

/** POST the pending batch; pending is cleared only on 200. */
function sigPost(context, batch, { keepalive = false } = {}) {
  return fetch(serveApi(context, 'signals'), {
    method: 'POST', keepalive, body: JSON.stringify(batch),
    headers: { 'content-type': 'application/json', 'x-concept-explainer-token': sigToken(context) },
  }).then((response) => response.text().then((body) => {
    let json = null;
    try { json = body ? JSON.parse(body) : null; } catch (error) { json = null; }
    return { status: response.status, json };
  }));
}

/**
 * This page's recording state and what changes it: visits (views and time),
 * glossary lookups, "?" hints, Next (finished) and quiz answers.
 */
function sigTracker(data, context) {
  const sections = context.sections || {};
  const box = { state: sigLoad(context), visits: new Map(), listeners: [] };
  const save = () => { box.state = sigCap(box.state); writeStore(`${SIG_PREFIX}${context.key}`, JSON.stringify(box.state)); };
  const endVisits = (keys, now) => keys.forEach((key) => { box.state = sigTime(box.state, key, now - box.visits.get(key)); });
  function check() {
    if (!sigLearningOn()) return;
    const now = Date.now();
    const keys = sigRoutesNow(sections, window.location.hash);
    const gone = [...box.visits.keys()].filter((k) => !keys.includes(k));
    const fresh = keys.filter((k) => !box.visits.has(k));
    if (!gone.length && !fresh.length) return;
    endVisits(gone, now);
    box.visits = new Map([...[...box.visits].filter(([k]) => keys.includes(k)), ...fresh.map((k) => [k, now])]);
    fresh.forEach((k) => { box.state = sigView(box.state, k); });
    const term = fresh.length ? sigTerm(data, window.location.hash) : null;
    if (term) box.state = sigLookup(box.state, 'glossary', term);
    save();
    box.listeners.forEach((fn) => fn(keys));
  }
  function syncQuiz() {
    if (!sigLearningOn() || !list(data.quiz).length || typeof quizStoreKey !== 'function') return;
    let saved = null;
    try { saved = JSON.parse(readStore(quizStoreKey(data.meta)) || 'null'); } catch (error) { saved = null; }
    const next = sigQuiz(box.state, saved, list(data.quiz));
    if (next !== box.state) { box.state = next; save(); }
  }
  // Every visit so far ends now (and goes on from now): before a page hides.
  function flush() {
    const now = Date.now();
    endVisits([...box.visits.keys()], now);
    box.visits = new Map([...box.visits.keys()].map((k) => [k, now]));
    syncQuiz();
    save();
  }
  return { box, sections, save, check, syncQuiz, flush };
}

/** A "?" hint opened, or Next pressed at the end of a chapter. */
function sigOnClick(tracker, target) {
  const hint = target.closest('.trunc-hint');
  const holder = hint && hint.closest('.truncatable');
  const label = holder && holder.__trunc ? holder.__trunc.full : hint && hint.dataset && hint.dataset.full;
  if (label && label.length <= 120) { tracker.box.state = sigLookup(tracker.box.state, 'hints', label); tracker.save(); }
  const [chapter] = sigRoutesNow(tracker.sections, window.location.hash);
  if (target.closest('.pager-link.is-next') && chapter) { tracker.box.state = sigFinished(tracker.box.state, chapter); tracker.save(); }
}

/** Send the pending batch; settled only on 200, kept (same batchId) otherwise. */
function sigSend(tracker, context, { keepalive = false } = {}) {
  if (!(window.location.protocol === 'http:' && sigToken(context))) return Promise.resolve({ ok: false, status: 0, message: 'Open this page from the library to send.' });
  const batch = sigBatch(tracker.box.state, context, sigToday());
  if (!batch) return Promise.resolve({ ok: true, status: 200, message: 'Nothing new to send.' });
  return sigPost(context, batch, { keepalive }).then(({ status, json }) => {
    if (status === 200) {
      tracker.box.state = sigAcked(tracker.box.state, batch);
      tracker.save();
      return { ok: true, status, message: json && json.duplicate ? 'The library already had this batch.' : 'Sent to the library.' };
    }
    const reason = status === 503 ? 'The library is busy. It will be sent later.' : (json && json.error) || `The library answered ${status}.`;
    return { ok: false, status, message: reason };
  }).catch(() => ({ ok: false, status: 0, message: 'The library did not answer. It will be sent later.' }));
}

function sigListen(tracker, context) {
  const onAction = (event) => {
    const target = event.target && event.target.closest ? event.target : null;
    if (sigLearningOn() && target && event.type === 'click') sigOnClick(tracker, target);
    window.setTimeout(() => { tracker.check(); tracker.syncQuiz(); }, 0);
  };
  const onHide = () => {
    if (!sigLearningOn()) return;
    tracker.flush();
    sigSend(tracker, context, { keepalive: true });
  };
  ['click', 'keyup'].forEach((type) => document.addEventListener(type, onAction, true));
  window.addEventListener('hashchange', tracker.check);
  window.addEventListener('pagehide', onHide);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') onHide(); });
}

/**
 * Start recording for this page, or return null where recording never
 * happens (a hosted copy). Every call re-checks the Reading toggle.
 */
function sigStart(data, context) {
  if (!sigAllowedOrigin(window.location) || !context || !context.key || !context.build) return null;
  const tracker = sigTracker(data, context);
  const { box, sections } = tracker;
  sigListen(tracker, context);
  tracker.check();
  return {
    active: sigLearningOn,
    served: () => window.location.protocol === 'http:' && Boolean(sigToken(context)),
    check: tracker.check,
    send: () => sigSend(tracker, context),
    onRoute: (fn) => box.listeners.push(fn),
    routesNow: () => sigRoutesNow(sections, window.location.hash),
    fingerprint: (route) => sections[route] || null,
    voteOf: (route) => (box.state.votes[route] && box.state.votes[route].fp === sections[route] ? box.state.votes[route] : null),
    vote(route, vote, note) {
      if (!sigLearningOn() || typeof sections[route] !== 'string') return false;
      box.state = sigVote(box.state, route, sections[route], vote, note);
      tracker.save();
      return true;
    },
    summary: () => sigPendingSummary(box.state, context),
    fileName: () => sigFileName(context),
    forget() {
      const n = sigForgetAll();
      box.state = sigFresh(context.build);
      box.visits = new Map();
      return n;
    },
    state: () => box.state,
  };
}
