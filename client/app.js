import { registerUser, loginUser, logoutUser, fetchCurrentUser, fetchProgress, saveProgress, requestJson } from './utils/api.js';
import { getToken, saveToken, getUser, saveUser, clearAuth } from './utils/auth.js';
import { state } from './utils/state.js';
import { askTutor } from './utils/aiController.js';

// Offline fallback catalog used before the server catalog is available.
const fallbackSubjects = [
  ['Mathematics', '6 topics', 'math', 'calculator'],
  ['Biology', '5 topics', 'biology', 'leaf'],
  ['Chemistry', '4 topics', 'chemistry', 'flask'],
  ['Physics', '5 topics', 'physics', 'atom'],
  ['English Language', '5 topics', 'english', 'book'],
  ['Economics', '4 topics', 'economics', 'chart'],
  ['Government', '4 topics', 'government', 'scales'],
  ['Geography', '4 topics', 'geography', 'globe']
];

// Offline fallback topics and suggested AI prompts.
const fallbackTopics = ['Number Bases', 'Algebraic Expressions', 'Linear Equations', 'Quadratic Equations', 'Geometry', 'Statistics'];
const prompts = ['Explain photosynthesis simply', 'How do I solve quadratic equations?', 'What is the difference between acids and bases?', 'What is a proposition in logic?'];
// Navigation aliases and visual metadata used while rendering subjects.
const screenAliases = { learn: 'subjects', quiz: 'quiz-subjects' };
const subjectStyles = ['math', 'biology', 'chemistry', 'physics', 'english', 'economics', 'government', 'geography'];
const subjectIcons = ['calculator', 'leaf', 'flask', 'atom', 'book', 'chart', 'scales', 'globe'];
// Shared empty-state markup for searches with no matching records.
const emptySearchResult = '<p class="empty-search-result">No matches found.</p>';

// Keep the app icons local so they remain visible offline and in installed PWAs.
function icon(name, className = '') {
  const paths = {
    calculator: '<rect x="5" y="3" width="14" height="18" rx="2"/><rect x="8" y="6" width="8" height="3"/><path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01"/>',
    leaf: '<path d="M20 4C11 4 5 8 5 15c0 3 2 5 5 5 7 0 10-6 10-16Z"/><path d="M4 20c3-5 7-8 13-10"/>',
    flask: '<path d="M9 3h6M10 3v6l-5 8a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-8V3"/><path d="M7 16h10"/>',
    atom: '<circle cx="12" cy="12" r="2"/><path d="M19.1 19.1C15 23.2 8.7 21.3 5.3 17.9S.8 8.2 4.9 4.9 15.3 2.7 19 6s3.4 9-.1 13.1Z"/><path d="M4.9 19.1C1.8 15.7 2.7 9.4 6.1 5.9S15.8 1 19.1 4.9s1.9 10.2-1.4 13.6-9.3 4-12.8.6Z"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z"/><path d="M4 5.5v16M8 7h8M8 11h8"/>',
    chart: '<path d="M4 19V5M4 19h16"/><path d="m7 15 3-4 3 2 5-7"/>',
    scales: '<path d="M12 4v16M7 20h10M5 7h14M5 7l-3 6h6L5 7ZM19 7l-3 6h6l-3-6Z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    spark: '<path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3ZM19 16l.6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6L19 16Z"/>',
    quiz: '<path d="M4 4h16v16H4z"/><path d="m8 12 3 3 5-6"/>',
    check: '<path d="m5 13 4 4L19 7"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    arrowRight: '<path d="m9 18 6-6-6-6"/>'
  };
  return `<svg class="icon ${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name] || paths.spark}</svg>`;
}

// Search is case-insensitive and supports partial words.
function matches(value, query) {
  return value.toLowerCase().includes(query.trim().toLowerCase());
}

function subjectMatches(subject, query) {
  // Match a subject directly or match one of its topics.
  if (!query || matches(subject[0], query)) return true;

  return state.subjectRecords.some((record) => (
    record.subject === subject[0] && matches(record.topic, query)
  ));
}

function filteredSubjects(query = '') {
  // Return subjects that satisfy the current search query.
  return state.subjects.filter((subject) => subjectMatches(subject, query));
}

// Build the compact subject card used on the home screen.
const subjectCard = ([name, count, color, iconName]) => `
  <button class="subject-card ${color}" data-subject="${name}" data-screen-target="topics">
    <span class="subject-icon">${iconMarkup(iconName)}</span>
    <span class="subject-copy">
      <strong>${name}</strong>
      <small>${count}</small>
    </span>
  </button>
`;

// Build a full-width subject row for catalog and quiz selection screens.
const subjectRow = ([name, count, color, iconName], target) => `
  <button class="large-subject-row" data-subject="${name}" data-screen-target="${target}">
    <span class="row-icon ${color}">${iconMarkup(iconName)}</span>
    <span class="row-copy">
      <strong>${name}</strong>
      <small>${count}</small>
    </span>
    <span class="chevron">${icon('arrowRight')}</span>
  </button>
`;

// Build a topic result row for subject search results.
const topicSearchRow = (record, index) => `
  <button class="topic-row" data-subject="${record.subject}" data-topic="${record.topic}" data-screen-target="topic-detail">
    <span class="topic-number">${String(index + 1).padStart(2, '0')}</span>
    <span class="row-copy">
      <strong>${record.topic}</strong>
      <small>${record.subject}</small>
    </span>
    <span class="chevron">${icon('arrowRight')}</span>
  </button>
`;

function iconMarkup(name) {
  return icon(name);
}

// The home screen only needs subject cards; topic matches are shown on the Subjects screen.
function renderHomeSubjects(query = '') {
  const subjects = filteredSubjects(query);
  document.querySelector('#home-subject-grid').innerHTML = subjects.length
    ? subjects.map(subjectCard).join('')
    : emptySearchResult;
}

function renderSubjectList(query = '') {
  // Render subject rows and direct topic matches for the catalog search.
  const subjects = filteredSubjects(query);
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
  // Refresh every subject-driven view after catalog data changes.
  renderHomeSubjects();
  renderSubjectList();
  document.querySelector('#quiz-subjects-list').innerHTML = state.subjects.map((subject) => subjectRow(subject, 'quiz-topics')).join('');
  renderTopics();
}

