/**
 * Public Meetings API — check-in QR, attendance, map location.
 * Uses same base URL as auth (REACT_APP_AUTH_API_URL).
 */

function resolveApiBase() {
  const raw = process.env.REACT_APP_AUTH_API_URL;
  if (raw === '' || raw === '/' || raw === 'same-origin') return '';
  if (raw == null) {
    if (process.env.NODE_ENV === 'development') return '';
    return 'http://127.0.0.1:4000';
  }
  return String(raw).replace(/\/$/, '');
}

const API_BASE = resolveApiBase();

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
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
  // hash-less query so mobile cameras open cleanly
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

/** Publish meeting so QR scanners can open check-in from any device. */
export async function publishMeeting(meeting) {
  return request(`/api/meetings/${encodeURIComponent(meeting.id)}`, {
    method: 'PUT',
    body: JSON.stringify({
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
    }),
  });
}

export async function fetchPublicMeeting(id) {
  return request(`/api/meetings/${encodeURIComponent(id)}`);
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
    breakfastChoice,
    lunchChoice,
    dinnerChoice,
  }
) {
  return request(`/api/meetings/${encodeURIComponent(meetingId)}/attendance`, {
    method: 'POST',
    body: JSON.stringify({
      fullName,
      email,
      phone,
      consentDetails: !!consentDetails,
      consentLocation: !!consentLocation,
      latitude,
      longitude,
      locationAccuracy,
      breakfastChoice: breakfastChoice || '',
      lunchChoice: lunchChoice || '',
      dinnerChoice: dinnerChoice || '',
    }),
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
