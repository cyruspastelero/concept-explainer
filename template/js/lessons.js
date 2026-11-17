// Chapter: key concepts, one idea per card. (The quiz follows.)
function renderConcepts(data, mount) {
  const concepts = list(data.concepts);
  if (!concepts.length) return null;
  let index = 0;
  const card = h('article', { class: 'panel concept-card', 'aria-live': 'polite' });
  const controls = h('div', { class: 'step-controls' });

  function show(next, { animate = true, link = true } = {}) {
    const target = Math.min(Math.max(next, 0), concepts.length - 1);
    const direction = target >= index ? 1 : -1;
    index = target;
    render();
    if (link) setDeepLink(`concepts/${index}`);
    if (animate) slideIn(card, direction);
  }

  function render() {
    const concept = concepts[index];
    fill(card,
      h('span', { class: 'step-count' }, `Idea ${index + 1} of ${concepts.length}`),
      h('h3', null, softBreaks(concept.title)),
      h('p', { class: 'concept-body' }, softBreaks(concept.body)),
      concept.analogy && h('div', { class: 'why' }, h('p', { class: 'eyebrow quiet' }, 'Think of it like'), h('p', null, softBreaks(concept.analogy))),
      chConceptExtras(concept),
      concept.file && h('div', { class: 'code-head' }, fileChip(concept.file), chWalkthroughLink(data, concept.file)),
      concept.code && codeBlock(concept.code, concept.lang),
      controls,
    );
    fill(controls,
      stepDots(concepts.length, index, (i) => show(i)),
      h('button', { class: 'btn', type: 'button', disabled: index === 0, onclick: () => show(index - 1) }, 'Back'),
      h('button', { class: 'btn primary', type: 'button', disabled: index === concepts.length - 1, onclick: () => show(index + 1) }, 'Continue'),
    );
  }

  render();
  mount.append(h('div', { class: 'lesson' }, card));
  return {
    open([raw] = []) {
      const wanted = Number.parseInt(raw, 10);
      if (!(Number.isInteger(wanted) && wanted >= 0 && wanted < concepts.length)) return null;
      show(wanted, { animate: false, link: false });
      return card;
    },
  };
}

// Chapter: check yourself. One question at a time, Brilliant pacing: pick an
// answer, then Check. A wrong first try says "Not yet" and lets you retry; a
// second wrong try (or Show answer) reveals the answer and the reason.
// Answers are remembered per explainer in this browser only.
const QUIZ_TRIES = 2;
const PATHISH = /^[^\s]*[/\\][^\s]*$|^[\w.-]+\.(?:[a-z]{1,5})(?::\d+)?$|\(\)|=>|::/i;

function quizStoreKey(meta) {
  return `concept-explainer:quiz:${text(meta && meta.repo, meta && meta.title)}:${text(meta && meta.commit, '')}`;
}

function loadQuiz(key, count) {
  try {
    const saved = JSON.parse(readStore(key) || 'null');
    if (!saved || !Array.isArray(saved.answers)) return null;
    return { index: Math.min(Math.max(0, saved.index | 0), count), answers: saved.answers.slice(0, count) };
  } catch (error) {
    return null;
  }
}

// Where a question is taught: a node or flow named in the question, the
// right option or the explanation; a cited path that belongs to a node.
function quizLesson(question, data) {
  const hay = [question.question, question.explain, list(question.options)[question.answer]].map((v) => text(v)).join(' ').toLowerCase();
  if (!hay) return null;
  const node = list(data.nodes).find((n) => (n.label && hay.includes(String(n.label).toLowerCase()))
    || list(n.files).some((f) => hay.includes(String(f).replace(/:\d+.*$/, '').toLowerCase())));
  if (node) return { href: `#map/${linkPart(node.id)}`, label: node.label };
  const flow = list(data.flows).find((f) => f.title && hay.includes(String(f.title).toLowerCase()));
  if (flow) return { href: `#flows/${linkPart(flow.id)}`, label: flow.title };
  const concept = list(data.concepts).findIndex((c) => c.title && hay.includes(String(c.title).toLowerCase()));
  if (concept >= 0) return { href: `#concepts/${concept}`, label: data.concepts[concept].title };
  return null;
}

function optionLabel(option) {
  const value = String(option);
  if (PATHISH.test(value.trim())) {
    return truncatable(h('span', { class: 'option-text is-code' }), value, { mode: 'middle' });
  }
  return h('span', { class: 'option-text' }, softBreaks(value));
}

// ---------- Quiz state (pure) ----------
const QUIZ_OPEN = Object.freeze({ tries: [], status: 'open', picked: null });

function quizAnswerOf(state, i) {
  return state.answers[i] || QUIZ_OPEN;
}

// The answer after pressing Check: right first time, right late (counts as
// missed), another try, or out of tries.
function quizChecked(answer, question) {
  const right = answer.picked === question.answer;
  const tries = [...answer.tries, answer.picked];
  const status = right ? (tries.length === 1 ? 'right' : 'right-late') : tries.length >= QUIZ_TRIES ? 'missed' : 'retry';
  return { ...answer, tries, status: status === 'right-late' ? 'missed' : status, firstTry: right && tries.length === 1, picked: right ? answer.picked : null, late: status === 'right-late' };
}