function renderTopics(query = '') {
  // Render topic choices for both learning and quiz flows.
  const topics = state.topics.filter((topic) => !query || matches(topic, query));

  document.querySelector('#quiz-topics-list').innerHTML = state.topics.map((topic, index) => `
    <button class="topic-row" data-topic="${topic}" data-screen-target="quiz-question">
      <span class="topic-number">${String(index + 1).padStart(2, '0')}</span>
      <span class="row-copy">
        <strong>${topic}</strong>
        <small>Course content and practice questions</small>
      </span>
      <span class="chevron">${icon('arrowRight')}</span>
    </button>
  `).join('');

  document.querySelector('#topic-list').innerHTML = topics.length ? topics.map((topic) => `
    <button class="topic-row" data-topic="${topic}" data-screen-target="topic-detail">
      <span class="topic-number">${String(state.topics.indexOf(topic) + 1).padStart(2, '0')}</span>
      <span class="row-copy">
        <strong>${topic}</strong>
        <small>${state.subjectRecords.find((record) => record.subject === state.selectedSubject && record.topic === topic)?.lesson?.introduction || 'Course content and practice questions'}</small>
      </span>
      <span class="chevron">${icon('arrowRight')}</span>
    </button>
  `).join('') : emptySearchResult;

  const heading = document.querySelector('.topic-heading h1');
  const summary = document.querySelector('.topic-heading p');
  const quizHeading = document.querySelector('#quiz-topics-title');

  if (heading) heading.textContent = state.selectedSubject;
  if (summary) summary.textContent = `${state.topics.length} topics`;
  if (quizHeading) quizHeading.textContent = state.selectedSubject;
}

