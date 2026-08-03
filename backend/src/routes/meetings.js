const crypto = require('crypto');
const express = require('express');
const { query } = require('../db/pool');

const router = express.Router();

function newId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `a_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function emptyMealMenu() {
  return {
    breakfast: { enabled: false, items: [] },
    lunch: { enabled: false, items: [] },
    dinner: { enabled: false, items: [] },
  };
}

function normalizeMealItems(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const out = [];
  items.forEach((raw) => {
    const name = String(raw || '').trim().slice(0, 80);
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(name);
  });
  return out.slice(0, 40);
}

function parseMealMenu(raw) {
  const base = emptyMealMenu();
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw || '{}');
    } catch {
      return base;
    }
  }
  if (!data || typeof data !== 'object') return base;

  ['breakfast', 'lunch', 'dinner'].forEach((key) => {
    const block = data[key] || {};
    const items = normalizeMealItems(block.items);
    if (items.length) {
      base[key] = { enabled: !!block.enabled && items.length > 0, items };
    } else {
      base[key] = { enabled: false, items: [] };
    }
  });
  return base;
}

function mealMenuToJson(menu) {
  return JSON.stringify(parseMealMenu(menu));
}

/** Program schedule: typed text and/or uploaded file (base64 data URL). */
function parseProgramSchedule(raw) {
  const empty = {
    text: '',
    fileName: '',
    fileMime: '',
    fileData: '',
  };
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw || '{}');
    } catch {
      // Plain text schedule from older clients
      return { ...empty, text: String(raw || '').slice(0, 20000) };
    }
  }
  if (!data || typeof data !== 'object') return empty;

  const text = String(data.text || '').trim().slice(0, 20000);
  const fileName = String(data.fileName || '').trim().slice(0, 200);
  const fileMime = String(data.fileMime || '').trim().slice(0, 120);
  let fileData = String(data.fileData || '').trim();
  // Cap ~1.8MB base64 payload
  if (fileData.length > 2_400_000) {
    fileData = fileData.slice(0, 2_400_000);
  }

  return {
    text,
    fileName: fileData ? fileName : '',
    fileMime: fileData ? fileMime : '',
    fileData,
  };
}

function programScheduleToJson(schedule) {
  return JSON.stringify(parseProgramSchedule(schedule));
}

/** Haversine distance in metres between two WGS84 points. */
function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function parseCoord(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Extract lat,lng from "5.12, -0.18" style strings. */
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

/**
 * Compare guest GPS to host venue.
 * @returns {{ locationMatch: 'at_venue'|'away'|'unknown', distanceM: number|null }}
 */
function verifyGuestAtVenue(venueLat, venueLng, guestLat, guestLng, accuracy, radiusM) {
  if (
    !Number.isFinite(venueLat) ||
    !Number.isFinite(venueLng) ||
    !Number.isFinite(guestLat) ||
    !Number.isFinite(guestLng)
  ) {
    return { locationMatch: 'unknown', distanceM: null };
  }
  const distanceM = Math.round(
    haversineMeters(venueLat, venueLng, guestLat, guestLng)
  );
  const base = Number.isFinite(radiusM) && radiusM > 0 ? radiusM : 200;
  // Tolerate GPS accuracy error
  const pad = Number.isFinite(accuracy) && accuracy > 0 ? accuracy : 0;
  const threshold = Math.min(2000, Math.max(base, pad + 40));
  return {
    locationMatch: distanceM <= threshold ? 'at_venue' : 'away',
    distanceM,
  };
}

function rowToMeeting(row) {
  if (!row) return null;
  const venueLat = parseCoord(row.venue_lat);
  const venueLng = parseCoord(row.venue_lng);
  const fromPlace = parseLatLngPair(row.google_place);
  const lat = venueLat != null ? venueLat : fromPlace?.lat ?? null;
  const lng = venueLng != null ? venueLng : fromPlace?.lng ?? null;
  const radius = Number(row.venue_radius_m);
  const hasVenue = Number.isFinite(lat) && Number.isFinite(lng);
  // Default in-person when flag missing: true if pin exists, else false for pure online
  let isInPerson = true;
  if (row.is_in_person === 0 || row.is_in_person === false || row.is_in_person === '0') {
    isInPerson = false;
  } else if (row.is_in_person === 1 || row.is_in_person === true || row.is_in_person === '1') {
    isInPerson = true;
  } else {
    isInPerson = hasVenue;
  }
  return {
    id: row.id,
    title: row.title,
    date: row.meet_date,
    time: row.meet_time,
    durationMins: row.duration_mins,
    location: row.location || '',
    onlineLink: row.online_link || '',
    googlePlace: row.google_place || row.location || '',
    venueLat: lat,
    venueLng: lng,
    venueRadiusM: Number.isFinite(radius) && radius > 0 ? radius : 200,
    isInPerson,
    hasVenue,
    organiser: row.organiser || '',
    status: row.status || 'scheduled',
    agenda: row.agenda || '',
    mealMenu: parseMealMenu(row.meal_menu_json),
    programSchedule: parseProgramSchedule(row.program_schedule_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToAttendance(row) {
  const lat = row.latitude != null && row.latitude !== '' ? Number(row.latitude) : null;
  const lng =
    row.longitude != null && row.longitude !== '' ? Number(row.longitude) : null;
  const distRaw =
    row.distance_m != null && row.distance_m !== '' ? Number(row.distance_m) : null;
  const match = String(row.location_match || 'unknown').toLowerCase();
  const locationMatch =
    match === 'at_venue' || match === 'away' ? match : 'unknown';
  return {
    id: row.id,
    meetingId: row.meeting_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lng) ? lng : null,
    locationAccuracy:
      row.location_accuracy != null && row.location_accuracy !== ''
        ? Number(row.location_accuracy)
        : null,
    locationMatch,
    distanceM: Number.isFinite(distRaw) ? distRaw : null,
    consentDetails: !!(row.consent_details === 1 || row.consent_details === true),
    consentLocation: !!(
      row.consent_location === 1 || row.consent_location === true
    ),
    breakfastChoice: row.breakfast_choice || '',
    lunchChoice: row.lunch_choice || '',
    dinnerChoice: row.dinner_choice || '',
    checkedInAt: row.checked_in_at,
  };
}

function isValidMealChoice(menuBlock, choice) {
  const c = String(choice || '').trim();
  if (!menuBlock || !menuBlock.enabled || !menuBlock.items?.length) {
    return c === '';
  }
  if (!c) return false;
  return menuBlock.items.some((item) => item.toLowerCase() === c.toLowerCase());
}

function resolveMealChoice(menuBlock, choice) {
  const c = String(choice || '').trim();
  if (!menuBlock?.enabled || !menuBlock.items?.length) return '';
  const found = menuBlock.items.find(
    (item) => item.toLowerCase() === c.toLowerCase()
  );
  return found || '';
}

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

/**
 * Publish / update a meeting so QR check-in works on any device.
 * PUT /api/meetings/:id
 */
router.put('/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id || id.length > 80) {
      return res.status(400).json({ error: 'Invalid meeting id.' });
    }

    const body = req.body || {};
    const title = String(body.title || '').trim();
    const date = String(body.date || '').trim();
    const time = String(body.time || '09:00').trim() || '09:00';
    const durationMins = Math.max(15, Number(body.durationMins) || 60);
    const location = String(body.location || '').trim();
    const onlineLink = String(body.onlineLink || '').trim();
    const googlePlace = String(body.googlePlace || body.location || '').trim();
    let venueLat = parseCoord(body.venueLat ?? body.venue_lat);
    let venueLng = parseCoord(body.venueLng ?? body.venue_lng);
    if (venueLat == null || venueLng == null) {
      const pair = parseLatLngPair(googlePlace);
      if (pair) {
        venueLat = pair.lat;
        venueLng = pair.lng;
      }
    }
    if (
      (venueLat != null && Math.abs(venueLat) > 90) ||
      (venueLng != null && Math.abs(venueLng) > 180)
    ) {
      return res
        .status(400)
        .json({ error: 'Invalid venue coordinates for this meeting.' });
    }
    const radiusRaw = Number(body.venueRadiusM ?? body.venue_radius_m);
    const venueRadiusM =
      Number.isFinite(radiusRaw) && radiusRaw >= 50 && radiusRaw <= 2000
        ? Math.round(radiusRaw)
        : 200;
    const organiser = String(body.organiser || '').trim();
    const status = String(body.status || 'scheduled').trim() || 'scheduled';
    const agenda = String(body.agenda || '').trim();
    const mealMenu = parseMealMenu(body.mealMenu || body.meal_menu || {});
    const mealMenuJson = mealMenuToJson(mealMenu);
    const programSchedule = parseProgramSchedule(
      body.programSchedule || body.program_schedule || {}
    );
    const programScheduleJson = programScheduleToJson(programSchedule);

    if (!title) return res.status(400).json({ error: 'Title is required.' });
    if (!date) return res.status(400).json({ error: 'Date is required.' });

    const isInPerson = !(
      body.isInPerson === false ||
      body.isInPerson === 0 ||
      body.isInPerson === '0' ||
      body.is_in_person === false ||
      body.is_in_person === 0 ||
      body.is_in_person === '0'
    );

    // In-person meetings require a pinned map location for guest verification
    if (isInPerson && (venueLat == null || venueLng == null)) {
      return res.status(400).json({
        error:
          'In-person meetings need a map pin. Open Place → Map and choose the venue, or mark the meeting as online only.',
      });
    }

    const venueLatStr = venueLat != null ? String(venueLat) : '';
    const venueLngStr = venueLng != null ? String(venueLng) : '';
    const isInPersonInt = isInPerson ? 1 : 0;

    const existing = await query('SELECT id FROM meetings WHERE id = $1', [id]);

    if (existing.rowCount > 0) {
      await query(
        `UPDATE meetings SET
          title = $2,
          meet_date = $3,
          meet_time = $4,
          duration_mins = $5,
          location = $6,
          online_link = $7,
          google_place = $8,
          venue_lat = $9,
          venue_lng = $10,
          venue_radius_m = $11,
          is_in_person = $12,
          organiser = $13,
          status = $14,
          agenda = $15,
          meal_menu_json = $16,
          program_schedule_json = $17,
          updated_at = NOW()
         WHERE id = $1`,
        [
          id,
          title,
          date,
          time,
          durationMins,
          location,
          onlineLink,
          googlePlace,
          venueLatStr,
          venueLngStr,
          venueRadiusM,
          isInPersonInt,
          organiser,
          status,
          agenda,
          mealMenuJson,
          programScheduleJson,
        ]
      );
    } else {
      await query(
        `INSERT INTO meetings (
          id, title, meet_date, meet_time, duration_mins,
          location, online_link, google_place, venue_lat, venue_lng, venue_radius_m,
          is_in_person, organiser, status, agenda,
          meal_menu_json, program_schedule_json
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          id,
          title,
          date,
          time,
          durationMins,
          location,
          onlineLink,
          googlePlace,
          venueLatStr,
          venueLngStr,
          venueRadiusM,
          isInPersonInt,
          organiser,
          status,
          agenda,
          mealMenuJson,
          programScheduleJson,
        ]
      );
    }

    const result = await query('SELECT * FROM meetings WHERE id = $1', [id]);
    return res.json({ meeting: rowToMeeting(result.rows[0]) });
  } catch (err) {
    console.error('publish meeting error:', err);
    return res.status(500).json({ error: 'Could not publish meeting.' });
  }
});

