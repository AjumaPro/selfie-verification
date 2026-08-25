import React, { useEffect, useMemo, useState } from 'react';
import {
  FaCalendarPlus,
  FaTrash,
  FaCheck,
  FaClock,
  FaUsers,
  FaMapMarkerAlt,
  FaSearch,
  FaEdit,
  FaCopy,
  FaDownload,
  FaPlay,
  FaBan,
  FaFlag,
  FaPlus,
  FaTimes,
  FaExternalLinkAlt,
  FaUndo,
  FaExclamationTriangle,
  FaCalendarAlt,
  FaUtensils,
  FaPaste,
  FaCheckCircle,
  FaLink,
} from 'react-icons/fa';
import MeetingCalendar from './MeetingCalendar';
import MeetingCheckIn from './MeetingCheckIn';
import GooglePlacePicker from './GooglePlacePicker';
import BookingHost from './BookingHost';
import MeetingsDeviceDownloads from './MeetingsDeviceDownloads';
import {
  publishMeeting,
  fetchMyMeetings,
  deleteMeeting as deleteMeetingApi,
  mapsOpenUrl,
  getMeetingsHostKey,
  resolveMapsLink,
} from '../services/meetingsApi';
import {
  resolveVenueFromText,
  resolveGoogleMapsPaste,
  formatCoord,
} from '../utils/googleMapsPaste';
import './MeetingsApp.css';

const STORAGE_KEY = 'glico_meetings_v2';
const LEGACY_KEY = 'glico_meetings_v1';

const CATEGORIES = [
  { id: 'general', label: 'General' },
  { id: 'kyc', label: 'KYC / compliance' },
  { id: 'ops', label: 'Operations' },
  { id: 'training', label: 'Training' },
  { id: 'branch', label: 'Branch' },
  { id: 'executive', label: 'Executive' },
];

const PRIORITIES = [
  { id: 'low', label: 'Low' },
  { id: 'normal', label: 'Normal' },
  { id: 'high', label: 'High' },
  { id: 'urgent', label: 'Urgent' },
];

const RECURRENCE = [
  { id: 'none', label: 'Does not repeat' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'biweekly', label: 'Every 2 weeks' },
  { id: 'monthly', label: 'Monthly' },
];

const emptyForm = {
  title: '',
  date: '',
  time: '',
  durationMins: '60',
  location: '',
  isInPerson: true,
  /** Host opted to attach a Google Maps check-in pin */
  includeMapPin: false,
  googlePlace: '',
  venueLat: '',
  venueLng: '',
  venueRadiusM: '200',
  onlineLink: '',
  organiser: '',
  category: 'general',
  priority: 'normal',
  recurrence: 'none',
  recurrenceCount: '8',
  reminderMins: '0',
  attendees: '',
  agenda: '',
  notes: '',
  offerBreakfast: false,
  breakfastMenu: '',
  offerLunch: false,
  lunchMenu: '',
  offerDinner: false,
  dinnerMenu: '',
  programText: '',
  programFileName: '',
  programFileMime: '',
  programFileData: '',
};

function parseMenuLines(text) {
  return String(text || '')
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);
}

function menuLinesFromItems(items) {
  return (Array.isArray(items) ? items : []).join('\n');
}

function normalizeMealMenu(raw) {
  const empty = {
    breakfast: { enabled: false, items: [] },
    lunch: { enabled: false, items: [] },
    dinner: { enabled: false, items: [] },
  };
  if (!raw || typeof raw !== 'object') return empty;
  const out = { ...empty };
  ['breakfast', 'lunch', 'dinner'].forEach((key) => {
    const block = raw[key] || {};
    const items = parseMenuLines(
      Array.isArray(block.items) ? block.items.join('\n') : block.items || ''
    );
    out[key] = {
      enabled: !!(block.enabled && items.length),
      items,
    };
  });
  return out;
}

