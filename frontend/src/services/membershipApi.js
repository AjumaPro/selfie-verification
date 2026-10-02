import { resolveApiBase } from '../config/apiBase';
import { getToken } from './authService';

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
