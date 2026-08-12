import React, { useEffect, useMemo, useState } from 'react';
import {
  FaCalendarCheck,
  FaCheckCircle,
  FaClock,
  FaMapMarkerAlt,
  FaExternalLinkAlt,
} from 'react-icons/fa';
import {
  fetchBookingPage,
  fetchSlots,
  bookSlot,
} from '../services/bookingApi';
import { mapsOpenUrl, mapsEmbedUrl } from '../services/meetingsApi';
import { glicoLogoUrl } from '../utils/brandAssets';
import './BookingGuest.css';

/**
 * Public booking page — guest picks a free slot and enters details.
 */
const BookingGuest = ({ pageId, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(null);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedTime, setSelectedTime] = useState('');
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchBookingPage(pageId)
      .then((data) => {
        if (!cancelled) setPage(data.page);
      })
      .catch((err) => {
        if (!cancelled) {
          const status = err.status;
          if (status === 0) {
            setError(
              err.message ||
                'Cannot reach the booking API. Start the backend (port 4000) and refresh.'
            );
          } else if (status === 404) {
            setError(
              'Booking page not found. Open Meetings → Book with me, click Publish booking page, then open this link again.'
            );
          } else if (status === 403) {
            setError('This booking page is not active.');
          } else {
            setError(
              err.message ||
                'Could not load booking. Is the API running on port 4000?'
            );
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  // Build selectable dates (next daysAhead)
  const dateOptions = useMemo(() => {
    if (!page) return [];
    const weekdays = new Set(page.weekdays || [1, 2, 3, 4, 5]);
    const out = [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    for (let i = 0; i <= (page.daysAhead || 28); i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const dow = d.getDay();
      if (!weekdays.has(dow)) continue;
      const iso = d.toISOString().slice(0, 10);
      out.push(iso);
    }
    return out;
  }, [page]);

  useEffect(() => {
    if (!selectedDate && dateOptions[0]) {
      setSelectedDate(dateOptions[0]);
    }
  }, [dateOptions, selectedDate]);

  useEffect(() => {
    if (!pageId || !selectedDate) return undefined;
    let cancelled = false;
    setSlotsLoading(true);
    setSelectedTime('');
    fetchSlots(pageId, { date: selectedDate })
      .then((data) => {
        if (!cancelled) setSlots(data.slots || []);
      })
      .catch((err) => {
        if (!cancelled) {
          setSlots([]);
          setError(err.message || 'Could not load free times.');
        }
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pageId, selectedDate]);

  const venueQuery =
    page?.venueLat != null && page?.venueLng != null
      ? `${page.venueLat},${page.venueLng}`
      : page?.googlePlace || page?.location || '';
  const embed = mapsEmbedUrl(venueQuery);
  const openMap = mapsOpenUrl(venueQuery);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!selectedDate || !selectedTime) {
      setError('Pick a date and a free time slot.');
      return;
    }
    setSubmitting(true);
    try {
      const data = await bookSlot(pageId, {
        ...form,
        date: selectedDate,
        time: selectedTime,
      });
      setDone(data);
    } catch (err) {
      setError(err.message || 'Could not complete booking.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="App booking-guest-page">
      <header className="booking-guest-header">
        <img
          src={glicoLogoUrl()}
          alt="GLICO"
          className="booking-guest-logo"
        />
        <div>
          <h1>Book an appointment</h1>
          <p>Choose a free slot · no account required</p>
        </div>
      </header>

      <main className="booking-guest-main">
        {loading && (
          <div className="booking-guest-card">
            <div className="loading-spinner" />
            <p>Loading schedule…</p>
          </div>
        )}

        {!loading && error && !page && (
          <div className="booking-guest-card">
            <div className="booking-guest-error" role="alert">
              {error}
            </div>
            {onClose && (
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Back
              </button>
            )}
          </div>
        )}

        {page && !done && (
          <>
            <div className="booking-guest-card">
              <h2>{page.title}</h2>
              {page.organiser && (
                <p className="booking-guest-meta">With {page.organiser}</p>
              )}
              <p className="booking-guest-meta">
                <FaClock aria-hidden /> {page.durationMins} minutes
              </p>
              {page.description && (
                <p className="booking-guest-desc">{page.description}</p>
              )}
              {(page.location || page.googlePlace) && (
                <p className="booking-guest-meta">
                  <FaMapMarkerAlt aria-hidden />{' '}
                  {page.location || page.googlePlace}
                </p>
              )}
              {page.onlineLink && (
                <p className="booking-guest-meta">
                  Online ·{' '}
                  <a href={page.onlineLink} target="_blank" rel="noopener noreferrer">
                    Join link
                  </a>
                </p>
              )}
            </div>

            {venueQuery && embed && (
              <div className="booking-guest-card">
                <div className="booking-guest-map-head">
                  <h3>Location</h3>
                  {openMap && (
                    <a
                      href={openMap}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="booking-guest-map-link"
                    >
                      Maps <FaExternalLinkAlt />
                    </a>
                  )}
                </div>
                <iframe
                  title="Meeting place"
                  className="booking-guest-map"
                  src={embed}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            )}

            <form className="booking-guest-card" onSubmit={onSubmit}>
              <h3>
                <FaCalendarCheck aria-hidden /> Pick a free slot
              </h3>
              {error && (
                <div className="booking-guest-error" role="alert">
                  {error}
                </div>
              )}

              <label className="booking-guest-field">
                <span>Date</span>
                <select
                  className="form-input"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  required
                >
                  {dateOptions.length === 0 && (
                    <option value="">No open days</option>
                  )}
                  {dateOptions.map((d) => (
                    <option key={d} value={d}>
                      {d} ·{' '}
                      {new Date(d + 'T12:00:00').toLocaleDateString(undefined, {
                        weekday: 'short',
                      })}
                    </option>
                  ))}
                </select>
              </label>

              <div className="booking-guest-slots">
                <span className="booking-guest-slots-label">Available times</span>
                {slotsLoading && <p className="booking-guest-hint">Loading times…</p>}
                {!slotsLoading && slots.length === 0 && (
                  <p className="booking-guest-hint">
                    No free slots on this day. Try another date.
                  </p>
                )}
                <div className="booking-guest-slot-grid">
                  {slots.map((s) => (
                    <button
                      key={`${s.date}-${s.time}`}
                      type="button"
                      className={`booking-slot-btn ${
                        selectedTime === s.time ? 'selected' : ''
                      }`}
                      onClick={() => setSelectedTime(s.time)}
                    >
                      {s.time}
                    </button>
                  ))}
                </div>
              </div>

              <label className="booking-guest-field">
                <span>Full name</span>
                <input
                  name="fullName"
                  className="form-input"
                  value={form.fullName}
                  onChange={onChange}
                  required
                  autoComplete="name"
                />
              </label>
              <label className="booking-guest-field">
                <span>Email</span>
                <input
                  name="email"
                  type="email"
                  className="form-input"
                  value={form.email}
                  onChange={onChange}
                  required
                  autoComplete="email"
                />
              </label>
              <label className="booking-guest-field">
                <span>Phone</span>
                <input
                  name="phone"
                  type="tel"
                  className="form-input"
                  value={form.phone}
                  onChange={onChange}
                  required
                  autoComplete="tel"
                />
              </label>
              <label className="booking-guest-field">
                <span>Notes (optional)</span>
                <textarea
                  name="notes"
                  className="form-input"
                  rows={2}
                  value={form.notes}
                  onChange={onChange}
                  placeholder="Anything the host should know"
                />
              </label>

              <button
                type="submit"
                className="btn btn-primary booking-guest-submit"
                disabled={submitting || !selectedTime}
              >
                {submitting
                  ? 'Booking…'
                  : selectedTime
                    ? `Confirm ${selectedDate} at ${selectedTime}`
                    : 'Pick a time to continue'}
              </button>
            </form>
          </>
        )}

        {done && (
          <div className="booking-guest-card booking-guest-success">
            <FaCheckCircle className="booking-guest-success-icon" aria-hidden />
            <h3>
              {done.alreadyBooked ? 'Already booked' : 'You are booked'}
            </h3>
            <p>{done.message}</p>
            <dl className="booking-guest-receipt">
              <div>
                <dt>When</dt>
                <dd>
                  {done.appointment?.date} · {done.appointment?.time}
                  {done.appointment?.durationMins
                    ? ` (${done.appointment.durationMins} min)`
                    : ''}
                </dd>
              </div>
              <div>
                <dt>Name</dt>
                <dd>{done.appointment?.fullName}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{done.appointment?.email}</dd>
              </div>
              {done.page?.googlePlace && (
                <div>
                  <dt>Where</dt>
                  <dd>{done.page.googlePlace}</dd>
                </div>
              )}
              {done.page?.onlineLink && (
                <div>
                  <dt>Online</dt>
                  <dd>
                    <a
                      href={done.page.onlineLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Join link
                    </a>
                  </dd>
                </div>
              )}
            </dl>
            {onClose && (
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default BookingGuest;
