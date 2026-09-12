import { requestJson } from './utils/api.js';
import { getToken } from './utils/auth.js';
import { state } from './utils/state.js';

const fallbackSubjects = [
  ['Mathematics', '6 topics', 'math', '∑'],
  ['Biology', '5 topics', 'biology', '⬡'],
  ['Chemistry', '4 topics', 'chemistry', '◈'],
  ['Physics', '5 topics', 'physics', '⚡'],
  ['English Language', '5 topics', 'english', 'Aa'],
  ['Economics', '4 topics', 'economics', '₦'],
  ['Government', '4 topics', 'government', '⚖'],
  ['Geography', '4 topics', 'geography', '◎']
];

const fallbackTopics = ['Number Bases', 'Algebraic Expressions', 'Linear Equations', 'Quadratic Equations', 'Geometry', 'Statistics'];
const prompts = ['Explain photosynthesis simply', 'How do I solve quadratic equations?', 'What is the difference between acids and bases?', "Help me understand Nigeria's constitution"];
const screenAliases = { learn: 'subjects', quiz: 'quiz-subjects' };
const subjectStyles = ['math', 'biology', 'chemistry', 'physics', 'english', 'economics', 'government', 'geography'];
const subjectIcons = ['∑', '⬡', '◈', '⚡', 'Aa', '₦', '⚖', '◎'];
const emptySearchResult = '<p class="empty-search-result">No matches found.</p>';

// Search is case-insensitive and supports partial words.
function matches(value, query) {
  return value.toLowerCase().includes(query.trim().toLowerCase());
}

function subjectMatches(subject, query) {
  if (!query || matches(subject[0], query)) return true;

  return state.subjectRecords.some((record) => (
    record.subject === subject[0] && matches(record.topic, query)
  ));
}

function filteredSubjects(query = '') {
  return state.subjects.filter((subject) => subjectMatches(subject, query));
}

const subjectCard = ([name, count, color, icon]) => `
  <button class="subject-card ${color}" data-subject="${name}" data-screen-target="topics">
    <span class="subject-icon">${icon}</span>
    <span class="subject-copy">
      <strong>${name}</strong>
      <small>${count}</small>
    </span>
  </button>
`;

const subjectRow = ([name, count, color, icon], target) => `
  <button class="large-subject-row" data-subject="${name}" data-screen-target="${target}">
    <span class="row-icon ${color}">${icon}</span>
    <span class="row-copy">
      <strong>${name}</strong>
      <small>${count}</small>
    </span>
    <span class="chevron">›</span>
  </button>
`;

const topicSearchRow = (record, index) => `
  <button class="topic-row" data-subject="${record.subject}" data-topic="${record.topic}" data-screen-target="topic-detail">
    <span class="topic-number">${String(index + 1).padStart(2, '0')}</span>
    <span class="row-copy">
      <strong>${record.topic}</strong>
      <small>${record.subject}</small>
    </span>
    <span class="chevron">›</span>
  </button>
`;

// The home screen only needs subject cards; topic matches are shown on the Subjects screen.
function renderHomeSubjects(query = '') {
  const subjects = filteredSubjects(query);
  document.querySelector('#home-subject-grid').innerHTML = subjects.length
    ? subjects.map(subjectCard).join('')
    : emptySearchResult;
}

function renderSubjectList(query = '') {
  const subjects = filteredSubjects(query);
  // Show topic matches directly so users do not need to open each subject first.
  const topicResults = query
    ? state.subjectRecords.filter((record, index, records) => (
      matches(record.topic, query)
      && records.findIndex((item) => item.subject === record.subject && item.topic === record.topic) === index
    ))
    : [];
  const subjectRows = query && topicResults.length
    ? ''
    : subjects.map((subject) => subjectRow(subject, 'topics')).join('');
  const topicRows = topicResults.map(topicSearchRow).join('');

  document.querySelector('#subjects-list').innerHTML = subjectRows || topicRows || emptySearchResult;
}

function renderSubjects() {
  renderHomeSubjects();
  renderSubjectList();
  document.querySelector('#quiz-subjects-list').innerHTML = state.subjects.map((subject) => subjectRow(subject, 'quiz-topics')).join('');
  renderTopics();
}