function renderLesson() {
  // Fill the topic detail and lesson screens from the selected record.
  const record = state.subjectRecords.find((item) => item.subject === state.selectedSubject && item.topic === state.selectedTopic);
  if (!record) return;

  const lesson = record.lesson || {};
  const points = (lesson.key_points || []).map((point) => `<li>${point}</li>`).join('');
  const questions = (record.practice_questions || []).map((item) => `<div class="question-link"><span>${item.question}</span></div>`).join('');

  function formatWorkedExampleHtml(example) {
    if (!example) return '';
    if (typeof example === 'string') return `<p>${example.replace(/\n/g, '<br>')}</p>`;
    if (typeof example === 'object') {
      let html = '';
      if (example.problem) html += `<div style="margin-bottom: 8px;"><strong>Problem:</strong><br>${example.problem.replace(/\n/g, '<br>')}</div>`;
      if (example.step_by_step_solution) html += `<div style="margin-bottom: 8px;"><strong>Step-by-Step Solution:</strong><br>${example.step_by_step_solution.replace(/\n/g, '<br>')}</div>`;
      if (example.answer) html += `<div><strong>Final Answer:</strong><br>${example.answer.replace(/\n/g, '<br>')}</div>`;
      return html;
    }
    return `<p>${String(example)}</p>`;
  }

  const formattedExplanation = (lesson.core_explanation || '')
    .split(/\n\n+/)
    .map((p) => `<p style="margin-bottom: 12px; line-height: 1.6;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');

  const diagramHtml = record.diagram ? `
    <h2>Concept Diagram</h2>
    <div class="formula" style="overflow-x: auto; background: rgba(0,0,0,0.03); border-radius: 8px; padding: 12px; margin: 12px 0;">
      <strong>${record.diagram.title || 'Diagram'}</strong>
      ${record.diagram.ascii_art ? `<pre style="font-family: monospace; font-size: 13px; line-height: 1.4; overflow-x: auto; margin: 8px 0; padding: 8px; background: rgba(0,0,0,0.04); border-radius: 4px;">${record.diagram.ascii_art}</pre>` : ''}
      ${record.diagram.explanation ? `<p style="font-size: 13px; margin-top: 6px; color: var(--text-secondary);">${record.diagram.explanation}</p>` : ''}
    </div>
  ` : '';

  const mistakesHtml = (record.common_mistakes || []).length ? `
    <h2>Common Pitfalls & Exam Traps</h2>
    <ul class="steps" style="margin-bottom: 16px;">
      ${record.common_mistakes.map((m) => {
        if (typeof m === 'string') return `<li>${m}</li>`;
        if (m && typeof m === 'object') {
          return `<li style="margin-bottom: 8px;"><strong>Pitfall:</strong> ${m.mistake || ''}<br><span style="color: var(--primary, #0284c7);"><strong>Correction:</strong> ${m.correction || ''}</span></li>`;
        }
        return `<li>${m}</li>`;
      }).join('')}
    </ul>
  ` : '';

  const workedExampleHtml = formatWorkedExampleHtml(lesson.worked_example);

  document.querySelector('#topic-detail-content').innerHTML = `
    <h1>${record.topic}</h1>
    <p class="description" style="line-height: 1.6;">${lesson.introduction || ''}</p>
    <button class="primary-button" data-screen-target="learning">Start learning</button>
    <div class="detail-actions">
      <button class="outline-button" data-screen-target="ai">${icon('spark')} <span>Ask AI</span></button>
      <button class="outline-button" data-screen-target="quiz-question">${icon('quiz')} <span>Take quiz</span></button>
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
    <p style="font-size: 1.05rem; line-height: 1.6; margin-bottom: 16px;">${lesson.introduction || ''}</p>
    <h2>Core Explanation</h2>
    ${formattedExplanation}
    ${diagramHtml}
    ${workedExampleHtml ? `<div class="formula" style="margin: 16px 0;"><strong>WORKED EXAMPLE</strong>${workedExampleHtml}</div>` : ''}
    ${points ? `<h2>Key Points</h2><ul class="steps">${points}</ul>` : ''}
    ${mistakesHtml}
    ${lesson.why_it_matters ? `<h2>Why It Matters</h2><p style="line-height: 1.6;">${lesson.why_it_matters}</p>` : ''}
    ${lesson.study_tip ? `<div class="formula" style="margin-top: 16px;"><strong>STUDY TIP</strong><p>${lesson.study_tip}</p></div>` : ''}
  `;
}

function normalizeAnswer(value) {
  // Normalize answer text before comparing generated and stored answers.
  return String(value || '').trim().toLowerCase().replace(/[.?!]+$/, '');
}

function currentQuizQuestion() {
  // Return the question currently being answered or reviewed.
  return state.quizQuestions[state.quizIndex];
}

function updateQuizHeader(prefix, total) {
  // Keep progress text, topic label, and progress bar in sync.
  const questionNumber = state.quizIndex + 1;
  const progress = document.querySelector(`#${prefix}-progress`);
  const label = document.querySelector(`#${prefix}-topic-label`);
  const bar = document.querySelector(`[data-screen="${prefix === 'quiz' ? 'quiz-question' : 'quiz-result'}"] .progress i`);

  if (progress) progress.textContent = `${questionNumber} / ${total}`;
  if (label) label.textContent = `${state.selectedSubject} · ${state.selectedTopic}`;
  if (bar) bar.style.width = total > 0 ? `${(questionNumber / total) * 100}%` : '0%';
}

function renderQuizQuestion() {
  // Display the current question and its selectable answers.
  const question = currentQuizQuestion();
  if (!question) return;

  const total = state.quizQuestions.length;
  updateQuizHeader('quiz', total);
  document.querySelector('#quiz-question-text').textContent = question.question;

  const halfway = Math.floor(total / 2);
  document.querySelector('#quiz-encouragement').textContent = (total > 2 && state.quizIndex === halfway)
    ? 'You are halfway through. Keep going, you are doing well!'
    : '';

  document.querySelector('#answers').innerHTML = (question.options || []).map((option, index) => `
    <button class="answer" data-answer-index="${index}">
      <b>${String.fromCharCode(65 + index)}</b><span>${option.label}</span>
    </button>
  `).join('');
}

function shuffleArray(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function prepareQuizQuestions(rawQuestions, record) {
  if (!Array.isArray(rawQuestions) || !rawQuestions.length) return [];

  return rawQuestions.map((q) => {
    let options = Array.isArray(q.options) ? q.options.map((opt) => ({ ...opt })) : [];
    let questionText = q.question;
    let answerText = q.answer;
    let explanationText = q.explanation;

    // Check if this question uses the generic template with dummy options
    const hasGenericOptions = options.some((opt) => (
      opt.label.includes('unrelated to the topic') ||
      opt.label.includes('opposite meaning') ||
      opt.label.includes('applies only when the quantity is zero')
    ));

    if (hasGenericOptions && record) {
      const correctOpt = options.find((opt) => opt.is_correct) || options[0];
      answerText = correctOpt.label;

      const otherKeyPoints = (record.lesson?.key_points || [])
        .filter((kp) => kp !== answerText)
        .map((kp) => kp.replace(/[.]+$/, ''));

      const otherSubtopics = (record.subtopics || [])
        .filter((st) => st !== answerText)
        .map((st) => `A general rule of ${st}`);

      const distractors = [
        ...otherKeyPoints,
        `It only applies under hypothetical laboratory conditions`,
        `The inverse relationship is consistently observed`,
        `It varies inversely with the square of the quantity`,
        `It is defined solely for closed isolated systems`,
        ...otherSubtopics
      ];

      const newDistractors = [];
      for (const d of distractors) {
        if (d && d !== answerText && !newDistractors.includes(d)) {
          newDistractors.push(d);
          if (newDistractors.length === 3) break;
        }
      }

      questionText = `According to the lesson on ${record.topic}, which of the following is accurate?`;

      options = [
        { label: answerText, is_correct: true },
        { label: newDistractors[0] || 'It only applies under hypothetical conditions', is_correct: false },
        { label: newDistractors[1] || 'The inverse of this relationship is always observed', is_correct: false },
        { label: newDistractors[2] || 'It remains undefined for finite measurable values', is_correct: false }
      ];

      explanationText = `"${answerText}" is a core fact established in the study of ${record.topic}.`;
    }

    // Randomize option positions so Option A is not always the correct answer!
    const shuffledOptions = shuffleArray(options);

    return {
      ...q,
      question: questionText,
      answer: answerText,
      explanation: explanationText,
      options: shuffledOptions
    };
  });
}

function renderQuizResult(selectedIndex) {
  // Show the selected answer, correct answer, and explanatory feedback.
  const question = currentQuizQuestion();
  if (!question || !question.options) return;

  const correctIndex = question.options.findIndex((option) => (
    option.is_correct || normalizeAnswer(option.label) === normalizeAnswer(question.answer)
  ));
  const isCorrect = selectedIndex === correctIndex;
  const correctOption = question.options[correctIndex] || { label: question.answer };
  const selectedOption = question.options[selectedIndex] || { label: '' };
  const answers = document.querySelector('#result-answers');
  const feedback = document.querySelector('#quiz-feedback');

  updateQuizHeader('result', state.quizQuestions.length);
  document.querySelector('#result-question-text').textContent = question.question;
  answers.innerHTML = question.options.map((option, index) => {
    const className = index === correctIndex ? 'correct' : index === selectedIndex ? 'wrong' : 'muted';
    const marker = index === correctIndex ? icon('check') : index === selectedIndex ? icon('close') : String.fromCharCode(65 + index);
    return `<div class="answer ${className}"><b>${marker}</b><span>${option.label}</span></div>`;
  }).join('');

  feedback.className = `feedback ${isCorrect ? 'correct-feedback' : 'wrong-feedback'}`;
  feedback.querySelector('strong').textContent = isCorrect ? 'Correct!' : 'Not quite.';

  let explanationText = question.explanation || '';
  if (!explanationText || explanationText.includes('The lesson explicitly identifies this principle')) {
    explanationText = `In ${state.selectedTopic}, "${correctOption.label}" is a fundamental curriculum concept.`;
  }

  const explanationPara = feedback.querySelector('p');
  if (isCorrect) {
    explanationPara.innerHTML = `
      <span>Great job! <strong>${correctOption.label}</strong> is correct.</span>
      <br /><br />
      <span style="display: block; font-size: 13px; line-height: 1.5; color: var(--body);">${explanationText}</span>
    `;
  } else {
    explanationPara.innerHTML = `
      <span>The correct answer is: <strong>${correctOption.label}</strong>.</span>
      <br /><br />
      <span style="display: block; font-size: 13px; line-height: 1.5; color: var(--body);">${explanationText}</span>
    `;
  }

  const nextButton = document.querySelector('[data-screen="quiz-result"] .question-footer .primary-button');
  nextButton.textContent = state.quizIndex === state.quizQuestions.length - 1 ? 'See results' : 'Next question';
  nextButton.dataset.screenTarget = state.quizIndex === state.quizQuestions.length - 1 ? 'quiz-complete' : 'quiz-next';
}

function startQuiz() {
  // Reset quiz state, load, and prepare practice questions for the topic.
  const record = state.subjectRecords.find((item) => (
    item.subject === state.selectedSubject && item.topic === state.selectedTopic
  ));
  const rawQuestions = (record?.practice_questions || []).slice(0, 10);
  state.quizQuestions = prepareQuizQuestions(rawQuestions, record);
  state.quizIndex = 0;
  state.quizScore = 0;

  if (!state.quizQuestions.length) {
    document.querySelector('#quiz-question-text').textContent = 'No practice questions available for this topic yet.';
    document.querySelector('#answers').innerHTML = `
      <div class="empty-quiz-notice">
        <p>Check back soon or explore the lesson content to learn more about this topic.</p>
      </div>
    `;
    document.querySelector('#quiz-progress').textContent = '0 / 0';
    document.querySelector('#quiz-topic-label').textContent = `${state.selectedSubject} · ${state.selectedTopic}`;
    const bar = document.querySelector('[data-screen="quiz-question"] .progress i');
    if (bar) bar.style.width = '0%';
    document.querySelector('#quiz-encouragement').textContent = '';
    return;
  }

  renderQuizQuestion();
}

function advanceQuiz() {
  // Move to the next question and return to the question screen.
  state.quizIndex += 1;
  renderQuizQuestion();
  activateScreen('quiz-question');
}

function renderPromptList() {
  // Render the reusable AI prompt suggestions.
  const list = document.querySelector('#prompt-list');
  if (!list) return;
  list.innerHTML = prompts.map((prompt) => `<button class="prompt" data-prompt="${prompt}">${prompt}</button>`).join('');
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}

function updateAiStatusUi() {
  const statusEl = document.querySelector('#ai-status');
  fetch('/api/ai/status')
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!statusEl) return;
      if (data?.configured) {
        statusEl.innerHTML = `<span class="status-dot online"></span> Online AI ready (${escapeHtml(data.model || data.provider)})`;
      } else {
        statusEl.innerHTML = `<span class="status-dot offline"></span> Study engine active`;
      }
    })
    .catch(() => {
      if (statusEl) {
        statusEl.innerHTML = `<span class="status-dot offline"></span> Study engine active`;
      }
    });
}