/**
 * Public meeting details for join/check-in page.
 * GET /api/meetings/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const result = await query('SELECT * FROM meetings WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Meeting not found. Ask the host to enable check-in QR.' });
    }
    return res.json({ meeting: rowToMeeting(result.rows[0]) });
  } catch (err) {
    console.error('get meeting error:', err);
    return res.status(500).json({ error: 'Could not load meeting.' });
  }
});

/**
 * Register attendance (scan QR → form).
 * POST /api/meetings/:id/attendance
 * body: { fullName, email, phone, consentDetails, consentLocation, latitude, longitude, locationAccuracy }
 */
router.post('/:id/attendance', async (req, res) => {
  try {
    const meetingId = String(req.params.id || '').trim();
    const meeting = await query(
      `SELECT id, status, meal_menu_json, google_place, venue_lat, venue_lng, venue_radius_m
       FROM meetings WHERE id = $1`,
      [meetingId]
    );
    if (meeting.rowCount === 0) {
      return res.status(404).json({ error: 'Meeting not found.' });
    }
    if (meeting.rows[0].status === 'cancelled') {
      return res.status(400).json({ error: 'This meeting was cancelled.' });
    }

    const mRow = meeting.rows[0];
    const mealMenu = parseMealMenu(mRow.meal_menu_json);
    let venueLat = parseCoord(mRow.venue_lat);
    let venueLng = parseCoord(mRow.venue_lng);
    if (venueLat == null || venueLng == null) {
      const pair = parseLatLngPair(mRow.google_place);
      if (pair) {
        venueLat = pair.lat;
        venueLng = pair.lng;
      }
    }
    const venueRadiusM = Number(mRow.venue_radius_m) || 200;
    const fullName = String(req.body?.fullName || '').trim();
    const email = normalizeEmail(req.body?.email);
    const phone = String(req.body?.phone || '').trim();
    const breakfastChoice = resolveMealChoice(
      mealMenu.breakfast,
      req.body?.breakfastChoice
    );
    const lunchChoice = resolveMealChoice(
      mealMenu.lunch,
      req.body?.lunchChoice
    );
    const dinnerChoice = resolveMealChoice(
      mealMenu.dinner,
      req.body?.dinnerChoice
    );
    const consentDetails = !!(
      req.body?.consentDetails === true ||
      req.body?.consentDetails === 1 ||
      req.body?.consentDetails === '1' ||
      req.body?.consentDetails === 'true'
    );
    const consentLocation = !!(
      req.body?.consentLocation === true ||
      req.body?.consentLocation === 1 ||
      req.body?.consentLocation === '1' ||
      req.body?.consentLocation === 'true'
    );

    const latRaw = req.body?.latitude;
    const lngRaw = req.body?.longitude;
    const accRaw = req.body?.locationAccuracy;
    const latitude =
      latRaw === null || latRaw === undefined || latRaw === ''
        ? null
        : Number(latRaw);
    const longitude =
      lngRaw === null || lngRaw === undefined || lngRaw === ''
        ? null
        : Number(lngRaw);
    const locationAccuracy =
      accRaw === null || accRaw === undefined || accRaw === ''
        ? null
        : Number(accRaw);

    if (fullName.length < 2) {
      return res.status(400).json({ error: 'Full name is required.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: 'Enter a valid phone number.' });
    }
    if (!consentDetails) {
      return res.status(400).json({
        error:
          'You must allow sharing your name, email and phone with the meeting host.',
      });
    }
    if (!consentLocation) {
      return res.status(400).json({
        error: 'You must allow sharing your device location for check-in.',
      });
    }
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      return res.status(400).json({
        error:
          'Location is required. Allow location access in your browser or app to check in.',
      });
    }
    if (
      mealMenu.breakfast.enabled &&
      !isValidMealChoice(mealMenu.breakfast, req.body?.breakfastChoice)
    ) {
      return res.status(400).json({
        error: 'Please choose a breakfast option from the menu.',
      });
    }
    if (
      mealMenu.lunch.enabled &&
      !isValidMealChoice(mealMenu.lunch, req.body?.lunchChoice)
    ) {
      return res.status(400).json({
        error: 'Please choose a lunch option from the menu.',
      });
    }
    if (
      mealMenu.dinner.enabled &&
      !isValidMealChoice(mealMenu.dinner, req.body?.dinnerChoice)
    ) {
      return res.status(400).json({
        error: 'Please choose a dinner option from the menu.',
      });
    }

    const { locationMatch, distanceM } = verifyGuestAtVenue(
      venueLat,
      venueLng,
      latitude,
      longitude,
      locationAccuracy,
      venueRadiusM
    );

    const latStr = String(latitude);
    const lngStr = String(longitude);
    const accStr = Number.isFinite(locationAccuracy)
      ? String(locationAccuracy)
      : '';
    const distStr = distanceM != null ? String(distanceM) : '';

    const dup = await query(
      `SELECT * FROM meeting_attendance
       WHERE meeting_id = $1 AND email = $2`,
      [meetingId, email]
    );
    if (dup.rowCount > 0) {
      const existingAtt = rowToAttendance(dup.rows[0]);
      return res.status(200).json({
        alreadyRegistered: true,
        attendance: existingAtt,
        locationMatch: existingAtt.locationMatch,
        distanceM: existingAtt.distanceM,
        venueVerified: Number.isFinite(venueLat) && Number.isFinite(venueLng),
        message: 'You are already registered for this meeting.',
      });
    }

    const id = newId();
    await query(
      `INSERT INTO meeting_attendance (
        id, meeting_id, full_name, email, phone,
        latitude, longitude, location_accuracy,
        location_match, distance_m,
        consent_details, consent_location,
        breakfast_choice, lunch_choice, dinner_choice
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        id,
        meetingId,
        fullName,
        email,
        phone,
        latStr,
        lngStr,
        accStr,
        locationMatch,
        distStr,
        1,
        1,
        breakfastChoice,
        lunchChoice,
        dinnerChoice,
      ]
    );

    const again = await query(
      `SELECT * FROM meeting_attendance WHERE id = $1`,
      [id]
    );
    const row = again.rows[0];
    const attendance = rowToAttendance(row);

    let message =
      'Checked in successfully. Your details, location and meal choice were shared with the host.';
    if (locationMatch === 'at_venue') {
      message =
        'Checked in successfully. Your location matches the meeting venue.';
    } else if (locationMatch === 'away') {
      message =
        'Checked in. Your device location does not match the meeting venue — the host can see this.';
    }

    return res.status(201).json({
      alreadyRegistered: false,
      attendance,
      locationMatch,
      distanceM,
      venueVerified: Number.isFinite(venueLat) && Number.isFinite(venueLng),
      message,
    });
  } catch (err) {
    console.error('attendance error:', err);
    return res.status(500).json({ error: 'Could not register attendance.' });
  }
});

/**
 * List attendance (host view — name, email, phone).
 * GET /api/meetings/:id/attendance
 */
router.get('/:id/attendance', async (req, res) => {
  try {
    const meetingId = String(req.params.id || '').trim();
    const meeting = await query('SELECT id FROM meetings WHERE id = $1', [meetingId]);
    if (meeting.rowCount === 0) {
      return res.status(404).json({ error: 'Meeting not found.' });
    }

    const result = await query(
      `SELECT * FROM meeting_attendance
       WHERE meeting_id = $1
       ORDER BY checked_in_at ASC`,
      [meetingId]
    );

    return res.json({
      attendance: result.rows.map(rowToAttendance),
      count: result.rowCount,
    });
  } catch (err) {
    console.error('list attendance error:', err);
    return res.status(500).json({ error: 'Could not load attendance.' });
  }
});

/**
 * Optional delete attendance (host cleanup)
 * DELETE /api/meetings/:id/attendance/:attendanceId
 */
router.delete('/:id/attendance/:attendanceId', async (req, res) => {
  try {
    const meetingId = String(req.params.id || '').trim();
    const attendanceId = String(req.params.attendanceId || '').trim();
    const result = await query(
      `DELETE FROM meeting_attendance WHERE id = $1 AND meeting_id = $2`,
      [attendanceId, meetingId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Attendance record not found.' });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('delete attendance error:', err);
    return res.status(500).json({ error: 'Could not delete attendance.' });
  }
});

module.exports = router;
