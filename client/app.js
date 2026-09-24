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

  document.querySelector('#topic-detail-content').innerHTML = `
    <h1>${record.topic}</h1>
    <p class="description">${lesson.introduction || ''}</p>
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

const PROVIDER_HINTS = {
  gemini: 'Get a free key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a>.',
  groq: 'Get a free key from <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">Groq Console</a>.',
  openai: 'Get a key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">OpenAI Platform</a>.',
  openrouter: 'Get a key from <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">OpenRouter</a>.',
  custom: 'Enter your custom OpenAI-compatible API URL and Model name.'
};

function updateAiStatusUi() {
  const statusEl = document.querySelector('#ai-status');
  fetch('/api/ai/status')
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!statusEl) return;
      if (data?.configured) {
        statusEl.innerHTML = `<span class="status-dot online"></span> Online AI ready (${escapeHtml(data.model || data.provider)}) · <button type="button" class="inline-link-btn ai-open-settings-action">Settings</button>`;
      } else {
        statusEl.innerHTML = `<span class="status-dot offline"></span> Offline tutor active · <button type="button" class="inline-link-btn ai-open-settings-action">Add API Key</button>`;
      }
    })
    .catch(() => {
      if (statusEl) {
        statusEl.innerHTML = `<span class="status-dot offline"></span> Offline study engine active`;
      }
    });
}

function openAiModal() {
  const modal = document.querySelector('#ai-modal');
  if (!modal) return;
  const msg = document.querySelector('#ai-config-message');
  if (msg) {
    msg.textContent = '';
    msg.className = 'form-message';
  }

  fetch('/api/ai/status')
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data) return;
      const providerSelect = document.querySelector('#ai-provider-select');
      const keyInput = document.querySelector('#ai-key-input');
      const customUrl = document.querySelector('#ai-custom-url');
      const customModel = document.querySelector('#ai-custom-model');

      if (providerSelect && data.provider) {
        providerSelect.value = data.provider;
        syncProviderFields(data.provider);
      }
      if (keyInput) {
        keyInput.value = '';
        if (data.maskedKey) {
          keyInput.placeholder = `Active key: ${data.maskedKey} (leave empty to keep)`;
        } else {
          keyInput.placeholder = 'Paste your API key here...';
        }
      }
      if (customUrl && data.url) customUrl.value = data.url;
      if (customModel && data.model) customModel.value = data.model;
    })
    .catch(() => {});

  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
}

function closeAiModal() {
  const modal = document.querySelector('#ai-modal');
  if (!modal) return;
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
}

function syncProviderFields(provider) {
  const customUrlGroup = document.querySelector('#ai-custom-url-group');
  const customModelGroup = document.querySelector('#ai-custom-model-group');
  const hint = document.querySelector('#ai-provider-hint');

  const isCustom = provider === 'custom';
  if (customUrlGroup) customUrlGroup.style.display = isCustom ? 'block' : 'none';
  if (customModelGroup) customModelGroup.style.display = isCustom ? 'block' : 'none';
  if (hint) hint.innerHTML = PROVIDER_HINTS[provider] || PROVIDER_HINTS.gemini;
}

function setupAiModal() {
  const openBtn = document.querySelector('#ai-settings-btn');
  const closeBtn = document.querySelector('#ai-modal-close');
  const backdrop = document.querySelector('#ai-modal-backdrop');
  const providerSelect = document.querySelector('#ai-provider-select');
  const keyToggle = document.querySelector('#ai-key-toggle');
  const keyInput = document.querySelector('#ai-key-input');
  const form = document.querySelector('#ai-config-form');
  const clearBtn = document.querySelector('#ai-clear-btn');
  const msg = document.querySelector('#ai-config-message');
  const saveBtn = document.querySelector('#ai-save-btn');

  if (openBtn) openBtn.addEventListener('click', openAiModal);
  if (closeBtn) closeBtn.addEventListener('click', closeAiModal);
  if (backdrop) backdrop.addEventListener('click', closeAiModal);

  document.addEventListener('click', (e) => {
    if (e.target.closest('.ai-open-settings-action') || e.target.id === 'ai-status-config-link') {
      e.preventDefault();
      openAiModal();
    }
  });

  if (providerSelect) {
    providerSelect.addEventListener('change', (e) => {
      syncProviderFields(e.target.value);
    });
  }

  if (keyToggle && keyInput) {
    keyToggle.addEventListener('click', () => {
      const isPassword = keyInput.type === 'password';
      keyInput.type = isPassword ? 'text' : 'password';
      keyToggle.textContent = isPassword ? '🔒' : '👁️';
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      if (msg) {
        msg.textContent = 'Clearing key...';
        msg.className = 'form-message';
      }
      try {
        const res = await requestJson('/api/ai/config', {
          method: 'POST',
          body: JSON.stringify({ key: '' })
        });
        if (msg) {
          msg.textContent = res.message || 'Key cleared. Switched to offline tutor.';
          msg.className = 'form-message success';
        }
        if (keyInput) {
          keyInput.value = '';
          keyInput.placeholder = 'Paste your API key here...';
        }
        updateAiStatusUi();
        setTimeout(closeAiModal, 1200);
      } catch (err) {
        if (msg) {
          msg.textContent = err.message || 'Failed to clear key.';
          msg.className = 'form-message error';
        }
      }
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const provider = providerSelect ? providerSelect.value : 'gemini';
      const key = keyInput ? keyInput.value.trim() : '';
      const customUrl = document.querySelector('#ai-custom-url')?.value.trim();
      const customModel = document.querySelector('#ai-custom-model')?.value.trim();

      if (!key) {
        if (msg) {
          msg.textContent = 'Please enter an API key to test and save, or click "Clear Key".';
          msg.className = 'form-message error';
        }
        return;
      }

      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Testing connection...';
      }
      if (msg) {
        msg.textContent = 'Connecting to provider and verifying API key...';
        msg.className = 'form-message';
      }

      try {
        const payload = { provider, key };
        if (provider === 'custom') {
          payload.url = customUrl;
          payload.model = customModel;
        }

        const res = await requestJson('/api/ai/config', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (msg) {
          msg.textContent = res.message || 'Online AI verified and ready!';
          msg.className = 'form-message success';
        }
        updateAiStatusUi();
        setTimeout(closeAiModal, 1200);
      } catch (err) {
        if (msg) {
          msg.textContent = err.message || 'Could not verify API key.';
          msg.className = 'form-message error';
        }
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Test & Save';
        }
      }
    });
  }
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

  const questionNode = document.createElement('div');
  questionNode.className = 'chat-message user-message';
  questionNode.textContent = question;

  const answerNode = document.createElement('div');
  answerNode.className = 'chat-message ai-message';

  const sourceBadge = meta.online
    ? `<span class="ai-badge-source online">Online · ${escapeHtml(meta.model || 'AI')}</span>`
    : `<span class="ai-badge-source offline">Offline Tutor</span>`;

  let noticeHtml = '';
  if (!meta.online && meta.onlineError) {
    noticeHtml = `
      <div class="ai-fallback-notice">
        ℹ️ <em>Online AI unavailable (${escapeHtml(meta.onlineError)}).</em> Switched to offline curriculum intelligence. <button type="button" class="inline-link-btn ai-open-settings-action">Configure AI key</button>
      </div>
    `;
  }

  answerNode.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
      <strong>AI Tutor</strong>
      ${sourceBadge}
    </div>
    <div class="ai-answer-body"></div>
    ${noticeHtml}
  `;

  answerNode.querySelector('.ai-answer-body').append(document.createTextNode(answer));

  log.append(questionNode, answerNode);

  const currentPromptList = document.querySelector('#prompt-list');
  if (currentPromptList) currentPromptList.style.display = 'none';

  const label = document.querySelector('.try-label');
  if (label) label.textContent = 'RECENT ANSWER';
}

