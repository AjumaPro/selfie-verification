import React, { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  FaMapMarkerAlt,
  FaSearch,
  FaTimes,
  FaCrosshairs,
  FaPlus,
  FaMinus,
  FaArrowUp,
  FaArrowDown,
  FaArrowLeft,
  FaArrowRight,
  FaExternalLinkAlt,
} from 'react-icons/fa';
import './GooglePlacePicker.css';
import {
  formatCoord,
  parseLatLngFromPlace,
  isGoogleMapsPaste,
  resolveGoogleMapsPaste,
} from '../utils/googleMapsPaste';
import { resolveMapsLink } from '../services/meetingsApi';

// Leaflet default markers break under CRA bundling without explicit URLs
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

/** Accra — sensible default for GLICO Ghana */
const DEFAULT_CENTER = [5.6037, -0.187];
const DEFAULT_ZOOM = 13;
const PIN_ZOOM = 17;
const MAX_ZOOM = 19;
/** ~2 m nudge steps for fine pin adjust */
const NUDGE_STEP = 0.00002;

const NOMINATIM_HEADERS = {
  Accept: 'application/json',
};

/** Fast dest shortcuts (Ghana + common) */
const QUICK_PLACES = [
  { label: 'Accra', q: 'Accra, Ghana' },
  { label: 'Kumasi', q: 'Kumasi, Ghana' },
  { label: 'Tema', q: 'Tema, Ghana' },
  { label: 'Airport Accra', q: 'Kotoka International Airport Accra' },
  { label: 'Cape Coast', q: 'Cape Coast, Ghana' },
  { label: 'Takoradi', q: 'Takoradi, Ghana' },
  { label: 'Tamale', q: 'Tamale, Ghana' },
];

function clampLat(lat) {
  return Math.max(-90, Math.min(90, Number(lat)));
}

function clampLng(lng) {
  let n = Number(lng);
  if (!Number.isFinite(n)) return n;
  while (n > 180) n -= 360;
  while (n < -180) n += 360;
  return n;
}

