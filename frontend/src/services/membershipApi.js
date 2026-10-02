import { resolveApiBase } from '../config/apiBase';
import { getToken } from './authService';
import { getPublicWebOrigin } from '../utils/publicWebOrigin';

const API_BASE = resolveApiBase();

async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (options.auth !== false) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = new Error(
      (data && data.error) || `Request failed (${res.status})`
    );
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function listMembershipForms() {
  return request('/api/membership');
}

export async function fetchMembershipForm(id) {
  return request(`/api/membership/${encodeURIComponent(id)}`);
}

export async function submitMembershipForm(payload) {
  return request('/api/membership', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteMembershipForm(id) {
  return request(`/api/membership/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function newMembershipSessionId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID().replace(/-/g, '');
    }
  } catch {
    /* ignore */
  }
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function getMembershipFormUrl(sessionId) {
  if (typeof window === 'undefined') return '';
  const id = String(sessionId || '').trim();
  if (!id) return '';
  const origin = getPublicWebOrigin();
  if (!origin) return '';
  return `${origin}/?form=${encodeURIComponent(id)}`;
}

export async function upsertMembershipSession(sessionId, { title, note, status }) {
  return request(`/api/membership/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PUT',
    body: JSON.stringify({ title, note, status }),
  });
}

export async function listMyMembershipSessions() {
  return request('/api/membership/sessions/mine');
}

export async function fetchPublicMembershipSession(sessionId) {
  return request(`/api/membership/sessions/${encodeURIComponent(sessionId)}`, {
    auth: false,
  });
}

export async function submitPublicMembershipForm(sessionId, payload) {
  return request(
    `/api/membership/sessions/${encodeURIComponent(sessionId)}/submit`,
    {
      method: 'POST',
      auth: false,
      body: JSON.stringify(payload),
    }
  );
}

export async function deleteMembershipSession(sessionId) {
  return request(`/api/membership/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
}

export async function fetchMembershipForm(id) {
  return request(`/api/membership/${encodeURIComponent(id)}`);
}

export async function submitMembershipForm(payload) {
  return request('/api/membership', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteMembershipForm(id) {
  return request(`/api/membership/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
