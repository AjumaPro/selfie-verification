/** Shared Google Maps link / coordinate parsing for meetings venue pins. */

export function formatCoord(n, digits = 6) {
  if (!Number.isFinite(n)) return '';
  return Number(n).toFixed(digits);
}

export function parseLatLngFromPlace(place) {
  const s = String(place || '').trim();
  if (!s) return null;
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  if (m) {
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    ) {
      return { lat, lng };
    }
  }
  return null;
}

export function isGoogleMapsPaste(text) {
  const s = String(text || '').trim();
  if (!s) return false;
  if (parseLatLngFromPlace(s)) return true;
  return /google\.|goo\.gl|maps\.app|\/maps\//i.test(s);
}

export function isShortMapsLink(text) {
  return /maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/maps/i.test(String(text || ''));
}

function decodeMaybe(s) {
  try {
    return decodeURIComponent(String(s || '').replace(/\+/g, ' ')).trim();
  } catch {
    return String(s || '')
      .replace(/\+/g, ' ')
      .trim();
  }
}

function validPair(lat, lng, label, source, priority) {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return null;
  }
  return {
    lat,
    lng,
    label: label || `${formatCoord(lat)}, ${formatCoord(lng)}`,
    source,
    priority,
  };
}

/**
 * Collect candidate pins from a Google Maps URL/HTML blob.
 * Prefer place-marker coords (!3d!4d) over camera centre (@lat,lng).
 */
export function extractMapsCoordCandidates(text, placeName) {
  const s = String(text || '');
  const out = [];
  const seen = new Set();
  const push = (hit) => {
    if (!hit) return;
    const key = `${hit.lat.toFixed(5)},${hit.lng.toFixed(5)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(hit);
  };

  // 1) Place marker — highest trust
  let re = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g;
  let m;
  while ((m = re.exec(s))) {
    push(validPair(Number(m[1]), Number(m[2]), placeName, 'gmaps-3d', 100));
  }

  // 2) data blob !2dLNG!3dLAT
  re = /!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/g;
  while ((m = re.exec(s))) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (Math.abs(b) <= 90 && Math.abs(a) <= 180) {
      push(validPair(b, a, placeName, 'gmaps-2d3d', 90));
    }
  }

  // 3) Explicit query/destination coords
  re =
    /[?&](?:q|query|destination)=(-?\d+(?:\.\d+)?)(?:%2C|,|\s)+(-?\d+(?:\.\d+)?)/gi;
  while ((m = re.exec(s))) {
    push(validPair(Number(m[1]), Number(m[2]), placeName, 'gmaps-q-coords', 80));
  }

  re = /[?&](?:ll|center)=(-?\d+(?:\.\d+)?)(?:%2C|,)(-?\d+(?:\.\d+)?)/gi;
  while ((m = re.exec(s))) {
    push(validPair(Number(m[1]), Number(m[2]), placeName, 'gmaps-ll', 50));
  }

  // 4) Camera / viewport — lowest trust (often NOT the place pin)
  re = /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/g;
  while ((m = re.exec(s))) {
    push(validPair(Number(m[1]), Number(m[2]), placeName, 'gmaps-at', 20));
  }

  out.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  return out;
}

/**
 * Parse Google Maps share URL, place link, or "lat, lng" paste.
 * Only returns lat/lng when confident (marker or explicit coords).
 * Camera-only (@) coords are returned with lowConfidence: true.
 */
export function parseGoogleMapsPaste(text) {
  const s = String(text || '').trim();
  if (!s) return null;

  const direct = parseLatLngFromPlace(s);
  if (direct) {
    return {
      lat: direct.lat,
      lng: direct.lng,
      label: `${formatCoord(direct.lat)}, ${formatCoord(direct.lng)}`,
      source: 'coords',
      exact: true,
    };
  }

  const looksLikeMaps =
    /google\.|goo\.gl|maps\.app/i.test(s) ||
    /\/maps\//i.test(s) ||
    s.includes('maps.google');

  if (isShortMapsLink(s)) {
    return { needsExpand: true, originalUrl: s, source: 'short-link' };
  }

  let placeName = null;
  const placeMatch = s.match(/\/maps\/place\/([^/@?#+]+)/i);
  if (placeMatch) {
    placeName = decodeMaybe(placeMatch[1]);
  }

  const candidates = extractMapsCoordCandidates(s, placeName);
  if (candidates.length) {
    const best = candidates[0];
    // Only treat as exact if from marker / explicit query — not camera @
    const exact = (best.priority || 0) >= 80;
    return {
      lat: best.lat,
      lng: best.lng,
      label: best.label,
      source: best.source,
      exact,
      lowConfidence: !exact,
      candidates: candidates.slice(0, 5),
    };
  }

  const m = s.match(/[?&](?:q|query)=([^&]+)/i);
  if (m) {
    const q = decodeMaybe(m[1]);
    if (q && !parseLatLngFromPlace(q)) {
      return { searchQuery: q, source: 'gmaps-query', needsConfirm: true };
    }
  }

  if (placeName) {
    return { searchQuery: placeName, source: 'gmaps-place-name', needsConfirm: true };
  }

  if (looksLikeMaps) {
    return {
      needsExpand: true,
      originalUrl: s,
      source: 'maps-link-opaque',
    };
  }

  return null;
}

/** Free geocode (Photon + Nominatim) — returns list for user confirmation. */
export async function geocodePlaceName(query, bias) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  const terms = [];
  const add = (t) => {
    const s = String(t || '').trim();
    if (s && !terms.includes(s)) terms.push(s);
  };
  add(q);
  if (!/\bghana\b/i.test(q)) {
    add(`${q}, Ghana`);
    add(`${q}, Accra, Ghana`);
  }

  const biasLat = Number.isFinite(bias?.lat) ? bias.lat : 5.6037;
  const biasLng = Number.isFinite(bias?.lng) ? bias.lng : -0.187;
  const results = [];
  const seen = new Set();
  const push = (lat, lng, label) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ lat, lng, label });
  };

  await Promise.all(
    terms.slice(0, 3).map(async (term) => {
      try {
        const url =
          `https://photon.komoot.io/api/?q=${encodeURIComponent(term)}` +
          `&limit=8&lat=${biasLat}&lon=${biasLng}`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) return;
        const data = await res.json();
        (data.features || []).forEach((f) => {
          const [lng, lat] = f.geometry?.coordinates || [];
          const p = f.properties || {};
          const label =
            [p.name, p.street, p.city || p.county, p.country]
              .filter(Boolean)
              .join(', ') || term;
          push(Number(lat), Number(lng), label);
        });
      } catch {
        /* ignore */
      }
    })
  );

  if (!results.length) {
    try {
      const url =
        `https://nominatim.openstreetmap.org/search?format=jsonv2` +
        `&q=${encodeURIComponent(terms[0])}&limit=8&addressdetails=1`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        (Array.isArray(data) ? data : []).forEach((item) => {
          push(Number(item.lat), Number(item.lon), item.display_name || terms[0]);
        });
      }
    } catch {
      /* ignore */
    }
  }

  return results;
}

