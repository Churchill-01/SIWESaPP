export async function requestJson(url, options = {}) {
  const response = await fetch(url, {
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
  return requestJson('/api/subjects');
}

export async function loginUser(email, password) {
  return requestJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

export async function registerUser(name, email, password) {
  return requestJson('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password })
  });
}