function renderTopics(query = '') {
  const topics = state.topics.filter((topic) => !query || matches(topic, query));

  document.querySelector('#quiz-topics-list').innerHTML = state.topics.map((topic, index) => `
    <button class="topic-row" data-topic="${topic}" data-screen-target="quiz-question">
      <span class="topic-number">${String(index + 1).padStart(2, '0')}</span>
      <span class="row-copy">
        <strong>${topic}</strong>
        <small>Course content and practice questions</small>
      </span>
      <span class="chevron">›</span>
    </button>
  `).join('');

  document.querySelector('#topic-list').innerHTML = topics.length ? topics.map((topic) => `
    <button class="topic-row" data-topic="${topic}" data-screen-target="topic-detail">
      <span class="topic-number">${String(state.topics.indexOf(topic) + 1).padStart(2, '0')}</span>
      <span class="row-copy">
        <strong>${topic}</strong>
        <small>${state.subjectRecords.find((record) => record.subject === state.selectedSubject && record.topic === topic)?.lesson?.introduction || 'Course content and practice questions'}</small>
      </span>
      <span class="chevron">›</span>
    </button>
  `).join('') : emptySearchResult;

  const heading = document.querySelector('.topic-heading h1');
  const summary = document.querySelector('.topic-heading p');

  if (heading) heading.textContent = state.selectedSubject;
  if (summary) summary.textContent = `${state.topics.length} topics`;
}

function renderLesson() {
  const record = state.subjectRecords.find((item) => item.subject === state.selectedSubject && item.topic === state.selectedTopic);
  if (!record) return;

  const lesson = record.lesson || {};
  const points = (lesson.key_points || []).map((point) => `<li>${point}</li>`).join('');
  const questions = (record.practice_questions || []).map((item) => `<div class="question-link"><span>${item.question}</span></div>`).join('');

  document.querySelector('#topic-detail-content').innerHTML = `
    <h1>${record.topic}</h1>
    <p class="description">${lesson.introduction || ''}</p>
    <button class="primary-button" data-screen-target="learning">Start learning</button>
    <div class="detail-actions">
      <button class="outline-button" data-screen-target="ai">▢ <span>Ask AI</span></button>
      <button class="outline-button" data-screen-target="quiz-question">☑ <span>Take quiz</span></button>
    </div>
    <div class="about-box">
      <h2>SUBTOPICS</h2>
      <ul>${(record.subtopics || points).map((item) => `<li>${item}</li>`).join('')}</ul>
    </div>
    <div class="questions">
      <h2>PRACTICE QUESTIONS</h2>
      <div id="common-questions">${questions}</div>
    </div>
  `;

  const lessonSubject = document.querySelector('#lesson-subject');
  if (lessonSubject) lessonSubject.textContent = state.selectedSubject.toUpperCase();

  document.querySelector('#lesson-content').innerHTML = `
    <h2>${record.topic}</h2>
    <p>${lesson.introduction || ''}</p>
    <h2>Core explanation</h2>
    <p>${lesson.core_explanation || ''}</p>
    ${lesson.worked_example ? `<div class="formula"><strong>WORKED EXAMPLE</strong><p>${lesson.worked_example}</p></div>` : ''}
    ${points ? `<h2>Key points</h2><ul class="steps">${points}</ul>` : ''}
    ${lesson.why_it_matters ? `<h2>Why it matters</h2><p>${lesson.why_it_matters}</p>` : ''}
    ${lesson.study_tip ? `<div class="formula"><strong>STUDY TIP</strong><p>${lesson.study_tip}</p></div>` : ''}
  `;
}

function normalizeAnswer(value) {
  return String(value || '').trim().toLowerCase().replace(/[.?!]+$/, '');
}

function currentQuizQuestion() {
  return state.quizQuestions[state.quizIndex];
}