function setupAiModal() {
  // Public API key configuration has been removed.
  // The administrator configures the online AI key directly on the server.
}

function extractBalancedBraces(str, startIndex) {
  let depth = 0;
  let start = -1;
  for (let i = startIndex; i < str.length; i++) {
    if (str[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (str[i] === '}') {
      depth--;
      if (depth === 0) {
        return { start, end: i, content: str.slice(start + 1, i) };
      }
    }
  }
  return null;
}

function renderMathLatex(tex) {
  let s = String(tex || '').trim();

  // Spacing
  s = s.replace(/\\(quad|qquad|,|;|!)/g, ' ');

  // Symbols and Greek letters
  const replacements = [
    [/\\pm\b/g, '&plusmn;'],
    [/\\mp\b/g, '&#8723;'],
    [/\\times\b/g, '&times;'],
    [/\\div\b/g, '&divide;'],
    [/\\cdot\b/g, '&sdot;'],
    [/\\leq?\b/g, '&le;'],
    [/\\geq?\b/g, '&ge;'],
    [/\\neq?\b/g, '&ne;'],
    [/\\approx\b/g, '&asymp;'],
    [/\\sim\b/g, '&sim;'],
    [/\\propto\b/g, '&prop;'],
    [/\\infin(ty)?\b/g, '&infin;'],
    [/\\(to|rightarrow)\b/g, '&rarr;'],
    [/\\(gets|leftarrow)\b/g, '&larr;'],
    [/\\leftrightarrow\b/g, '&harr;'],
    [/\\(Rightarrow|implies)\b/g, '&rArr;'],
    [/\\(Leftrightarrow|iff)\b/g, '&hArr;'],
    [/\\(degree|deg)\b/g, '&deg;'],
    [/\\int\b/g, '&int;'],
    [/\\sum\b/g, '&sum;'],
    [/\\prod\b/g, '&prod;'],
    [/\\in\b/g, '&isin;'],
    [/\\notin\b/g, '&notin;'],
    [/\\subset\b/g, '&sub;'],
    [/\\subseteq\b/g, '&sube;'],
    [/\\cup\b/g, '&cup;'],
    [/\\cap\b/g, '&cap;'],
    [/\\(empty|emptyset)\b/g, '&empty;'],
    [/\\forall\b/g, '&forall;'],
    [/\\exists\b/g, '&exist;'],
    [/\\therefore\b/g, '&there4;'],
    [/\\because\b/g, '&#8757;'],
    [/\\angle\b/g, '&ang;'],
    [/\\perp\b/g, '&perp;'],
    [/\\parallel\b/g, '&#8741;'],
    [/\\nabla\b/g, '&nabla;'],
    [/\\partial\b/g, '&part;'],
    [/\\Delta\b/g, '&Delta;'],
    [/\\Gamma\b/g, '&Gamma;'],
    [/\\Lambda\b/g, '&Lambda;'],
    [/\\Omega\b/g, '&Omega;'],
    [/\\Phi\b/g, '&Phi;'],
    [/\\Pi\b/g, '&Pi;'],
    [/\\Psi\b/g, '&Psi;'],
    [/\\Sigma\b/g, '&Sigma;'],
    [/\\Theta\b/g, '&Theta;'],
    [/\\Upsilon\b/g, '&Upsilon;'],
    [/\\Xi\b/g, '&Xi;'],
    [/\\alpha\b/g, '&alpha;'],
    [/\\beta\b/g, '&beta;'],
    [/\\gamma\b/g, '&gamma;'],
    [/\\delta\b/g, '&delta;'],
    [/\\epsilon\b/g, '&epsilon;'],
    [/\\zeta\b/g, '&zeta;'],
    [/\\eta\b/g, '&eta;'],
    [/\\theta\b/g, '&theta;'],
    [/\\iota\b/g, '&iota;'],
    [/\\kappa\b/g, '&kappa;'],
    [/\\lambda\b/g, '&lambda;'],
    [/\\mu\b/g, '&mu;'],
    [/\\nu\b/g, '&nu;'],
    [/\\xi\b/g, '&xi;'],
    [/\\pi\b/g, '&pi;'],
    [/\\rho\b/g, '&rho;'],
    [/\\sigma\b/g, '&sigma;'],
    [/\\tau\b/g, '&tau;'],
    [/\\upsilon\b/g, '&upsilon;'],
    [/\\phi\b/g, '&phi;'],
    [/\\chi\b/g, '&chi;'],
    [/\\psi\b/g, '&psi;'],
    [/\\omega\b/g, '&omega;'],
    [/\\mathbb\{R\}/g, 'ℝ'],
    [/\\mathbb\{N\}/g, 'ℕ'],
    [/\\mathbb\{Z\}/g, 'ℤ'],
    [/\\mathbb\{Q\}/g, 'ℚ'],
    [/\\mathbb\{C\}/g, 'ℂ']
  ];

  for (const [pattern, repl] of replacements) {
    s = s.replace(pattern, repl);
  }

  // Text inside math
  s = s.replace(/\\(text|mathrm)\{([^{}]+)\}/g, '<span class="math-text">$2</span>');
  s = s.replace(/\\mathbf\{([^{}]+)\}/g, '<strong>$1</strong>');
  s = s.replace(/\\mathit\{([^{}]+)\}/g, '<em>$1</em>');

  // Fractions with balanced braces
  function parseFractions(str) {
    let out = '';
    let i = 0;
    while (i < str.length) {
      const idx = str.indexOf('\\frac', i);
      if (idx === -1) {
        out += str.slice(i);
        break;
      }
      out += str.slice(i, idx);
      const first = extractBalancedBraces(str, idx + 5);
      if (!first) {
        out += '\\frac';
        i = idx + 5;
        continue;
      }
      const second = extractBalancedBraces(str, first.end + 1);
      if (!second) {
        out += '\\frac{' + first.content + '}';
        i = first.end + 1;
        continue;
      }
      const num = parseFractions(first.content);
      const den = parseFractions(second.content);
      out += `<span class="math-fraction"><span class="math-num">${num}</span><span class="math-den">${den}</span></span>`;
      i = second.end + 1;
    }
    return out;
  }
  s = parseFractions(s);

  // Square roots with balanced braces
  function parseRoots(str) {
    let out = '';
    let i = 0;
    while (i < str.length) {
      const idx = str.indexOf('\\sqrt', i);
      if (idx === -1) {
        out += str.slice(i);
        break;
      }
      out += str.slice(i, idx);
      let afterIdx = idx + 5;
      let rootDegree = '';
      if (str[afterIdx] === '[') {
        const closeBracket = str.indexOf(']', afterIdx);
        if (closeBracket !== -1) {
          rootDegree = str.slice(afterIdx + 1, closeBracket);
          afterIdx = closeBracket + 1;
        }
      }
      const brace = extractBalancedBraces(str, afterIdx);
      if (!brace) {
        out += str.slice(idx, afterIdx);
        i = afterIdx;
        continue;
      }
      const radicand = parseRoots(brace.content);
      if (rootDegree) {
        out += `<span class="math-sqrt"><sup class="math-root-index">${rootDegree}</sup><span class="math-rad">&radic;</span><span class="math-radicand">${radicand}</span></span>`;
      } else {
        out += `<span class="math-sqrt"><span class="math-rad">&radic;</span><span class="math-radicand">${radicand}</span></span>`;
      }
      i = brace.end + 1;
    }
    return out;
  }
  s = parseRoots(s);

  // Parentheses sizing commands \left( \right)
  s = s.replace(/\\left([(\[{|])/g, '$1').replace(/\\right([)\]}|])/g, '$1');

  // Degree ^\circ
  s = s.replace(/\^\\circ/g, '&deg;');
  // Powers and exponents: ^{...} or ^x
  s = s.replace(/\^\{([^{}]+)\}/g, '<sup>$1</sup>');
  s = s.replace(/\^([a-zA-Z0-9+\-]+)/g, '<sup>$1</sup>');

  // Subscripts: _{...} or _x
  s = s.replace(/_\{([^{}]+)\}/g, '<sub>$1</sub>');
  s = s.replace(/_([a-zA-Z0-9+\-]+)/g, '<sub>$1</sub>');

  // Clean unhandled backslashes on remaining letters
  s = s.replace(/\\([a-zA-Z]+)/g, '$1');

  return s;
}

function formatAiResponse(raw) {
  if (!raw) return '';
  let text = String(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const placeholders = [];
  function savePlaceholder(html) {
    const key = `___AI_PLACEHOLDER_${placeholders.length}___`;
    placeholders.push({ key, html });
    return key;
  }

  // 1. Code blocks ```lang\ncode\n```
  text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const cleanLang = lang.trim() || 'code';
    const escapedCode = escapeHtml(code.trimEnd());
    const cardHtml = `
      <div class="ai-code-block">
        <div class="ai-code-header">
          <span class="ai-code-lang">${cleanLang}</span>
          <button type="button" class="ai-code-copy-btn">Copy</button>
        </div>
        <pre><code class="language-${cleanLang}">${escapedCode}</code></pre>
      </div>
    `.trim();
    return savePlaceholder(cardHtml);
  });

  // 2. Display math blocks: $$ ... $$ or \[ ... \]
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (match, math) => {
    const rendered = renderMathLatex(escapeHtml(math));
    return savePlaceholder(`<div class="math-block" role="math">${rendered}</div>`);
  });
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (match, math) => {
    const rendered = renderMathLatex(escapeHtml(math));
    return savePlaceholder(`<div class="math-block" role="math">${rendered}</div>`);
  });

  // 3. Inline math: $...$ or \(...\)
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (match, math) => {
    const rendered = renderMathLatex(escapeHtml(math));
    return savePlaceholder(`<span class="math-inline" role="math">${rendered}</span>`);
  });
  text = text.replace(/(^|[^\\])\$([^\$\n]+?)\$/g, (match, prefix, math) => {
    const rendered = renderMathLatex(escapeHtml(math));
    return prefix + savePlaceholder(`<span class="math-inline" role="math">${rendered}</span>`);
  });

  function formatInline(str) {
    if (!str) return '';
    let s = str;
    // Inline code
    s = s.replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>');
    // Bold
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    // Italic
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/\b_([^_]+)_\b/g, '<em>$1</em>');
    // Strikethrough
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // Chemical formulas in plain text (e.g. H2O, CO2, CaCO3, H2SO4, KMnO4, CH4, O2, N2, etc.)
    s = s.replace(/\b([A-Z][a-z]?\d*(?:[A-Z][a-z]?\d*)+)\b/g, (full) => {
      const formulaRegex = /^([A-Z][a-z]?)(\d*)([A-Z][a-z]?)(\d*)([A-Z][a-z]?)?(\d*)?([A-Z][a-z]?)?(\d*)?$/;
      if (formulaRegex.test(full)) {
        return full.replace(/([A-Za-z])(\d+)/g, '$1<sub>$2</sub>');
      }
      return full;
    });
    // Single element diatomic or molecules: O2, N2, H2, Cl2
    s = s.replace(/\b([A-Z][a-z]?)([2-9])\b/g, '$1<sub>$2</sub>');

    // Units with exponents: m/s^2, cm^3, m^2, km/h, kg/m^3, s^-1
    s = s.replace(/([a-zA-Z]+)\^([0-9+\-]+)/g, '$1<sup>$2</sup>');
    // Algebraic powers: x^2, y^3
    s = s.replace(/\b([a-zA-Z])\^([0-9+\-]+)/g, '$1<sup>$2</sup>');
    // Subscripts: x_1, v_i, t_0
    s = s.replace(/\b([a-zA-Z])_([0-9a-zA-Z]+)\b/g, '$1<sub>$2</sub>');

    // Arrows and operators in text
    s = s.replace(/<->/g, '&#8596;');
    s = s.replace(/->/g, '&#8594;');
    s = s.replace(/=>/g, '&#8658;');
    s = s.replace(/\+\/-/g, '&plusmn;');
    s = s.replace(/\bdeg\s*C\b/gi, '&deg;C');

    return s;
  }

  // 4. Markdown tables
  const lines = text.split('\n');
  const processedLines = [];
  let i = 0;

  function isTableDelimiter(line) {
    if (!line) return false;
    const trimmed = line.trim();
    return /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(trimmed);
  }

  function parseTableRow(line) {
    let cells = line.trim();
    if (cells.startsWith('|')) cells = cells.slice(1);
    if (cells.endsWith('|')) cells = cells.slice(0, -1);
    return cells.split('|').map((c) => c.trim());
  }

  while (i < lines.length) {
    const line = lines[i];
    if (i + 1 < lines.length && line.includes('|') && isTableDelimiter(lines[i + 1])) {
      const headerCells = parseTableRow(line);
      const delimCells = parseTableRow(lines[i + 1]);
      const alignments = delimCells.map((d) => {
        const left = d.startsWith(':');
        const right = d.endsWith(':');
        if (left && right) return 'center';
        if (right) return 'right';
        if (left) return 'left';
        return 'left';
      });

      const bodyRows = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        bodyRows.push(parseTableRow(lines[i]));
        i++;
      }

      let tableHtml = '<div class="ai-table-wrap"><table class="ai-table"><thead><tr>';
      headerCells.forEach((th, idx) => {
        const align = alignments[idx] || 'left';
        tableHtml += `<th style="text-align:${align}">${formatInline(th)}</th>`;
      });
      tableHtml += '</tr></thead><tbody>';

      bodyRows.forEach((row) => {
        tableHtml += '<tr>';
        row.forEach((td, idx) => {
          const align = alignments[idx] || 'left';
          tableHtml += `<td style="text-align:${align}">${formatInline(td)}</td>`;
        });
        tableHtml += '</tr>';
      });
      tableHtml += '</tbody></table></div>';

      processedLines.push(savePlaceholder(tableHtml));
      continue;
    }
    processedLines.push(line);
    i++;
  }
  text = processedLines.join('\n');

  // 5. Block elements: Headings, Blockquotes, HR, Lists
  const blockLines = text.split('\n');
  const resultBlocks = [];
  let currentList = null;

  function flushList() {
    if (!currentList) return;
    const tag = currentList.type;
    const itemsHtml = currentList.items.map((it) => `<li>${formatInline(it)}</li>`).join('');
    resultBlocks.push(`<${tag} class="ai-list">${itemsHtml}</${tag}>`);
    currentList = null;
  }

  for (let j = 0; j < blockLines.length; j++) {
    const rawLine = blockLines[j];
    const line = rawLine.trim();

    if (!line) {
      flushList();
      continue;
    }

    if (/^___AI_PLACEHOLDER_\d+___$/.test(line)) {
      flushList();
      resultBlocks.push(line);
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flushList();
      resultBlocks.push('<hr class="ai-hr">');
      continue;
    }

    if (/^####\s+(.+)$/.test(line)) {
      flushList();
      resultBlocks.push(`<h4>${formatInline(line.replace(/^####\s+/, ''))}</h4>`);
      continue;
    }
    if (/^###\s+(.+)$/.test(line)) {
      flushList();
      resultBlocks.push(`<h3>${formatInline(line.replace(/^###\s+/, ''))}</h3>`);
      continue;
    }
    if (/^##\s+(.+)$/.test(line)) {
      flushList();
      resultBlocks.push(`<h2>${formatInline(line.replace(/^##\s+/, ''))}</h2>`);
      continue;
    }
    if (/^#\s+(.+)$/.test(line)) {
      flushList();
      resultBlocks.push(`<h1>${formatInline(line.replace(/^#\s+/, ''))}</h1>`);
      continue;
    }

    if (/^>\s*(.+)$/.test(line)) {
      flushList();
      const quoteText = line.replace(/^>\s*/, '');
      resultBlocks.push(`<blockquote class="ai-quote">${formatInline(quoteText)}</blockquote>`);
      continue;
    }

    const ulMatch = line.match(/^[-*•+]\s+(.+)$/);
    if (ulMatch) {
      if (currentList && currentList.type !== 'ul') flushList();
      if (!currentList) currentList = { type: 'ul', items: [] };
      currentList.items.push(ulMatch[1]);
      continue;
    }

    const olMatch = line.match(/^(\d+)[.)]\s+(.+)$/);
    if (olMatch) {
      if (currentList && currentList.type !== 'ol') flushList();
      if (!currentList) currentList = { type: 'ol', items: [] };
      currentList.items.push(olMatch[2]);
      continue;
    }

    flushList();
    resultBlocks.push(`<p>${formatInline(line)}</p>`);
  }

  flushList();

  let finalHtml = resultBlocks.join('\n');

  // Restore placeholders
  for (const item of placeholders) {
    finalHtml = finalHtml.replaceAll(item.key, item.html);
  }

  return finalHtml;
}

