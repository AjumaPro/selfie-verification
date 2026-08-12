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

/** Parse Google Maps share URLs — prefer place marker (!3d!4d) over camera (@). */
function parseGoogleMapsPaste(text) {
  const s = String(text || '').trim();
  if (!s) return null;

  const direct = parseLatLngPair(s);
  if (direct) return { lat: direct.lat, lng: direct.lng, label: s, exact: true };

  let placeName = null;
  const placeMatch = s.match(/\/maps\/place\/([^/@?#+]+)/i);
  if (placeMatch) {
    try {
      placeName = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).trim();
    } catch {
      placeName = placeMatch[1].replace(/\+/g, ' ').trim();
    }
  }

  // Prefer place marker coords (actual pin)
  let m = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (m) {
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng, label: placeName || s, exact: true, source: 'gmaps-3d' };
    }
  }

  m = s.match(/!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (Math.abs(b) <= 90 && Math.abs(a) <= 180) {
      return { lat: b, lng: a, label: placeName || s, exact: true, source: 'gmaps-2d3d' };
    }
  }

  m = s.match(
    /[?&](?:q|query|destination)=(-?\d+(?:\.\d+)?)(?:%2C|,|\s)+(-?\d+(?:\.\d+)?)/i
  );
  if (m) {
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng, label: placeName || s, exact: true, source: 'gmaps-q' };
    }
  }

  m = s.match(
    /[?&](?:ll|center)=(-?\d+(?:\.\d+)?)(?:%2C|,)(-?\d+(?:\.\d+)?)/i
  );
  if (m) {
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng, label: placeName || s, exact: false, source: 'gmaps-ll' };
    }
  }

  // Camera / viewport — low confidence (often not the venue pin)
  m = s.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (m) {
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return {
        lat,
        lng,
        label: placeName || s,
        exact: false,
        lowConfidence: true,
        source: 'gmaps-at',
      };
    }
  }

  m = s.match(/[?&](?:q|query)=([^&]+)/i);
  if (m) {
    try {
      const q = decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
      if (q && !parseLatLngPair(q)) return { searchQuery: q };
    } catch {
      /* ignore */
    }
  }

  if (placeName) return { searchQuery: placeName };
  return null;
}

