function normalizePrompt(prompt) {
  return String(prompt || '').trim().toLowerCase();
}

function scoreRecordMatch(record, prompt, subject, topic) {
  const normalizedPrompt = normalizePrompt(prompt);
  const recordSubject = normalizePrompt(record.subject || '');
  const recordTopic = normalizePrompt(record.topic || '');

  if (!normalizedPrompt) return 0;

  let score = 0;

  if (subject && recordSubject === normalizePrompt(subject)) score += 40;
  if (topic && (recordTopic === normalizePrompt(topic) || recordTopic.includes(normalizePrompt(topic)))) score += 35;

  if (recordSubject.includes(normalizedPrompt) || normalizedPrompt.includes(recordSubject)) score += 15;
  if (recordTopic.includes(normalizedPrompt) || normalizedPrompt.includes(recordTopic)) score += 20;

  return score;
}

export function findLessonRecord(subject, topic, records = [], prompt = '') {
  const safeRecords = Array.isArray(records) ? records : [];

  const exactMatch = safeRecords.find((record) => (
    record.subject === subject && record.topic === topic
  ));

  if (exactMatch) return exactMatch;

  if (subject && topic) {
    const partialMatch = safeRecords.find((record) => (
      record.subject === subject && normalizePrompt(record.topic).includes(normalizePrompt(topic))
    ));
    if (partialMatch) return partialMatch;
  }

  if (prompt) {
    let bestRecord = null;
    let bestScore = 0;

    for (const record of safeRecords) {
      const score = scoreRecordMatch(record, prompt, subject, topic);
      if (score > bestScore) {
        bestScore = score;
        bestRecord = record;
      }
    }

    if (bestRecord && bestScore > 0) return bestRecord;
  }

  if (subject) {
    const subjectMatch = safeRecords.find((record) => record.subject === subject);
    if (subjectMatch) return subjectMatch;
  }

  return null;
}

export function generateAiTutorResponse(prompt, subject, topic, records = []) {
  const cleanPrompt = normalizePrompt(prompt);
  const selectedSubject = subject || 'this subject';
  const selectedTopic = topic || 'this topic';
  const record = findLessonRecord(subject, topic, records, prompt);

  if (!record) {
    return 'I can help with Biology, Chemistry, Physics, Mathematics and other school subjects. Pick a subject and topic first, then ask a question like “Explain photosynthesis in simple terms.”';
  }

  const lesson = record.lesson || {};
  const keyPoints = Array.isArray(lesson.key_points) ? lesson.key_points : [];
  const subtopics = Array.isArray(record.subtopics) ? record.subtopics : [];
  const workedExample = lesson.worked_example || '';
  const whyItMatters = lesson.why_it_matters || '';
  const studyTip = lesson.study_tip || 'Keep the definition, one example, and one memory trick in your head.';

  const intro = lesson.introduction || lesson.core_explanation || `This topic helps students understand the main ideas behind ${selectedTopic}.`;
  const firstPoint = keyPoints[0] || subtopics[0] || 'the main idea';
  const secondPoint = keyPoints[1] || subtopics[1] || 'one good example';

  if (!cleanPrompt || /what is|define|meaning|explain|teach me/.test(cleanPrompt)) {
    const examples = subtopics.length ? subtopics.slice(0, 3).join(', ') : 'main ideas, examples, and practice questions';
    return `Here is the simple version: in ${selectedSubject}, ${selectedTopic} is about ${intro} The big idea is that ${firstPoint}. Some other key parts are ${examples}. Think of it like this: the rule comes first, then the example, then the exam question.`;
  }

  if (/(how|solve|steps|method|process|study)/.test(cleanPrompt)) {
    const steps = keyPoints.length ? keyPoints.slice(0, 3).join(' • ') : subtopics.slice(0, 3).join(' • ');
    return `Here is the easiest way to study ${selectedTopic}: 1) understand the main idea, 2) remember the key points: ${steps}, 3) check one example, and 4) answer one practice question without looking at the notes. A good student mindset is: understand first, memorise second, apply third.`;
  }

  if (/(example|sample|illustrat|show)/.test(cleanPrompt)) {
    if (workedExample) {
      return `Easy example: ${workedExample} This shows the idea in a real situation. If you can explain it in your own words, you almost understand it.`;
    }

    return `A simple example for ${selectedTopic} is to take the main rule, apply it to one small situation, and then check whether the result makes sense. That is how strong students usually learn new topics.`;
  }

  if (/(why|importance|matter|useful|use|exam)/.test(cleanPrompt)) {
    if (whyItMatters) {
      return `Why it matters: ${whyItMatters} In simpler terms, this topic helps you think clearly, answer questions better, and recognise patterns in real life or in exams.`;
    }

    return `This topic matters because it helps you understand the pattern behind the question. If you understand the reason, you can answer faster and with more confidence in exams.`;
  }

  if (/(difference|compare|contrast|distinguish)/.test(cleanPrompt)) {
    return `The easiest way to compare ideas in ${selectedTopic} is to remember this: ${firstPoint} is the rule, while ${secondPoint} is the way it is used. The rule tells you what is true, and the example shows how it works in real life.`;
  }

  const summary = lesson.core_explanation || intro;
  return `Here is the smart way to remember ${selectedTopic}: ${summary} First, understand the rule. Second, use one example. Third, connect it to a real-life situation. Final memory tip: ${studyTip}`;
}