function updateQuizHeader(prefix, total) {
  const questionNumber = state.quizIndex + 1;
  const progress = document.querySelector(`#${prefix}-progress`);
  const label = document.querySelector(`#${prefix}-topic-label`);
  const bar = document.querySelector(`[data-screen="${prefix === 'quiz' ? 'quiz-question' : 'quiz-result'}"] .progress i`);

  if (progress) progress.textContent = `${questionNumber} / ${total}`;
  if (label) label.textContent = `${state.selectedSubject} · ${state.selectedTopic}`;
  if (bar) bar.style.width = `${(questionNumber / total) * 100}%`;
}

function renderQuizQuestion() {
  const question = currentQuizQuestion();
  if (!question) return;

  updateQuizHeader('quiz', state.quizQuestions.length);
  document.querySelector('#quiz-question-text').textContent = question.question;
  document.querySelector('#quiz-encouragement').textContent = state.quizIndex === 4
    ? 'You are halfway through. Keep going, you are doing well!'
    : '';
  document.querySelector('#answers').innerHTML = question.options.map((option, index) => `
    <button class="answer" data-answer-index="${index}">
      <b>${String.fromCharCode(65 + index)}</b><span>${option.label}</span>
    </button>
  `).join('');
}

function renderQuizResult(selectedIndex) {
  const question = currentQuizQuestion();
  const correctIndex = question.options.findIndex((option) => (
    option.is_correct || normalizeAnswer(option.label) === normalizeAnswer(question.answer)
  ));
  const isCorrect = selectedIndex === correctIndex;
  const answers = document.querySelector('#result-answers');
  const feedback = document.querySelector('#quiz-feedback');

  updateQuizHeader('result', state.quizQuestions.length);
  document.querySelector('#result-question-text').textContent = question.question;
  answers.innerHTML = question.options.map((option, index) => {
    const className = index === correctIndex ? 'correct' : index === selectedIndex ? 'wrong' : 'muted';
    const marker = index === correctIndex ? '✓' : index === selectedIndex ? '×' : String.fromCharCode(65 + index);
    return `<div class="answer ${className}"><b>${marker}</b><span>${option.label}</span></div>`;
  }).join('');

  feedback.className = `feedback ${isCorrect ? 'correct-feedback' : 'wrong-feedback'}`;
  feedback.querySelector('strong').textContent = isCorrect ? 'Correct!' : 'Not quite.';
  feedback.querySelector('p').textContent = question.explanation || `The correct answer is ${question.answer}.`;

  const nextButton = document.querySelector('[data-screen="quiz-result"] .question-footer .primary-button');
  nextButton.textContent = state.quizIndex === state.quizQuestions.length - 1 ? 'See results' : 'Next question';
  nextButton.dataset.screenTarget = state.quizIndex === state.quizQuestions.length - 1 ? 'quiz-complete' : 'quiz-next';
}

function startQuiz() {
  const record = state.subjectRecords.find((item) => (
    item.subject === state.selectedSubject && item.topic === state.selectedTopic
  ));
  state.quizQuestions = (record?.practice_questions || []).slice(0, 10);
  state.quizIndex = 0;
  state.quizScore = 0;
  renderQuizQuestion();
}

function advanceQuiz() {
  state.quizIndex += 1;
  renderQuizQuestion();
  activateScreen('quiz-question');
}

function renderPromptList() {
  const list = document.querySelector('#prompt-list');
  if (!list) return;
  list.innerHTML = prompts.map((prompt) => `<button class="prompt" data-prompt="${prompt}">${prompt}</button>`).join('');
}

function renderQuizComplete() {
  const score = document.querySelector('#quiz-score');
  const summary = document.querySelector('#quiz-summary');
  const total = state.quizQuestions.length || 10;
  if (score) score.textContent = `${state.quizScore}/${total}`;
  if (summary) summary.textContent = `You scored ${state.quizScore} out of ${total}.`;
}

function activateScreen(target) {
  const resolved = screenAliases[target] || target;

  document.querySelectorAll('.screen').forEach((screen) => {
    screen.classList.toggle('active', screen.dataset.screen === resolved);
  });

  document.querySelectorAll('.bottom-nav button').forEach((button) => {
    const isActive = button.dataset.screenTarget === resolved || (resolved === 'topics' && button.dataset.screenTarget === 'subjects');
    button.classList.toggle('active', isActive);
  });
}

