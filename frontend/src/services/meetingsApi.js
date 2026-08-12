/**
 * Public Meetings API — check-in QR, attendance, map location.
 * Host list is owned by a durable per-browser creator key (until deleted).
 */

import { resolveApiBase } from '../config/apiBase';

const API_BASE = resolveApiBase();
const HOST_KEY_STORAGE = 'glico_meetings_host_key_v1';

/** Stable secret for this browser — owner of meetings created here. */
export function getMeetingsHostKey() {
  if (typeof window === 'undefined') return '';
  try {
    let key = localStorage.getItem(HOST_KEY_STORAGE);
    if (key && key.length >= 16) return key;
    const uuid =
      (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID()) ||
      `hk_${Date.now()}_${Math.random().toString(36).slice(2)}${Math.random()
        .toString(36)
        .slice(2)}`;
    key = String(uuid).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
    if (key.length < 16) {
      key = `hk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 18)}`;
    }
    localStorage.setItem(HOST_KEY_STORAGE, key);
    return key;
  } catch {
    return `hk_session_${Date.now()}`;
  }
}

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const hostKey = options.hostKey !== false ? getMeetingsHostKey() : '';
  if (hostKey && options.withHost !== false) {
    headers['X-Meetings-Host-Key'] = hostKey;
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

export function getJoinUrl(meetingId) {
  if (typeof window === 'undefined') return '';
  const base = `${window.location.origin}${window.location.pathname || '/'}`;
  const clean = base.replace(/\/$/, '') || window.location.origin;
  return `${clean}?join=${encodeURIComponent(meetingId)}`;
}

export function mapsEmbedUrl(place) {
  const q = String(place || '').trim();
  if (!q) return '';
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed`;
}

export function mapsOpenUrl(place) {
  const q = String(place || '').trim();
  if (!q) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function meetingBody(meeting) {
  return {
    title: meeting.title,
    date: meeting.date,
    time: meeting.time,
    durationMins: meeting.durationMins,
    location: meeting.location,
    onlineLink: meeting.onlineLink,
    googlePlace: meeting.googlePlace || meeting.location,
    venueLat: meeting.venueLat,
    venueLng: meeting.venueLng,
    venueRadiusM: meeting.venueRadiusM || 200,
    isInPerson: meeting.isInPerson !== false,
    organiser: meeting.organiser,
    status: meeting.status,
    agenda: meeting.agenda,
    mealMenu: meeting.mealMenu || {
      breakfast: { enabled: false, items: [] },
      lunch: { enabled: false, items: [] },
      dinner: { enabled: false, items: [] },
    },
    programSchedule: meeting.programSchedule || {
      text: '',
      fileName: '',
      fileMime: '',
      fileData: '',
    },
    category: meeting.category,
    priority: meeting.priority,
    recurrence: meeting.recurrence,
    seriesId: meeting.seriesId,
    reminderMins: meeting.reminderMins,
    attendees: meeting.attendees,
    notes: meeting.notes,
    minutes: meeting.minutes,
    actionItems: meeting.actionItems,
    qrEnabled: !!meeting.qrEnabled,
  };
}

/** Create/update meeting on server (persists until creator deletes). */
export async function publishMeeting(meeting) {
  return request(`/api/meetings/${encodeURIComponent(meeting.id)}`, {
    method: 'PUT',
    body: JSON.stringify(meetingBody(meeting)),
  });
}

/** Load all meetings created on this device (via host key). */
export async function fetchMyMeetings() {
  return request('/api/meetings/mine');
}

/** Delete meeting — only creator (host key). */
export async function deleteMeeting(meetingId) {
  return request(`/api/meetings/${encodeURIComponent(meetingId)}`, {
    method: 'DELETE',
  });
}

export async function fetchPublicMeeting(id) {
  return request(`/api/meetings/${encodeURIComponent(id)}`, {
    withHost: false,
  });
}

export async function registerAttendance(
  meetingId,
  {
    fullName,
    email,
    phone,
    consentDetails,
    consentLocation,
    latitude,
    longitude,
    locationAccuracy,
    locationUnavailable,
    breakfastChoice,
    lunchChoice,
    dinnerChoice,
  }
) {
  return request(`/api/meetings/${encodeURIComponent(meetingId)}/attendance`, {
    method: 'POST',
    withHost: false,
    body: JSON.stringify({
      fullName,
      email,
      phone,
      consentDetails: !!consentDetails,
      consentLocation: !!consentLocation,
      latitude,
      longitude,
      locationAccuracy,
      locationUnavailable: !!locationUnavailable,
      breakfastChoice: breakfastChoice || '',
      lunchChoice: lunchChoice || '',
      dinnerChoice: dinnerChoice || '',
    }),
  });
}

/** Expand short Google Maps links and extract venue pin coordinates. */
export async function resolveMapsLink(url, hint = '') {
  return request('/api/meetings/resolve-maps-link', {
    method: 'POST',
    withHost: false,
    body: JSON.stringify({ url, hint }),
  });
}

export async function fetchAttendance(meetingId) {
  return request(`/api/meetings/${encodeURIComponent(meetingId)}/attendance`);
}

export async function removeAttendance(meetingId, attendanceId) {
  return request(
    `/api/meetings/${encodeURIComponent(meetingId)}/attendance/${encodeURIComponent(attendanceId)}`,
    { method: 'DELETE' }
  );
}

export { API_BASE as meetingsApiBase };
