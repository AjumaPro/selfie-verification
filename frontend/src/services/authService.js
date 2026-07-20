/**
 * Auth client — Express + PostgreSQL API.
 *
 * First install / first open: no token → must sign in.
 * Self-registration creates a pending account (needs superadmin approval).
 * "Stay signed in": token in localStorage → auto-login on later opens.
 */

const TOKEN_KEY = 'selfie_auth_token_v1';
const USER_KEY = 'selfie_auth_user_v1';
const REMEMBER_KEY = 'selfie_auth_remember_v1';

const API_BASE = (process.env.REACT_APP_AUTH_API_URL || 'http://localhost:4000').replace(
  /\/$/,
  ''
);

function clearAllAuthStorage() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export function isRememberEnabled() {
  return localStorage.getItem(REMEMBER_KEY) === '1';
}

function setRememberPreference(enabled) {
  if (enabled) localStorage.setItem(REMEMBER_KEY, '1');
  else localStorage.removeItem(REMEMBER_KEY);
}

function saveSession(token, user, remember) {
  clearAllAuthStorage();
  setRememberPreference(Boolean(remember));
  const store = remember ? localStorage : sessionStorage;
  store.setItem(TOKEN_KEY, token);
  store.setItem(USER_KEY, JSON.stringify(user));
}

function clearSession() {
  clearAllAuthStorage();
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

export function getCachedUser() {
  try {
    const raw =
      localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function request(path, { method = 'GET', body, token } = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(
      'Cannot reach the auth server. Start the API with: cd backend && npm run dev'
    );
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export function getSession() {
  return getCachedUser();
}

export async function restoreSession() {
  const token = getToken();
  if (!token) {
    clearAllAuthStorage();
    return null;
  }

  try {
    const { user } = await request('/api/auth/me', { token });
    saveSession(token, user, isRememberEnabled());
    return user;
  } catch {
    clearSession();
    return null;
  }
}

/** Self-register — does not log in; waits for superadmin approval. */
export async function register({ fullName, email, password, organization }) {
  const data = await request('/api/auth/register', {
    method: 'POST',
    body: { fullName, email, password, organization },
  });
  return data;
}

export async function login({ email, password }, { remember = true } = {}) {
  const { user, token } = await request('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  saveSession(token, user, remember);
  return user;
}

export async function loginSuperAdmin(
  { email, password },
  { remember = true } = {}
) {
  const { user, token } = await request('/api/auth/superadmin/login', {
    method: 'POST',
    body: { email, password },
  });
  saveSession(token, user, remember);
  return user;
}

export async function listUsers() {
  const token = getToken();
  if (!token) throw new Error('Not signed in');
  const { users } = await request('/api/auth/users', { token });
  return users || [];
}

export async function createUser(payload) {
  const token = getToken();
  if (!token) throw new Error('Not signed in');
  const { user } = await request('/api/auth/users', {
    method: 'POST',
    token,
    body: payload,
  });
  return user;
}

export async function setUserStatus(id, status) {
  const token = getToken();
  if (!token) throw new Error('Not signed in');
  const { user } = await request(`/api/auth/users/${id}/status`, {
    method: 'PATCH',
    token,
    body: { status },
  });
  return user;
}

export async function deleteUser(id) {
  const token = getToken();
  if (!token) throw new Error('Not signed in');
  return request(`/api/auth/users/${id}`, { method: 'DELETE', token });
}

export function logout() {
  clearSession();
}
