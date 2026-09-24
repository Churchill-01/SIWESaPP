import { getAuthHeaders } from './auth.js';

// Local API origin used when the client is opened from a file or preview server.
const localApiOrigin = 'http://localhost:3000';

// Resolve relative API paths for both hosted and local-preview deployments.
function apiUrl(path) {
  const isFileClient = window.location.protocol === 'file:';
  const isLocalPreview = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    && window.location.port !== '3000';

  return isFileClient || isLocalPreview ? `${localApiOrigin}${path}` : path;
}

export async function requestJson(url, options = {}) {
  // Send JSON requests, automatically attaching auth headers when present.
  const authHeaders = getAuthHeaders();
  const response = await fetch(apiUrl(url), {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const errorText = await response.text();
    let message = errorText;
    try {
      const parsed = JSON.parse(errorText);
      message = parsed.error || message;
    } catch {
      // Keep errorText
    }
    throw new Error(message || 'Request failed');
  }

  return response.headers.get('content-type')?.includes('application/json') ? response.json() : response.text();
}

export async function fetchSubjects() {
  // Retrieve the subject names exposed by the server.
  return requestJson('/api/subjects');
}

export async function loginUser(email, password) {
  // Authenticate an existing user.
  return requestJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

export async function registerUser(name, email, password) {
  // Create a new user account and return its session token.
  return requestJson('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password })
  });
}

export async function logoutUser() {
  // Terminate the active session on the backend.
  return requestJson('/api/auth/logout', {
    method: 'POST'
  });
}

export async function fetchCurrentUser() {
  // Retrieve the profile of the currently logged-in user.
  return requestJson('/api/auth/me');
}

export async function fetchProgress() {
  // Retrieve user quiz progress records.
  return requestJson('/api/progress');
}

export async function saveProgress(subject, topic, score, total) {
  // Persist a student's quiz score to the server.
  return requestJson('/api/progress', {
    method: 'POST',
    body: JSON.stringify({ subject, topic, score, total })
  });
}
