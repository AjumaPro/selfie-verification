const crypto = require('crypto');
const express = require('express');
const { query } = require('../db/pool');

const router = express.Router();

function newId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `b_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function parseCoord(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseWeekdays(raw) {
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw || '[]');
    } catch {
      data = [1, 2, 3, 4, 5];
    }
  }
  if (!Array.isArray(data)) return [1, 2, 3, 4, 5];
  const days = data
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return days.length ? Array.from(new Set(days)).sort() : [1, 2, 3, 4, 5];
}

function parseTimeToMins(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function minsToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

/** yyyy-mm-dd in local wall-clock of server (Africa/Accra UTC+0 often fine for dates). */
function addDaysIso(isoDate, days) {
  const [y, m, d] = String(isoDate).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function weekdayOfIso(isoDate) {
  const [y, m, d] = String(isoDate).split('-').map(Number);
  // UTC weekday so date labels stay stable for Ghana (UTC)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function rowToPage(row) {
  if (!row) return null;
  const venueLat = parseCoord(row.venue_lat);
  const venueLng = parseCoord(row.venue_lng);
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    organiser: row.organiser || '',
    durationMins: Number(row.duration_mins) || 30,
    intervalMins: Number(row.interval_mins) || Number(row.duration_mins) || 30,
    daysAhead: Number(row.days_ahead) || 28,
    weekdays: parseWeekdays(row.weekdays_json),
    dayStart: row.day_start || '09:00',
    dayEnd: row.day_end || '17:00',
    bufferMins: Number(row.buffer_mins) || 0,
    location: row.location || '',
    googlePlace: row.google_place || '',
    venueLat,
    venueLng,
    venueRadiusM: Number(row.venue_radius_m) || 200,
    onlineLink: row.online_link || '',
    timezone: row.timezone || 'Africa/Accra',
    active: !!(row.active === 1 || row.active === true),
    hasVenue: venueLat != null && venueLng != null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToAppointment(row) {
  if (!row) return null;
  return {
    id: row.id,
    pageId: row.page_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone || '',
    date: row.slot_date,
    time: row.slot_time,
    durationMins: Number(row.duration_mins) || 30,
    status: row.status || 'booked',
    notes: row.notes || '',
    createdAt: row.created_at,
  };
}

function slotKey(date, time) {
  return `${date}|${time}`;
}

/**
 * Generate open slots for a page between dates (inclusive).
 * Excludes already booked appointments.
 */
function generateAvailableSlots(page, bookedSet, fromDate, toDate) {
  const startMins = parseTimeToMins(page.dayStart);
  const endMins = parseTimeToMins(page.dayEnd);
  const duration = Math.max(15, Number(page.durationMins) || 30);
  const interval = Math.max(15, Number(page.intervalMins) || duration);
  const buffer = Math.max(0, Number(page.bufferMins) || 0);
  if (startMins == null || endMins == null || endMins <= startMins) return [];

  const weekdays = new Set(page.weekdays);
  const slots = [];
  let d = fromDate;
  while (d <= toDate) {
    if (weekdays.has(weekdayOfIso(d))) {
      for (let t = startMins; t + duration <= endMins; t += interval) {
        const time = minsToTime(t);
        // Check overlap with any booking (block slot length + buffer after)
        let busy = false;
        for (const key of bookedSet) {
          if (!key.startsWith(`${d}|`)) continue;
          const bTime = key.split('|')[1];
          const bStart = parseTimeToMins(bTime);
          if (bStart == null) continue;
          // Booked occupies [bStart - buffer, bStart + duration + buffer]
          const blockStart = bStart - buffer;
          const blockEnd = bStart + duration + buffer;
          const slotEnd = t + duration;
          if (t < blockEnd && slotEnd > blockStart) {
            busy = true;
            break;
          }
        }
        if (!busy) {
          slots.push({ date: d, time, durationMins: duration });
        }
      }
    }
    d = addDaysIso(d, 1);
  }
  return slots;
}

/**
 * Publish / update booking page (host).
 * PUT /api/booking/pages/:id
 */
router.put('/pages/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id || id.length > 80) {
      return res.status(400).json({ error: 'Invalid booking page id.' });
    }
    const body = req.body || {};
    const title = String(body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Title is required.' });

    const description = String(body.description || '').trim().slice(0, 4000);
    const organiser = String(body.organiser || '').trim().slice(0, 200);
    const durationMins = Math.min(
      240,
      Math.max(15, Number(body.durationMins) || 30)
    );
    const intervalMins = Math.min(
      240,
      Math.max(15, Number(body.intervalMins) || durationMins)
    );
    const daysAhead = Math.min(90, Math.max(1, Number(body.daysAhead) || 28));
    const weekdays = parseWeekdays(body.weekdays);
    const dayStart = String(body.dayStart || '09:00').trim();
    const dayEnd = String(body.dayEnd || '17:00').trim();
    if (parseTimeToMins(dayStart) == null || parseTimeToMins(dayEnd) == null) {
      return res.status(400).json({ error: 'Invalid working hours.' });
    }
    if (parseTimeToMins(dayEnd) <= parseTimeToMins(dayStart)) {
      return res
        .status(400)
        .json({ error: 'End time must be after start time.' });
    }
    const bufferMins = Math.min(120, Math.max(0, Number(body.bufferMins) || 0));
    const location = String(body.location || '').trim();
    const googlePlace = String(body.googlePlace || body.location || '').trim();
    let venueLat = parseCoord(body.venueLat);
    let venueLng = parseCoord(body.venueLng);
    const venueRadiusM = Math.min(
      2000,
      Math.max(50, Number(body.venueRadiusM) || 200)
    );
    const onlineLink = String(body.onlineLink || '').trim();
    const timezone = String(body.timezone || 'Africa/Accra').trim() || 'Africa/Accra';
    const active =
      body.active === false || body.active === 0 || body.active === '0' ? 0 : 1;

    const weekdaysJson = JSON.stringify(weekdays);
    const venueLatStr = venueLat != null ? String(venueLat) : '';
    const venueLngStr = venueLng != null ? String(venueLng) : '';

    const existing = await query('SELECT id FROM booking_pages WHERE id = $1', [
      id,
    ]);

    if (existing.rowCount > 0) {
      await query(
        `UPDATE booking_pages SET
          title = $2, description = $3, organiser = $4,
          duration_mins = $5, interval_mins = $6, days_ahead = $7,
          weekdays_json = $8, day_start = $9, day_end = $10, buffer_mins = $11,
          location = $12, google_place = $13, venue_lat = $14, venue_lng = $15,
          venue_radius_m = $16, online_link = $17, timezone = $18, active = $19,
          updated_at = NOW()
         WHERE id = $1`,
        [
          id,
          title,
          description,
          organiser,
          durationMins,
          intervalMins,
          daysAhead,
          weekdaysJson,
          dayStart,
          dayEnd,
          bufferMins,
          location,
          googlePlace,
          venueLatStr,
          venueLngStr,
          venueRadiusM,
          onlineLink,
          timezone,
          active,
        ]
      );
    } else {
      await query(
        `INSERT INTO booking_pages (
          id, title, description, organiser,
          duration_mins, interval_mins, days_ahead,
          weekdays_json, day_start, day_end, buffer_mins,
          location, google_place, venue_lat, venue_lng, venue_radius_m,
          online_link, timezone, active
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
          id,
          title,
          description,
          organiser,
          durationMins,
          intervalMins,
          daysAhead,
          weekdaysJson,
          dayStart,
          dayEnd,
          bufferMins,
          location,
          googlePlace,
          venueLatStr,
          venueLngStr,
          venueRadiusM,
          onlineLink,
          timezone,
          active,
        ]
      );
    }

    const result = await query('SELECT * FROM booking_pages WHERE id = $1', [
      id,
    ]);
    return res.json({ page: rowToPage(result.rows[0]) });
  } catch (err) {
    console.error('publish booking page error:', err);
    return res.status(500).json({ error: 'Could not save booking page.' });
  }
});

