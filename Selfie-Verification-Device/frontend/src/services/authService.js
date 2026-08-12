/**
 * Auth client — Express + PostgreSQL API.
 *
 * First install / first open: no token → must sign in.
 * Self-registration creates a pending account (needs superadmin approval).
 * "Stay signed in": token in localStorage → auto-login on later opens.
 */

import { resolveApiBase } from '../config/apiBase';

const TOKEN_KEY = 'selfie_auth_token_v1';
const USER_KEY = 'selfie_auth_user_v1';
const REMEMBER_KEY = 'selfie_auth_remember_v1';

const API_BASE = resolveApiBase();

function clearTokenStorage() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

/** true = stay signed in; false = session only; null = never chosen (default on) */
export function getRememberPreference() {
  const v = localStorage.getItem(REMEMBER_KEY);
  if (v === '1') return true;
  if (v === '0') return false;
  return null;
}

export function isRememberEnabled() {
  // Default ON unless the user explicitly opted out
  return getRememberPreference() !== false;
}

function setRememberPreference(enabled) {
  localStorage.setItem(REMEMBER_KEY, enabled ? '1' : '0');
}

function saveSession(token, user, remember) {
  clearTokenStorage();
  setRememberPreference(Boolean(remember));
  const store = remember ? localStorage : sessionStorage;
  store.setItem(TOKEN_KEY, token);
  store.setItem(USER_KEY, JSON.stringify(user));
}

function clearSession({ clearRemember = false } = {}) {
  clearTokenStorage();
  if (clearRemember) localStorage.removeItem(REMEMBER_KEY);
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

class AuthRequestError extends Error {
  constructor(message, { status = 0, network = false } = {}) {
    super(message);
    this.name = 'AuthRequestError';
    this.status = status;
    this.network = network;
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
    throw new AuthRequestError(
      API_BASE
        ? `Cannot reach the auth server at ${API_BASE}. For Mac/Windows apps, ensure you are online and this API URL is correct. Locally start the API with: npm run api`
        : 'Cannot reach the auth server. Start the API with: npm run api (or set REACT_APP_AUTH_API_URL / REACT_APP_DESKTOP_AUTH_API_URL for the desktop build).',
      { network: true }
    );
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    throw new AuthRequestError(data?.error || `Request failed (${res.status})`, {
      status: res.status,
    });
  }
  return data;
}

export function getSession() {
  return getCachedUser();
}

/**
 * Restore session on app start.
 * - Remembered tokens live in localStorage and survive reloads.
 * - Network blips do NOT wipe a remembered session (uses cache).
 * - Only 401/403 clear the stored session.
 */
export async function restoreSession() {
  const token = getToken();
  if (!token) {
    return null;
  }

  const remember =
    Boolean(localStorage.getItem(TOKEN_KEY)) || isRememberEnabled();

  try {
    const { user } = await request('/api/auth/me', { token });
    saveSession(token, user, remember);
    return user;
  } catch (err) {
    const status = err?.status || 0;
    const isAuthReject = status === 401 || status === 403;

    if (isAuthReject) {
      clearSession();
      return null;
    }

    // Network / server error: keep remembered session from cache
    const cached = getCachedUser();
    if (cached && remember) {
      return cached;
    }

    // Session-only tab: if API unreachable, still allow cached session for this tab
    if (cached && sessionStorage.getItem(TOKEN_KEY)) {
      return cached;
    }

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

export async function changeOwnPassword({ currentPassword, newPassword }) {
  const token = getToken();
  if (!token) throw new Error('Not signed in');
  return request('/api/auth/me/password', {
    method: 'PATCH',
    token,
    body: { currentPassword, newPassword },
  });
}

export async function updateOwnProfile({ fullName, email, organization }) {
  const token = getToken();
  if (!token) throw new Error('Not signed in');
  const { user } = await request('/api/auth/me', {
    method: 'PATCH',
    token,
    body: { fullName, email, organization },
  });
  // Keep cached profile in sync
  const remember = Boolean(localStorage.getItem(TOKEN_KEY)) || isRememberEnabled();
  saveSession(token, user, remember);
  return user;
}

export async function resetUserPassword(id, newPassword) {
  const token = getToken();
  if (!token) throw new Error('Not signed in');
  return request(`/api/auth/users/${id}/password`, {
    method: 'PATCH',
    token,
    body: { newPassword },
  });
}

export async function updateUser(id, { fullName, email, organization }) {
  const token = getToken();
  if (!token) throw new Error('Not signed in');
  const { user } = await request(`/api/auth/users/${id}`, {
    method: 'PATCH',
    token,
    body: { fullName, email, organization },
  });
  return user;
}

export function logout() {
  // Keep remember preference so the checkbox stays as the user left it
  clearSession({ clearRemember: false });
}