function renderAiChat(question, answer, meta = {}) {
  const chatArea = document.querySelector('.chat-area');
  if (!chatArea) return;

  const container = document.querySelector('#ai-chat-log');
  if (!container) {
    const newContainer = document.createElement('div');
    newContainer.id = 'ai-chat-log';
    newContainer.className = 'chat-log';
    chatArea.prepend(newContainer);
  }

  const log = document.querySelector('#ai-chat-log');
  if (!log) return;

  // Remove temporary thinking bubble if present
  const loadingBubble = document.querySelector('#ai-loading-bubble');
  if (loadingBubble) loadingBubble.remove();

  // If question was already rendered (e.g. while thinking), keep it; otherwise append it
  const pendingQuestion = log.querySelector('.user-message[data-pending="true"]');
  if (pendingQuestion) {
    pendingQuestion.removeAttribute('data-pending');
  } else {
    const questionNode = document.createElement('div');
    questionNode.className = 'chat-message user-message';
    questionNode.textContent = question;
    log.append(questionNode);
  }

  const answerNode = document.createElement('div');
  answerNode.className = 'chat-message ai-message';

  const sourceBadge = meta.online
    ? `<span class="ai-badge-source online">Online · ${escapeHtml(meta.model || 'AI')}</span>`
    : `<span class="ai-badge-source offline">Offline Tutor</span>`;

  let noticeHtml = '';
  if (!meta.online && meta.onlineError) {
    noticeHtml = `
      <div class="ai-fallback-notice">
        ℹ️ <em>Online AI unavailable (${escapeHtml(meta.onlineError)}).</em> Switched to offline curriculum intelligence.
      </div>
    `;
  }

  answerNode.innerHTML = `
    <div class="ai-answer-header">
      <span class="ai-answer-title">
        <svg class="icon" viewBox="0 0 24 24" style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;" aria-hidden="true"><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z"/></svg>
        AI Tutor
      </span>
      ${sourceBadge}
    </div>
    <div class="ai-answer-body">${formatAiResponse(answer)}</div>
    ${noticeHtml}
  `;

  log.append(answerNode);

  const currentPromptList = document.querySelector('#prompt-list');
  if (currentPromptList) currentPromptList.style.display = 'none';

  const label = document.querySelector('.try-label');
  if (label) label.style.display = 'none';

  // Smooth scroll to the answer
  setTimeout(() => {
    answerNode.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 40);
}

async function askAiTutor() {
  const input = document.querySelector('.chat-input span');
  const submitButton = document.querySelector('.chat-input button');
  const status = document.querySelector('#ai-status');
  const placeholder = 'Ask about anything you\'re studying...';
  const rawPrompt = input ? input.textContent.trim() : '';
  const promptText = rawPrompt && rawPrompt !== placeholder ? rawPrompt : 'Explain this topic in a simple way for a high school student';
  const question = promptText;

  // Immediately display user message and thinking indicator in the chat
  const chatArea = document.querySelector('.chat-area');
  if (chatArea) {
    const welcome = document.querySelector('#ai-welcome-msg');
    if (welcome) welcome.style.display = 'none';

    let log = document.querySelector('#ai-chat-log');
    if (!log) {
      log = document.createElement('div');
      log.id = 'ai-chat-log';
      log.className = 'chat-log';
      chatArea.prepend(log);
    }
    const qNode = document.createElement('div');
    qNode.className = 'chat-message user-message';
    qNode.dataset.pending = 'true';
    qNode.textContent = question;

    const loadingNode = document.createElement('div');
    loadingNode.id = 'ai-loading-bubble';
    loadingNode.className = 'chat-message ai-message ai-loading-bubble';
    loadingNode.innerHTML = `
      <div class="ai-loading-dots">
        <span></span><span></span><span></span>
      </div>
      <span class="ai-loading-text">AI Tutor is thinking...</span>
    `;
    log.append(qNode, loadingNode);
    loadingNode.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  if (submitButton) submitButton.disabled = true;
  if (status) status.innerHTML = '<span class="status-dot offline"></span> Thinking...';

  try {
    const result = await askTutor(question, {
      subject: state.selectedSubject,
      topic: state.selectedTopic,
      records: state.subjectRecords,
      previous: state.tutorContext
    });
    state.tutorContext = result.context || state.tutorContext;
    renderAiChat(question, result.answer, result);
    if (status) {
      if (result.online) {
        status.innerHTML = `<span class="status-dot online"></span> Answered by Online AI (${escapeHtml(result.model || 'live')})`;
      } else if (result.onlineError) {
        status.innerHTML = `<span class="status-dot offline"></span> Offline Tutor (Online AI: ${escapeHtml(result.onlineError)})`;
      } else {
        status.innerHTML = `<span class="status-dot offline"></span> Answered by offline curriculum tutor`;
      }
    }
  } catch (err) {
    const loadingBubble = document.querySelector('#ai-loading-bubble');
    if (loadingBubble) loadingBubble.remove();
    renderAiChat(question, 'Sorry, something went wrong while getting the answer. Please try again.', { online: false, onlineError: err?.message || 'Error' });
  } finally {
    if (submitButton) submitButton.disabled = false;
  }

  if (input) {
    input.textContent = placeholder;
    input.style.color = '#6a7282';
  }

  activateScreen('ai');
}

function renderQuizComplete() {
  // Update the final score and summary after the last question.
  const score = document.querySelector('#quiz-score');
  const summary = document.querySelector('#quiz-summary');
  const total = state.quizQuestions.length || 10;
  if (score) score.textContent = `${state.quizScore}/${total}`;
  if (summary) summary.textContent = `You scored ${state.quizScore} out of ${total}.`;

  // Persist score to server if user is logged in
  if (state.user && state.selectedSubject && state.selectedTopic && total > 0) {
    saveProgress(state.selectedSubject, state.selectedTopic, state.quizScore, total).catch(() => {});
  }
}

function activateScreen(target) {
  // If attempting to activate login or signup, redirect to dedicated auth page
  if (target === 'login' || target === 'signup') {
    window.location.href = `./auth.html?mode=${target}`;
    return;
  }

  // Toggle screen visibility, navigation state, and auth navigation rules.
  const resolved = screenAliases[target] || target;

  document.querySelectorAll('.screen').forEach((screen) => {
    screen.classList.toggle('active', screen.dataset.screen === resolved);
  });

  document.querySelectorAll('.bottom-nav button').forEach((button) => {
    const isActive = button.dataset.screenTarget === resolved || (resolved === 'topics' && button.dataset.screenTarget === 'subjects');
    button.classList.toggle('active', isActive);
  });

  const bottomNav = document.querySelector('.bottom-nav');
  if (bottomNav) {
    bottomNav.classList.toggle('is-hidden', resolved === 'signup' || resolved === 'login');
  }
}

function updateAuthUi() {
  const greetingText = document.querySelector('#home-greeting-text');
  const authBtn = document.querySelector('#home-auth-btn');

  const hour = new Date().getHours();
  let timeGreeting = 'Good evening';
  if (hour < 12) timeGreeting = 'Good morning';
  else if (hour < 17) timeGreeting = 'Good afternoon';

  if (state.user) {
    if (greetingText) greetingText.textContent = `${timeGreeting}, ${state.user.name}`;
    if (authBtn) {
      authBtn.textContent = 'Sign out';
      authBtn.dataset.screenTarget = 'logout';
    }
  } else {
    if (greetingText) greetingText.textContent = timeGreeting;
    if (authBtn) {
      authBtn.textContent = 'Log in';
      authBtn.dataset.screenTarget = 'login';
    }
  }
}

function loadCatalog() {
  // Load the live catalog, falling back to the cached catalog on failure.
  const catalogPath = `/api/catalog?t=${Date.now()}`;

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
      if (state.topics.length === 0 && state.subjectRecords.length > 0) {
        state.selectedSubject = state.subjectRecords[0].subject;
        state.topics = [...new Set(state.subjectRecords.filter((record) => record.subject === state.selectedSubject).map((record) => record.topic))];
      }
      if (!state.topics.includes(state.selectedTopic) && state.topics.length > 0) {
        state.selectedTopic = state.topics[0];
      }
      renderSubjects();
    })
    .catch(() => loadCachedCatalog());
}

