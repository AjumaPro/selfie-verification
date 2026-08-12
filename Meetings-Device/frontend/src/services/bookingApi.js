/**
 * Free-slot booking API (guest-picked appointment times).
 */

import { resolveApiBase } from '../config/apiBase';

const API_BASE = resolveApiBase();

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  let res;
  try {
    res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch (networkErr) {
    const err = new Error(
      API_BASE
        ? `Cannot reach the booking API at ${API_BASE}. In a terminal run: npm run api (from the project root), keep that window open, then refresh.`
        : 'Cannot reach the booking API. Start the backend with “npm run api” from the project root (keeps port 4000 up), restart the frontend after changing .env, then refresh this page.'
    );
    err.cause = networkErr;
    err.status = 0;
    throw err;
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    let msg = (data && data.error) || `Request failed (${res.status})`;
    if (res.status === 404) {
      msg =
        'Booking page not found. Open Meetings → Book with me → Publish, then use the new share link.';
    }
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function getBookingUrl(pageId) {
  if (typeof window === 'undefined') return '';
  const base = `${window.location.origin}${window.location.pathname || '/'}`;
  const clean = base.replace(/\/$/, '') || window.location.origin;
  return `${clean}?book=${encodeURIComponent(pageId)}`;
}

export async function publishBookingPage(page) {
  return request(`/api/booking/pages/${encodeURIComponent(page.id)}`, {
    method: 'PUT',
    body: JSON.stringify(page),
  });
}

export async function fetchBookingPage(pageId) {
  return request(`/api/booking/pages/${encodeURIComponent(pageId)}`);
}

export async function fetchSlots(pageId, { date, from, to } = {}) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const q = params.toString();
  return request(
    `/api/booking/pages/${encodeURIComponent(pageId)}/slots${q ? `?${q}` : ''}`
  );
}

export async function bookSlot(pageId, payload) {
  return request(`/api/booking/pages/${encodeURIComponent(pageId)}/book`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchAppointments(pageId) {
  return request(
    `/api/booking/pages/${encodeURIComponent(pageId)}/appointments`
  );
}

export async function cancelAppointment(pageId, appointmentId) {
  return request(
    `/api/booking/pages/${encodeURIComponent(pageId)}/appointments/${encodeURIComponent(appointmentId)}`,
    { method: 'DELETE' }
  );
}

export { API_BASE as bookingApiBase };