function quizWithAnswer(state, i, next) {
  const answers = [...state.answers];
  answers[i] = { ...quizAnswerOf(state, i), ...next };
  return { ...state, answers };
}

const quizPicked = (answer) => answer.picked !== null && answer.picked !== undefined;

// ---------- Quiz screens ----------
function quizProgress(questions, state, current, go) {
  return h('div', { class: 'step-dots quiz-dots' }, questions.map((_, i) => {
    const status = quizAnswerOf(state, i).status;
    return h('button', {
      type: 'button', class: [i === current ? 'is-current' : '', status !== 'open' ? 'is-done' : ''].join(' ').trim(),
      'aria-label': `Question ${i + 1}${status === 'right' ? ', right' : status === 'missed' ? ', missed' : ''}`,
      'aria-current': i === current ? 'step' : null, onclick: () => go(i),
    });
  }));
}

function quizFeedback(question, answer) {
  const live = h('div', { class: 'quiz-live', 'aria-live': 'polite' });
  if (answer.status === 'open') return live;
  const correctText = list(question.options)[question.answer];
  const explain = text(question.explain, `The answer is “${correctText}”.`);
  const states = {
    retry: { cls: 'is-retry', head: 'Not yet. Try again.', body: 'Pick another answer, or show the answer.' },
    right: { cls: 'is-right', head: 'Right', body: explain },
    missed: { cls: 'is-missed', head: answer.late ? 'Right on the second try' : 'Why', body: explain },
  };
  const view = states[answer.status] || states.missed;
  live.append(h('div', { class: `feedback ${view.cls}` },
    h('p', { class: 'feedback-head', tabindex: '-1', 'data-focus': '' }, h('span', { class: 'status-dot', 'aria-hidden': 'true' }), view.head),
    h('p', null, softBreaks(view.body))));
  return live;
}

function quizOptions(question, answer, resolved, pick) {
  const optionEls = list(question.options).map((option, j) => {
    const tried = answer.tries.includes(j);
    const isAnswer = resolved && j === question.answer;
    return h('button', {
      class: ['option', tried && !isAnswer ? 'is-tried' : '', isAnswer ? 'is-answer' : ''].join(' ').trim(),
      type: 'button', role: 'radio', 'aria-checked': String(answer.picked === j), tabindex: '-1', disabled: resolved,
      onclick: () => pick(j),
    },
    h('span', { class: 'key' }, String(j + 1)), optionLabel(option),
    isAnswer && h('span', { class: 'tag tag-answer' }, 'Correct answer'),
    tried && !isAnswer && h('span', { class: 'option-note' }, 'Your try'));
  });
  const focusable = optionEls[answer.picked ?? 0] || optionEls[0];
  if (focusable && !resolved) focusable.tabIndex = 0;
  return optionEls;
}

// Arrows move the pick, 1 to n pick directly, Enter checks.
function quizKeys(event, answer, count, { pick, check }) {
  const move = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
  const number = Number.parseInt(event.key, 10);
  if (move) {
    event.preventDefault();
    pick(((answer.picked ?? -1) + move + count) % count);
  } else if (number >= 1 && number <= count) {
    event.preventDefault();
    pick(number - 1);
  } else if (event.key === 'Enter' && quizPicked(answer)) {
    event.preventDefault();
    check();
  }
}

function quizControls(i, count, answer, resolved, actions) {
  const checkButton = !resolved && h('button', {
    class: 'btn primary', type: 'button', disabled: !quizPicked(answer), onclick: actions.check,
  }, answer.status === 'retry' ? 'Check again' : 'Check');
  const showAnswer = answer.status === 'retry' && h('button', { class: 'link quiz-reveal', type: 'button', onclick: actions.reveal }, 'Show answer');
  return h('div', { class: 'step-controls quiz-controls' },
    h('button', { class: 'btn', type: 'button', disabled: i === 0, onclick: () => actions.go(i - 1) }, 'Back'),
    showAnswer,
    resolved
      ? h('button', { class: 'btn primary', type: 'button', onclick: () => actions.go(i + 1) }, i === count - 1 ? 'See your score' : 'Continue')
      : checkButton);
}

// actions: { pick(j), check(), reveal(), go(i), reset() }
function quizQuestionScreen(questions, state, i, actions) {
  const question = questions[i];
  const count = list(question.options).length;
  const answer = quizAnswerOf(state, i);
  const resolved = answer.status === 'right' || answer.status === 'missed';
  const group = h('div', {
    class: 'options', role: 'radiogroup', 'aria-label': question.question,
    onkeydown: (event) => { if (!resolved) quizKeys(event, answer, count, actions); },
  }, quizOptions(question, answer, resolved, actions.pick));
  return [
    h('div', { class: 'quiz-top' },
      h('span', { class: 'step-count' }, `Question ${i + 1} of ${questions.length}`),
      h('button', { class: 'link quiz-reset', type: 'button', onclick: actions.reset }, 'Reset')),
    quizProgress(questions, state, i, actions.go),
    h('h3', { class: 'quiz-q', tabindex: '-1', 'data-focus': answer.status === 'open' ? '' : null }, softBreaks(question.question)),
    group,
    quizFeedback(question, answer),
    quizControls(i, questions.length, answer, resolved, actions),
    h('p', { class: 'kbd-hint' }, 'Tip: press ', h('kbd', null, '1'), ' to ', h('kbd', null, String(count)), ' to pick, ', h('kbd', null, 'Enter'), ' to check.'),
  ];
}

