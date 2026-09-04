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
let subjects = fallbackSubjects;
let subjectRecords = [];
let topics = fallbackTopics;
let selectedSubject = 'Mathematics';
let selectedTopic = 'Logic';

const subjectCard = ([name, count, color, icon]) => `<button class="subject-card ${color}" data-subject="${name}" data-screen-target="topics"><span class="subject-icon">${icon}</span><span class="subject-copy"><strong>${name}</strong><small>${count}</small></span></button>`;
const subjectRow = ([name, count, color, icon], target) => `<button class="large-subject-row" data-subject="${name}" data-screen-target="${target}"><span class="row-icon ${color}">${icon}</span><span class="row-copy"><strong>${name}</strong><small>${count}</small></span><span class="chevron">›</span></button>`;

function renderSubjects() {
  document.querySelector('#home-subject-grid').innerHTML = subjects.map(subjectCard).join('');
  document.querySelector('#subjects-list').innerHTML = subjects.map((subject) => subjectRow(subject, 'topics')).join('');
  document.querySelector('#quiz-subjects-list').innerHTML = subjects.map((subject) => subjectRow(subject, 'quiz-topics')).join('');
  renderTopics();
}

function renderTopics() {
  document.querySelector('#quiz-topics-list').innerHTML = topics.map((topic, index) => `<button class="topic-row" data-topic="${topic}" data-screen-target="quiz-question"><span class="topic-number">${String(index + 1).padStart(2, '0')}</span><span class="row-copy"><strong>${topic}</strong><small>Course content and practice questions</small></span><span class="chevron">›</span></button>`).join('');
  document.querySelector('#topic-list').innerHTML = topics.map((topic, index) => `<button class="topic-row" data-topic="${topic}" data-screen-target="topic-detail"><span class="topic-number">${String(index + 1).padStart(2, '0')}</span><span class="row-copy"><strong>${topic}</strong><small>${subjectRecords.find((record) => record.subject === selectedSubject && record.topic === topic)?.lesson?.introduction || 'Course content and practice questions'}</small></span><span class="chevron">›</span></button>`).join('');
  document.querySelector('.topic-heading h1').textContent = selectedSubject;
  document.querySelector('.topic-heading p').textContent = `${topics.length} topics`;
}

function renderLesson() {
  const record = subjectRecords.find((item) => item.subject === selectedSubject && item.topic === selectedTopic);
  if (!record) return;
  const lesson = record.lesson || {};
  const points = (lesson.key_points || []).map((point) => `<li>${point}</li>`).join('');
  const questions = (record.practice_questions || []).map((item) => `<div class="question-link"><span>${item.question}</span></div>`).join('');
  document.querySelector('#topic-detail-content').innerHTML = `<h1>${record.topic}</h1><p class="description">${lesson.introduction || ''}</p><button class="primary-button" data-screen-target="learning">Start learning</button><div class="detail-actions"><button class="outline-button" data-screen-target="ai">▢ <span>Ask AI</span></button><button class="outline-button" data-screen-target="quiz-question">☑ <span>Take quiz</span></button></div><div class="about-box"><h2>SUBTOPICS</h2><ul>${(record.subtopics || points).map((item) => `<li>${item}</li>`).join('')}</ul></div><div class="questions"><h2>PRACTICE QUESTIONS</h2><div id="common-questions">${questions}</div></div>`;
  document.querySelector('#lesson-subject').textContent = selectedSubject.toUpperCase();
  document.querySelector('#lesson-content').innerHTML = `<h2>${record.topic}</h2><p>${lesson.introduction || ''}</p><h2>Core explanation</h2><p>${lesson.core_explanation || ''}</p>${lesson.worked_example ? `<div class="formula"><strong>WORKED EXAMPLE</strong><p>${lesson.worked_example}</p></div>` : ''}${points ? `<h2>Key points</h2><ul class="steps">${points}</ul>` : ''}${lesson.why_it_matters ? `<h2>Why it matters</h2><p>${lesson.why_it_matters}</p>` : ''}${lesson.study_tip ? `<div class="formula"><strong>STUDY TIP</strong><p>${lesson.study_tip}</p></div>` : ''}`;
}

renderSubjects();
document.querySelector('#prompt-list').innerHTML = prompts.map((prompt) => `<button class="prompt" data-prompt="${prompt}">${prompt}</button>`).join('');
document.querySelector('#answers').innerHTML = [['A', '8'], ['B', '10'], ['C', '12'], ['D', '14']].map(([letter, value]) => `<button class="answer" data-answer="${value}"><b>${letter}</b><span>${value}</span></button>`).join('');

fetch('subjects.json')
  .then((response) => response.ok ? response.json() : Promise.reject(new Error('Subjects file unavailable')))
  .then((catalog) => {
    subjectRecords = catalog.records || [];
    subjects = (catalog.subjects || []).map((name, index) => [
      name,
      `${new Set(subjectRecords.filter((record) => record.subject === name).map((record) => record.topic)).size} topics`,
      subjectStyles[index % subjectStyles.length],
      subjectIcons[index % subjectIcons.length]
    ]);
    topics = [...new Set(subjectRecords.filter((record) => record.subject === selectedSubject).map((record) => record.topic))];
    renderSubjects();
  })
  .catch(() => {});

function activateScreen(target) {
  const resolved = screenAliases[target] || target;
  document.querySelectorAll('.screen').forEach((screen) => screen.classList.toggle('active', screen.dataset.screen === resolved));
  document.querySelectorAll('.bottom-nav button').forEach((button) => button.classList.toggle('active', button.dataset.screenTarget === resolved || (resolved === 'topics' && button.dataset.screenTarget === 'subjects')));
}

document.addEventListener('click', (event) => {
  const route = event.target.closest('[data-screen-target]');
  if (route) {
    event.preventDefault();
    if (route.dataset.subject) {
      selectedSubject = route.dataset.subject;
      topics = [...new Set(subjectRecords.filter((record) => record.subject === selectedSubject).map((record) => record.topic))];
      if (!topics.length) topics = fallbackTopics;
      renderTopics();
    }
    if (route.dataset.topic) {
      selectedTopic = route.dataset.topic;
      renderLesson();
    }
    activateScreen(route.dataset.screenTarget);
  }
  const answer = event.target.closest('[data-answer]');
  if (answer) activateScreen(answer.dataset.answer === '10' ? 'quiz-result-correct' : 'quiz-result-wrong');
  const prompt = event.target.closest('[data-prompt]');
  if (prompt) {
    const input = document.querySelector('.chat-input span');
    if (input) input.textContent = prompt.dataset.prompt;
    activateScreen('ai');
  }
});

document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
activateScreen('home');
