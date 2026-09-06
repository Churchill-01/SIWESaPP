const AUTH_TOKEN_KEY = 'study_app_token';

export function saveToken(token) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function getToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function clearToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function getAuthHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
