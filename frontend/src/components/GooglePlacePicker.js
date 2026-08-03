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
} from 'react-icons/fa';
import './GooglePlacePicker.css';

// Leaflet default markers break under CRA bundling without explicit URLs
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

/** Accra — sensible default for GLICO Ghana */
const DEFAULT_CENTER = [5.6037, -0.187];
const DEFAULT_ZOOM = 16;
const PIN_ZOOM = 18;
const MAX_ZOOM = 20;
/** ~1.1 m per step at equator when nudging 0.00001° */
const NUDGE_STEP = 0.00002;

const NOMINATIM_HEADERS = {
  Accept: 'application/json',
};

function parseLatLngFromPlace(place) {
  const s = String(place || '').trim();
  if (!s) return null;
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (m) {
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

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

function formatCoord(n, digits = 6) {
  if (!Number.isFinite(n)) return '';
  return Number(n).toFixed(digits);
}

async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1`;
  const res = await fetch(url, { headers: NOMINATIM_HEADERS });
  if (!res.ok) throw new Error('Could not look up that location.');
  const data = await res.json();
  const label =
    data.display_name ||
    `${formatCoord(lat)}, ${formatCoord(lng)}`;
  return { lat, lng, label };
}

async function searchPlaces(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  // Bias search to Ghana for more relevant local buildings
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2` +
    `&q=${encodeURIComponent(q)}` +
    `&limit=8&addressdetails=1` +
    `&viewbox=-3.5,11.2,1.3,4.5&bounded=0` +
    `&countrycodes=gh`;
  const res = await fetch(url, { headers: NOMINATIM_HEADERS });
  if (!res.ok) throw new Error('Place search failed.');
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map((item) => ({
    lat: Number(item.lat),
    lng: Number(item.lon),
    label: item.display_name || q,
  }));
}

/**
 * Precise map pin picker for venue verification.
 * OSM + satellite, drag/nudge/coordinates for accurate placement.
 */
const GooglePlacePicker = ({ value, onChange, onClose }) => {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const accuracyCircleRef = useRef(null);
  const layersRef = useRef({ street: null, satellite: null });
  const reverseTimer = useRef(null);
  const searchTimer = useRef(null);

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [latInput, setLatInput] = useState('');
  const [lngInput, setLngInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [layerMode, setLayerMode] = useState('street'); // street | satellite
  const [geoAccuracy, setGeoAccuracy] = useState(null);

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
          setSelection(place);
          setQuery(place.label);
        } catch (err) {
          const fallback = {
            lat,
            lng,
            label: `${formatCoord(lat)}, ${formatCoord(lng)}`,
          };
          setSelection(fallback);
          setQuery(fallback.label);
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

      if (label) {
        setSelection({ lat: cleanLat, lng: cleanLng, label });
        setQuery(label);
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

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      // Arrow keys nudge pin when modal focused
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

    // High-detail satellite for precise building/courtyard pins
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

    L.control
      .zoom({ position: 'bottomright' })
      .addTo(map);

    map.on('click', (e) => {
      pinAt(e.latlng.lat, e.latlng.lng, { zoomTo: false, reverse: true });
    });

    map.on('dblclick', (e) => {
      pinAt(e.latlng.lat, e.latlng.lng, { zoomTo: true, reverse: true });
    });

    mapRef.current = map;

    // Seed from existing value — prefer "lat, lng" style after colon in labels
    let seed = parseLatLngFromPlace(value);
    if (!seed && typeof value === 'string') {
      const tail = value.match(
        /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/
      );
      if (tail) {
        seed = { lat: Number(tail[1]), lng: Number(tail[2]) };
      }
    }

    if (seed) {
      pinAt(seed.lat, seed.lng, {
        zoomTo: true,
        reverse: true,
      });
    } else if (value && String(value).trim()) {
      setQuery(String(value));
      setBusy(true);
      searchPlaces(value)
        .then((list) => {
          if (list[0]) {
            pinAt(list[0].lat, list[0].lng, {
              label: list[0].label,
              zoomTo: true,
              reverse: false,
            });
          }
        })
        .catch(() => {
          /* keep default map */
        })
        .finally(() => setBusy(false));
    }

    const t = setTimeout(() => map.invalidateSize(), 100);
    const t2 = setTimeout(() => map.invalidateSize(), 400);

    return () => {
      clearTimeout(t);
      clearTimeout(t2);
      if (reverseTimer.current) clearTimeout(reverseTimer.current);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      accuracyCircleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  // Switch base layer
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
    const q = e.target.value;
    setQuery(q);
    setError('');
    if (searchTimer.current) clearTimeout(searchTimer.current);
    // Direct coordinate paste
    const coords = parseLatLngFromPlace(q);
    if (coords) {
      setSuggestions([]);
      pinAt(coords.lat, coords.lng, { reverse: true });
      return;
    }
    searchTimer.current = setTimeout(async () => {
      if (q.trim().length < 2) {
        setSuggestions([]);
        return;
      }
      try {
        const list = await searchPlaces(q);
        setSuggestions(list);
      } catch (err) {
        setSuggestions([]);
        setError(err.message || 'Search failed.');
      }
    }, 400);
  };

  const pickSuggestion = (item) => {
    setSuggestions([]);
    pinAt(item.lat, item.lng, {
      label: item.label,
      zoomTo: true,
      reverse: false,
    });
    setQuery(item.label);
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

  const confirm = () => {
    if (!selected) {
      setError('Click the map, drag the pin, or enter coordinates first.');
      return;
    }
    const lat = clampLat(selected.lat);
    const lng = clampLng(selected.lng);
    // Prefer address label; always keep exact coords as system of truth
    const label =
      selected.label && !/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(selected.label)
        ? selected.label
        : `${formatCoord(lat)}, ${formatCoord(lng)}`;
    onChange({
      label,
      lat,
      lng,
    });
  };

  return (
    <div
      className="gpp-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Pick accurate map location"
    >
      <div className="gpp-modal gpp-modal-wide">
        <header className="gpp-head">
          <div>
            <h3>
              <FaMapMarkerAlt aria-hidden /> Pin exact meeting location
            </h3>
            <p>
              Zoom in, switch to satellite, drag the pin, or nudge with arrow
              keys. Guests are verified against this exact pin.
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
            placeholder="Search place, or paste lat, lng…"
            value={query}
            onChange={onSearchInput}
            autoComplete="off"
          />
          <button
            type="button"
            className="gpp-locate"
            onClick={useMyLocation}
            title="High-accuracy GPS"
          >
            <FaCrosshairs aria-hidden /> GPS
          </button>
        </div>

        {suggestions.length > 0 && (
          <ul className="gpp-suggestions">
            {suggestions.map((s) => (
              <li key={`${s.lat}-${s.lng}-${s.label}`}>
                <button type="button" onClick={() => pickSuggestion(s)}>
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        )}

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
              onBlur={applyCoordInputs}
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
              onBlur={applyCoordInputs}
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

        {busy && <p className="gpp-status">Updating pin…</p>}
        {error && (
          <p className="gpp-error" role="alert">
            {error}
          </p>
        )}
        {selected && (
          <div className="gpp-selected-block">
            <p className="gpp-selected" title={selected.label}>
              <strong>Address:</strong> {selected.label}
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
            disabled={!selected}
          >
            Use this exact pin
          </button>
        </footer>
      </div>
    </div>
  );
};

export default GooglePlacePicker;