function loadCachedCatalog() {
  // Load the bundled JSON catalog when the API cannot be reached.
  const catalogPath = `/subjects.json?t=${Date.now()}`;

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
      if (state.topics.length === 0 && state.subjectRecords.length > 0) {
        state.selectedSubject = state.subjectRecords[0].subject;
        state.topics = [...new Set(state.subjectRecords.filter((record) => record.subject === state.selectedSubject).map((record) => record.topic))];
      }
      if (!state.topics.includes(state.selectedTopic) && state.topics.length > 0) {
        state.selectedTopic = state.topics[0];
      }
      renderSubjects();
    })
    .catch(() => {
      state.subjectRecords = [];
      state.subjects = fallbackSubjects;
      state.topics = fallbackTopics;
      renderSubjects();
    });
}

async function handleLogout() {
  try {
    await logoutUser();
  } catch {
    // Continue local cleanup even if offline
  }
  clearAuth();
  sessionStorage.removeItem('study_guest_mode');
  state.authToken = null;
  state.user = null;
  state.userProgress = [];
  window.location.replace('./auth.html?mode=login&status=signed_out');
}

function onRouteClick(event) {
  // Handle delegated navigation clicks and update selected content.
  const route = event.target.closest('[data-screen-target]');
  if (!route) return;

  event.preventDefault();

  if (route.dataset.screenTarget === 'logout') {
    handleLogout();
    return;
  }

  if (route.dataset.screenTarget === 'login') {
    window.location.href = './auth.html?mode=login';
    return;
  }

  if (route.dataset.screenTarget === 'signup') {
    window.location.href = './auth.html?mode=signup';
    return;
  }

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
  // Score the selected answer and show its result screen.
  const answer = event.target.closest('[data-answer-index]');
  if (!answer) return;
  const question = currentQuizQuestion();
  if (!question || !question.options) return;

  const selectedIndex = Number(answer.dataset.answerIndex);
  const correctIndex = question.options.findIndex((option) => (
    option.is_correct || normalizeAnswer(option.label) === normalizeAnswer(question.answer)
  ));
  if (selectedIndex === correctIndex) state.quizScore += 1;
  renderQuizResult(selectedIndex);
  activateScreen('quiz-result');
}