async function askAiTutor() {
  const input = document.querySelector('.chat-input span');
  const submitButton = document.querySelector('.chat-input button');
  const status = document.querySelector('#ai-status');
  const placeholder = 'Ask about anything you\'re studying...';
  const rawPrompt = input ? input.textContent.trim() : '';
  const promptText = rawPrompt && rawPrompt !== placeholder ? rawPrompt : 'Explain this topic in a simple way for a high school student';
  const question = promptText;

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
        status.innerHTML = `<span class="status-dot online"></span> Answered by Online AI (${escapeHtml(result.model || 'live')}) · <button type="button" class="inline-link-btn ai-open-settings-action">Settings</button>`;
      } else if (result.onlineError) {
        status.innerHTML = `<span class="status-dot offline"></span> Offline Tutor (Online AI: ${escapeHtml(result.onlineError)}) · <button type="button" class="inline-link-btn ai-open-settings-action">Fix Key</button>`;
      } else {
        status.innerHTML = `<span class="status-dot offline"></span> Answered by offline curriculum tutor`;
      }
    }
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
  // Load the bundled JSON catalog when the API cannot be reached.
  const catalogPath = '/subjects.json';

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

async function handleLogout() {
  try {
    await logoutUser();
  } catch {
    // Continue local cleanup even if offline
  }
  clearAuth();
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

  const hasVisited = localStorage.getItem('study_has_visited');
  const token = getToken();

  // If first-time user (has not visited before and has no active login session),
  // open the dedicated auth page:
  if (!hasVisited && !token) {
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