/**
 * Public page details.
 * GET /api/booking/pages/:id
 */
router.get('/pages/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const result = await query('SELECT * FROM booking_pages WHERE id = $1', [
      id,
    ]);
    if (result.rowCount === 0) {
      return res.status(404).json({
        error: 'Booking page not found. Ask the host to publish their schedule.',
      });
    }
    const page = rowToPage(result.rows[0]);
    if (!page.active) {
      return res.status(403).json({ error: 'This booking page is not active.' });
    }
    return res.json({ page });
  } catch (err) {
    console.error('get booking page error:', err);
    return res.status(500).json({ error: 'Could not load booking page.' });
  }
});

/**
 * Available slots for a page.
 * GET /api/booking/pages/:id/slots?date=YYYY-MM-DD (optional single day)
 */
router.get('/pages/:id/slots', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const result = await query('SELECT * FROM booking_pages WHERE id = $1', [
      id,
    ]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Booking page not found.' });
    }
    const page = rowToPage(result.rows[0]);
    if (!page.active) {
      return res.status(403).json({ error: 'This booking page is not active.' });
    }

    const today = todayIso();
    let fromDate = String(req.query.from || today).slice(0, 10);
    let toDate = String(req.query.to || '').slice(0, 10);
    const single = String(req.query.date || '').slice(0, 10);
    if (single && /^\d{4}-\d{2}-\d{2}$/.test(single)) {
      fromDate = single;
      toDate = single;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) fromDate = today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
      toDate = addDaysIso(today, page.daysAhead);
    }
    if (fromDate < today) fromDate = today;
    const maxTo = addDaysIso(today, page.daysAhead);
    if (toDate > maxTo) toDate = maxTo;
    if (toDate < fromDate) toDate = fromDate;

    const booked = await query(
      `SELECT slot_date, slot_time FROM booking_appointments
       WHERE page_id = $1 AND status = 'booked'
         AND slot_date >= $2 AND slot_date <= $3`,
      [id, fromDate, toDate]
    );
    const bookedSet = new Set(
      booked.rows.map((r) => slotKey(r.slot_date, r.slot_time))
    );

    const slots = generateAvailableSlots(page, bookedSet, fromDate, toDate);
    return res.json({
      pageId: id,
      from: fromDate,
      to: toDate,
      slots,
      count: slots.length,
    });
  } catch (err) {
    console.error('slots error:', err);
    return res.status(500).json({ error: 'Could not load available slots.' });
  }
});

