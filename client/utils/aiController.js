import { requestJson } from './api.js';
import { generateAiTutorResponse } from './ai.js';

const ONLINE_TIMEOUT_MS = 8000;

function canTryOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function localAnswer(question, options) {
  return {
    answer: generateAiTutorResponse(question, options.subject, options.topic, options.records),
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