function onPromptClick(event) {
  // Place a suggested question in the AI input and open the tutor.
  const prompt = event.target.closest('[data-prompt]');
  if (!prompt) return;

  const input = document.querySelector('.chat-input span');
  if (input) {
    input.textContent = prompt.dataset.prompt;
    input.style.color = 'var(--ink)';
  }
  activateScreen('ai');
}

function onAiSubmit(event) {
  const button = event.target.closest('.chat-input button');
  if (!button) return;

  askAiTutor();
}

async function onLoginSubmit(event) {
  // Authenticate an existing user.
  const form = event.target.closest('#login-form');
  if (!form) return;

  event.preventDefault();
  const submitButton = form.querySelector('button[type="submit"]');
  const message = form.querySelector('#login-message');
  const formData = new FormData(form);
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');

  message.textContent = '';
  message.className = 'form-message';
  submitButton.disabled = true;
  submitButton.textContent = 'Logging in...';

  try {
    const result = await loginUser(email, password);
    saveToken(result.token);
    saveUser(result.user);
    state.authToken = result.token;
    state.user = result.user;
    updateAuthUi();
    form.reset();
    activateScreen('home');

    // Load user's saved progress
    fetchProgress().then((data) => {
      state.userProgress = data?.progress || [];
    }).catch(() => {});
  } catch (error) {
    message.textContent = error.message || 'Invalid email or password.';
    message.className = 'form-message error';
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Log in';
  }
}

