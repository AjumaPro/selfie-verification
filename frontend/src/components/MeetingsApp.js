import React, { useEffect, useMemo, useState } from 'react';
import {
  FaCalendarPlus,
  FaTrash,
  FaCheck,
  FaClock,
  FaUsers,
  FaMapMarkerAlt,
} from 'react-icons/fa';
import './MeetingsApp.css';

const STORAGE_KEY = 'glico_meetings_v1';

function loadMeetings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMeetings(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const emptyForm = {
  title: '',
  date: '',
  time: '',
  location: '',
  attendees: '',
  notes: '',
};

/**
 * Standalone Meetings application (separate from Image Recognition).
 * Data is stored per-browser in localStorage.
 */
const MeetingsApp = () => {
  const [meetings, setMeetings] = useState(() => loadMeetings());
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('upcoming'); // upcoming | past | all

  useEffect(() => {
    saveMeetings(meetings);
  }, [meetings]);

  const sorted = useMemo(() => {
    const withKey = meetings.map((m) => ({
      ...m,
      sortKey: `${m.date || '9999-99-99'}T${m.time || '00:00'}`,
    }));
    withKey.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    return withKey;
  }, [meetings]);

  const visible = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const nowKey = `${today}T${hhmm}`;

    return sorted.filter((m) => {
      if (filter === 'all') return true;
      if (m.status === 'done') return filter === 'past';
      const isPast = m.sortKey < nowKey;
      if (filter === 'past') return isPast || m.status === 'done';
      return !isPast && m.status !== 'done';
    });
  }, [sorted, filter]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const onSubmit = (e) => {
    e.preventDefault();
    setError('');
    const title = form.title.trim();
    if (!title) {
      setError('Meeting title is required.');
      return;
    }
    if (!form.date) {
      setError('Choose a meeting date.');
      return;
    }

    const entry = {
      id: newId(),
      title,
      date: form.date,
      time: form.time || '09:00',
      location: form.location.trim(),
      attendees: form.attendees.trim(),
      notes: form.notes.trim(),
      status: 'scheduled',
      createdAt: new Date().toISOString(),
    };

    setMeetings((list) => [...list, entry]);
    setForm(emptyForm);
  };

  const markDone = (id) => {
    setMeetings((list) =>
      list.map((m) => (m.id === id ? { ...m, status: 'done' } : m))
    );
  };

  const remove = (id) => {
    setMeetings((list) => list.filter((m) => m.id !== id));
  };

  return (
    <section className="meetings-app" aria-label="Meetings">
      <header className="meetings-header">
        <h2>Meetings</h2>
        <p>
          Schedule and track team sessions. This app is separate from Image
          Recognition; meetings stay on this device (browser storage).
        </p>
      </header>

      <div className="meetings-layout">
        <form className="meetings-form" onSubmit={onSubmit}>
          <h3>
            <FaCalendarPlus aria-hidden /> New meeting
          </h3>

          {error && (
            <div className="meetings-error" role="alert">
              {error}
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

          <div className="meetings-row">
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
          </div>

          <label className="meetings-field">
            <span>
              <FaMapMarkerAlt aria-hidden /> Location / link
            </span>
            <input
              name="location"
              className="form-input"
              value={form.location}
              onChange={onChange}
              placeholder="Office room, Teams link, …"
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
              placeholder="Names, comma-separated"
            />
          </label>

          <label className="meetings-field">
            <span>Agenda / notes</span>
            <textarea
              name="notes"
              className="form-input meetings-textarea"
              value={form.notes}
              onChange={onChange}
              rows={3}
              placeholder="Topics to cover…"
            />
          </label>

          <button type="submit" className="btn btn-primary meetings-submit">
            Save meeting
          </button>
        </form>

        <div className="meetings-list-panel">
          <div className="meetings-filters">
            {[
              { id: 'upcoming', label: 'Upcoming' },
              { id: 'past', label: 'Past / done' },
              { id: 'all', label: 'All' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                className={`meetings-filter ${filter === f.id ? 'active' : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <p className="meetings-empty">No meetings in this view yet.</p>
          ) : (
            <ul className="meetings-list">
              {visible.map((m) => (
                <li
                  key={m.id}
                  className={`meetings-item ${m.status === 'done' ? 'is-done' : ''}`}
                >
                  <div className="meetings-item-main">
                    <h4>{m.title}</h4>
                    <p className="meetings-meta">
                      <FaClock aria-hidden />
                      {m.date}
                      {m.time ? ` · ${m.time}` : ''}
                      {m.location ? ` · ${m.location}` : ''}
                    </p>
                    {m.attendees && (
                      <p className="meetings-attendees">
                        <FaUsers aria-hidden /> {m.attendees}
                      </p>
                    )}
                    {m.notes && <p className="meetings-notes">{m.notes}</p>}
                    {m.status === 'done' && (
                      <span className="meetings-badge">Completed</span>
                    )}
                  </div>
                  <div className="meetings-item-actions">
                    {m.status !== 'done' && (
                      <button
                        type="button"
                        className="meetings-action done"
                        onClick={() => markDone(m.id)}
                        title="Mark complete"
                      >
                        <FaCheck /> Done
                      </button>
                    )}
                    <button
                      type="button"
                      className="meetings-action delete"
                      onClick={() => remove(m.id)}
                      title="Delete"
                    >
                      <FaTrash />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};

export default MeetingsApp;