/**
 * Book a free slot (guest).
 * POST /api/booking/pages/:id/book
 */
router.post('/pages/:id/book', async (req, res) => {
  try {
    const pageId = String(req.params.id || '').trim();
    const pageRes = await query('SELECT * FROM booking_pages WHERE id = $1', [
      pageId,
    ]);
    if (pageRes.rowCount === 0) {
      return res.status(404).json({ error: 'Booking page not found.' });
    }
    const page = rowToPage(pageRes.rows[0]);
    if (!page.active) {
      return res.status(403).json({ error: 'This booking page is not active.' });
    }

    const fullName = String(req.body?.fullName || '').trim();
    const email = normalizeEmail(req.body?.email);
    const phone = String(req.body?.phone || '').trim();
    const notes = String(req.body?.notes || '').trim().slice(0, 500);
    const date = String(req.body?.date || '').slice(0, 10);
    const time = String(req.body?.time || '').slice(0, 5);

    if (fullName.length < 2) {
      return res.status(400).json({ error: 'Full name is required.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (phone && !isValidPhone(phone)) {
      return res.status(400).json({ error: 'Enter a valid phone number.' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Choose a valid date.' });
    }
    if (parseTimeToMins(time) == null) {
      return res.status(400).json({ error: 'Choose a valid time.' });
    }

    const today = todayIso();
    if (date < today) {
      return res.status(400).json({ error: 'That date is in the past.' });
    }
    const maxDate = addDaysIso(today, page.daysAhead);
    if (date > maxDate) {
      return res.status(400).json({
        error: `You can only book up to ${page.daysAhead} days ahead.`,
      });
    }

    // Confirm slot still free
    const booked = await query(
      `SELECT slot_date, slot_time FROM booking_appointments
       WHERE page_id = $1 AND status = 'booked'
         AND slot_date = $2`,
      [pageId, date]
    );
    const bookedSet = new Set(
      booked.rows.map((r) => slotKey(r.slot_date, r.slot_time))
    );
    const free = generateAvailableSlots(page, bookedSet, date, date);
    const ok = free.some((s) => s.time === time);
    if (!ok) {
      return res.status(409).json({
        error: 'That slot is no longer available. Pick another time.',
      });
    }

    // Prevent duplicate open booking for same email + page + future slot
    const dup = await query(
      `SELECT * FROM booking_appointments
       WHERE page_id = $1 AND email = $2 AND status = 'booked'
         AND slot_date >= $3
       LIMIT 1`,
      [pageId, email, today]
    );
    if (dup.rowCount > 0) {
      return res.status(200).json({
        alreadyBooked: true,
        appointment: rowToAppointment(dup.rows[0]),
        page: {
          id: page.id,
          title: page.title,
          organiser: page.organiser,
          location: page.location,
          googlePlace: page.googlePlace,
          onlineLink: page.onlineLink,
        },
        message: 'You already have an upcoming booking on this page.',
      });
    }

    const id = newId();
    await query(
      `INSERT INTO booking_appointments (
        id, page_id, full_name, email, phone,
        slot_date, slot_time, duration_mins, status, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'booked',$9)`,
      [
        id,
        pageId,
        fullName,
        email,
        phone,
        date,
        time,
        page.durationMins,
        notes,
      ]
    );

    const again = await query(
      'SELECT * FROM booking_appointments WHERE id = $1',
      [id]
    );

    return res.status(201).json({
      alreadyBooked: false,
      appointment: rowToAppointment(again.rows[0]),
      page: {
        id: page.id,
        title: page.title,
        organiser: page.organiser,
        location: page.location,
        googlePlace: page.googlePlace,
        venueLat: page.venueLat,
        venueLng: page.venueLng,
        onlineLink: page.onlineLink,
      },
      message: 'Your appointment is booked. See you then.',
    });
  } catch (err) {
    console.error('book slot error:', err);
    return res.status(500).json({ error: 'Could not complete booking.' });
  }
});

/**
 * List appointments (host).
 * GET /api/booking/pages/:id/appointments
 */
router.get('/pages/:id/appointments', async (req, res) => {
  try {
    const pageId = String(req.params.id || '').trim();
    const page = await query('SELECT id FROM booking_pages WHERE id = $1', [
      pageId,
    ]);
    if (page.rowCount === 0) {
      return res.status(404).json({ error: 'Booking page not found.' });
    }
    const result = await query(
      `SELECT * FROM booking_appointments
       WHERE page_id = $1
       ORDER BY slot_date ASC, slot_time ASC`,
      [pageId]
    );
    return res.json({
      appointments: result.rows.map(rowToAppointment),
      count: result.rowCount,
    });
  } catch (err) {
    console.error('list appointments error:', err);
    return res.status(500).json({ error: 'Could not load appointments.' });
  }
});

/**
 * Cancel appointment (host).
 * DELETE /api/booking/pages/:pageId/appointments/:id
 */
router.delete('/pages/:pageId/appointments/:id', async (req, res) => {
  try {
    const pageId = String(req.params.pageId || '').trim();
    const id = String(req.params.id || '').trim();
    const result = await query(
      `UPDATE booking_appointments SET status = 'cancelled'
       WHERE id = $1 AND page_id = $2`,
      [id, pageId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('cancel appointment error:', err);
    return res.status(500).json({ error: 'Could not cancel appointment.' });
  }
});

module.exports = router;
