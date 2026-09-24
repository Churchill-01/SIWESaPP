// Storage keys used for user session and profile data.
const AUTH_TOKEN_KEY = 'study_app_token';
const AUTH_USER_KEY = 'study_app_user';

// Persist a session token in the browser.
export function saveToken(token) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

// Read the persisted session token, if one exists.
export function getToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

// Persist the sanitized user profile.
export function saveUser(user) {
  if (user) {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(AUTH_USER_KEY);
  }
}

// Retrieve the stored user profile, if available.
export function getUser() {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Clear all auth credentials and profile info from storage.
export function clearAuth() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

// Backwards-compatible clearToken alias.
export function clearToken() {
  clearAuth();
}

// Build the authorization header expected by protected API requests.
export function getAuthHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
