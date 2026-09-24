// Shared in-memory state used by the screen renderers and event handlers.
export const state = {
  subjects: [],
  subjectRecords: [],
  topics: [],
  selectedSubject: 'Mathematics',
  selectedTopic: 'Logic',
  authToken: null,
  user: null,
  userProgress: [],
  quizScore: 0,
  quizIndex: 0,
  quizQuestions: [],
  tutorContext: null
};