function loadCatalog() {
  const catalogPath = '/api/catalog';

  requestJson(catalogPath)
    .then((catalog) => {
      state.subjectRecords = catalog.records || [];
      state.subjects = (catalog.subjects || []).map((name, index) => [
        name,
        `${new Set(state.subjectRecords.filter((record) => record.subject === name).map((record) => record.topic)).size} topics`,
        subjectStyles[index % subjectStyles.length],
        subjectIcons[index % subjectIcons.length]
      ]);
      state.topics = [...new Set(state.subjectRecords.filter((record) => record.subject === state.selectedSubject).map((record) => record.topic))];
      renderSubjects();
    })
    .catch(() => loadCachedCatalog());
}

function loadCachedCatalog() {
  const catalogPath = window.location.pathname.includes('/client/') ? '../subjects.json' : 'subjects.json';

  fetch(catalogPath)
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error('Cached catalog unavailable'))))
    .then((catalog) => {
      state.subjectRecords = catalog.records || [];
      state.subjects = (catalog.subjects || []).map((name, index) => [
        name,
        `${new Set(state.subjectRecords.filter((record) => record.subject === name).map((record) => record.topic)).size} topics`,
        subjectStyles[index % subjectStyles.length],
        subjectIcons[index % subjectIcons.length]
      ]);
      state.topics = [...new Set(state.subjectRecords.filter((record) => record.subject === state.selectedSubject).map((record) => record.topic))];
      renderSubjects();
    })
    .catch(() => {
      state.subjectRecords = [];
      state.subjects = fallbackSubjects;
      state.topics = fallbackTopics;
      renderSubjects();
    });
}

function onRouteClick(event) {
  const route = event.target.closest('[data-screen-target]');
  if (!route) return;

  event.preventDefault();

  if (route.dataset.subject) {
    state.selectedSubject = route.dataset.subject;
    state.topics = [...new Set(state.subjectRecords.filter((record) => record.subject === state.selectedSubject).map((record) => record.topic))];
    if (!state.topics.length) state.topics = fallbackTopics;
    renderTopics();
  }

  if (route.dataset.topic) {
    state.selectedTopic = route.dataset.topic;
    renderLesson();
  }

  if (route.dataset.screenTarget === 'quiz-question') startQuiz();
  if (route.dataset.screenTarget === 'quiz-next') {
    advanceQuiz();
    return;
  }
  if (route.dataset.screenTarget === 'quiz-complete') renderQuizComplete();

  activateScreen(route.dataset.screenTarget);
}

function onAnswerClick(event) {
  const answer = event.target.closest('[data-answer-index]');
  if (!answer) return;
  const selectedIndex = Number(answer.dataset.answerIndex);
  const question = currentQuizQuestion();
  const correctIndex = question.options.findIndex((option) => (
    option.is_correct || normalizeAnswer(option.label) === normalizeAnswer(question.answer)
  ));
  if (selectedIndex === correctIndex) state.quizScore += 1;
  renderQuizResult(selectedIndex);
  activateScreen('quiz-result');
}

function onPromptClick(event) {
  const prompt = event.target.closest('[data-prompt]');
  if (!prompt) return;

  const input = document.querySelector('.chat-input span');
  if (input) input.textContent = prompt.dataset.prompt;
  activateScreen('ai');
}

function onSearchInput(event) {
  const input = event.target.closest('[data-search-scope]');
  if (!input) return;

  if (input.dataset.searchScope === 'home') renderHomeSubjects(input.value);
  if (input.dataset.searchScope === 'subjects') renderSubjectList(input.value);
  if (input.dataset.searchScope === 'topics') renderTopics(input.value);
}

function initializeApp() {
  state.subjects = fallbackSubjects;
  state.topics = fallbackTopics;
  state.selectedSubject = 'Mathematics';
  state.selectedTopic = 'Logic';

  renderSubjects();
  renderPromptList();

  document.addEventListener('click', (event) => {
    onRouteClick(event);
    onAnswerClick(event);
    onPromptClick(event);
  });
  document.addEventListener('input', onSearchInput);

  document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
  activateScreen('home');

  const token = getToken();
  if (token) {
    state.authToken = token;
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }

  loadCatalog();
}

initializeApp();