function resolveVenueFromStored(row) {
  let lat = parseCoord(row?.venue_lat);
  let lng = parseCoord(row?.venue_lng);
  if (lat != null && lng != null) {
    return {
      lat,
      lng,
      label: row.google_place || row.location || '',
    };
  }
  const fromPaste = parseGoogleMapsPaste(row?.google_place);
  if (
    fromPaste &&
    Number.isFinite(fromPaste.lat) &&
    Number.isFinite(fromPaste.lng) &&
    fromPaste.exact !== false &&
    !fromPaste.lowConfidence
  ) {
    return fromPaste;
  }
  const pair = parseLatLngPair(row?.google_place);
  if (pair) return { ...pair, label: row.google_place || '' };
  return { lat: null, lng: null, label: row?.google_place || '' };
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
  const venue = resolveVenueFromStored(row);
  const lat = venue.lat;
  const lng = venue.lng;
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
 * Expand short Google Maps share links and extract lat/lng for venue pins.
 * POST /api/meetings/resolve-maps-link  body: { url, hint? }
 */
router.post('/resolve-maps-link', async (req, res) => {
  try {
    const url = String(req.body?.url || '').trim();
    const hint = String(req.body?.hint || '').trim();
    if (!url) {
      return res.status(400).json({ error: 'A Google Maps URL is required.' });
    }
    if (!/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: 'URL must start with http:// or https://.' });
    }
    if (!/google\.|goo\.gl|maps\.app|g\.co/i.test(url)) {
      return res.status(400).json({ error: 'Not a Google Maps link.' });
    }

    // Follow redirects — short links (maps.app.goo.gl) hide coords until expanded
    let finalUrl = url;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const upstream = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; GlicoMeetings/1.0; +https://glico.com)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      clearTimeout(timer);
      finalUrl = upstream.url || url;
      // Also scan HTML for @lat,lng / !3d when final URL is still opaque
      let html = '';
      try {
        html = await upstream.text();
      } catch {
        html = '';
      }
      const fromFinal = parseGoogleMapsPaste(finalUrl);
      if (fromFinal?.lat != null && fromFinal?.lng != null && fromFinal.exact !== false && !fromFinal.lowConfidence) {
        return res.json({
          lat: fromFinal.lat,
          lng: fromFinal.lng,
          label: fromFinal.label || fromFinal.searchQuery || '',
          finalUrl,
          source: fromFinal.source || 'expanded-url',
          exact: true,
        });
      }
      if (html) {
        // Prefer marker patterns in HTML; avoid first random @ match
        const marker = html.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
        if (marker) {
          const lat = Number(marker[1]);
          const lng = Number(marker[2]);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            let label = '';
            const placeMatch = html.match(/\/maps\/place\/([^/"'?#\\]+)/);
            if (placeMatch) {
              try {
                label = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
              } catch {
                label = placeMatch[1].replace(/\+/g, ' ');
              }
            }
            return res.json({
              lat,
              lng,
              label: label || '',
              finalUrl,
              source: 'expanded-html-marker',
              exact: true,
            });
          }
        }
        const fromHtml = parseGoogleMapsPaste(html.slice(0, 200000));
        if (fromHtml?.lat != null && fromHtml?.lng != null && fromHtml.exact) {
          return res.json({
            lat: fromHtml.lat,
            lng: fromHtml.lng,
            label: fromHtml.label || '',
            finalUrl,
            source: 'expanded-html',
            exact: true,
          });
        }
        if (fromHtml?.searchQuery) {
          return res.json({
            searchQuery: fromHtml.searchQuery,
            finalUrl,
            source: 'expanded-query',
          });
        }
        // Low-confidence camera only — let client ask user to confirm
        if (fromFinal?.lat != null && fromFinal?.lng != null) {
          return res.json({
            lat: fromFinal.lat,
            lng: fromFinal.lng,
            label: fromFinal.label || '',
            finalUrl,
            source: fromFinal.source || 'gmaps-at',
            exact: false,
            lowConfidence: true,
          });
        }
      }
      if (fromFinal?.searchQuery) {
        return res.json({
          searchQuery: fromFinal.searchQuery,
          finalUrl,
          source: 'expanded-query',
        });
      }
      if (fromFinal?.lat != null && fromFinal?.lng != null) {
        return res.json({
          lat: fromFinal.lat,
          lng: fromFinal.lng,
          label: fromFinal.label || '',
          finalUrl,
          source: fromFinal.source || 'gmaps-at',
          exact: !!fromFinal.exact,
          lowConfidence: !!fromFinal.lowConfidence,
        });
      }
    } catch (err) {
      // Fall through to hint / error
    }

    if (hint.length >= 2) {
      return res.json({
        searchQuery: hint,
        finalUrl,
        source: 'hint-fallback',
      });
    }

    return res.status(422).json({
      error:
        'Could not read a pin from that Google Maps link. Open the place, Share with the red pin visible, or paste coordinates like 5.60, -0.18.',
      finalUrl,
    });
  } catch (err) {
    console.error('resolve-maps-link', err);
    return res.status(500).json({ error: 'Could not resolve that Maps link.' });
  }
});

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
      const fromPaste = parseGoogleMapsPaste(googlePlace);
      if (
        fromPaste &&
        Number.isFinite(fromPaste.lat) &&
        Number.isFinite(fromPaste.lng) &&
        fromPaste.exact !== false &&
        !fromPaste.lowConfidence
      ) {
        venueLat = fromPaste.lat;
        venueLng = fromPaste.lng;
      } else {
        const pair = parseLatLngPair(googlePlace);
        if (pair) {
          venueLat = pair.lat;
          venueLng = pair.lng;
        }
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

    // In-person: require plain venue address + map pin coordinates
    if (isInPerson && (venueLat == null || venueLng == null)) {
      return res.status(400).json({
        error:
          'In-person meetings need a map pin. Open Place → Map and choose the venue, or mark the meeting as online only.',
      });
    }
    if (isInPerson && !location) {
      return res.status(400).json({
        error:
          'In-person meetings need a venue address (room, branch, or street), plus a map pin.',
      });
    }
    if (isInPerson && !googlePlace) {
      return res.status(400).json({
        error:
          'In-person meetings need the map address with the pin. Confirm the location in Map.',
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
    const venueResolved = resolveVenueFromStored(mRow);
    let venueLat = venueResolved.lat;
    let venueLng = venueResolved.lng;
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
    let latitude =
      latRaw === null || latRaw === undefined || latRaw === ''
        ? null
        : Number(latRaw);
    let longitude =
      lngRaw === null || lngRaw === undefined || lngRaw === ''
        ? null
        : Number(lngRaw);
    let locationAccuracy =
      accRaw === null || accRaw === undefined || accRaw === ''
        ? null
        : Number(accRaw);
    if (!Number.isFinite(locationAccuracy)) locationAccuracy = null;

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

    const locationUnavailable = !!(
      req.body?.locationUnavailable === true ||
      req.body?.locationUnavailable === 1 ||
      req.body?.locationUnavailable === 'true'
    );
    const isOnlineMeeting =
      mRow.is_in_person === 0 ||
      mRow.is_in_person === false ||
      mRow.is_in_person === '0';
    const hasVenuePin =
      Number.isFinite(venueLat) && Number.isFinite(venueLng);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      // Allow check-in without GPS for online meetings, or when the client
      // reports the browser blocked location (in-app browsers, denied, etc.)
      if (locationUnavailable || isOnlineMeeting || !hasVenuePin) {
        latitude = null;
        longitude = null;
        locationAccuracy = null;
      } else {
        return res.status(400).json({
          error:
            'Location is required. Open the check-in link in Safari or Chrome, allow location, or check in again and choose unverified if GPS is blocked.',
        });
      }
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

    const { locationMatch, distanceM } =
      Number.isFinite(latitude) && Number.isFinite(longitude)
        ? verifyGuestAtVenue(
            venueLat,
            venueLng,
            latitude,
            longitude,
            locationAccuracy,
            venueRadiusM
          )
        : { locationMatch: 'unknown', distanceM: null };

    const latStr = Number.isFinite(latitude) ? String(latitude) : '';
    const lngStr = Number.isFinite(longitude) ? String(longitude) : '';
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
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      message =
        'Checked in successfully. Location could not be verified in this browser — the host sees Unverified.';
    } else if (locationMatch === 'at_venue') {
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
