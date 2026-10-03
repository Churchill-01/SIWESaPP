import { requestJson } from './api.js';
import { generateAiTutorResponse } from './ai.js';

const ONLINE_TIMEOUT_MS = 25000;

function canTryOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function getCurriculumRecords(options) {
  if (Array.isArray(options?.records) && options.records.length > 0) {
    return options.records;
  }
  if (typeof localStorage !== 'undefined') {
    try {
      const cached = localStorage.getItem('cached_curriculum_catalog');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed?.records) && parsed.records.length > 0) {
          return parsed.records;
        }
      }
    } catch {
      // Ignore parse errors
    }
  }
  return [];
}

function localAnswer(question, options = {}) {
  const records = getCurriculumRecords(options);
  return {
    answer: generateAiTutorResponse(question, options.subject, options.topic, records),
    source: 'local',
    online: false
  };
}

export async function askTutor(question, options = {}) {
  if (!canTryOnline()) {
    const fallback = localAnswer(question, options);
    fallback.onlineError = 'Device is currently offline';
    return fallback;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ONLINE_TIMEOUT_MS);

  try {
    const result = await requestJson('/api/ai/online', {
      method: 'POST',
      signal: controller.signal,
      body: JSON.stringify({
        question,
        subject: options.subject,
        topic: options.topic,
        previous: options.previous
      })
    });

    if (!result?.answer) throw new Error('Online tutor returned no answer');
    return { ...result, source: 'online', online: true, model: result.model || 'live' };
  } catch (error) {
    const fallback = localAnswer(question, options);
    fallback.onlineError = error?.name === 'AbortError'
      ? 'Online AI request timed out (8s)'
      : (error?.message || 'Online tutor unavailable');
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}