/**
 * Resolve paste to lat/lng.
 * Only auto-accepts exact coords from the link (marker / lat,lng paste).
 * Guesses open the map picker for confirmation — never silent wrong pins.
 */
export async function resolveGoogleMapsPaste(text, opts = {}) {
  const raw = String(text || '').trim();
  if (!raw) return { error: 'Paste a Google Maps link or coordinates.' };

  let parsed = parseGoogleMapsPaste(raw);

  // Exact paste (coords or high-confidence marker in URL)
  if (
    parsed?.lat != null &&
    parsed?.lng != null &&
    parsed.exact === true &&
    !parsed.lowConfidence
  ) {
    return { ...parsed, exact: true };
  }

  if (parsed?.needsExpand && typeof opts.expandUrl === 'function') {
    try {
      const expanded = await opts.expandUrl(parsed.originalUrl || raw);
      if (expanded?.lat != null && expanded?.lng != null) {
        const exact =
          expanded.exact === true &&
          !expanded.lowConfidence &&
          expanded.source !== 'gmaps-at';
        if (exact) {
          return {
            lat: expanded.lat,
            lng: expanded.lng,
            label: expanded.label || parsed.label,
            source: expanded.source || 'expanded-short-link',
            exact: true,
          };
        }
        return {
          needsConfirm: true,
          lat: expanded.lat,
          lng: expanded.lng,
          label: expanded.label,
          searchQuery: expanded.label || opts.hint || '',
          message:
            'Found a map position from that link, but it may be the camera view — not the place pin. Confirm on the map.',
        };
      }
      if (expanded?.searchQuery) {
        parsed = {
          searchQuery: expanded.searchQuery,
          source: 'expanded-query',
          needsConfirm: true,
        };
      }
    } catch {
      /* fall through */
    }
  }

  // Low-confidence camera coords from full URL — ask user to confirm
  if (parsed?.lat != null && parsed?.lng != null && parsed.lowConfidence) {
    return {
      needsConfirm: true,
      lat: parsed.lat,
      lng: parsed.lng,
      label: parsed.label,
      searchQuery: parsed.label || opts.hint || '',
      message:
        'That link only has the map camera position, not a confirmed place pin. Confirm the correct spot on the map.',
    };
  }

  const searchQ = parsed?.searchQuery || '';
  if (searchQ) {
    return {
      needsConfirm: true,
      searchQuery: searchQ,
      message: `Open the map and pick the correct “${searchQ}” — we won’t guess the pin.`,
    };
  }

  // Do NOT auto-geocode venue hint as if it were the pasted Google pin
  if (isGoogleMapsPaste(raw) || parsed?.needsExpand) {
    const hint = String(opts.hint || '').trim();
    return {
      needsConfirm: true,
      searchQuery: hint || '',
      error:
        'That Google Maps Share link does not include an exact pin. Use Option B (Open map picker), or in Google Maps: right‑click the red pin → copy coordinates → paste here (e.g. 5.6037, -0.1870).',
    };
  }

  return {
    error: 'Paste a Google Maps share link or lat,lng coordinates (e.g. 5.6037, -0.1870).',
  };
}

/** Resolve lat/lng + label from stored meeting fields or a paste string. */
export function resolveVenueFromText({ googlePlace, venueLat, venueLng }) {
  const lat = Number(venueLat);
  const lng = Number(venueLng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return {
      lat,
      lng,
      label:
        String(googlePlace || '').trim() ||
        `${formatCoord(lat)}, ${formatCoord(lng)}`,
    };
  }
  const fromPaste = parseGoogleMapsPaste(googlePlace);
  if (fromPaste?.lat != null && fromPaste?.lng != null && fromPaste.exact !== false && !fromPaste.lowConfidence) {
    return {
      lat: fromPaste.lat,
      lng: fromPaste.lng,
      label: fromPaste.label || String(googlePlace || '').trim(),
    };
  }
  const coords = parseLatLngFromPlace(googlePlace);
  if (coords) {
    return {
      lat: coords.lat,
      lng: coords.lng,
      label: String(googlePlace || '').trim(),
    };
  }
  return null;
}
