import test from 'node:test';
import assert from 'node:assert/strict';
import { findLessonRecord, generateTutorResponse } from './tutorEngine.js';

const mockRecords = [
  {
    id: 'sss3-mathematics-logic',
    subject: 'Mathematics',
    topic: 'Logic',
    subtopics: ['Propositions', 'Compound statements', 'Truth tables'],
    lesson: {
      introduction: 'Logic studies rules for deciding validity.',
      core_explanation: 'A proposition is a statement with a definite truth value: it is either true or false.',
      key_points: ['A proposition can be true or false.', 'NOT P reverses truth value.'],
      worked_example: 'P: 12 is even',
      why_it_matters: 'Useful in programming and reasoning.',
      study_tip: 'Read definitions first.'
    },
    common_mistakes: ['Confusing commands or questions with propositions.'],
    practice_questions: [
      {
        question: 'Which of the following is a proposition?',
        options: [{ label: '9 is greater than 4', is_correct: true }, { label: 'Please wait', is_correct: false }]
      }
    ]
  },
  {
    id: 'sss3-biology-photosynthesis',
    subject: 'Biology',
    topic: 'Photosynthesis',
    subtopics: ['Light stage', 'Dark stage', 'Chlorophyll'],
    lesson: {
      introduction: 'Photosynthesis is the process by which green plants manufacture food.',
      core_explanation: 'Light energy is converted into chemical energy.',
      key_points: ['Requires light, carbon dioxide and water.'],
      worked_example: '6CO2 + 6H2O -> C6H12O6 + 6O2',
      why_it_matters: 'Supports life on earth by producing oxygen.',
      study_tip: 'Memorize the balanced equation.'
    },
    common_mistakes: ['Thinking photosynthesis occurs at night without light.'],
    practice_questions: []
  }
];

test('findLessonRecord prioritizes topic keywords in student prompt over default subject/topic', () => {
  const match = findLessonRecord('Mathematics', 'Logic', mockRecords, 'Explain how photosynthesis works in plants');
  assert.equal(match.topic, 'Photosynthesis');
  assert.equal(match.subject, 'Biology');
});

test('findLessonRecord falls back to selected subject and topic when prompt has no topic keywords', () => {
  const match = findLessonRecord('Mathematics', 'Logic', mockRecords, 'Can you explain this to me?');
  assert.equal(match.topic, 'Logic');
  assert.equal(match.subject, 'Mathematics');
});

test('generateTutorResponse produces curriculum-grounded explanation for matched topic', () => {
  const response = generateTutorResponse('Explain photosynthesis simply', 'Mathematics', 'Logic', mockRecords);
  assert.ok(response.includes('Biology'));
  assert.ok(response.includes('Photosynthesis'));
  assert.ok(response.includes('manufacture food'));
});

test('generateTutorResponse handles greeting intent naturally', () => {
  const response = generateTutorResponse('Hello tutor!', 'Mathematics', 'Logic', mockRecords);
  assert.ok(response.includes('Hello!'));
  assert.ok(response.includes('Logic'));
});

test('generateTutorResponse provides worked example when requested', () => {
  const response = generateTutorResponse('Give me a worked example', 'Mathematics', 'Logic', mockRecords);
  assert.ok(response.includes('Worked Example'));
  assert.ok(response.includes('P: 12 is even'));
});

test('generateTutorResponse provides practice question when requested', () => {
  const response = generateTutorResponse('Quiz me on logic', 'Mathematics', 'Logic', mockRecords);
  assert.ok(response.includes('Which of the following is a proposition?'));
});

test('generateTutorResponse highlights common mistakes when asked', () => {
  const response = generateTutorResponse('What are common mistakes in logic?', 'Mathematics', 'Logic', mockRecords);
  assert.ok(response.includes('Confusing commands or questions'));
});