function shortLabel(display, max = 72) {
  const s = String(display || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function mapsOpenUrl(lat, lng, label) {
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  const q = String(label || '').trim();
  if (!q) return 'https://www.google.com/maps';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function googleMapsSearchUrl(query) {
  const q = String(query || '').trim();
  if (!q) return 'https://www.google.com/maps';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

async function reverseGeocode(lat, lng) {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
    `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}` +
    `&zoom=18&addressdetails=1`;
  const res = await fetch(url, { headers: NOMINATIM_HEADERS });
  if (!res.ok) throw new Error('Could not look up that location.');
  const data = await res.json();
  return {
    lat,
    lng,
    label: data.display_name || `${formatCoord(lat)}, ${formatCoord(lng)}`,
  };
}

/**
 * Expand queries so POIs like "GLICO LIFE HEADOFFICE" match free geocoders.
 */
function buildSearchTerms(query) {
  const q = String(query || '').trim().replace(/\s+/g, ' ');
  if (!q) return [];
  const terms = [];
  const add = (t) => {
    const s = String(t || '').trim().replace(/\s+/g, ' ');
    if (s.length >= 2 && !terms.some((x) => x.toLowerCase() === s.toLowerCase())) {
      terms.push(s);
    }
  };

  add(q);
  const expanded = q
    .replace(/headoffice/gi, 'head office')
    .replace(/\bh\.?q\.?\b/gi, 'headquarters');
  add(expanded);

  if (q === q.toUpperCase() && q.length > 4) {
    add(q.replace(/\w+/g, (w) => w.charAt(0) + w.slice(1).toLowerCase()));
  }

  const slim = expanded
    .replace(
      /\b(the|ltd|limited|company|plc|branch|office|headquarters|head office)\b/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
  add(slim);

  if (!/\bghana\b/i.test(expanded)) {
    add(`${expanded}, Ghana`);
    add(`${expanded}, Accra, Ghana`);
  }
  if (slim && !/\bghana\b/i.test(slim)) {
    add(`${slim}, Ghana`);
    add(`${slim} Accra Ghana`);
  }
  return terms.slice(0, 7);
}

function rankResults(results, query) {
  const q = String(query || '').toLowerCase();
  const tokens = q.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  const score = (item) => {
    const lab = String(item.label || '').toLowerCase();
    let s = 0;
    if (lab.includes(q)) s += 40;
    tokens.forEach((t) => {
      if (lab.includes(t)) s += 8;
    });
    if (/\bghana\b/i.test(lab)) s += 12;
    if (/\baccra\b/i.test(lab)) s += 4;
    if (item.source === 'photon') s += 3;
    if (item.source === 'nominatim') s += 2;
    return s;
  };
  return [...results].sort((a, b) => score(b) - score(a));
}

/**
 * Multi-engine search (Photon + OSM + ArcGIS + Open-Meteo). No API key.
 */
async function searchDestinations(query, bias) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  const coords = parseLatLngFromPlace(q);
  if (coords) {
    return [
      {
        lat: coords.lat,
        lng: coords.lng,
        label: `${formatCoord(coords.lat)}, ${formatCoord(coords.lng)}`,
        detail: 'Coordinates',
        source: 'coords',
      },
    ];
  }

  const biasLat = Number.isFinite(bias?.lat) ? bias.lat : DEFAULT_CENTER[0];
  const biasLng = Number.isFinite(bias?.lng) ? bias.lng : DEFAULT_CENTER[1];
  const terms = buildSearchTerms(q);
  const results = [];
  const seen = new Set();
  const push = (item) => {
    if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) return;
    const key = `${item.lat.toFixed(4)},${item.lng.toFixed(4)}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(item);
  };

  const tasks = [];

  terms.forEach((term) => {
    tasks.push(
      (async () => {
        try {
          const url =
            `https://photon.komoot.io/api/?q=${encodeURIComponent(term)}` +
            `&limit=15&lat=${biasLat}&lon=${biasLng}`;
          const res = await fetch(url, { headers: { Accept: 'application/json' } });
          if (!res.ok) return;
          const data = await res.json();
          (data.features || []).forEach((f) => {
            const [lng, lat] = f.geometry?.coordinates || [];
            const p = f.properties || {};
            const parts = [p.name, p.street, p.city || p.county, p.state, p.country]
              .filter(Boolean)
              .filter((v, i, a) => a.indexOf(v) === i);
            push({
              lat: Number(lat),
              lng: Number(lng),
              label: parts.join(', ') || term,
              detail: `${p.type || 'Place'} · Photon`,
              source: 'photon',
            });
          });
        } catch {
          /* ignore */
        }
      })()
    );
  });

  terms.slice(0, 4).forEach((term) => {
    tasks.push(
      (async () => {
        try {
          const url =
            `https://nominatim.openstreetmap.org/search?format=jsonv2` +
            `&q=${encodeURIComponent(term)}&limit=12&addressdetails=1`;
          const res = await fetch(url, { headers: NOMINATIM_HEADERS });
          if (!res.ok) return;
          const data = await res.json();
          (Array.isArray(data) ? data : []).forEach((item) => {
            push({
              lat: Number(item.lat),
              lng: Number(item.lon),
              label: item.display_name || term,
              detail: `${item.type || item.class || 'Address'} · OSM`,
              source: 'nominatim',
            });
          });
        } catch {
          /* ignore */
        }
      })()
    );
  });

  terms.slice(0, 3).forEach((term) => {
    tasks.push(
      (async () => {
        try {
          const url =
            `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates` +
            `?f=json&maxLocations=12&outFields=*` +
            `&SingleLine=${encodeURIComponent(term)}` +
            `&location=${biasLng},${biasLat}`;
          const res = await fetch(url, { headers: { Accept: 'application/json' } });
          if (!res.ok) return;
          const data = await res.json();
          (data.candidates || []).forEach((c) => {
            push({
              lat: Number(c.location?.y),
              lng: Number(c.location?.x),
              label: c.address || term,
              detail: `Score ${Math.round(c.score || 0)} · ArcGIS`,
              source: 'arcgis',
            });
          });
        } catch {
          /* ignore */
        }
      })()
    );
  });

  tasks.push(
    (async () => {
      try {
        const term = terms[0];
        const url =
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}` +
          `&count=10&language=en&format=json`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) return;
        const data = await res.json();
        (data.results || []).forEach((r) => {
          push({
            lat: Number(r.latitude),
            lng: Number(r.longitude),
            label: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
            detail: `${r.feature_code || 'Place'} · Open-Meteo`,
            source: 'open-meteo',
          });
        });
      } catch {
        /* ignore */
      }
    })()
  );

  await Promise.all(tasks);
  return rankResults(results, q).slice(0, 30);
}

/**
 * Precise map pin picker (Leaflet street + satellite).
 * Search any destination, then refine pin on the map.
 */
const GooglePlacePicker = ({ value, onChange, onClose }) => {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const accuracyCircleRef = useRef(null);
  const resultLayerRef = useRef(null);
  const layersRef = useRef({ street: null, satellite: null });
  const reverseTimer = useRef(null);
  const searchTimer = useRef(null);
  const searchGen = useRef(0);
  const pickRef = useRef(() => {});

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [latInput, setLatInput] = useState('');
  const [lngInput, setLngInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [layerMode, setLayerMode] = useState('street');
  const [geoAccuracy, setGeoAccuracy] = useState(null);
  const [searchHint, setSearchHint] = useState(
    'Search here, or use Google Maps → paste the link back and Add pin.'
  );
  const [gmapsPaste, setGmapsPaste] = useState('');
  const [importingGmaps, setImportingGmaps] = useState(false);

  const setSelection = useCallback((place, { skipInputs } = {}) => {
    setSelected(place);
    if (!skipInputs) {
      setLatInput(formatCoord(place.lat));
      setLngInput(formatCoord(place.lng));
    }
  }, []);

  const scheduleReverse = useCallback(
    (lat, lng) => {
      if (reverseTimer.current) clearTimeout(reverseTimer.current);
      reverseTimer.current = setTimeout(async () => {
        setBusy(true);
        setError('');
        try {
          const place = await reverseGeocode(lat, lng);
          // Update pin label only — do not rewrite the user's search box
          setSelection(place);
        } catch (err) {
          const fallback = {
            lat,
            lng,
            label: `${formatCoord(lat)}, ${formatCoord(lng)}`,
          };
          setSelection(fallback);
          setError(err.message || 'Address lookup failed; pin coordinates kept.');
        } finally {
          setBusy(false);
        }
      }, 350);
    },
    [setSelection]
  );

  const ensureMarker = useCallback(
    (lat, lng) => {
      if (!mapRef.current) return;
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
        return;
      }
      const marker = L.marker([lat, lng], {
        draggable: true,
        autoPan: true,
        autoPanPadding: [40, 40],
      }).addTo(mapRef.current);

      marker.on('drag', () => {
        const p = marker.getLatLng();
        setLatInput(formatCoord(p.lat));
        setLngInput(formatCoord(p.lng));
        setSelected((prev) => ({
          lat: p.lat,
          lng: p.lng,
          label: prev?.label || `${formatCoord(p.lat)}, ${formatCoord(p.lng)}`,
        }));
      });

      marker.on('dragend', () => {
        const p = marker.getLatLng();
        setLatInput(formatCoord(p.lat));
        setLngInput(formatCoord(p.lng));
        scheduleReverse(p.lat, p.lng);
      });

      markerRef.current = marker;
    },
    [scheduleReverse]
  );

  const pinAt = useCallback(
    (lat, lng, { label, zoomTo = true, reverse = true, accuracyM } = {}) => {
      if (!mapRef.current) return;
      const cleanLat = clampLat(lat);
      const cleanLng = clampLng(lng);
      if (!Number.isFinite(cleanLat) || !Number.isFinite(cleanLng)) {
        setError('Invalid coordinates.');
        return;
      }

      ensureMarker(cleanLat, cleanLng);

      if (accuracyCircleRef.current) {
        mapRef.current.removeLayer(accuracyCircleRef.current);
        accuracyCircleRef.current = null;
      }
      if (Number.isFinite(accuracyM) && accuracyM > 0 && accuracyM < 5000) {
        accuracyCircleRef.current = L.circle([cleanLat, cleanLng], {
          radius: accuracyM,
          color: '#1a7ab8',
          fillColor: '#2f8fc9',
          fillOpacity: 0.12,
          weight: 1.5,
        }).addTo(mapRef.current);
        setGeoAccuracy(Math.round(accuracyM));
      } else {
        setGeoAccuracy(null);
      }

      if (zoomTo) {
        const z = Math.max(mapRef.current.getZoom(), PIN_ZOOM);
        mapRef.current.setView([cleanLat, cleanLng], Math.min(z, MAX_ZOOM), {
          animate: true,
        });
      } else {
        mapRef.current.panTo([cleanLat, cleanLng], { animate: true });
      }

      // Label from user-picked suggestion (or GPS/map) — never invent selection from search alone
      if (label) {
        setSelection({ lat: cleanLat, lng: cleanLng, label });
        return;
      }

      setSelection({
        lat: cleanLat,
        lng: cleanLng,
        label: `${formatCoord(cleanLat)}, ${formatCoord(cleanLng)}`,
      });

      if (reverse) {
        scheduleReverse(cleanLat, cleanLng);
      }
    },
    [ensureMarker, scheduleReverse, setSelection]
  );

  const runSearch = useCallback(
    async (rawQuery) => {
      const q = String(rawQuery ?? query).trim();
      setError('');
      setSearchHint('');
      // Search only fills the list — never moves the pin or sets Selected
      if (q.length < 2) {
        setSuggestions([]);
        setSearchHint('Type at least 2 characters, then press Search.');
        return;
      }

      // Coordinates become one list option (user must tap to pin)
      const coords = parseLatLngFromPlace(q);
      if (coords) {
        const item = {
          lat: coords.lat,
          lng: coords.lng,
          label: `${formatCoord(coords.lat)}, ${formatCoord(coords.lng)}`,
          detail: 'Coordinates — tap to pin',
          source: 'coords',
        };
        setSuggestions([item]);
        setSearchHint('1 coordinates option — tap it to pin on the map.');
        return;
      }

      const gen = ++searchGen.current;
      setSearching(true);
      // Clear previous pin so search never looks "auto-selected"
      setSelected(null);
      setLatInput('');
      setLngInput('');
      if (markerRef.current && mapRef.current) {
        mapRef.current.removeLayer(markerRef.current);
        markerRef.current = null;
      }
      if (accuracyCircleRef.current && mapRef.current) {
        mapRef.current.removeLayer(accuracyCircleRef.current);
        accuracyCircleRef.current = null;
      }
      setGeoAccuracy(null);
      try {
        const center = mapRef.current?.getCenter?.();
        const bias = center
          ? { lat: center.lat, lng: center.lng }
          : { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] };
        const list = await searchDestinations(q, bias);
        if (gen !== searchGen.current) return;
        setSuggestions(list);
        if (!list.length) {
          setSearchHint(
            'No matches. Try a fuller name, city, or paste lat, lng from Google Maps.'
          );
        } else {
          setSearchHint(
            `${list.length} place${list.length === 1 ? '' : 's'} — tap one to pin (nothing is selected until you tap).`
          );
        }
      } catch (err) {
        if (gen !== searchGen.current) return;
        setSuggestions([]);
        setError(err.message || 'Search failed. Check your connection.');
      } finally {
        if (gen === searchGen.current) setSearching(false);
      }
    },
    [query]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (!selected || !mapRef.current) return;
      const el = e.target;
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable)
      ) {
        return;
      }
      const steps = {
        ArrowUp: [NUDGE_STEP, 0],
        ArrowDown: [-NUDGE_STEP, 0],
        ArrowLeft: [0, -NUDGE_STEP],
        ArrowRight: [0, NUDGE_STEP],
      };
      const d = steps[e.key];
      if (!d) return;
      e.preventDefault();
      pinAt(selected.lat + d[0], selected.lng + d[1], {
        zoomTo: false,
        reverse: true,
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, selected, pinAt]);

  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return undefined;

    const map = L.map(mapElRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      maxZoom: MAX_ZOOM,
      zoomControl: false,
      scrollWheelZoom: true,
      doubleClickZoom: false,
      boxZoom: true,
      keyboard: true,
    });

    const street = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
        maxZoom: MAX_ZOOM,
        maxNativeZoom: 19,
      }
    );

    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Tiles &copy; Esri',
        maxZoom: MAX_ZOOM,
        maxNativeZoom: 19,
      }
    );

    street.addTo(map);
    layersRef.current = { street, satellite };
    resultLayerRef.current = L.layerGroup().addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    map.on('click', (e) => {
      pinAt(e.latlng.lat, e.latlng.lng, { zoomTo: false, reverse: true });
    });
    map.on('dblclick', (e) => {
      pinAt(e.latlng.lat, e.latlng.lng, { zoomTo: true, reverse: true });
    });

    mapRef.current = map;

    // Do NOT auto-pin on open. Prior coords only recenter the map for context.
    let seed = parseLatLngFromPlace(value);
    if (!seed && typeof value === 'string') {
      const pure = String(value).trim();
      // Only exact "lat, lng" — never pull numbers from long address text
      seed = parseLatLngFromPlace(pure);
    }

    if (seed) {
      map.setView([seed.lat, seed.lng], PIN_ZOOM, { animate: false });
      setSearchHint(
        'Previous pin area shown. Search and tap a result, or click the map to choose.'
      );
    } else if (value && String(value).trim()) {
      // Prefill search box only — user must press Search and tap a result
      setQuery(String(value).trim());
      setSearchHint('Press Search, then tap a place in the list to pin it.');
    }

    const t = setTimeout(() => map.invalidateSize(), 100);
    const t2 = setTimeout(() => map.invalidateSize(), 400);
    const t3 = setTimeout(() => map.invalidateSize(), 900);

    return () => {
      clearTimeout(t);
      clearTimeout(t2);
      clearTimeout(t3);
      if (reverseTimer.current) clearTimeout(reverseTimer.current);
      if (searchTimer.current) clearTimeout(searchTimer.current);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      accuracyCircleRef.current = null;
      resultLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Plot search hits on the big map (click = select). Does not auto-pick.
  useEffect(() => {
    const map = mapRef.current;
    const layer = resultLayerRef.current;
    if (!map || !layer) return undefined;

    layer.clearLayers();
    if (!suggestions.length) return undefined;

    const bounds = [];
    suggestions.forEach((s, idx) => {
      const circle = L.circleMarker([s.lat, s.lng], {
        radius: 8,
        color: '#103078',
        weight: 2,
        fillColor: '#48a8e8',
        fillOpacity: 0.85,
      });
      circle.bindTooltip(`${idx + 1}. ${shortLabel(s.label, 60)}`, {
        direction: 'top',
        opacity: 0.95,
      });
      circle.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        pickRef.current(s);
      });
      layer.addLayer(circle);
      bounds.push([s.lat, s.lng]);
    });

    if (bounds.length === 1) {
      map.setView(bounds[0], Math.max(map.getZoom(), 15), { animate: true });
    } else if (bounds.length > 1) {
      try {
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16, animate: true });
      } catch {
        /* ignore */
      }
    }
    setTimeout(() => map.invalidateSize(), 50);
    return undefined;
  }, [suggestions]);

  useEffect(() => {
    const map = mapRef.current;
    const { street, satellite } = layersRef.current;
    if (!map || !street || !satellite) return;
    if (layerMode === 'satellite') {
      if (map.hasLayer(street)) map.removeLayer(street);
      if (!map.hasLayer(satellite)) satellite.addTo(map);
    } else {
      if (map.hasLayer(satellite)) map.removeLayer(satellite);
      if (!map.hasLayer(street)) street.addTo(map);
    }
  }, [layerMode]);

  const onSearchInput = (e) => {
    // Typing only updates the field — no live search, no auto-pin
    setQuery(e.target.value);
    setError('');
  };

  const pickSuggestion = (item) => {
    setSearchHint('You chose this place. Drag the pin to fine-tune if needed.');
    pinAt(item.lat, item.lng, {
      label: item.label,
      zoomTo: true,
      reverse: false,
    });
    setQuery(item.label);
  };
  pickRef.current = pickSuggestion;

  const openGoogleMapsSearch = () => {
    const url = googleMapsSearchUrl(query || gmapsPaste || selected?.label || '');
    window.open(url, '_blank', 'noopener,noreferrer');
    setSearchHint(
      'Google Maps opened. Find the place → Share → Copy link (or copy lat,lng), paste below, then Add pin.'
    );
  };

  /** Import place from a Google Maps share link / pasted coordinates. */
  const importFromGoogleMaps = async (raw) => {
    const text = String(raw ?? gmapsPaste ?? query).trim();
    if (!text) {
      setError('Paste a Google Maps link or coordinates (e.g. 5.6037, -0.1870).');
      return;
    }

    // Plain text (not a maps URL) → local search
    if (!isGoogleMapsPaste(text) && !parseLatLngFromPlace(text)) {
      setQuery(text);
      await runSearch(text);
      return;
    }

    setImportingGmaps(true);
    setError('');
    setBusy(true);
    try {
      const resolved = await resolveGoogleMapsPaste(text, {
        hint: query,
        expandUrl: async (url) => {
          try {
            return await resolveMapsLink(url, query);
          } catch {
            return null;
          }
        },
      });

      if (resolved?.error && !resolved?.needsConfirm) {
        setError(resolved.error);
        if (resolved.searchQuery) {
          setQuery(resolved.searchQuery);
          await runSearch(resolved.searchQuery);
        }
        return;
      }

      // Uncertain paste — search / seed map; host must confirm before Use
      if (resolved?.needsConfirm) {
        setError(
          resolved.message ||
            resolved.error ||
            'Confirm the correct pin — that link may not be the exact place marker.'
        );
        if (Number.isFinite(resolved?.lat) && Number.isFinite(resolved?.lng)) {
          let label = resolved.label;
          const coordsOnly =
            !label ||
            /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(String(label));
          if (coordsOnly) {
            try {
              const place = await reverseGeocode(resolved.lat, resolved.lng);
              label = place.label;
            } catch {
              label = `${formatCoord(resolved.lat)}, ${formatCoord(resolved.lng)}`;
            }
          }
          pinAt(resolved.lat, resolved.lng, {
            label,
            zoomTo: true,
            reverse: false,
          });
          setQuery(label || resolved.searchQuery || '');
          setSuggestions([
            {
              lat: resolved.lat,
              lng: resolved.lng,
              label,
              detail: 'Needs confirmation',
              source: 'google-maps',
            },
          ]);
          setSearchHint(
            'Tentative pin from Google Maps — verify it, then Use address & pin.'
          );
        } else if (resolved.searchQuery) {
          setQuery(resolved.searchQuery);
          await runSearch(resolved.searchQuery);
          setSearchHint(
            'Pick the correct place from results, then Use address & pin.'
          );
        }
        setGmapsPaste('');
        return;
      }

      if (!Number.isFinite(resolved?.lat) || !Number.isFinite(resolved?.lng)) {
        setError('Could not read coordinates from that Google Maps paste.');
        if (resolved?.searchQuery) {
          setQuery(resolved.searchQuery);
          await runSearch(resolved.searchQuery);
        }
        return;
      }

      let label = resolved.label;
      const coordsOnly =
        !label || /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(String(label));
      if (coordsOnly) {
        try {
          const place = await reverseGeocode(resolved.lat, resolved.lng);
          label = place.label;
        } catch {
          label = `${formatCoord(resolved.lat)}, ${formatCoord(resolved.lng)}`;
        }
      }
      pinAt(resolved.lat, resolved.lng, {
        label,
        zoomTo: true,
        reverse: false,
      });
      setQuery(label);
      setGmapsPaste('');
      setSuggestions([
        {
          lat: resolved.lat,
          lng: resolved.lng,
          label,
          detail: 'From Google Maps',
          source: 'google-maps',
        },
      ]);
      setSearchHint(
        'Google Maps place added. Fine-tune the pin if needed, then Use address & pin.'
      );
    } finally {
      setImportingGmaps(false);
      setBusy(false);
    }
  };

  const applyCoordInputs = () => {
    const lat = clampLat(parseFloat(latInput));
    const lng = clampLng(parseFloat(lngInput));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setError('Enter valid latitude (-90…90) and longitude (-180…180).');
      return;
    }
    setError('');
    pinAt(lat, lng, { zoomTo: true, reverse: true });
  };

  const nudge = (dLat, dLng) => {
    if (!selected) {
      setError('Drop a pin first, then use nudge for fine-tuning.');
      return;
    }
    pinAt(selected.lat + dLat, selected.lng + dLng, {
      zoomTo: false,
      reverse: true,
    });
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not available in this browser.');
      return;
    }
    setBusy(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        pinAt(pos.coords.latitude, pos.coords.longitude, {
          zoomTo: true,
          reverse: true,
          accuracyM: pos.coords.accuracy,
        });
        setBusy(false);
      },
      () => {
        setBusy(false);
        setError('Could not get your location. Allow location and try again.');
      },
      { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 }
    );
  };

  const pinMapCenter = () => {
    if (!mapRef.current) return;
    const c = mapRef.current.getCenter();
    pinAt(c.lat, c.lng, { zoomTo: false, reverse: true });
  };

  const zoomBy = (delta) => {
    if (!mapRef.current) return;
    mapRef.current.setZoom(
      Math.min(MAX_ZOOM, Math.max(3, mapRef.current.getZoom() + delta))
    );
  };

  const confirm = async () => {
    if (!selected) {
      setError('Search a place or click the map to drop a pin first.');
      return;
    }
    const lat = clampLat(selected.lat);
    const lng = clampLng(selected.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setError('Pin has invalid coordinates. Search and select a place again.');
      return;
    }
    let label = String(selected.label || '').trim();
    const coordsOnly = !label || /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(label);
    // Always try to attach a real street address with the pin
    if (coordsOnly) {
      setBusy(true);
      try {
        const place = await reverseGeocode(lat, lng);
        label = place.label || `${formatCoord(lat)}, ${formatCoord(lng)}`;
      } catch {
        label = `${formatCoord(lat)}, ${formatCoord(lng)}`;
        setError(
          'Address lookup failed. Pin coordinates will still be saved — add a venue name on the form.'
        );
      } finally {
        setBusy(false);
      }
    }
    onChange({
      label,
      lat,
      lng,
    });
  };

  const mapsUrl = mapsOpenUrl(selected?.lat, selected?.lng, query || selected?.label);
  const searchOnGoogleMapsUrl = query.trim()
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query.trim())}`
    : 'https://www.google.com/maps';

  return (
    <div
      className="gpp-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Find destination and pin location"
    >
      <div className="gpp-modal gpp-modal-wide gpp-modal-xl">
        <header className="gpp-head">
          <div>
            <h3>
              <FaMapMarkerAlt aria-hidden /> Find &amp; pin venue
            </h3>
            <p>
              Search here, or open <strong>Google Maps</strong>, then paste the
              share link / coordinates and <strong>Add pin</strong>.
            </p>
          </div>
          <button
            type="button"
            className="gpp-close"
            onClick={onClose}
            aria-label="Close"
          >
            <FaTimes />
          </button>
        </header>

        <div className="gpp-search">
          <FaSearch className="gpp-search-icon" aria-hidden />
          <input
            type="search"
            className="form-input gpp-search-input"
            placeholder="e.g. GLICO Life Accra, mall, street — or paste a Maps link"
            value={query}
            onChange={onSearchInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const t = String(query).trim();
                if (isGoogleMapsPaste(t)) {
                  importFromGoogleMaps(t);
                } else {
                  runSearch();
                }
              }
            }}
            onPaste={(e) => {
              const text = e.clipboardData?.getData('text');
              if (text && isGoogleMapsPaste(text)) {
                setTimeout(() => importFromGoogleMaps(text.trim()), 0);
              }
            }}
            autoComplete="off"
            autoFocus
          />
          <button
            type="button"
            className="gpp-search-btn"
            onClick={() => runSearch()}
            disabled={searching}
          >
            <FaSearch aria-hidden /> {searching ? 'Searching…' : 'Search'}
          </button>
          <button
            type="button"
            className="gpp-gmaps-search-btn"
            onClick={openGoogleMapsSearch}
            title="Open Google Maps with this search"
          >
            Google Maps <FaExternalLinkAlt aria-hidden />
          </button>
          <button
            type="button"
            className="gpp-locate"
            onClick={useMyLocation}
            title="Use current GPS"
          >
            <FaCrosshairs aria-hidden /> GPS
          </button>
        </div>

        <div className="gpp-gmaps-import" aria-label="Import from Google Maps">
          <div className="gpp-gmaps-import-row">
            <input
              type="url"
              className="form-input gpp-gmaps-paste"
              placeholder="Paste Google Maps link or lat, lng — then Add pin"
              value={gmapsPaste}
              onChange={(e) => {
                setGmapsPaste(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  importFromGoogleMaps(gmapsPaste);
                }
              }}
              onPaste={(e) => {
                const text = e.clipboardData?.getData('text');
                if (text && isGoogleMapsPaste(text)) {
                  // Let paste land, then import on next tick
                  setTimeout(() => importFromGoogleMaps(text), 0);
                }
              }}
            />
            <button
              type="button"
              className="gpp-gmaps-add-btn"
              onClick={() => importFromGoogleMaps(gmapsPaste || query)}
              disabled={importingGmaps || busy}
            >
              {importingGmaps ? 'Adding…' : 'Add pin'}
            </button>
          </div>
          <p className="gpp-gmaps-steps">
            1) <button type="button" className="gpp-text-link" onClick={openGoogleMapsSearch}>Search on Google Maps</button>
            {' · '}
            2) Share → copy link (with the red pin open)
            {' · '}
            3) Paste above → <strong>Add pin</strong>
          </p>
        </div>

        <div className="gpp-quick" aria-label="Quick destinations">
          {QUICK_PLACES.map((p) => (
            <button
              key={p.q}
              type="button"
              className="gpp-quick-chip"
              onClick={() => {
                setQuery(p.q);
                runSearch(p.q);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="gpp-main">
          <aside className="gpp-side" aria-label="Search results">
            <div className="gpp-side-head">
              <strong>
                {searching
                  ? 'Searching…'
                  : suggestions.length
                    ? `${suggestions.length} places`
                    : 'Results'}
              </strong>
              <a
                href={searchOnGoogleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="gpp-open-gmaps"
                title="Open this search in Google Maps"
              >
                Google Maps <FaExternalLinkAlt aria-hidden />
              </a>
            </div>
            {searchHint && <p className="gpp-search-hint">{searchHint}</p>}
            {suggestions.length > 0 ? (
              <ul className="gpp-suggestions gpp-suggestions-panel" role="listbox">
                {suggestions.map((s, idx) => {
                  const isActive =
                    selected &&
                    Math.abs(selected.lat - s.lat) < 1e-5 &&
                    Math.abs(selected.lng - s.lng) < 1e-5;
                  return (
                    <li key={`${s.source}-${s.lat}-${s.lng}-${idx}`}>
                      <button
                        type="button"
                        className={isActive ? 'gpp-sug-active' : undefined}
                        onClick={() => pickSuggestion(s)}
                        role="option"
                        aria-selected={isActive}
                      >
                        <span className="gpp-sug-num">{idx + 1}</span>
                        <span className="gpp-sug-text">
                          <span className="gpp-sug-main">
                            {shortLabel(s.label, 120)}
                          </span>
                          {s.detail && (
                            <span className="gpp-sug-meta">{s.detail}</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="gpp-empty-results">
                <p>
                  {searching
                    ? 'Looking up places from multiple map services…'
                    : 'Type a place and press Search. Matches show here and as blue dots on the map.'}
                </p>
                <p className="gpp-empty-tip">
                  Tip: if a shop is missing, open{' '}
                  <a
                    href={searchOnGoogleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Google Maps
                  </a>
                  , Share → Copy link (or copy coordinates like{' '}
                  <code>5.60, -0.18</code>), paste below, then{' '}
                  <strong>Add pin</strong>.
                </p>
              </div>
            )}
          </aside>

          <div className="gpp-map-col">
            <div className="gpp-map-tools">
              <div className="gpp-layer-toggle" role="group" aria-label="Map style">
                <button
                  type="button"
                  className={layerMode === 'street' ? 'on' : ''}
                  onClick={() => setLayerMode('street')}
                >
                  Street
                </button>
                <button
                  type="button"
                  className={layerMode === 'satellite' ? 'on' : ''}
                  onClick={() => setLayerMode('satellite')}
                >
                  Satellite
                </button>
              </div>
              <div className="gpp-zoom-btns">
                <button type="button" onClick={() => zoomBy(1)} title="Zoom in">
                  <FaPlus />
                </button>
                <button type="button" onClick={() => zoomBy(-1)} title="Zoom out">
                  <FaMinus />
                </button>
                <button
                  type="button"
                  className="gpp-center-pin"
                  onClick={pinMapCenter}
                  title="Drop pin at map center"
                >
                  Pin centre
                </button>
                <a
                  className="gpp-open-gmaps"
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open pin area in Google Maps"
                >
                  Google Maps <FaExternalLinkAlt aria-hidden />
                </a>
              </div>
            </div>

            <div className="gpp-map-wrap">
              <div className="gpp-map gpp-map-tall" ref={mapElRef} />
              <div className="gpp-crosshair" aria-hidden title="Map centre">
                <span />
              </div>
            </div>

            <div className="gpp-coords-row">
              <label className="gpp-coord-field">
                <span>Latitude</span>
                <input
                  className="form-input"
                  inputMode="decimal"
                  value={latInput}
                  onChange={(e) => setLatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applyCoordInputs();
                    }
                  }}
                  placeholder="5.603700"
                />
              </label>
              <label className="gpp-coord-field">
                <span>Longitude</span>
                <input
                  className="form-input"
                  inputMode="decimal"
                  value={lngInput}
                  onChange={(e) => setLngInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applyCoordInputs();
                    }
                  }}
                  placeholder="-0.187000"
                />
              </label>
              <button
                type="button"
                className="gpp-apply-coords"
                onClick={applyCoordInputs}
              >
                Apply coords
              </button>
              <div className="gpp-nudge" aria-label="Fine adjust pin">
                <button type="button" onClick={() => nudge(NUDGE_STEP, 0)} title="Nudge north">
                  <FaArrowUp />
                </button>
                <div className="gpp-nudge-mid">
                  <button type="button" onClick={() => nudge(0, -NUDGE_STEP)} title="Nudge west">
                    <FaArrowLeft />
                  </button>
                  <button type="button" onClick={() => nudge(0, NUDGE_STEP)} title="Nudge east">
                    <FaArrowRight />
                  </button>
                </div>
                <button type="button" onClick={() => nudge(-NUDGE_STEP, 0)} title="Nudge south">
                  <FaArrowDown />
                </button>
              </div>
            </div>
          </div>
        </div>

        {(busy || searching) && (
          <p className="gpp-status">
            {searching
              ? 'Searching Photon, OpenStreetMap, ArcGIS & Open-Meteo…'
              : 'Updating pin…'}
          </p>
        )}
        {error && (
          <p className="gpp-error" role="alert">
            {error}
          </p>
        )}
        {selected && (
          <div className="gpp-selected-block">
            <p className="gpp-selected" title={selected.label}>
              <strong>Selected:</strong> {selected.label}
            </p>
            <p className="gpp-coords-readout">
              <strong>Exact pin:</strong> {formatCoord(selected.lat)},{' '}
              {formatCoord(selected.lng)}
              {geoAccuracy != null ? ` · GPS ±${geoAccuracy} m` : ''}
            </p>
          </div>
        )}

        <footer className="gpp-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={confirm}
            disabled={!selected || busy}
          >
            {busy ? 'Saving address…' : 'Use address & pin'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default GooglePlacePicker;