function normalizeProgramSchedule(raw) {
  if (!raw || typeof raw !== 'object') {
    if (typeof raw === 'string' && raw.trim()) {
      return {
        text: raw.trim(),
        fileName: '',
        fileMime: '',
        fileData: '',
      };
    }
    return { text: '', fileName: '', fileMime: '', fileData: '' };
  }
  return {
    text: String(raw.text || '').trim(),
    fileName: String(raw.fileName || '').trim(),
    fileMime: String(raw.fileMime || '').trim(),
    fileData: String(raw.fileData || '').trim(),
  };
}

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function parseCoords(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseLatLngPair(text) {
  const s = String(text || '').trim();
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function resolveVenueCoords(m) {
  const resolved = resolveVenueFromText({
    googlePlace: m.googlePlace || m.location,
    venueLat: m.venueLat,
    venueLng: m.venueLng,
  });
  if (resolved) return { lat: resolved.lat, lng: resolved.lng };
  return { lat: null, lng: null };
}

function migrateMeeting(raw) {
  const attendees = Array.isArray(raw.attendees)
    ? raw.attendees
    : String(raw.attendees || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((name) => ({ id: newId(), name, status: 'invited' }));

  const venue = resolveVenueCoords(raw);
  // Prefer stored flag; else treat as in-person only when a pin exists
  let isInPerson = true;
  if (raw.isInPerson === false || raw.isInPerson === 0 || raw.isInPerson === '0') {
    isInPerson = false;
  } else if (
    raw.isInPerson === true ||
    raw.isInPerson === 1 ||
    raw.isInPerson === '1'
  ) {
    isInPerson = true;
  } else {
    isInPerson = venue.lat != null && venue.lng != null;
  }

  return {
    id: raw.id || newId(),
    title: raw.title || 'Untitled',
    date: raw.date || '',
    time: raw.time || '09:00',
    durationMins: Number(raw.durationMins) || 60,
    location: raw.location || '',
    googlePlace: raw.googlePlace || raw.location || '',
    venueLat: venue.lat,
    venueLng: venue.lng,
    venueRadiusM: Number(raw.venueRadiusM) || 200,
    isInPerson,
    onlineLink: raw.onlineLink || '',
    organiser: raw.organiser || raw.organier || '',
    category: raw.category || 'general',
    priority: raw.priority || 'normal',
    recurrence: raw.recurrence || 'none',
    seriesId: raw.seriesId || '',
    reminderMins: Number(raw.reminderMins) || 0,
    attendees,
    agenda: raw.agenda || raw.notes || '',
    notes: raw.notes && raw.agenda ? raw.notes : '',
    minutes: raw.minutes || '',
    actionItems: Array.isArray(raw.actionItems) ? raw.actionItems : [],
    status: raw.status === 'done' ? 'completed' : raw.status || 'scheduled',
    qrEnabled: !!raw.qrEnabled,
    mealMenu: normalizeMealMenu(raw.mealMenu),
    programSchedule: normalizeProgramSchedule(raw.programSchedule),
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
  };
}

function loadMeetings() {
  try {
    const v2 = localStorage.getItem(STORAGE_KEY);
    if (v2) {
      const parsed = JSON.parse(v2);
      return Array.isArray(parsed) ? parsed.map(migrateMeeting) : [];
    }
    const v1 = localStorage.getItem(LEGACY_KEY);
    if (v1) {
      const parsed = JSON.parse(v1);
      return Array.isArray(parsed) ? parsed.map(migrateMeeting) : [];
    }
    return [];
  } catch {
    return [];
  }
}

function saveMeetings(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function meetingStart(m) {
  return new Date(`${m.date}T${m.time || '00:00'}:00`);
}

function meetingEnd(m) {
  const start = meetingStart(m);
  return new Date(start.getTime() + (Number(m.durationMins) || 60) * 60000);
}

function formatTimeRange(m) {
  const start = m.time || '—';
  if (!m.time || !m.durationMins) return start;
  const end = meetingEnd(m);
  const hh = String(end.getHours()).padStart(2, '0');
  const mm = String(end.getMinutes()).padStart(2, '0');
  return `${start}–${hh}:${mm}`;
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(`${dateStr}T12:00:00`).toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function categoryLabel(id) {
  return CATEGORIES.find((c) => c.id === id)?.label || id;
}

function isLink(s) {
  return /^https?:\/\//i.test(String(s || '').trim());
}

function overlaps(a, b) {
  if (a.id === b.id || !a.date || !b.date) return false;
  if (a.status === 'cancelled' || b.status === 'cancelled') return false;
  if (a.status === 'completed' || b.status === 'completed') return false;
  const as = meetingStart(a).getTime();
  const ae = meetingEnd(a).getTime();
  const bs = meetingStart(b).getTime();
  const be = meetingEnd(b).getTime();
  return as < be && bs < ae;
}

function padIcs(n) {
  return String(n).padStart(2, '0');
}

function toIcsDate(d) {
  return (
    d.getUTCFullYear() +
    padIcs(d.getUTCMonth() + 1) +
    padIcs(d.getUTCDate()) +
    'T' +
    padIcs(d.getUTCHours()) +
    padIcs(d.getUTCMinutes()) +
    padIcs(d.getUTCSeconds()) +
    'Z'
  );
}

function escapeIcs(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function buildIcs(meetings) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GLICO//Meetings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  meetings
    .filter((m) => m.status !== 'cancelled' && m.date)
    .forEach((m) => {
      const start = meetingStart(m);
      const end = meetingEnd(m);
      lines.push(
        'BEGIN:VEVENT',
        `UID:${m.id}@glico-meetings`,
        `DTSTAMP:${toIcsDate(new Date())}`,
        `DTSTART:${toIcsDate(start)}`,
        `DTEND:${toIcsDate(end)}`,
        `SUMMARY:${escapeIcs(m.title)}`,
        `DESCRIPTION:${escapeIcs(
          [m.agenda, m.notes, m.minutes].filter(Boolean).join('\\n\\n')
        )}`,
        `LOCATION:${escapeIcs(m.googlePlace || m.location || m.onlineLink || '')}`,
        m.priority === 'urgent' || m.priority === 'high'
          ? 'PRIORITY:1'
          : 'PRIORITY:5',
        'END:VEVENT'
      );
    });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Build plain-text meal menu for creator download. */
function buildMenuDocument(meeting) {
  const m = meeting || {};
  const meal = normalizeMealMenu(m.mealMenu);
  const lines = [
    'GLICO Life Platform — Meal menu',
    '==========================',
    `Meeting: ${m.title || 'Untitled'}`,
    `Date: ${m.date || '—'}  Time: ${m.time || '—'}`,
    m.googlePlace || m.location
      ? `Venue: ${m.googlePlace || m.location}`
      : '',
    m.organiser ? `Organiser: ${m.organiser}` : '',
    '',
  ].filter((line, i, arr) => line !== '' || (i > 0 && arr[i - 1] !== ''));

  let hasAny = false;
  [
    ['Breakfast', meal.breakfast],
    ['Lunch', meal.lunch],
    ['Dinner', meal.dinner],
  ].forEach(([label, block]) => {
    if (!block?.enabled || !block.items?.length) return;
    hasAny = true;
    lines.push(`${label}`);
    lines.push('-'.repeat(label.length));
    block.items.forEach((item, idx) => {
      lines.push(`  ${idx + 1}. ${item}`);
    });
    lines.push('');
  });

  if (!hasAny) {
    lines.push('No meal options enabled for this meeting.');
  } else {
    lines.push('---');
    lines.push(`Generated ${new Date().toLocaleString()}`);
  }
  return lines.join('\n');
}

function buildMenuCsv(meeting) {
  const m = meeting || {};
  const meal = normalizeMealMenu(m.mealMenu);
  const rows = [['Meeting', 'Date', 'Time', 'Meal', 'Item']];
  [
    ['Breakfast', meal.breakfast],
    ['Lunch', meal.lunch],
    ['Dinner', meal.dinner],
  ].forEach(([mealName, block]) => {
    if (!block?.enabled || !block.items?.length) return;
    block.items.forEach((item) => {
      rows.push([
        m.title || '',
        m.date || '',
        m.time || '',
        mealName,
        item,
      ]);
    });
  });
  const esc = (cell) => {
    const s = String(cell ?? '');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return rows.map((r) => r.map(esc).join(',')).join('\n');
}

function meetingHasMenu(m) {
  const meal = normalizeMealMenu(m?.mealMenu);
  return (
    (!!meal.breakfast.enabled && meal.breakfast.items.length > 0) ||
    (!!meal.lunch.enabled && meal.lunch.items.length > 0) ||
    (!!meal.dinner.enabled && meal.dinner.items.length > 0)
  );
}

function parseAttendeesInput(text) {
  return String(text || '')
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ id: newId(), name, status: 'invited' }));
}

function attendeesToInput(list) {
  return (list || []).map((a) => a.name).join(', ');
}

/** Advance ISO date by recurrence rule once. */
function nextRecurrenceDate(isoDate, rule) {
  const [y, m, d] = String(isoDate).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (rule === 'daily') dt.setDate(dt.getDate() + 1);
  else if (rule === 'weekly') dt.setDate(dt.getDate() + 7);
  else if (rule === 'biweekly') dt.setDate(dt.getDate() + 14);
  else if (rule === 'monthly') dt.setMonth(dt.getMonth() + 1);
  else return null;
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Expand a template meeting into real dated instances for recurrence.
 * First item is the original; rest are copies with new ids and dates.
 */
function expandRecurringMeetings(entry, count) {
  const rule = entry.recurrence || 'none';
  if (rule === 'none') return [entry];
  const n = Math.min(52, Math.max(1, Number(count) || 1));
  const seriesId = entry.seriesId || entry.id;
  const out = [];
  let date = entry.date;
  for (let i = 0; i < n; i += 1) {
    if (!date) break;
    const id = i === 0 ? entry.id : newId();
    out.push({
      ...entry,
      id,
      date,
      seriesId,
      // Each instance is a real event; label retains the series rule
      recurrence: rule,
      qrEnabled: false,
      createdAt: entry.createdAt,
      updatedAt: new Date().toISOString(),
    });
    date = nextRecurrenceDate(date, rule);
  }
  return out;
}

function formFromMeeting(m) {
  const meal = normalizeMealMenu(m.mealMenu);
  const program = normalizeProgramSchedule(m.programSchedule);
  const venue = resolveVenueCoords(m);
  return {
    title: m.title || '',
    date: m.date || '',
    time: m.time || '',
    durationMins: String(m.durationMins || 60),
    location: m.location || '',
    isInPerson: m.isInPerson !== false,
    includeMapPin: venue.lat != null && venue.lng != null,
    googlePlace: m.googlePlace || m.location || '',
    venueLat: venue.lat != null ? String(venue.lat) : '',
    venueLng: venue.lng != null ? String(venue.lng) : '',
    venueRadiusM: String(m.venueRadiusM || 200),
    onlineLink: m.onlineLink || '',
    organiser: m.organiser || '',
    category: m.category || 'general',
    priority: m.priority || 'normal',
    recurrence: m.recurrence || 'none',
    recurrenceCount: '8',
    reminderMins: String(m.reminderMins || 0),
    attendees: attendeesToInput(m.attendees),
    agenda: m.agenda || '',
    notes: m.notes || '',
    offerBreakfast: !!meal.breakfast.enabled,
    breakfastMenu: menuLinesFromItems(meal.breakfast.items),
    offerLunch: !!meal.lunch.enabled,
    lunchMenu: menuLinesFromItems(meal.lunch.items),
    offerDinner: !!meal.dinner.enabled,
    dinnerMenu: menuLinesFromItems(meal.dinner.items),
    programText: program.text || '',
    programFileName: program.fileName || '',
    programFileMime: program.fileMime || '',
    programFileData: program.fileData || '',
  };
}

/**
 * Advanced Meetings app — server-backed (API) + local cache until creator deletes.
 */
const MeetingsApp = () => {
  const [meetings, setMeetings] = useState(() => loadMeetings());
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('upcoming');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('date_asc');
  const [expandedId, setExpandedId] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showMeals, setShowMeals] = useState(false);
  const [showProgram, setShowProgram] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [gmapsPaste, setGmapsPaste] = useState('');
  const [gmapsPasteBusy, setGmapsPasteBusy] = useState(false);
  const [newActionText, setNewActionText] = useState({});
  const [toast, setToast] = useState('');
  const [calendarDate, setCalendarDate] = useState('');
  const [listView, setListView] = useState('agenda'); // agenda | calendar | booking

  // Ensure host key exists early
  useEffect(() => {
    getMeetingsHostKey();
  }, []);

  // Persist cache locally (offline offline / faster UI)
  useEffect(() => {
    saveMeetings(meetings);
  }, [meetings]);

  // Load creator's meetings from API (source of truth until deleted)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSyncing(true);
      setSyncError('');
      try {
        getMeetingsHostKey();
        const data = await fetchMyMeetings();
        if (cancelled) return;
        const remote = Array.isArray(data?.meetings)
          ? data.meetings.map(migrateMeeting)
          : [];
        setMeetings((local) => {
          // Prefer server copy of same id; keep only local-only drafts not yet synced
          const byId = new Map();
          local.forEach((m) => byId.set(m.id, m));
          remote.forEach((m) => byId.set(m.id, { ...m, qrEnabled: true }));
          return Array.from(byId.values()).sort((a, b) => {
            const da = `${a.date || ''}T${a.time || '00:00'}`;
            const db = `${b.date || ''}T${b.time || '00:00'}`;
            return da.localeCompare(db);
          });
        });
      } catch (err) {
        if (!cancelled) {
          setSyncError(
            err?.message ||
              'Could not reach the meetings server — showing local saves only.'
          );
        }
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const flash = (msg) => setToast(msg);

  const persistMeeting = async (inst) => {
    getMeetingsHostKey();
    const data = await publishMeeting(inst);
    return data?.meeting ? migrateMeeting({ ...inst, ...data.meeting, qrEnabled: true }) : { ...inst, qrEnabled: true };
  };

  const conflictIds = useMemo(() => {
    const set = new Set();
    for (let i = 0; i < meetings.length; i += 1) {
      for (let j = i + 1; j < meetings.length; j += 1) {
        if (overlaps(meetings[i], meetings[j])) {
          set.add(meetings[i].id);
          set.add(meetings[j].id);
        }
      }
    }
    return set;
  }, [meetings]);

  const stats = useMemo(() => {
    const now = Date.now();
    const weekEnd = now + 7 * 24 * 60 * 60 * 1000;
    let upcoming = 0;
    let thisWeek = 0;
    let completed = 0;
    let openActions = 0;
    meetings.forEach((m) => {
      if (m.status === 'completed') completed += 1;
      else if (m.status !== 'cancelled') {
        const start = meetingStart(m).getTime();
        if (start >= now - 60 * 60 * 1000) upcoming += 1;
        if (start >= now && start <= weekEnd) thisWeek += 1;
      }
      (m.actionItems || []).forEach((a) => {
        if (!a.done) openActions += 1;
      });
    });
    return {
      total: meetings.length,
      upcoming,
      thisWeek,
      completed,
      openActions,
      conflicts: conflictIds.size,
    };
  }, [meetings, conflictIds]);

  const visible = useMemo(() => {
    const now = Date.now();
    let list = meetings.filter((m) => {
      const start = m.date ? meetingStart(m).getTime() : 0;
      if (statusFilter === 'upcoming') {
        if (m.status === 'completed' || m.status === 'cancelled') return false;
        return start >= now - 30 * 60 * 1000 || m.status === 'in_progress';
      }
      if (statusFilter === 'past') {
        return (
          m.status === 'completed' ||
          m.status === 'cancelled' ||
          (start < now && m.status !== 'in_progress')
        );
      }
      if (statusFilter === 'in_progress') return m.status === 'in_progress';
      if (statusFilter === 'completed') return m.status === 'completed';
      return true;
    });

    if (categoryFilter !== 'all') {
      list = list.filter((m) => m.category === categoryFilter);
    }
    if (priorityFilter !== 'all') {
      list = list.filter((m) => m.priority === priorityFilter);
    }

    if (calendarDate) {
      list = list.filter((m) => m.date === calendarDate);
    }

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((m) => {
        const blob = [
          m.title,
          m.location,
          m.googlePlace,
          m.onlineLink,
          m.organiser,
          m.agenda,
          m.notes,
          m.minutes,
          categoryLabel(m.category),
          ...(m.attendees || []).map((a) => a.name),
          ...(m.actionItems || []).map((a) => a.text),
        ]
          .join(' ')
          .toLowerCase();
        return blob.includes(q);
      });
    }

    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sortBy === 'priority') {
        const order = { urgent: 0, high: 1, normal: 2, low: 3 };
        const d = (order[a.priority] ?? 2) - (order[b.priority] ?? 2);
        if (d !== 0) return d;
      }
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      const ak = meetingStart(a).getTime();
      const bk = meetingStart(b).getTime();
      if (sortBy === 'date_desc') return bk - ak;
      return ak - bk;
    });
    return sorted;
  }, [
    meetings,
    statusFilter,
    categoryFilter,
    priorityFilter,
    query,
    sortBy,
    calendarDate,
  ]);

  const grouped = useMemo(() => {
    const map = new Map();
    visible.forEach((m) => {
      const key = m.date || 'No date';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    });
    return Array.from(map.entries());
  }, [visible]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  /** Paste Google Maps share link / coords onto the meeting form (same pin used at check-in). */
  const applyGoogleMapsPaste = async (raw) => {
    const text = String(raw ?? gmapsPaste).trim();
    if (!text) {
      setError('Paste a Google Maps link or coordinates (e.g. 5.6037, -0.1870).');
      return;
    }
    setGmapsPasteBusy(true);
    setError('');
    try {
      const resolved = await resolveGoogleMapsPaste(text, {
        hint: form.location || form.googlePlace || '',
        expandUrl: async (url) => {
          try {
            return await resolveMapsLink(url, form.location || '');
          } catch {
            return null;
          }
        },
      });

      // Exact pin from link/coords — save directly
      if (
        resolved?.lat != null &&
        resolved?.lng != null &&
        !resolved.needsConfirm &&
        !resolved.error
      ) {
        const label =
          resolved.label ||
          `${formatCoord(resolved.lat)}, ${formatCoord(resolved.lng)}`;
        const shortVenue = label.split(',').slice(0, 2).join(',').trim();
        setForm((f) => ({
          ...f,
          googlePlace: label,
          venueLat: String(Number(resolved.lat.toFixed(7))),
          venueLng: String(Number(resolved.lng.toFixed(7))),
          isInPerson: true,
          includeMapPin: true,
          location: (f.location || '').trim() || shortVenue,
        }));
        setGmapsPaste('');
        flash(
          'Exact Google Maps pin set on this form. Create or Update the meeting to publish it for guests.'
        );
        return;
      }

      // Uncertain — open map picker; do NOT save lat/lng until host confirms
      const searchSeed =
        resolved?.searchQuery ||
        resolved?.label ||
        form.location ||
        '';
      const seedPlace =
        Number.isFinite(resolved?.lat) && Number.isFinite(resolved?.lng)
          ? `${formatCoord(resolved.lat)}, ${formatCoord(resolved.lng)}`
          : searchSeed;
      setForm((f) => ({
        ...f,
        googlePlace: seedPlace || f.googlePlace,
        venueLat: '',
        venueLng: '',
        isInPerson: true,
        location: (f.location || '').trim() || searchSeed || f.location,
      }));
      setGmapsPaste('');
      setShowMapPicker(true);
      setError(
        resolved?.message ||
          resolved?.error ||
          'Confirm the exact pin on the map — Share links often don’t include the real place marker.'
      );
      flash('Confirm the correct pin on the map, then tap Use address & pin.');
    } finally {
      setGmapsPasteBusy(false);
    }
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setError('');
    setGmapsPaste('');
    setShowAdvanced(false);
    setShowDetails(false);
    setShowMeals(false);
    setShowProgram(false);
  };

  const buildMeetingFromForm = (existing) => {
    const title = form.title.trim();
    if (!title) {
      setError('Meeting title is required.');
      return null;
    }
    if (!form.date) {
      setError('Choose a meeting date.');
      return null;
    }
    const durationMins = Math.max(15, Number(form.durationMins) || 60);
    const location = form.location.trim();
    const googlePlace = (form.googlePlace || form.location || '').trim();
    let venueLat = parseCoords(form.venueLat);
    let venueLng = parseCoords(form.venueLng);
    if (venueLat == null || venueLng == null) {
      const resolved = resolveVenueFromText({
        googlePlace: form.googlePlace,
        venueLat: form.venueLat,
        venueLng: form.venueLng,
      });
      if (resolved) {
        venueLat = resolved.lat;
        venueLng = resolved.lng;
      }
    }
    const venueRadiusM = Math.min(
      2000,
      Math.max(50, Number(form.venueRadiusM) || 200)
    );
    const breakfastItems = parseMenuLines(form.breakfastMenu);
    const lunchItems = parseMenuLines(form.lunchMenu);
    const dinnerItems = parseMenuLines(form.dinnerMenu);
    if (form.offerBreakfast && !breakfastItems.length) {
      setError('Add at least one breakfast item, or turn off breakfast.');
      return null;
    }
    if (form.offerLunch && !lunchItems.length) {
      setError('Add at least one lunch item, or turn off lunch.');
      return null;
    }
    if (form.offerDinner && !dinnerItems.length) {
      setError('Add at least one dinner item, or turn off dinner.');
      return null;
    }
    const isInPerson = form.isInPerson !== false;
    const includeMapPin = isInPerson && form.includeMapPin === true;
    if (isInPerson && includeMapPin) {
      if (venueLat == null || venueLng == null) {
        setError(
          'You chose to add a Google Maps pin — paste a Maps link or open Map and pin the venue. Or switch to “No map pin”.'
        );
        return null;
      }
    }
    if (!includeMapPin) {
      venueLat = null;
      venueLng = null;
    }
    const mealMenu = {
      breakfast: {
        enabled: !!form.offerBreakfast && breakfastItems.length > 0,
        items: breakfastItems,
      },
      lunch: {
        enabled: !!form.offerLunch && lunchItems.length > 0,
        items: lunchItems,
      },
      dinner: {
        enabled: !!form.offerDinner && dinnerItems.length > 0,
        items: dinnerItems,
      },
    };
    const programSchedule = {
      text: form.programText.trim(),
      fileName: form.programFileName || '',
      fileMime: form.programFileMime || '',
      fileData: form.programFileData || '',
    };
    return {
      id: existing?.id || newId(),
      title,
      date: form.date,
      time: form.time || '09:00',
      durationMins,
      location,
      isInPerson,
      googlePlace: includeMapPin
        ? (form.googlePlace || '').trim() || location || ''
        : location || (form.googlePlace || '').trim() || '',
      venueLat: includeMapPin && venueLat != null ? venueLat : null,
      venueLng: includeMapPin && venueLng != null ? venueLng : null,
      venueRadiusM,
      onlineLink: form.onlineLink.trim(),
      organiser: form.organiser.trim(),
      category: form.category,
      priority: form.priority,
      recurrence: form.recurrence,
      seriesId: existing?.seriesId || '',
      reminderMins: Number(form.reminderMins) || 0,
      attendees: parseAttendeesInput(form.attendees),
      agenda: form.agenda.trim(),
      notes: form.notes.trim(),
      mealMenu,
      programSchedule,
      minutes: existing?.minutes || '',
      actionItems: existing?.actionItems || [],
      status: existing?.status || 'scheduled',
      qrEnabled: !!existing?.qrEnabled,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const existing = editingId
      ? meetings.find((m) => m.id === editingId)
      : null;
    const entry = buildMeetingFromForm(existing);
    if (!entry) return;

    // New recurring series: expand into real dated instances
    const createSeries =
      !editingId &&
      entry.recurrence &&
      entry.recurrence !== 'none';
    const instances = createSeries
      ? expandRecurringMeetings(entry, Number(form.recurrenceCount) || 8)
      : [entry];

    setSyncing(true);
    const savedList = [];
    const failures = [];
    try {
      for (const inst of instances) {
        try {
          const saved = await persistMeeting(inst);
          savedList.push(saved);
        } catch (err) {
          // Always keep a local copy so the creator never loses input
          savedList.push({ ...inst, qrEnabled: false });
          failures.push(err?.message || 'save failed');
        }
      }

      setMeetings((list) => {
        if (editingId) {
          return list.map((m) =>
            m.id === editingId ? savedList[0] : m
          );
        }
        // Replace any existing same ids, then append new
        const ids = new Set(savedList.map((m) => m.id));
        const rest = list.filter((m) => !ids.has(m.id));
        return [...rest, ...savedList];
      });
      setExpandedId(savedList[0]?.id || null);

      if (failures.length && failures.length === savedList.length) {
        setError(
          failures[0] ||
            'Could not save to server. Meeting kept on this device only — reconnect and open Meetings to sync.'
        );
        flash('Saved on this device only (server unreachable).');
      } else if (failures.length) {
        flash(
          `Saved ${savedList.length - failures.length} to server; ${failures.length} device-only.`
        );
      } else if (createSeries) {
        flash(
          `Created ${savedList.length} meetings — kept until you delete them.`
        );
      } else {
        flash(
          editingId
            ? 'Meeting updated and saved.'
            : 'Meeting saved — it stays until you delete it.'
        );
      }
      resetForm();
    } finally {
      setSyncing(false);
    }
  };

  const markQrEnabled = (id) => {
    setMeetings((list) =>
      list.map((m) =>
        m.id === id
          ? { ...m, qrEnabled: true, updatedAt: new Date().toISOString() }
          : m
      )
    );
  };

  const startEdit = (m) => {
    setForm(formFromMeeting(m));
    setEditingId(m.id);
    setShowAdvanced(false);
    setShowDetails(true);
    setShowMeals(
      !!(
        m.mealMenu?.breakfast?.enabled ||
        m.mealMenu?.lunch?.enabled ||
        m.mealMenu?.dinner?.enabled
      )
    );
    setShowProgram(
      !!(m.programSchedule?.text || m.programSchedule?.fileData)
    );
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onProgramFile = (file) => {
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      setError('Program file must be under 1.5 MB.');
      return;
    }
    const allowed = /^(text\/|application\/pdf|image\/|application\/msword|application\/vnd\.)/i;
    if (!allowed.test(file.type) && !/\.(pdf|txt|md|csv|doc|docx|png|jpe?g|webp)$/i.test(file.name)) {
      setError('Upload PDF, text, Word, CSV, or image for the program schedule.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((f) => ({
        ...f,
        programFileName: file.name,
        programFileMime: file.type || 'application/octet-stream',
        programFileData: String(reader.result || ''),
      }));
      setError('');
    };
    reader.onerror = () => setError('Could not read the program file.');
    reader.readAsDataURL(file);
  };

  const clearProgramFile = () => {
    setForm((f) => ({
      ...f,
      programFileName: '',
      programFileMime: '',
      programFileData: '',
    }));
  };

  const setStatus = async (id, status) => {
    const target = meetings.find((m) => m.id === id);
    if (!target) return;
    const next = { ...target, status, updatedAt: new Date().toISOString() };
    setMeetings((list) => list.map((m) => (m.id === id ? next : m)));
    try {
      await persistMeeting(next);
    } catch {
      /* local already updated */
    }
    flash(
      status === 'completed'
        ? 'Marked completed.'
        : status === 'in_progress'
          ? 'Meeting started.'
          : status === 'cancelled'
            ? 'Meeting cancelled.'
            : 'Status updated.'
    );
  };

  const remove = async (id) => {
    if (
      !window.confirm(
        'Delete this meeting permanently? Guests will no longer be able to check in.'
      )
    ) {
      return;
    }
    try {
      await deleteMeetingApi(id);
    } catch (err) {
      // Still remove locally if server says 404 (already gone)
      if (err?.status && err.status !== 404) {
        setError(err.message || 'Could not delete on server.');
        // keep going to remove local
      }
    }
    setMeetings((list) => list.filter((m) => m.id !== id));
    if (editingId === id) resetForm();
    flash('Meeting deleted.');
  };

  const duplicate = async (m) => {
    const copy = {
      ...migrateMeeting(m),
      id: newId(),
      title: `${m.title} (copy)`,
      status: 'scheduled',
      qrEnabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      actionItems: (m.actionItems || []).map((a) => ({
        ...a,
        id: newId(),
        done: false,
      })),
    };
    try {
      const saved = await persistMeeting(copy);
      setMeetings((list) => [...list, saved]);
      flash('Meeting duplicated and saved.');
    } catch {
      setMeetings((list) => [...list, copy]);
      flash('Meeting duplicated on this device only.');
    }
  };

  const toggleAttendeeStatus = (meetingId, attendeeId) => {
    const cycle = { invited: 'accepted', accepted: 'declined', declined: 'invited' };
    setMeetings((list) =>
      list.map((m) => {
        if (m.id !== meetingId) return m;
        return {
          ...m,
          attendees: (m.attendees || []).map((a) =>
            a.id === attendeeId
              ? { ...a, status: cycle[a.status] || 'invited' }
              : a
          ),
          updatedAt: new Date().toISOString(),
        };
      })
    );
  };

  const addActionItem = (meetingId) => {
    const text = (newActionText[meetingId] || '').trim();
    if (!text) return;
    setMeetings((list) =>
      list.map((m) => {
        if (m.id !== meetingId) return m;
        return {
          ...m,
          actionItems: [
            ...(m.actionItems || []),
            { id: newId(), text, done: false, owner: '' },
          ],
          updatedAt: new Date().toISOString(),
        };
      })
    );
    setNewActionText((s) => ({ ...s, [meetingId]: '' }));
  };

  const toggleAction = (meetingId, actionId) => {
    setMeetings((list) =>
      list.map((m) => {
        if (m.id !== meetingId) return m;
        return {
          ...m,
          actionItems: (m.actionItems || []).map((a) =>
            a.id === actionId ? { ...a, done: !a.done } : a
          ),
          updatedAt: new Date().toISOString(),
        };
      })
    );
  };

  const removeAction = (meetingId, actionId) => {
    setMeetings((list) =>
      list.map((m) => {
        if (m.id !== meetingId) return m;
        return {
          ...m,
          actionItems: (m.actionItems || []).filter((a) => a.id !== actionId),
          updatedAt: new Date().toISOString(),
        };
      })
    );
  };

  const updateMinutes = (meetingId, minutes) => {
    setMeetings((list) =>
      list.map((m) =>
        m.id === meetingId
          ? { ...m, minutes, updatedAt: new Date().toISOString() }
          : m
      )
    );
  };

  const exportIcs = () => {
    downloadBlob(
      `glico-meetings-${new Date().toISOString().slice(0, 10)}.ics`,
      buildIcs(meetings),
      'text/calendar'
    );
    flash('Exported calendar (.ics).');
  };

  const downloadMenu = (meeting, format = 'txt') => {
    if (!meetingHasMenu(meeting)) {
      flash('No meal menu on this meeting.');
      return;
    }
    const safe =
      String(meeting.title || 'meeting')
        .replace(/[^\w\-]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48) || 'meeting';
    const datePart = meeting.date || new Date().toISOString().slice(0, 10);
    if (format === 'csv') {
      downloadBlob(
        `glico-menu-${safe}-${datePart}.csv`,
        buildMenuCsv(meeting),
        'text/csv;charset=utf-8'
      );
      flash('Menu downloaded (.csv).');
      return;
    }
    downloadBlob(
      `glico-menu-${safe}-${datePart}.txt`,
      buildMenuDocument(meeting),
      'text/plain;charset=utf-8'
    );
    flash('Menu downloaded (.txt).');
  };

  return (
    <section className="meetings-app" aria-label="Meetings">
      {showMapPicker && (
        <GooglePlacePicker
          value={
            form.venueLat && form.venueLng
              ? `${form.venueLat}, ${form.venueLng}`
              : form.googlePlace
          }
          onClose={() => setShowMapPicker(false)}
          onChange={(place) => {
            const label =
              typeof place === 'string' ? place : place?.label || '';
            const lat =
              typeof place === 'object' && place != null
                ? Number(place.lat)
                : null;
            const lng =
              typeof place === 'object' && place != null
                ? Number(place.lng)
                : null;
            const shortVenue = label
              ? label.split(',').slice(0, 2).join(',').trim()
              : '';
            setForm((f) => ({
              ...f,
              // Always store full map address + exact pin together
              googlePlace: label,
              venueLat: Number.isFinite(lat)
                ? String(Number(lat.toFixed(7)))
                : f.venueLat,
              venueLng: Number.isFinite(lng)
                ? String(Number(lng.toFixed(7)))
                : f.venueLng,
              isInPerson: true,
              includeMapPin: true,
              // Keep host venue note; seed from map address if empty
              location: (f.location || '').trim() || shortVenue,
            }));
            setShowMapPicker(false);
            flash(
              'Map pin set on this form. Create or Update the meeting to publish it.'
            );
          }}
        />
      )}
      <header className="meetings-header">
        <div className="meetings-header-copy">
          <p className="meetings-kicker">GLICO scheduling</p>
          <h2>Meetings</h2>
          <p>
            Plan sessions, QR check-in with venue verification, or share a
            booking page so guests pick free slots.
          </p>
          <div className="meetings-header-downloads">
            <MeetingsDeviceDownloads compact />
          </div>
        </div>
        {toast && (
          <div className="meetings-toast" role="status">
            {toast}
          </div>
        )}
      </header>

      <div className="meetings-stats" aria-label="Meeting stats">
        <div className="meetings-stat">
          <span className="meetings-stat-value">{stats.upcoming}</span>
          <span className="meetings-stat-label">Upcoming</span>
        </div>
        <div className="meetings-stat">
          <span className="meetings-stat-value">{stats.thisWeek}</span>
          <span className="meetings-stat-label">This week</span>
        </div>
        <div className="meetings-stat">
          <span className="meetings-stat-value">{stats.completed}</span>
          <span className="meetings-stat-label">Completed</span>
        </div>
        <div className="meetings-stat">
          <span className="meetings-stat-value">{stats.openActions}</span>
          <span className="meetings-stat-label">Open actions</span>
        </div>
        {stats.conflicts > 0 && (
          <div className="meetings-stat warn">
            <span className="meetings-stat-value">{stats.conflicts}</span>
            <span className="meetings-stat-label">Time conflicts</span>
          </div>
        )}
      </div>

      <div className="meetings-layout">
        <form className="meetings-form" onSubmit={onSubmit}>
          <div className="meetings-form-head">
            <span className="meetings-form-icon" aria-hidden>
              <FaCalendarPlus />
            </span>
            <div>
              <h3>{editingId ? 'Edit meeting' : 'New meeting'}</h3>
              <p className="meetings-form-sub">
                {syncing
                  ? 'Syncing with server…'
                  : 'Saved on the server until you delete it. Map pin only for in-person check-in.'}
              </p>
            </div>
          </div>

          <div className="meetings-form-body">
            {error && (
              <div className="meetings-error" role="alert">
                {error}
              </div>
            )}
            {syncError && !error && (
              <div className="meetings-error meetings-error-soft" role="status">
                {syncError}
              </div>
            )}

            <label className="meetings-field">
              <span>Title</span>
              <input
                name="title"
                className="form-input"
                value={form.title}
                onChange={onChange}
                placeholder="e.g. Branch KYC review"
                required
              />
            </label>

            <div className="meetings-row meetings-row-3">
              <label className="meetings-field">
                <span>Date</span>
                <input
                  name="date"
                  type="date"
                  className="form-input"
                  value={form.date}
                  onChange={onChange}
                  required
                />
              </label>
              <label className="meetings-field">
                <span>Time</span>
                <input
                  name="time"
                  type="time"
                  className="form-input"
                  value={form.time}
                  onChange={onChange}
                />
              </label>
              <label className="meetings-field">
                <span>Mins</span>
                <input
                  name="durationMins"
                  type="number"
                  min={15}
                  step={15}
                  className="form-input"
                  value={form.durationMins}
                  onChange={onChange}
                />
              </label>
            </div>

            <div className="meetings-row">
              <label className="meetings-field">
                <span>Category</span>
                <select
                  name="category"
                  className="form-input"
                  value={form.category}
                  onChange={onChange}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="meetings-field">
                <span>Priority</span>
                <select
                  name="priority"
                  className="form-input"
                  value={form.priority}
                  onChange={onChange}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="meetings-chip-toggles">
              <button
                type="button"
                className={`meetings-chip-toggle ${showDetails ? 'on' : ''}`}
                onClick={() => setShowDetails((s) => !s)}
                aria-expanded={showDetails}
              >
                <FaMapMarkerAlt aria-hidden /> Place & people
              </button>
              <button
                type="button"
                className={`meetings-chip-toggle ${
                  showMeals ||
                  form.offerBreakfast ||
                  form.offerLunch ||
                  form.offerDinner
                    ? 'on'
                    : ''
                }`}
                onClick={() => setShowMeals((s) => !s)}
                aria-expanded={showMeals}
              >
                Meals
                {(form.offerBreakfast || form.offerLunch || form.offerDinner) && (
                  <span className="meetings-chip-dot" aria-hidden />
                )}
              </button>
              <button
                type="button"
                className={`meetings-chip-toggle ${
                  showProgram || form.programText || form.programFileData
                    ? 'on'
                    : ''
                }`}
                onClick={() => setShowProgram((s) => !s)}
                aria-expanded={showProgram}
              >
                Program
                {(form.programText || form.programFileData) && (
                  <span className="meetings-chip-dot" aria-hidden />
                )}
              </button>
              <button
                type="button"
                className={`meetings-chip-toggle ${showAdvanced ? 'on' : ''}`}
                onClick={() => setShowAdvanced((s) => !s)}
                aria-expanded={showAdvanced}
              >
                More
              </button>
            </div>

            {showDetails && (
              <div className="meetings-panel-collapse">
                <div className="meetings-format-row" role="group" aria-label="Meeting type">
                  <span className="meetings-format-label">Meeting type</span>
                  <div className="meetings-format-options">
                    <label className={`meetings-format-opt ${form.isInPerson !== false ? 'on' : ''}`}>
                      <input
                        type="radio"
                        name="isInPerson"
                        checked={form.isInPerson !== false}
                        onChange={() =>
                          setForm((f) => ({ ...f, isInPerson: true }))
                        }
                      />
                      <span>In person</span>
                    </label>
                    <label className={`meetings-format-opt ${form.isInPerson === false ? 'on' : ''}`}>
                      <input
                        type="radio"
                        name="isInPerson"
                        checked={form.isInPerson === false}
                        onChange={() =>
                          setForm((f) => ({ ...f, isInPerson: false }))
                        }
                      />
                      <span>Online only</span>
                    </label>
                  </div>
                </div>
                <label className="meetings-field">
                  <span>
                    <FaMapMarkerAlt aria-hidden /> Venue address
                    <span className="meetings-optional-tag"> Optional</span>
                  </span>
                  <input
                    name="location"
                    className="form-input"
                    value={form.location}
                    onChange={onChange}
                    placeholder={
                      form.isInPerson !== false
                        ? 'e.g. GLICO Life Head Office, boardroom, street…'
                        : 'Optional room / branch note'
                    }
                  />
                  {form.isInPerson !== false && (
                    <p className="meetings-field-hint">
                      Plain-language address for the agenda and guests. Google Maps
                      pin is separate below.
                    </p>
                  )}
                </label>
                {form.isInPerson !== false && (
                  <div
                    className="meetings-format-row meetings-map-choice"
                    role="group"
                    aria-label="Google Maps location"
                  >
                    <span className="meetings-format-label">
                      Google Maps location
                    </span>
                    <div className="meetings-format-options">
                      <label
                        className={`meetings-format-opt ${form.includeMapPin ? 'on' : ''}`}
                      >
                        <input
                          type="radio"
                          name="includeMapPin"
                          checked={!!form.includeMapPin}
                          onChange={() =>
                            setForm((f) => ({ ...f, includeMapPin: true }))
                          }
                        />
                        <span>Add map pin</span>
                      </label>
                      <label
                        className={`meetings-format-opt ${!form.includeMapPin ? 'on' : ''}`}
                      >
                        <input
                          type="radio"
                          name="includeMapPin"
                          checked={!form.includeMapPin}
                          onChange={() =>
                            setForm((f) => ({
                              ...f,
                              includeMapPin: false,
                              venueLat: '',
                              venueLng: '',
                              googlePlace: '',
                            }))
                          }
                        />
                        <span>No map pin</span>
                      </label>
                    </div>
                    <p className="meetings-field-hint">
                      {form.includeMapPin
                        ? 'Guests can check in against this pin (± radius). Paste a Maps link or open the map.'
                        : 'Create the meeting without GPS check-in. You can add a pin later by editing.'}
                    </p>
                  </div>
                )}
                {form.isInPerson !== false && form.includeMapPin && (() => {
                  const pinSaved =
                    !!(form.venueLat && form.venueLng);
                  const gmapsSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    (form.location || form.googlePlace || 'Accra Ghana').trim()
                  )}`;
                  return (
                  <div className="meetings-venue-pin-section">
                    <div className="meetings-venue-pin-head">
                      <span className="meetings-venue-pin-icon" aria-hidden>
                        <FaMapMarkerAlt />
                      </span>
                      <div>
                        <p className="meetings-venue-pin-title">
                          Check-in location pin
                        </p>
                        <p className="meetings-venue-pin-intro">
                          Choose <strong>paste</strong> or <strong>pin on
                          map</strong>. Guests must be within ±
                          {form.venueRadiusM || 200} m when they register.
                        </p>
                      </div>
                    </div>

                    {pinSaved ? (
                      <div className="meetings-venue-saved" role="status">
                        <FaCheckCircle aria-hidden />
                        <div className="meetings-venue-saved-body">
                          <strong>Pin saved</strong>
                          <span className="meetings-venue-saved-coords">
                            {Number(form.venueLat).toFixed(5)},{' '}
                            {Number(form.venueLng).toFixed(5)}
                          </span>
                          {form.googlePlace && (
                            <p className="meetings-venue-saved-addr">
                              {form.googlePlace}
                            </p>
                          )}
                          <a
                            href={mapsOpenUrl(
                              `${form.venueLat},${form.venueLng}`
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="meetings-place-open"
                          >
                            View in Google Maps{' '}
                            <FaExternalLinkAlt aria-hidden />
                          </a>
                          <button
                            type="button"
                            className="meetings-clear-pin-btn"
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                includeMapPin: false,
                                venueLat: '',
                                venueLng: '',
                                googlePlace: '',
                              }))
                            }
                          >
                            Remove pin
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="meetings-venue-pending">
                        No pin yet — use Option A or B below, or choose{' '}
                        <strong>No map pin</strong> above to create without one.
                      </p>
                    )}

                    <div className="meetings-venue-options">
                      <div className="meetings-venue-option">
                        <div className="meetings-venue-option-head">
                          <span className="meetings-venue-badge">A</span>
                          <div>
                            <p className="meetings-venue-option-title">
                              <FaPaste aria-hidden /> Paste Google Maps link
                            </p>
                            <p className="meetings-venue-option-sub">
                              Best when you already found the place in Google
                              Maps
                            </p>
                          </div>
                        </div>
                        <input
                          type="text"
                          className="form-input meetings-venue-paste-input"
                          placeholder="Paste link or coordinates, e.g. 5.6037, -0.1870"
                          value={gmapsPaste}
                          onChange={(e) => {
                            setGmapsPaste(e.target.value);
                            setError('');
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              applyGoogleMapsPaste(gmapsPaste);
                            }
                          }}
                          onPaste={(e) => {
                            const text = e.clipboardData?.getData('text');
                            if (text && text.trim()) {
                              setTimeout(
                                () => applyGoogleMapsPaste(text.trim()),
                                0
                              );
                            }
                          }}
                        />
                        <div className="meetings-venue-option-actions">
                          <button
                            type="button"
                            className="meetings-gmaps-apply-btn"
                            onClick={() => applyGoogleMapsPaste(gmapsPaste)}
                            disabled={gmapsPasteBusy}
                          >
                            {gmapsPasteBusy ? 'Adding…' : 'Add pin'}
                          </button>
                          <a
                            className="meetings-gmaps-open"
                            href={gmapsSearchUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <FaLink aria-hidden /> Open Google Maps
                          </a>
                        </div>
                        <ol className="meetings-venue-steps">
                          <li>Open Google Maps and find the venue</li>
                          <li>
                            Phone / tablet: tap the pin → <strong>Share</strong> →{' '}
                            <strong>Copy link</strong> (or copy coordinates), then
                            paste below and tap <strong>Add pin</strong>
                          </li>
                          <li>
                            Computer: right‑click the red pin → copy coordinates,
                            or Share → copy link, then paste and{' '}
                            <strong>Add pin</strong>
                          </li>
                          <li>
                            Full place URLs work best; short Share links
                            (<code>maps.app.goo.gl</code>) often need map confirm
                          </li>
                        </ol>
                      </div>

                      <div className="meetings-venue-divider">
                        <span>or</span>
                      </div>

                      <div className="meetings-venue-option">
                        <div className="meetings-venue-option-head">
                          <span className="meetings-venue-badge meetings-venue-badge-b">
                            B
                          </span>
                          <div>
                            <p className="meetings-venue-option-title">
                              <FaMapMarkerAlt aria-hidden /> Pin on map
                            </p>
                            <p className="meetings-venue-option-sub">
                              Search inside the app and drop the pin manually
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="meetings-pin-map-cta"
                          onClick={() => setShowMapPicker(true)}
                        >
                          <FaMapMarkerAlt aria-hidden />
                          {pinSaved ? 'Adjust pin on map' : 'Open map picker'}
                        </button>
                        <ol className="meetings-venue-steps">
                          <li>Search for the place in the map picker</li>
                          <li>Tap a result or click the map to drop a pin</li>
                          <li>Drag to fine-tune → Use address &amp; pin</li>
                        </ol>
                      </div>
                    </div>
                  </div>
                  );
                })()}
                {form.isInPerson !== false && form.includeMapPin && (
                  <label className="meetings-field meetings-radius-field">
                    <span>Check-in radius (metres)</span>
                    <input
                      name="venueRadiusM"
                      type="number"
                      min={50}
                      max={2000}
                      step={25}
                      className="form-input"
                      value={form.venueRadiusM}
                      onChange={onChange}
                    />
                  </label>
                )}
                <div className="meetings-row">
                  <label className="meetings-field">
                    <span>
                      Online link
                      {form.isInPerson === false ? (
                        <span className="meetings-required-tag"> Recommended</span>
                      ) : null}
                    </span>
                    <input
                      name="onlineLink"
                      className="form-input"
                      value={form.onlineLink}
                      onChange={onChange}
                      placeholder="Teams / Zoom"
                    />
                  </label>
                  <label className="meetings-field">
                    <span>
                      <FaUsers aria-hidden /> Attendees
                    </span>
                    <input
                      name="attendees"
                      className="form-input"
                      value={form.attendees}
                      onChange={onChange}
                      placeholder="Comma-separated"
                    />
                  </label>
                </div>
                <label className="meetings-field">
                  <span>Agenda</span>
                  <textarea
                    name="agenda"
                    className="form-input meetings-textarea"
                    value={form.agenda}
                    onChange={onChange}
                    rows={2}
                    placeholder="Topics…"
                  />
                </label>
              </div>
            )}

            {showMeals && (
              <div className="meetings-meal-box">
                <div className="meetings-meal-toggles-row">
                  <label className="meetings-meal-toggle">
                    <input
                      type="checkbox"
                      checked={!!form.offerBreakfast}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          offerBreakfast: e.target.checked,
                        }))
                      }
                    />
                    <span>Breakfast</span>
                  </label>
                  <label className="meetings-meal-toggle">
                    <input
                      type="checkbox"
                      checked={!!form.offerLunch}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, offerLunch: e.target.checked }))
                      }
                    />
                    <span>Lunch</span>
                  </label>
                  <label className="meetings-meal-toggle">
                    <input
                      type="checkbox"
                      checked={!!form.offerDinner}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          offerDinner: e.target.checked,
                        }))
                      }
                    />
                    <span>Dinner</span>
                  </label>
                </div>
                {form.offerBreakfast && (
                  <label className="meetings-field">
                    <span>Breakfast options</span>
                    <textarea
                      name="breakfastMenu"
                      className="form-input meetings-textarea"
                      value={form.breakfastMenu}
                      onChange={onChange}
                      rows={2}
                      placeholder="One item per line"
                    />
                  </label>
                )}
                {form.offerLunch && (
                  <label className="meetings-field">
                    <span>Lunch options</span>
                    <textarea
                      name="lunchMenu"
                      className="form-input meetings-textarea"
                      value={form.lunchMenu}
                      onChange={onChange}
                      rows={2}
                      placeholder="One item per line"
                    />
                  </label>
                )}
                {form.offerDinner && (
                  <label className="meetings-field">
                    <span>Dinner options</span>
                    <textarea
                      name="dinnerMenu"
                      className="form-input meetings-textarea"
                      value={form.dinnerMenu}
                      onChange={onChange}
                      rows={2}
                      placeholder="One item per line"
                    />
                  </label>
                )}
              </div>
            )}

            {showProgram && (
              <div className="meetings-program-box">
                <p className="meetings-program-title">Program schedule</p>
                <p className="meetings-field-hint">
                  Type the run-of-show, or upload a PDF / Word / image schedule.
                </p>
                <label className="meetings-field">
                  <span>Schedule text</span>
                  <textarea
                    name="programText"
                    className="form-input meetings-textarea"
                    value={form.programText}
                    onChange={onChange}
                    rows={3}
                    placeholder={"09:00 Registration\n09:30 Welcome\n10:00 Sessions…"}
                  />
                </label>
                <div className="meetings-program-upload">
                  <label className="meetings-program-file-btn">
                    Upload schedule file
                    <input
                      type="file"
                      accept=".pdf,.txt,.md,.csv,.doc,.docx,image/*,application/pdf"
                      hidden
                      onChange={(e) => {
                        onProgramFile(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {form.programFileName ? (
                    <div className="meetings-program-file-meta">
                      <span title={form.programFileName}>
                        {form.programFileName}
                      </span>
                      <button
                        type="button"
                        className="meetings-program-clear"
                        onClick={clearProgramFile}
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <span className="meetings-field-hint">
                      PDF, Word, text, CSV, or image · max 1.5 MB
                    </span>
                  )}
                </div>
              </div>
            )}

            {showAdvanced && (
              <div className="meetings-advanced">
                <label className="meetings-field">
                  <span>Organiser</span>
                  <input
                    name="organiser"
                    className="form-input"
                    value={form.organiser}
                    onChange={onChange}
                    placeholder="Chair"
                  />
                </label>
                <div className="meetings-row">
                  <label className="meetings-field">
                    <span>Recurrence</span>
                    <select
                      name="recurrence"
                      className="form-input"
                      value={form.recurrence}
                      onChange={onChange}
                    >
                      {RECURRENCE.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {form.recurrence !== 'none' && !editingId && (
                    <label className="meetings-field">
                      <span>Create how many?</span>
                      <input
                        name="recurrenceCount"
                        type="number"
                        min={2}
                        max={52}
                        className="form-input"
                        value={form.recurrenceCount}
                        onChange={onChange}
                      />
                    </label>
                  )}
                  <label className="meetings-field">
                    <span>Reminder</span>
                    <select
                      name="reminderMins"
                      className="form-input"
                      value={form.reminderMins}
                      onChange={onChange}
                    >
                      <option value="0">None</option>
                      <option value="15">15 min</option>
                      <option value="30">30 min</option>
                      <option value="60">1 hour</option>
                      <option value="1440">1 day</option>
                    </select>
                  </label>
                </div>
                <label className="meetings-field">
                  <span>Notes</span>
                  <textarea
                    name="notes"
                    className="form-input meetings-textarea"
                    value={form.notes}
                    onChange={onChange}
                    rows={2}
                    placeholder="Internal notes…"
                  />
                </label>
              </div>
            )}
          </div>

          <div className="meetings-form-actions">
            <button
              type="submit"
              className="btn btn-primary meetings-submit"
              disabled={syncing}
            >
              {syncing
                ? 'Saving…'
                : editingId
                  ? 'Update meeting'
                  : 'Save meeting'}
            </button>
            {editingId && (
              <button
                type="button"
                className="btn meetings-cancel-edit"
                onClick={resetForm}
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        <div className="meetings-list-panel">
          <div className="meetings-panel-toolbar">
            <div className="meetings-view-toggle" role="tablist" aria-label="View">
              <button
                type="button"
                role="tab"
                aria-selected={listView === 'agenda'}
                className={`meetings-view-btn ${listView === 'agenda' ? 'active' : ''}`}
                onClick={() => setListView('agenda')}
              >
                Agenda
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={listView === 'calendar'}
                className={`meetings-view-btn ${listView === 'calendar' ? 'active' : ''}`}
                onClick={() => setListView('calendar')}
              >
                <FaCalendarAlt aria-hidden /> Calendar
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={listView === 'booking'}
                className={`meetings-view-btn ${listView === 'booking' ? 'active' : ''}`}
                onClick={() => setListView('booking')}
              >
                Book with me
              </button>
            </div>
          </div>

          {listView === 'booking' && <BookingHost />}

          {listView === 'calendar' && (
            <MeetingCalendar
              meetings={meetings}
              selectedDate={calendarDate}
              onSelectDate={(d) => {
                setCalendarDate(d);
                if (d) setStatusFilter('all');
              }}
            />
          )}

          {listView !== 'booking' && (
            <>
              <div className="meetings-toolbar">
                <label className="meetings-search">
                  <FaSearch aria-hidden />
                  <input
                    type="search"
                    className="form-input"
                    placeholder="Search title, people, agenda…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <div className="meetings-toolbar-selects">
                  <select
                    className="form-input meetings-select-sm"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    aria-label="Filter by category"
                  >
                    <option value="all">All categories</option>
                    {CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="form-input meetings-select-sm"
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                    aria-label="Filter by priority"
                  >
                    <option value="all">All priorities</option>
                    {PRIORITIES.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="form-input meetings-select-sm"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    aria-label="Sort meetings"
                  >
                    <option value="date_asc">Soonest first</option>
                    <option value="date_desc">Latest first</option>
                    <option value="priority">Priority</option>
                    <option value="title">Title A–Z</option>
                  </select>
                </div>
              </div>

              <div className="meetings-filters">
                {[
                  { id: 'upcoming', label: 'Upcoming' },
                  { id: 'in_progress', label: 'In progress' },
                  { id: 'past', label: 'Past' },
                  { id: 'completed', label: 'Completed' },
                  { id: 'all', label: 'All' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`meetings-filter ${statusFilter === f.id ? 'active' : ''}`}
                    onClick={() => setStatusFilter(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="meetings-io">
                <button type="button" className="meetings-io-btn" onClick={exportIcs}>
                  <FaDownload /> Calendar (.ics)
                </button>
              </div>

              {visible.length === 0 ? (
            <div className="meetings-empty">
              <span className="meetings-empty-icon" aria-hidden>
                <FaCalendarPlus />
              </span>
              <p className="meetings-empty-title">No meetings in this view</p>
              <p className="meetings-empty-copy">
                Create a meeting on the left (title + date is enough). It stays
                saved until you delete it. Switch filters or day on the calendar
                to see more.
              </p>
            </div>
          ) : (
            <div className="meetings-groups">
              {grouped.map(([dateKey, dayMeetings]) => (
                <div key={dateKey} className="meetings-day-group">
                  <h3 className="meetings-day-heading">
                    {dateKey === 'No date'
                      ? 'No date'
                      : formatDisplayDate(dateKey)}
                    <span className="meetings-day-count">
                      {dayMeetings.length}
                    </span>
                  </h3>
                  <ul className="meetings-list">
                    {dayMeetings.map((m) => {
                      const isExpanded = expandedId === m.id;
                      const hasConflict = conflictIds.has(m.id);
                      return (
                        <li
                          key={m.id}
                          className={`meetings-item status-${m.status} priority-${m.priority} ${
                            hasConflict ? 'has-conflict' : ''
                          }`}
                        >
                          <div className="meetings-item-top">
                            <button
                              type="button"
                              className="meetings-item-main"
                              onClick={() =>
                                setExpandedId(isExpanded ? null : m.id)
                              }
                            >
                              <div className="meetings-item-title-row">
                                <h4>{m.title}</h4>
                                <span
                                  className={`meetings-priority-pill p-${m.priority}`}
                                >
                                  <FaFlag aria-hidden /> {m.priority}
                                </span>
                              </div>
                              <p className="meetings-meta">
                                <FaClock aria-hidden />
                                {formatTimeRange(m)}
                                {m.durationMins ? ` · ${m.durationMins}m` : ''}
                                {m.location ? ` · ${m.location}` : ''}
                              </p>
                              <div className="meetings-chips">
                                <span className="meetings-chip">
                                  {categoryLabel(m.category)}
                                </span>
                                <span
                                  className={`meetings-chip status-chip s-${m.status}`}
                                >
                                  {m.status.replace('_', ' ')}
                                </span>
                                {m.recurrence !== 'none' && (
                                  <span className="meetings-chip">
                                    Repeats: {m.recurrence}
                                  </span>
                                )}
                                {m.reminderMins > 0 && (
                                  <span className="meetings-chip">
                                    Reminder {m.reminderMins}m
                                  </span>
                                )}
                                {m.qrEnabled && (
                                  <span className="meetings-chip">
                                    QR check-in on
                                  </span>
                                )}
                                {(m.googlePlace || m.location) && (
                                  <span className="meetings-chip">
                                    <FaMapMarkerAlt aria-hidden /> Map
                                  </span>
                                )}
                                {m.isInPerson === false && (
                                  <span className="meetings-chip">Online</span>
                                )}
                                {m.isInPerson !== false &&
                                  m.venueLat != null &&
                                  m.venueLng != null && (
                                  <span className="meetings-chip">In person</span>
                                )}
                                {m.mealMenu?.breakfast?.enabled && (
                                  <span className="meetings-chip">Breakfast menu</span>
                                )}
                                {m.mealMenu?.lunch?.enabled && (
                                  <span className="meetings-chip">Lunch menu</span>
                                )}
                                {m.mealMenu?.dinner?.enabled && (
                                  <span className="meetings-chip">Dinner menu</span>
                                )}
                                {meetingHasMenu(m) && (
                                  <button
                                    type="button"
                                    className="meetings-chip meetings-chip-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      downloadMenu(m, 'txt');
                                    }}
                                    title="Download meal menu"
                                  >
                                    <FaDownload aria-hidden /> Download menu
                                  </button>
                                )}
                                {(m.programSchedule?.text ||
                                  m.programSchedule?.fileData) && (
                                  <span className="meetings-chip">Program</span>
                                )}
                                {hasConflict && (
                                  <span className="meetings-chip conflict">
                                    <FaExclamationTriangle aria-hidden />{' '}
                                    Conflict
                                  </span>
                                )}
                                {m.qrEnabled && (
                                  <span className="meetings-chip qr">
                                    QR check-in
                                  </span>
                                )}
                                {(m.attendees || []).length > 0 && (
                                  <span className="meetings-chip">
                                    <FaUsers aria-hidden />{' '}
                                    {m.attendees.length} people
                                  </span>
                                )}
                                {(m.actionItems || []).filter((a) => !a.done)
                                  .length > 0 && (
                                  <span className="meetings-chip">
                                    {
                                      m.actionItems.filter((a) => !a.done)
                                        .length
                                    }{' '}
                                    actions open
                                  </span>
                                )}
                              </div>
                            </button>

                            <div className="meetings-item-actions">
                              {m.status === 'scheduled' && (
                                <button
                                  type="button"
                                  className="meetings-action start"
                                  onClick={() => setStatus(m.id, 'in_progress')}
                                  title="Start"
                                >
                                  <FaPlay /> Start
                                </button>
                              )}
                              {(m.status === 'scheduled' ||
                                m.status === 'in_progress') && (
                                <button
                                  type="button"
                                  className="meetings-action done"
                                  onClick={() => setStatus(m.id, 'completed')}
                                  title="Complete"
                                >
                                  <FaCheck /> Done
                                </button>
                              )}
                              {m.status === 'completed' && (
                                <button
                                  type="button"
                                  className="meetings-action reopen"
                                  onClick={() => setStatus(m.id, 'scheduled')}
                                  title="Reopen"
                                >
                                  <FaUndo /> Reopen
                                </button>
                              )}
                              {m.status !== 'cancelled' &&
                                m.status !== 'completed' && (
                                  <button
                                    type="button"
                                    className="meetings-action cancel"
                                    onClick={() => setStatus(m.id, 'cancelled')}
                                    title="Cancel meeting"
                                  >
                                    <FaBan />
                                  </button>
                                )}
                              <button
                                type="button"
                                className="meetings-action edit"
                                onClick={() => startEdit(m)}
                                title="Edit"
                              >
                                <FaEdit />
                              </button>
                              <button
                                type="button"
                                className="meetings-action copy"
                                onClick={() => duplicate(m)}
                                title="Duplicate"
                              >
                                <FaCopy />
                              </button>
                              <button
                                type="button"
                                className="meetings-action delete"
                                onClick={() => remove(m.id)}
                                title="Delete"
                              >
                                <FaTrash />
                              </button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="meetings-detail">
                              <MeetingCheckIn
                                meeting={m}
                                onPublished={markQrEnabled}
                              />

                              {m.organiser && (
                                <p>
                                  <strong>Organiser:</strong> {m.organiser}
                                </p>
                              )}
                              {m.onlineLink && (
                                <p>
                                  <strong>Link:</strong>{' '}
                                  {isLink(m.onlineLink) ? (
                                    <a
                                      href={m.onlineLink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      Join online <FaExternalLinkAlt />
                                    </a>
                                  ) : (
                                    m.onlineLink
                                  )}
                                </p>
                              )}
                              {m.agenda && (
                                <div className="meetings-block">
                                  <strong>Agenda</strong>
                                  <p className="meetings-pre">{m.agenda}</p>
                                </div>
                              )}
                              {(m.mealMenu?.breakfast?.enabled ||
                                m.mealMenu?.lunch?.enabled ||
                                m.mealMenu?.dinner?.enabled) && (
                                <div className="meetings-block">
                                  <div className="meetings-block-head">
                                    <strong>Meals menu</strong>
                                    {meetingHasMenu(m) && (
                                      <div className="meetings-menu-dl">
                                        <button
                                          type="button"
                                          className="meetings-menu-dl-btn"
                                          onClick={() => downloadMenu(m, 'txt')}
                                        >
                                          <FaDownload aria-hidden />{' '}
                                          <FaUtensils aria-hidden /> Menu (.txt)
                                        </button>
                                        <button
                                          type="button"
                                          className="meetings-menu-dl-btn"
                                          onClick={() => downloadMenu(m, 'csv')}
                                        >
                                          <FaDownload aria-hidden /> Menu (.csv)
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                  {m.mealMenu?.breakfast?.enabled && (
                                    <p className="meetings-pre">
                                      Breakfast:{' '}
                                      {m.mealMenu.breakfast.items.join(', ')}
                                    </p>
                                  )}
                                  {m.mealMenu?.lunch?.enabled && (
                                    <p className="meetings-pre">
                                      Lunch: {m.mealMenu.lunch.items.join(', ')}
                                    </p>
                                  )}
                                  {m.mealMenu?.dinner?.enabled && (
                                    <p className="meetings-pre">
                                      Dinner:{' '}
                                      {m.mealMenu.dinner.items.join(', ')}
                                    </p>
                                  )}
                                </div>
                              )}
                              {(m.programSchedule?.text ||
                                m.programSchedule?.fileData) && (
                                <div className="meetings-block">
                                  <strong>Program schedule</strong>
                                  {m.programSchedule?.text && (
                                    <p className="meetings-pre">
                                      {m.programSchedule.text}
                                    </p>
                                  )}
                                  {m.programSchedule?.fileData && (
                                    <p className="meetings-pre">
                                      <a
                                        href={m.programSchedule.fileData}
                                        download={
                                          m.programSchedule.fileName ||
                                          'program-schedule'
                                        }
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        Download{' '}
                                        {m.programSchedule.fileName ||
                                          'program file'}
                                      </a>
                                    </p>
                                  )}
                                </div>
                              )}
                              {m.notes && (
                                <div className="meetings-block">
                                  <strong>Notes</strong>
                                  <p className="meetings-pre">{m.notes}</p>
                                </div>
                              )}

                              {(m.attendees || []).length > 0 && (
                                <div className="meetings-block">
                                  <strong>Attendees</strong>
                                  <ul className="meetings-attendee-list">
                                    {m.attendees.map((a) => (
                                      <li key={a.id}>
                                        <button
                                          type="button"
                                          className={`meetings-attendee-rsvp rsvp-${a.status}`}
                                          onClick={() =>
                                            toggleAttendeeStatus(m.id, a.id)
                                          }
                                          title="Cycle RSVP status"
                                        >
                                          {a.name}
                                          <span>{a.status}</span>
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                  <p className="meetings-hint">
                                    Click a name to cycle invited → accepted →
                                    declined.
                                  </p>
                                </div>
                              )}

                              <div className="meetings-block">
                                <strong>Action items</strong>
                                <ul className="meetings-actions-list">
                                  {(m.actionItems || []).map((a) => (
                                    <li key={a.id}>
                                      <label
                                        className={a.done ? 'is-done' : ''}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={!!a.done}
                                          onChange={() =>
                                            toggleAction(m.id, a.id)
                                          }
                                        />
                                        <span>{a.text}</span>
                                      </label>
                                      <button
                                        type="button"
                                        className="meetings-x"
                                        onClick={() =>
                                          removeAction(m.id, a.id)
                                        }
                                        aria-label="Remove action"
                                      >
                                        <FaTimes />
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                                <div className="meetings-add-action">
                                  <input
                                    className="form-input"
                                    placeholder="New action item…"
                                    value={newActionText[m.id] || ''}
                                    onChange={(e) =>
                                      setNewActionText((s) => ({
                                        ...s,
                                        [m.id]: e.target.value,
                                      }))
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addActionItem(m.id);
                                      }
                                    }}
                                  />
                                  <button
                                    type="button"
                                    className="meetings-action done"
                                    onClick={() => addActionItem(m.id)}
                                  >
                                    <FaPlus /> Add
                                  </button>
                                </div>
                              </div>

                              <div className="meetings-block">
                                <strong>Meeting minutes</strong>
                                <textarea
                                  className="form-input meetings-textarea"
                                  rows={3}
                                  placeholder="Decisions, summary…"
                                  value={m.minutes || ''}
                                  onChange={(e) =>
                                    updateMinutes(m.id, e.target.value)
                                  }
                                />
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
            </>
          )}
        </div>
      </div>
    </section>
  );
};

export default MeetingsApp;
