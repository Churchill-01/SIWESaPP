// Storage key used for the current user's session token.
const AUTH_TOKEN_KEY = 'study_app_token';

// Persist a session token in the browser.
export function saveToken(token) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

// Read the persisted session token, if one exists.
export function getToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

// Remove the current session token from browser storage.
export function clearToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

// Build the authorization header expected by protected API requests.
export function getAuthHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
