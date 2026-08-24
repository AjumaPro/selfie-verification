/**
 * Shareable selfie verification sessions — host QR / link, guest submit.
 */

import { resolveApiBase } from '../config/apiBase';
import { getToken } from './authService';

const API_BASE = resolveApiBase();

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (options.auth !== false) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(url, {
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

export function newVerifySessionId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID().replace(/-/g, '');
    }
  } catch {
    /* ignore */
  }
  return `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function getVerifyUrl(sessionId) {
  if (typeof window === 'undefined') return '';
  const base = `${window.location.origin}${window.location.pathname || '/'}`;
  const clean = base.replace(/\/$/, '') || window.location.origin;
  return `${clean}?verify=${encodeURIComponent(sessionId)}`;
}

export async function upsertVerifySession(sessionId, { title, note, status }) {
  return request(`/api/verify/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PUT',
    body: JSON.stringify({ title, note, status }),
  });
}

export async function listMyVerifySessions() {
  return request('/api/verify/mine');
}

export async function fetchPublicVerifySession(sessionId) {
  return request(`/api/verify/sessions/${encodeURIComponent(sessionId)}`, {
    auth: false,
  });
}

export async function submitVerifyResult(sessionId, payload) {
  return request(
    `/api/verify/sessions/${encodeURIComponent(sessionId)}/results`,
    {
      method: 'POST',
      auth: false,
      body: JSON.stringify(payload),
    }
  );
}

export async function fetchVerifyResults(sessionId) {
  return request(
    `/api/verify/sessions/${encodeURIComponent(sessionId)}/results`
  );
}

export async function removeVerifyResult(sessionId, resultId) {
  return request(
    `/api/verify/sessions/${encodeURIComponent(sessionId)}/results/${encodeURIComponent(resultId)}`,
    { method: 'DELETE' }
  );
}

export async function deleteVerifySession(sessionId) {
  return request(`/api/verify/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
}