async function onSignupSubmit(event) {
  // Validate, submit, and persist a newly created account session.
  const form = event.target.closest('#signup-form');
  if (!form) return;

  event.preventDefault();
  const submitButton = form.querySelector('button[type="submit"]');
  const message = form.querySelector('#signup-message');
  const formData = new FormData(form);
  const name = String(formData.get('name') || '').trim();
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');

  message.textContent = '';
  message.className = 'form-message';
  submitButton.disabled = true;
  submitButton.textContent = 'Creating account...';

  try {
    const result = await registerUser(name, email, password);
    saveToken(result.token);
    saveUser(result.user);
    state.authToken = result.token;
    state.user = result.user;
    updateAuthUi();
    form.reset();
    activateScreen('home');
  } catch (error) {
    message.textContent = error.message || 'We could not create your account. Please try again.';
    message.className = 'form-message error';
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Create account';
  }
}

function onSearchInput(event) {
  // Route each search field to the renderer for its screen.
  const input = event.target.closest('[data-search-scope]');
  if (!input) return;

  if (input.dataset.searchScope === 'home') renderHomeSubjects(input.value);
  if (input.dataset.searchScope === 'subjects') renderSubjectList(input.value);
  if (input.dataset.searchScope === 'topics') renderTopics(input.value);
}

function setupChatInput() {
  const input = document.querySelector('.chat-input span');
  const placeholder = 'Ask about anything you\'re studying...';
  if (!input) return;

  input.addEventListener('focus', () => {
    if (input.textContent.trim() === placeholder) {
      input.textContent = '';
      input.style.color = 'var(--ink)';
    }
  });

  input.addEventListener('blur', () => {
    if (!input.textContent.trim()) {
      input.textContent = placeholder;
      input.style.color = '#6a7282';
    }
  });
}

function checkFirstTimeUser() {
  const urlParams = new URLSearchParams(window.location.search);
  // Support ?reset=1 to easily test first-time onboarding anytime
  if (urlParams.get('reset') === '1') {
    localStorage.removeItem('study_has_visited');
    clearAuth();
  }

  const token = getToken();
  const isGuest = sessionStorage.getItem('study_guest_mode') === 'true';

  // If user is not logged in and not in active guest mode, start on the sign up screen:
  if (!token && !isGuest) {
    window.location.replace('./auth.html');
    return false;
  }
  return true;
}

function initializeApp() {
  // Check if first-time user before initializing home screen
  if (!checkFirstTimeUser()) {
    return;
  }

  // Set initial state, register delegated events, and start data loading.
  state.subjects = fallbackSubjects;
  state.topics = fallbackTopics;
  state.selectedSubject = 'Mathematics';
  state.selectedTopic = 'Logic';

  renderSubjects();
  renderPromptList();
  setupChatInput();
  setupAiModal();
  updateAiStatusUi();

  const app = document.querySelector('#app');
  const handleClick = (event) => {
    onRouteClick(event);
    onAnswerClick(event);
    onPromptClick(event);
    onAiSubmit(event);

    const copyBtn = event.target.closest('.ai-code-copy-btn');
    if (copyBtn) {
      const codeEl = copyBtn.closest('.ai-code-block')?.querySelector('code');
      if (codeEl && navigator.clipboard) {
        navigator.clipboard.writeText(codeEl.textContent || '').then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
        }).catch(() => {
          copyBtn.textContent = 'Failed';
          setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
        });
      }
    }
  };

  if (app) app.addEventListener('click', handleClick);

  document.addEventListener('keydown', (event) => {
    const input = event.target.closest('.chat-input span');
    if (!input) return;

    if (event.key === 'Enter') {
      event.preventDefault();
      askAiTutor();
    }
  });

  document.addEventListener('submit', (event) => {
    if (event.target.id === 'login-form') onLoginSubmit(event);
    if (event.target.id === 'signup-form') onSignupSubmit(event);
  });

  document.addEventListener('input', onSearchInput);

  document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
  activateScreen('home');

  // Restore authenticated session and user if stored
  const token = getToken();
  const cachedUser = getUser();
  if (token) {
    state.authToken = token;
    state.user = cachedUser;
    updateAuthUi();

    // Verify session with server and sync fresh user profile and progress
    fetchCurrentUser()
      .then((data) => {
        state.user = data.user;
        saveUser(data.user);
        updateAuthUi();
        return fetchProgress();
      })
      .then((data) => {
        state.userProgress = data?.progress || [];
      })
      .catch(() => {
        // If session expired or invalid on server, clear credentials
        clearAuth();
        state.authToken = null;
        state.user = null;
        state.userProgress = [];
        updateAuthUi();
      });
  } else {
    updateAuthUi();
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }

  loadCatalog();
}

initializeApp();
