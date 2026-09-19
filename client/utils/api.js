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
  // Send JSON requests and normalize JSON or text responses for callers.
  const response = await fetch(apiUrl(url), {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || 'Request failed');
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