function quizMissedList(data, missed, go) {
  return h('div', { class: 'quiz-missed' },
    h('p', { class: 'eyebrow quiet' }, 'To revisit'),
    h('ul', { class: 'rows' }, missed.map(({ q, i }) => {
      const lesson = quizLesson(q, data);
      return h('li', { class: 'quiz-missed-row' },
        h('button', { class: 'link', type: 'button', onclick: () => go(i) }, softBreaks(`${i + 1}. ${q.question}`)),
        lesson && h('a', { class: 'quiz-lesson', href: lesson.href }, softBreaks(`Read: ${lesson.label}`)));
    })));
}

function quizEndScreen(data, questions, state, { go, reset }) {
  const firstTry = questions.filter((_, i) => quizAnswerOf(state, i).status === 'right').length;
  const missed = questions.map((q, i) => ({ q, i, a: quizAnswerOf(state, i) })).filter(({ a }) => a.status !== 'right');
  return [
    h('div', { class: 'quiz-top' }, h('span', { class: 'step-count' }, 'Your score'),
      h('button', { class: 'link quiz-reset', type: 'button', onclick: reset }, 'Reset')),
    quizProgress(questions, state, -1, go),
    h('h3', { class: 'quiz-score', tabindex: '-1', 'data-focus': '' }, `${firstTry} of ${questions.length} on the first try`),
    h('div', { class: 'meter', 'aria-hidden': 'true' }, h('span', { style: `--share:${firstTry / questions.length}` })),
    missed.length
      ? quizMissedList(data, missed, go)
      : h('p', { class: 'quiz-perfect' }, 'Every answer right on the first try. This chapter is done.'),
    h('div', { class: 'step-controls quiz-controls' },
      h('button', { class: 'btn', type: 'button', onclick: () => go(questions.length - 1) }, 'Back'),
      h('button', { class: 'btn primary', type: 'button', onclick: reset }, 'Try again')),
  ];
}

// A right answer keeps its pick and pops; a wrong one shakes.
function quizCelebrate(card, answer) {
  const chosen = card.querySelectorAll('.option')[answer.tries[answer.tries.length - 1]];
  if (!chosen) return;
  if (answer.picked !== null) pop(chosen); else shake(chosen);
}

function renderQuiz(data, mount) {
  const questions = list(data.quiz);
  if (!questions.length) return null;
  const key = quizStoreKey(data.meta);
  let state = loadQuiz(key, questions.length) || { index: 0, answers: [] };
  const card = h('article', { class: 'panel quiz-card' });
  const persist = () => writeStore(key, JSON.stringify({ index: state.index, answers: state.answers }));
  const update = (i, next) => { state = quizWithAnswer(state, i, next); persist(); };
  const focusOption = (j) => { const el = card.querySelectorAll('.option')[j]; if (el) el.focus(); return el; };

  function go(index, { focus = true, link = true } = {}) {
    state = { ...state, index: Math.min(Math.max(index, 0), questions.length) };
    persist();
    if (link) setDeepLink(state.index >= questions.length ? 'quiz/done' : `quiz/${state.index + 1}`);
    render({ focus });
  }

  const actions = {
    go,
    reset: () => { state = { index: 0, answers: [] }; persist(); go(0); },
    pick: (j) => { update(state.index, { picked: j }); render(); focusOption(j); },
    reveal: () => { update(state.index, { status: 'missed', picked: null }); render({ focus: true }); },
    check: () => {
      const i = state.index;
      if (!quizPicked(quizAnswerOf(state, i))) return;
      update(i, quizChecked(quizAnswerOf(state, i), questions[i]));
      render({ focus: true });
      quizCelebrate(card, quizAnswerOf(state, i));
    },
  };

  function render({ focus = false } = {}) {
    fill(card, ...(state.index >= questions.length ? quizEndScreen(data, questions, state, actions) : quizQuestionScreen(questions, state, state.index, actions)));
    const head = focus && card.querySelector('[data-focus]');
    if (head) head.focus({ preventScroll: true });
  }

  mount.append(h('div', { class: 'lesson quiz' }, card));
  render();
  return {
    open([n] = []) {
      if (n === 'done') { go(questions.length, { focus: false, link: false }); return card; }
      const wanted = Number.parseInt(n, 10);
      if (!(Number.isInteger(wanted) && wanted >= 1 && wanted <= questions.length)) return null;
      go(wanted - 1, { focus: false, link: false });
      return card;
    },
  };
}
