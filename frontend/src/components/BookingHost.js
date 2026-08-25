import React, { useCallback, useEffect, useState } from 'react';
import {
  FaCalendarCheck,
  FaCopy,
  FaExternalLinkAlt,
  FaMapMarkerAlt,
  FaPaste,
  FaSync,
  FaTrash,
} from 'react-icons/fa';
import GooglePlacePicker from './GooglePlacePicker';
import {
  publishBookingPage,
  fetchAppointments,
  cancelAppointment,
  getBookingUrl,
} from '../services/bookingApi';
import { mapsOpenUrl, resolveMapsLink } from '../services/meetingsApi';
import {
  resolveGoogleMapsPaste,
  isGoogleMapsPaste,
  formatCoord,
} from '../utils/googleMapsPaste';
import './BookingHost.css';
import './MeetingCheckIn.css';

const STORAGE_KEY = 'glico_booking_page_v1';

const WEEKDAY_OPTS = [
  { id: 1, label: 'Mon' },
  { id: 2, label: 'Tue' },
  { id: 3, label: 'Wed' },
  { id: 4, label: 'Thu' },
  { id: 5, label: 'Fri' },
  { id: 6, label: 'Sat' },
  { id: 0, label: 'Sun' },
];

function newPageId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `bp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function defaultPage() {
  return {
    id: newPageId(),
    title: 'Book a meeting',
    description: 'Pick a free slot that works for you.',
    organiser: '',
    durationMins: 30,
    intervalMins: 30,
    daysAhead: 28,
    weekdays: [1, 2, 3, 4, 5],
    dayStart: '09:00',
    dayEnd: '17:00',
    bufferMins: 0,
    location: '',
    googlePlace: '',
    venueLat: null,
    venueLng: null,
    venueRadiusM: 200,
    onlineLink: '',
    timezone: 'Africa/Accra',
    active: true,
  };
}

function loadPage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPage();
    const parsed = JSON.parse(raw);
    return { ...defaultPage(), ...parsed, id: parsed.id || newPageId() };
  } catch {
    return defaultPage();
  }
}

function savePage(page) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(page));
}

/**
 * Host: publishing free-slot booking page + appointment list.
 */
const BookingHost = () => {
  const [page, setPage] = useState(() => loadPage());
  const [appointments, setAppointments] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [copied, setCopied] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [published, setPublished] = useState(false);
  const [gmapsPaste, setGmapsPaste] = useState('');
  const [gmapsPasteBusy, setGmapsPasteBusy] = useState(false);

  const bookingUrl = getBookingUrl(page.id);

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setError('');
    try {
      const data = await fetchAppointments(page.id);
      setAppointments(data.appointments || []);
      setPublished(true);
    } catch (err) {
      if (err.status === 404) {
        setAppointments([]);
        setPublished(false);
      } else {
        setError(err.message || 'Could not load appointments.');
      }
    } finally {
      setLoadingList(false);
    }
  }, [page.id]);

  useEffect(() => {
    savePage(page);
  }, [page]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const setField = (key, value) => {
    setPage((p) => ({ ...p, [key]: value }));
  };

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
        hint: page.location || page.googlePlace || '',
        expandUrl: async (url) => {
          try {
            return await resolveMapsLink(url, page.location || '');
          } catch {
            return null;
          }
        },
      });

      if (
        resolved?.lat != null &&
        resolved?.lng != null &&
        !resolved.needsConfirm &&
        !resolved.error
      ) {
        const label =
          resolved.label ||
          `${formatCoord(resolved.lat)}, ${formatCoord(resolved.lng)}`;
        setPage((p) => ({
          ...p,
          googlePlace: label,
          venueLat: Number(resolved.lat.toFixed(7)),
          venueLng: Number(resolved.lng.toFixed(7)),
          location: (p.location || '').trim() || label.split(',').slice(0, 2).join(',').trim(),
        }));
        setGmapsPaste('');
        flash('Exact Google Maps pin set. Publish/Update to save for guests.');
        return;
      }

      // Uncertain / short link — open map for confirm
      setGmapsPaste(text);
      setShowMap(true);
      if (resolved?.error) {
        setError(resolved.error);
      } else {
        flash('Confirm the pin on the map, then Use this place.');
      }
    } catch (err) {
      setError(err.message || 'Could not read that Google Maps paste.');
    } finally {
      setGmapsPasteBusy(false);
    }
  };

  const toggleDay = (day) => {
    setPage((p) => {
      const set = new Set(p.weekdays || []);
      if (set.has(day)) set.delete(day);
      else set.add(day);
      const weekdays = Array.from(set).sort((a, b) => a - b);
      return { ...p, weekdays: weekdays.length ? weekdays : [1, 2, 3, 4, 5] };
    });
  };

  const publish = async (e) => {
    e.preventDefault();
    setError('');
    if (!String(page.title || '').trim()) {
      setError('Add a title for your booking page.');
      return;
    }
    setSaving(true);
    try {
      await publishBookingPage({
        ...page,
        durationMins: Number(page.durationMins) || 30,
        intervalMins: Number(page.intervalMins) || Number(page.durationMins) || 30,
        daysAhead: Number(page.daysAhead) || 28,
        bufferMins: Number(page.bufferMins) || 0,
        venueRadiusM: Number(page.venueRadiusM) || 200,
        active: true,
      });
      setPublished(true);
      flash('Booking page published. Share the link with guests.');
      await loadList();
    } catch (err) {
      setError(
        err.message ||
          'Could not publish. Is the API running on port 4000?'
      );
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy booking link:', bookingUrl);
    }
  };

  const drop = async (id) => {
    if (!window.confirm('Cancel this appointment? The slot will free up.'))
      return;
    try {
      await cancelAppointment(page.id, id);
      setAppointments((list) =>
        list.map((a) => (a.id === id ? { ...a, status: 'cancelled' } : a))
      );
      flash('Appointment cancelled.');
    } catch (err) {
      setError(err.message || 'Could not cancel.');
    }
  };

  const activeAppts = appointments.filter((a) => a.status === 'booked');
  const pastish = appointments.filter((a) => a.status === 'cancelled');

  return (
    <div className="booking-host">
      {showMap && (
        <GooglePlacePicker
          value={
            page.venueLat != null && page.venueLng != null
              ? `${page.venueLat}, ${page.venueLng}`
              : page.googlePlace
          }
          onClose={() => setShowMap(false)}
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
            setPage((p) => ({
              ...p,
              googlePlace: label,
              venueLat: Number.isFinite(lat) ? lat : p.venueLat,
              venueLng: Number.isFinite(lng) ? lng : p.venueLng,
              location:
                p.location ||
                (label ? label.split(',').slice(0, 2).join(',').trim() : ''),
            }));
            setShowMap(false);
          }}
        />
      )}

      <header className="booking-host-head">
        <div>
          <h3>
            <FaCalendarCheck aria-hidden /> Booking page
          </h3>
          <p>
            Set when you are free. Guests open your link, pick a slot, and book —
            no account needed.
          </p>
        </div>
        {toast && (
          <div className="booking-host-toast" role="status">
            {toast}
          </div>
        )}
      </header>

      <form className="booking-host-form" onSubmit={publish}>
        <label className="meetings-field">
          <span>Page title</span>
          <input
            className="form-input"
            value={page.title}
            onChange={(e) => setField('title', e.target.value)}
            placeholder="e.g. Branch visit · KYC support"
            required
          />
        </label>
        <label className="meetings-field">
          <span>Description</span>
          <textarea
            className="form-input meetings-textarea"
            rows={2}
            value={page.description}
            onChange={(e) => setField('description', e.target.value)}
            placeholder="What guests should know before booking"
          />
        </label>
        <div className="meetings-row">
          <label className="meetings-field">
            <span>Your name</span>
            <input
              className="form-input"
              value={page.organiser}
              onChange={(e) => setField('organiser', e.target.value)}
              placeholder="Host / team"
            />
          </label>
          <label className="meetings-field">
            <span>Slot length (min)</span>
            <input
              type="number"
              min={15}
              max={240}
              step={15}
              className="form-input"
              value={page.durationMins}
              onChange={(e) => setField('durationMins', e.target.value)}
            />
          </label>
        </div>
        <div className="meetings-row">
          <label className="meetings-field">
            <span>Available from</span>
            <input
              type="time"
              className="form-input"
              value={page.dayStart}
              onChange={(e) => setField('dayStart', e.target.value)}
            />
          </label>
          <label className="meetings-field">
            <span>Available until</span>
            <input
              type="time"
              className="form-input"
              value={page.dayEnd}
              onChange={(e) => setField('dayEnd', e.target.value)}
            />
          </label>
          <label className="meetings-field">
            <span>Days ahead</span>
            <input
              type="number"
              min={1}
              max={90}
              className="form-input"
              value={page.daysAhead}
              onChange={(e) => setField('daysAhead', e.target.value)}
            />
          </label>
        </div>
        <div className="booking-weekdays">
          <span className="booking-weekdays-label">Open days</span>
          <div className="booking-weekdays-row">
            {WEEKDAY_OPTS.map((d) => (
              <label key={d.id} className="booking-day-chip">
                <input
                  type="checkbox"
                  checked={(page.weekdays || []).includes(d.id)}
                  onChange={() => toggleDay(d.id)}
                />
                <span>{d.label}</span>
              </label>
            ))}
          </div>
        </div>
        <label className="meetings-field">
          <span>
            <FaMapMarkerAlt aria-hidden /> Place (optional)
          </span>
          <div className="meetings-place-row">
            <input
              className="form-input"
              value={page.googlePlace || ''}
              readOnly
              placeholder="Pin a place if guests meet in person"
            />
            <button
              type="button"
              className="meetings-pick-map-btn"
              onClick={() => setShowMap(true)}
            >
              Map
            </button>
          </div>
          <div className="booking-host-gmaps-paste">
            <input
              type="text"
              className="form-input"
              placeholder="Paste Google Maps link or lat, lng — then Add pin"
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
                if (text && (isGoogleMapsPaste(text) || /,/.test(text))) {
                  setTimeout(() => applyGoogleMapsPaste(text.trim()), 0);
                }
              }}
            />
            <button
              type="button"
              className="meetings-pick-map-btn"
              onClick={() => applyGoogleMapsPaste(gmapsPaste)}
              disabled={gmapsPasteBusy}
            >
              <FaPaste aria-hidden /> {gmapsPasteBusy ? 'Adding…' : 'Add pin'}
            </button>
          </div>
          <p className="booking-host-hint">
            Tablet: Google Maps → Share → Copy link → paste above → Add pin. Exact
            pins set the place; short links open the map to confirm.
          </p>
        </label>
        <label className="meetings-field">
          <span>Online link (optional)</span>
          <input
            className="form-input"
            value={page.onlineLink || ''}
            onChange={(e) => setField('onlineLink', e.target.value)}
            placeholder="Teams / Zoom"
          />
        </label>

        {error && (
          <div className="booking-host-error" role="alert">
            {error}
          </div>
        )}

        <div className="booking-host-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving
              ? 'Publishing…'
              : published
                ? 'Update booking page'
                : 'Publish booking page'}
          </button>
        </div>
      </form>

      <div className="booking-host-share">
        <h4>Share with guests</h4>
        <div className="meeting-checkin-link-row">
          <input
            className="form-input"
            readOnly
            value={bookingUrl}
            onFocus={(e) => e.target.select()}
            aria-label="Public booking link"
          />
          <button type="button" className="meeting-checkin-copy" onClick={copyLink}>
            <FaCopy /> {copied ? 'Copied' : 'Copy'}
          </button>
          <a
            className="booking-open-link"
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open <FaExternalLinkAlt />
          </a>
        </div>
        <p className="booking-host-hint">
          Guests open this link, pick a free time, enter their details, and book.
        </p>
      </div>

      <div className="booking-host-list">
        <div className="meeting-checkin-table-head">
          <h4>
            Booked appointments
            <span className="meeting-checkin-count">{activeAppts.length}</span>
          </h4>
          <button
            type="button"
            className="meeting-checkin-refresh"
            onClick={loadList}
            disabled={loadingList}
          >
            <FaSync className={loadingList ? 'spin' : ''} /> Refresh
          </button>
        </div>
        {activeAppts.length === 0 ? (
          <p className="booking-host-hint">
            No upcoming bookings yet. Share your link so guests can claim free slots.
          </p>
        ) : (
          <div className="meeting-checkin-table-scroll">
            <table className="meeting-checkin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {activeAppts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.date}</td>
                    <td>
                      {a.time}
                      {a.durationMins ? ` · ${a.durationMins}m` : ''}
                    </td>
                    <td className="name">{a.fullName}</td>
                    <td>
                      <a href={`mailto:${a.email}`}>{a.email}</a>
                    </td>
                    <td>
                      {a.phone ? <a href={`tel:${a.phone}`}>{a.phone}</a> : '—'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="meeting-checkin-remove"
                        onClick={() => drop(a.id)}
                        title="Cancel booking"
                      >
                        <FaTrash /> Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pastish.length > 0 && (
          <p className="booking-host-hint">
            {pastish.length} cancelled booking(s) not shown in totals.
          </p>
        )}
        {page.googlePlace && page.venueLat != null && (
          <p className="booking-host-hint">
            Venue ·{' '}
            <a
              href={mapsOpenUrl(`${page.venueLat},${page.venueLng}`)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {page.googlePlace}
            </a>
          </p>
        )}
      </div>
    </div>
  );
};

export default BookingHost;
