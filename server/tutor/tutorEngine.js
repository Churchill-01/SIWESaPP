// Stop words to filter out during keyword extraction
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can', 'could',
  'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has',
  'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'i', 'if',
  'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me', 'more', 'most', 'my', 'myself', 'no', 'nor',
  'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out',
  'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs',
  'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under',
  'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom',
  'why', 'will', 'with', 'would', 'you', 'your', 'yours', 'yourself', 'yourselves', 'tell', 'explain',
  'teach', 'give', 'know', 'want', 'please', 'help', 'something'
]);

function extractKeywords(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function cleanSentence(text) {
  return String(text || '').trim().replace(/\s+/g, ' ');
}

export function findLessonRecord(subject, topic, records = [], prompt = '') {
  const safeRecords = Array.isArray(records) ? records : [];
  if (!safeRecords.length) return null;

  const promptLower = String(prompt || '').toLowerCase().trim();
  const promptKeywords = extractKeywords(promptLower);

  if (promptKeywords.length) {
    let bestRecord = null;
    let bestScore = 0;

    for (const record of safeRecords) {
      const recSubject = (record.subject || '').toLowerCase();
      const recTopic = (record.topic || '').toLowerCase();
      const subtopics = (record.subtopics || []).map((s) => s.toLowerCase());

      let score = 0;

      if (promptLower.includes(recTopic)) score += 60;
      for (const st of subtopics) {
        if (promptLower.includes(st)) score += 45;
      }
      if (promptLower.includes(recSubject)) score += 30;

      for (const kw of promptKeywords) {
        if (recTopic.includes(kw)) score += 18;
        for (const st of subtopics) {
          if (st.includes(kw)) score += 14;
        }
        if (recSubject.includes(kw)) score += 8;

        for (const chunk of (record.ai_retrieval_chunks || [])) {
          if (chunk.toLowerCase().includes(kw)) score += 4;
        }
        for (const kp of (record.lesson?.key_points || [])) {
          if (kp.toLowerCase().includes(kw)) score += 4;
        }
      }

      if (subject && record.subject === subject) score += 5;
      if (topic && record.topic === topic) score += 8;

      if (score > bestScore) {
        bestScore = score;
        bestRecord = record;
      }
    }

    if (bestRecord && bestScore >= 16) {
      return bestRecord;
    }
  }

  const exact = safeRecords.find((r) => r.subject === subject && r.topic === topic);
  if (exact) return exact;

  const subjectMatch = safeRecords.find((r) => r.subject === subject);
  if (subjectMatch) return subjectMatch;

  return safeRecords[0];
}

function detectIntent(prompt) {
  const p = String(prompt || '').toLowerCase().trim();

  if (/^(hi|hello|hey|good\s*(morning|afternoon|evening)|greetings)\b/.test(p)) {
    return 'greeting';
  }

  if (/(quiz\s*me|test\s*me|practice\s*question|ask\s*me\s*a\s*question|give\s*me\s*a\s*question|challenge\s*me)/.test(p)) {
    return 'quiz';
  }

  if (/(example|sample|worked\s*example|show\s*me\s*how|solve\s*an\s*example|demonstrate|calculation)/.test(p)) {
    return 'example';
  }

  if (/(mistake|error|pitfall|common\s*mistake|misconception|wrong)/.test(p)) {
    return 'mistakes';
  }

  if (/(how\s*to\s*study|study\s*tip|revision\s*tip|exam\s*tip|how\s*to\s*remember|memorise|memorize)/.test(p)) {
    return 'tips';
  }

  if (/(why|importance|matter|useful|use\s*case|real\s*life|application|benefit)/.test(p)) {
    return 'importance';
  }

  if (/(formula|equation|calculate|steps|method|how\s*do\s*i\s*solve|how\s*to\s*solve|procedure)/.test(p)) {
    return 'formula';
  }

  if (/(difference|compare|contrast|versus|vs|distinguish)/.test(p)) {
    return 'compare';
  }

  if (/(what\s*is|define|meaning|explain|overview|summary|tell\s*me\s*about)/.test(p)) {
    return 'definition';
  }

  return 'general';
}

function findRelevantChunks(record, promptKeywords, maxChunks = 2) {
  const candidates = [
    ...(record.ai_retrieval_chunks || []),
    ...(record.lesson?.key_points || []),
    ...(record.lesson?.core_explanation ? record.lesson.core_explanation.split(/(?<=[.?!])\s+/).filter((s) => s.length > 25) : [])
  ];

  if (!promptKeywords.length) return candidates.slice(0, maxChunks);

  const scored = candidates.map((chunk) => {
    const chunkLower = chunk.toLowerCase();
    let score = 0;
    for (const kw of promptKeywords) {
      if (chunkLower.includes(kw)) score += 1;
    }
    return { chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const relevant = scored.filter((item) => item.score > 0).map((item) => item.chunk);

  return relevant.length ? relevant.slice(0, maxChunks) : candidates.slice(0, maxChunks);
}

export function generateTutorResponse(prompt, subject, topic, records = []) {
  const cleanPrompt = cleanSentence(prompt);
  const record = findLessonRecord(subject, topic, records, cleanPrompt);

  if (!record) {
    return 'I can help with Biology, Chemistry, Physics, and Mathematics.\n\nPick a subject and topic from the menu, or ask a question like "Explain photosynthesis simply" or "What is simple interest?".';
  }

  const curSubject = record.subject || subject || 'Course';
  const curTopic = record.topic || topic || 'Lesson';
  const lesson = record.lesson || {};
  const keyPoints = Array.isArray(lesson.key_points) ? lesson.key_points : [];
  const subtopics = Array.isArray(record.subtopics) ? record.subtopics : [];
  const workedExample = lesson.worked_example || '';
  const whyItMatters = lesson.why_it_matters || '';
  const studyTip = lesson.study_tip || 'Keep the definition, one example, and one memory trick in mind.';
  const commonMistakes = Array.isArray(record.common_mistakes) ? record.common_mistakes : [];
  const practiceQuestions = Array.isArray(record.practice_questions) ? record.practice_questions : [];

  const promptKeywords = extractKeywords(cleanPrompt);
  const intent = detectIntent(cleanPrompt);

  if (intent === 'greeting') {
    return `Hello! I am your AI Study Tutor.\n\nWe are currently exploring **${curTopic}** in **${curSubject}**.\n\nHere are some things you can ask me:\n• "Explain ${curTopic} simply"\n• "Give me a worked example"\n• "Quiz me on this topic"\n• "What are common exam mistakes?"\n\nWhat would you like to learn today?`;
  }

  if (intent === 'quiz') {
    if (practiceQuestions.length) {
      const q = practiceQuestions[Math.floor(Math.random() * practiceQuestions.length)];
      const opts = (q.options || []).map((o, idx) => `${String.fromCharCode(65 + idx)}) ${o.label}`).join('\n');
      return `Here is a practice question on **${curTopic}**:\n\n**${q.question}**\n\n${opts}\n\nThink about your answer, or try the Quiz tab to test your full knowledge!`;
    }
    return `In **${curTopic}**, a great self-test is to state the main definition from memory, write down the fundamental formulas, and explain how ${keyPoints[0] || 'the main concept'} applies in practice!`;
  }

  if (intent === 'example') {
    if (workedExample) {
      return `**Worked Example — ${curTopic} (${curSubject}):**\n\n${workedExample}\n\n**Study Strategy:**\n${studyTip}`;
    }
    const sampleConcept = keyPoints[0] || lesson.core_explanation || 'Apply the fundamental definition to a sample problem.';
    return `**Example Application in ${curTopic}:**\n\n${sampleConcept}\n\nNotice how the principle is applied step-by-step to arrive at the result.`;
  }

  if (intent === 'mistakes') {
    if (commonMistakes.length) {
      const mistakeList = commonMistakes.slice(0, 3).map((m, idx) => `${idx + 1}. ${m}`).join('\n');
      return `**Common Pitfalls in ${curTopic} (${curSubject}):**\n\n${mistakeList}\n\n**Memory Tip:**\n${studyTip}`;
    }
    return `**Key Things to Avoid in ${curTopic}:**\n\n1. Memorizing terms without understanding the underlying rule.\n2. Omitting units or conditions in numerical answers.\n3. Skipping intermediate working in calculations.\n\n**Advice:** ${studyTip}`;
  }

  if (intent === 'tips') {
    return `**Study Strategy for ${curTopic} (${curSubject}):**\n\n• **Core Tip:** ${studyTip}\n• **Key Concepts:** Focus on ${subtopics.slice(0, 3).join(', ') || 'the definitions and worked examples'}.\n• **Exam Approach:** First understand the rule, work through one example without looking at notes, and then solve practice questions.`;
  }

  if (intent === 'importance') {
    if (whyItMatters) {
      return `**Why ${curTopic} Matters:**\n\n${whyItMatters}\n\nIn exams and beyond, understanding this topic builds foundational problem-solving skills for advanced science, mathematics, and technology.`;
    }
    return `**Significance of ${curTopic}:**\n\nThis topic is a cornerstone of ${curSubject}. Mastering it helps you recognise recurring exam patterns and understand the physical or mathematical reasons behind each question.`;
  }

  if (intent === 'formula') {
    const relevant = findRelevantChunks(record, promptKeywords, 2);
    const formulaText = relevant.length ? relevant.map((c) => `• ${c}`).join('\n\n') : (keyPoints.slice(0, 2).map((kp) => `• ${kp}`).join('\n') || lesson.core_explanation);
    return `**Key Formulas & Concepts for ${curTopic}:**\n\n${formulaText}\n\n${workedExample ? `**Sample Application:**\n${workedExample}` : `**Study Tip:** ${studyTip}`}`;
  }

  if (intent === 'compare') {
    const first = keyPoints[0] || subtopics[0] || 'the primary rule';
    const second = keyPoints[1] || subtopics[1] || 'its direct application';
    return `**Key Distinction in ${curTopic}:**\n\n• **First Element:** ${first}\n• **Second Element:** ${second}\n\nRemember: in ${curSubject}, the fundamental rule defines what is true under standard conditions, while the specific application demonstrates how it behaves in practice.`;
  }

  const relevantChunks = findRelevantChunks(record, promptKeywords, 2);
  const matchedDetail = relevantChunks.length
    ? relevantChunks.map((c) => `• ${c}`).join('\n\n')
    : (keyPoints.slice(0, 3).map((kp) => `• ${kp}`).join('\n') || lesson.core_explanation);

  const introText = lesson.introduction || lesson.core_explanation || `${curTopic} is an essential part of ${curSubject}.`;

  return `**${curTopic} (${curSubject})**\n\n${introText}\n\n**Core Principles:**\n${matchedDetail}\n\n**Study Tip:**\n${studyTip}`;
}
