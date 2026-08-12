import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  FaUsers,
  FaMapMarkerAlt,
  FaClock,
  FaCheckCircle,
  FaExternalLinkAlt,
  FaShieldAlt,
  FaLocationArrow,
} from 'react-icons/fa';
import {
  fetchPublicMeeting,
  registerAttendance,
  mapsEmbedUrl,
  mapsOpenUrl,
} from '../services/meetingsApi';
import './MeetingJoin.css';
import { glicoLogoUrl } from '../utils/brandAssets';

function isSecureGeoContext() {
  if (typeof window === 'undefined') return false;
  if (window.isSecureContext) return true;
  const h = String(window.location.hostname || '');
  return h === 'localhost' || h === '127.0.0.1';
}

function geoErrorMessage(err) {
  if (err && err.code === 1) {
    return 'Location permission was denied. In your phone browser: allow Location for this site, turn on Precise Location, then tap Share location again.';
  }
  if (err && err.code === 2) {
    return 'Could not determine your position. Turn on GPS / Location Services, step outdoors if you can, then try again.';
  }
  if (err && err.code === 3) {
    return 'Location timed out. Move outdoors for a clearer GPS signal, then tap Share location again.';
  }
  return (
    err?.message ||
    'Location access is required to check in. Tap Share location and allow when prompted.'
  );
}

/**
 * Mobile-friendly GPS: watch for a real fix (not a stale/network guess),
 * accept a good reading early, fall back to coarser location if needed.
 */
function requestDeviceLocation() {
  return new Promise((resolve, reject) => {
    if (!isSecureGeoContext()) {
      reject(
        new Error(
          'Location only works on HTTPS. Open the check-in page from the QR code (https://…), not an insecure http link.'
        )
      );
      return;
    }
    if (!navigator.geolocation) {
      reject(
        new Error(
          'This device does not support location. Use a phone browser with GPS / location services.'
        )
      );
      return;
    }

    let settled = false;
    let best = null;
    let watchId = null;
    let timerId = null;

    const toLoc = (pos) => ({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      locationAccuracy: pos.coords.accuracy,
      timestamp: pos.timestamp || Date.now(),
    });

    const cleanup = () => {
      if (watchId != null && navigator.geolocation.clearWatch) {
        try {
          navigator.geolocation.clearWatch(watchId);
        } catch {
          /* ignore */
        }
      }
      watchId = null;
      if (timerId) clearTimeout(timerId);
      timerId = null;
    };

    const finish = (loc) => {
      if (settled || !loc) return;
      settled = true;
      cleanup();
      resolve(loc);
    };

    const fail = (err) => {
      if (settled) return;
      if (best) {
        finish(best);
        return;
      }
      settled = true;
      cleanup();
      reject(new Error(geoErrorMessage(err)));
    };

    const consider = (pos) => {
      if (!pos?.coords) return;
      const loc = toLoc(pos);
      if (
        !Number.isFinite(loc.latitude) ||
        !Number.isFinite(loc.longitude)
      ) {
        return;
      }
      if (
        !best ||
        (Number.isFinite(loc.locationAccuracy) &&
          loc.locationAccuracy < (best.locationAccuracy || 1e9))
      ) {
        best = loc;
      }
      // Good enough for check-in — stop waiting
      if (
        Number.isFinite(loc.locationAccuracy) &&
        loc.locationAccuracy <= 80
      ) {
        finish(loc);
      }
    };

    try {
      watchId = navigator.geolocation.watchPosition(consider, (err) => {
        // Permission denied is fatal; other errors may still get a later fix
        if (err && err.code === 1) fail(err);
      }, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 25000,
      });
    } catch (err) {
      fail(err);
      return;
    }

    // Kick Android / some WebViews that respond better to getCurrentPosition
    try {
      navigator.geolocation.getCurrentPosition(consider, () => {}, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000,
      });
    } catch {
      /* ignore */
    }

    timerId = setTimeout(() => {
      if (best) {
        finish(best);
        return;
      }
      // Last resort: allow a coarser / cached fix so check-in is not stuck
      navigator.geolocation.getCurrentPosition(
        (pos) => finish(toLoc(pos)),
        fail,
        {
          enableHighAccuracy: false,
          maximumAge: 120000,
          timeout: 12000,
        }
      );
    }, 20000);
  });
}

/**
 * Public check-in page opened by scanning a meeting QR code.
 * Requires consent to share contact details + live device location.
 */
const MeetingJoin = ({ meetingId, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [meeting, setMeeting] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ fullName: '', email: '', phone: '' });
  const [breakfastChoice, setBreakfastChoice] = useState('');
  const [lunchChoice, setLunchChoice] = useState('');
  const [dinnerChoice, setDinnerChoice] = useState('');
  const [consentDetails, setConsentDetails] = useState(false);
  const [consentLocation, setConsentLocation] = useState(false);
  const [geo, setGeo] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);
  const capturingRef = useRef(false);
  const geoRef = useRef(null);

  useEffect(() => {
    geoRef.current = geo;
  }, [geo]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchPublicMeeting(meetingId)
      .then((data) => {
        if (!cancelled) setMeeting(data.meeting);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err.message ||
              'Meeting not found. Ask the host to enable the check-in QR first.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  const place = useMemo(
    () => meeting?.googlePlace || meeting?.location || '',
    [meeting]
  );
  const venueQuery = useMemo(() => {
    if (
      meeting?.venueLat != null &&
      meeting?.venueLng != null &&
      Number.isFinite(Number(meeting.venueLat)) &&
      Number.isFinite(Number(meeting.venueLng))
    ) {
      return `${meeting.venueLat},${meeting.venueLng}`;
    }
    return place;
  }, [meeting, place]);
  const hasVenue = !!(
    meeting?.venueLat != null &&
    meeting?.venueLng != null &&
    Number.isFinite(Number(meeting.venueLat)) &&
    Number.isFinite(Number(meeting.venueLng))
  );
  const mealMenu = meeting?.mealMenu || {
    breakfast: { enabled: false, items: [] },
    lunch: { enabled: false, items: [] },
    dinner: { enabled: false, items: [] },
  };
  const program = meeting?.programSchedule || {};
  const showBreakfast = !!(mealMenu.breakfast?.enabled && mealMenu.breakfast.items?.length);
  const showLunch = !!(mealMenu.lunch?.enabled && mealMenu.lunch.items?.length);
  const showDinner = !!(mealMenu.dinner?.enabled && mealMenu.dinner.items?.length);
  const hasProgram = !!(program.text || program.fileData);
  const embed = mapsEmbedUrl(venueQuery);
  const openMap = mapsOpenUrl(venueQuery);

  const guestMapUrl = useMemo(() => {
    if (!geo) return '';
    return mapsOpenUrl(`${geo.latitude},${geo.longitude}`);
  }, [geo]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  // Auto-tick permissions as the guest fills contact fields (can still untick).
  // Do NOT auto-call GPS here — mobile browsers block location without a tap.
  useEffect(() => {
    const nameOk = form.fullName.trim().length >= 2;
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
    const phoneDigits = form.phone.replace(/\D/g, '');
    const phoneStarted = phoneDigits.length >= 3;
    const anyFilled =
      form.fullName.trim().length > 0 ||
      form.email.trim().length > 0 ||
      form.phone.trim().length > 0;

    if (nameOk && emailOk) {
      setConsentDetails(true);
    }
    if (anyFilled || phoneStarted) {
      setConsentLocation(true);
    }
  }, [form.fullName, form.email, form.phone]);

  const captureLocation = useCallback(async () => {
    if (capturingRef.current) return geoRef.current;
    capturingRef.current = true;
    setGeoError('');
    setGeoLoading(true);
    try {
      const loc = await requestDeviceLocation();
      setGeo(loc);
      setConsentLocation(true);
      return loc;
    } catch (err) {
      setGeoError(err.message || 'Could not get location.');
      // Keep last good fix if we had one (don’t wipe on a failed refresh)
      return geoRef.current;
    } finally {
      setGeoLoading(false);
      capturingRef.current = false;
    }
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!consentDetails) {
      setError(
        'Please allow the host to see your name, email and phone number.'
      );
      return;
    }
    if (!consentLocation) {
      setError('Please allow location so the host can see where you checked in.');
      return;
    }
    if (showBreakfast && !breakfastChoice) {
      setError('Please choose what you will have for breakfast.');
      return;
    }
    if (showLunch && !lunchChoice) {
      setError('Please choose what you will have for lunch.');
      return;
    }
    if (showDinner && !dinnerChoice) {
      setError('Please choose what you will have for dinner.');
      return;
    }

    setSubmitting(true);
    try {
      const existing = geoRef.current;
      const age = existing?.timestamp
        ? Date.now() - existing.timestamp
        : Infinity;
      const rough =
        Number.isFinite(existing?.locationAccuracy) &&
        existing.locationAccuracy > 150;
      let loc = existing;
      if (!loc || rough || age > 60000) {
        loc = (await captureLocation()) || existing;
      }
      if (!loc) {
        setError(
          geoError ||
            'Tap “Share my GPS location”, allow permission, then check in.'
        );
        setSubmitting(false);
        return;
      }

      const data = await registerAttendance(meetingId, {
        ...form,
        consentDetails: true,
        consentLocation: true,
        latitude: loc.latitude,
        longitude: loc.longitude,
        locationAccuracy: loc.locationAccuracy,
        breakfastChoice: showBreakfast ? breakfastChoice : '',
        lunchChoice: showLunch ? lunchChoice : '',
        dinnerChoice: showDinner ? dinnerChoice : '',
      });
      setDone(data);
    } catch (err) {
      setError(err.message || 'Could not check in.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="App meeting-join-page">
      <header className="meeting-join-header">
        <img
          src={glicoLogoUrl()}
          alt="GLICO"
          className="meeting-join-logo"
        />
        <div>
          <h1>Meeting check-in</h1>
          <p>Allow location and share your details to join the register.</p>
        </div>
      </header>

      <main className="meeting-join-main">
        {loading && (
          <div className="meeting-join-card">
            <div className="loading-spinner" />
            <p>Loading meeting…</p>
          </div>
        )}

        {!loading && error && !meeting && (
          <div className="meeting-join-card">
            <div className="meeting-join-error" role="alert">
              {error}
            </div>
            {onClose && (
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Back to apps
              </button>
            )}
          </div>
        )}

        {meeting && (
          <>
            <div className="meeting-join-card">
              <h2>{meeting.title}</h2>
              <p className="meeting-join-meta">
                <FaClock aria-hidden /> {meeting.date}
                {meeting.time ? ` · ${meeting.time}` : ''}
                {meeting.durationMins ? ` · ${meeting.durationMins} min` : ''}
              </p>
              {meeting.organiser && (
                <p className="meeting-join-meta">Host: {meeting.organiser}</p>
              )}
              {(meeting.location || place) && (
                <p className="meeting-join-meta">
                  <FaMapMarkerAlt aria-hidden /> {meeting.location || place}
                </p>
              )}
              {meeting.googlePlace &&
                meeting.googlePlace !== meeting.location && (
                  <p className="meeting-join-meta meeting-join-map-address">
                    Map pin: {meeting.googlePlace}
                  </p>
                )}
              {hasVenue && (
                <p className="meeting-join-meta meeting-join-pin-coords">
                  Check-in pin: {Number(meeting.venueLat).toFixed(5)},{' '}
                  {Number(meeting.venueLng).toFixed(5)}
                </p>
              )}
              {hasVenue && (
                <p className="meeting-join-verify-note">
                  <FaShieldAlt aria-hidden /> In-person check-in: your device
                  location will be verified against this venue
                  {meeting.venueRadiusM
                    ? ` (within about ${meeting.venueRadiusM} m)`
                    : ''}
                  .
                </p>
              )}
              {meeting.isInPerson === false && !hasVenue && (
                <p className="meeting-join-verify-note">
                  <FaShieldAlt aria-hidden /> Online meeting — share your details
                  to check in
                  {meeting.onlineLink ? ' (join link provided below where available)' : ''}.
                </p>
              )}
              {meeting.agenda && (
                <p className="meeting-join-agenda">{meeting.agenda}</p>
              )}
              {hasProgram && (
                <div className="meeting-join-program">
                  <p className="meeting-join-consent-title">Program schedule</p>
                  {program.text && (
                    <pre className="meeting-join-program-text">{program.text}</pre>
                  )}
                  {program.fileData && (
                    <a
                      href={program.fileData}
                      download={program.fileName || 'program-schedule'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="meeting-join-program-file"
                    >
                      Download {program.fileName || 'program schedule'}{' '}
                      <FaExternalLinkAlt aria-hidden />
                    </a>
                  )}
                </div>
              )}
            </div>

            {venueQuery && (
              <div className="meeting-join-card meeting-join-map-card">
                <div className="meeting-join-map-head">
                  <h3>
                    <FaMapMarkerAlt aria-hidden /> Meeting venue (host pin)
                  </h3>
                  {openMap && (
                    <a
                      href={openMap}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="meeting-join-map-link"
                    >
                      Open in Google Maps <FaExternalLinkAlt />
                    </a>
                  )}
                </div>
                {place && place !== venueQuery && (
                  <p className="meeting-join-meta">{place}</p>
                )}
                {embed && (
                  <iframe
                    title={`Map for ${meeting.title}`}
                    className="meeting-join-map"
                    src={embed}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    allowFullScreen
                  />
                )}
              </div>
            )}

            {done ? (
              <div className="meeting-join-card meeting-join-success">
                <FaCheckCircle className="meeting-join-success-icon" aria-hidden />
                <h3>
                  {done.alreadyRegistered
                    ? 'Already registered'
                    : 'You are checked in'}
                </h3>
                <p>{done.message}</p>
                {(done.locationMatch || done.attendance?.locationMatch) && (
                  <div
                    className={`meeting-join-match ${
                      (done.locationMatch || done.attendance?.locationMatch) ===
                      'at_venue'
                        ? 'ok'
                        : (done.locationMatch ||
                              done.attendance?.locationMatch) === 'away'
                          ? 'away'
                          : 'unknown'
                    }`}
                  >
                    {(done.locationMatch || done.attendance?.locationMatch) ===
                    'at_venue' ? (
                      <>
                        <strong>Location verified</strong>
                        <span>
                          You appear to be at the meeting venue
                          {(done.distanceM ?? done.attendance?.distanceM) !=
                          null
                            ? ` (${Math.round(done.distanceM ?? done.attendance.distanceM)} m from pin)`
                            : ''}
                          .
                        </span>
                      </>
                    ) : (done.locationMatch ||
                        done.attendance?.locationMatch) === 'away' ? (
                      <>
                        <strong>Not at venue</strong>
                        <span>
                          Your location does not match the host venue
                          {(done.distanceM ?? done.attendance?.distanceM) !=
                          null
                            ? ` (about ${Math.round(done.distanceM ?? done.attendance.distanceM)} m away)`
                            : ''}
                          . The host can see this.
                        </span>
                      </>
                    ) : (
                      <>
                        <strong>Location recorded</strong>
                        <span>
                          Venue pin was not available for comparison.
                        </span>
                      </>
                    )}
                  </div>
                )}
                <dl className="meeting-join-receipt">
                  <div>
                    <dt>Name</dt>
                    <dd>{done.attendance?.fullName}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{done.attendance?.email}</dd>
                  </div>
                  <div>
                    <dt>Phone</dt>
                    <dd>{done.attendance?.phone}</dd>
                  </div>
                  {done.attendance?.breakfastChoice && (
                    <div>
                      <dt>Breakfast</dt>
                      <dd>{done.attendance.breakfastChoice}</dd>
                    </div>
                  )}
                  {done.attendance?.lunchChoice && (
                    <div>
                      <dt>Lunch</dt>
                      <dd>{done.attendance.lunchChoice}</dd>
                    </div>
                  )}
                  {done.attendance?.dinnerChoice && (
                    <div>
                      <dt>Dinner</dt>
                      <dd>{done.attendance.dinnerChoice}</dd>
                    </div>
                  )}
                  {done.attendance?.latitude != null &&
                    done.attendance?.longitude != null && (
                      <div>
                        <dt>Your GPS</dt>
                        <dd>
                          <a
                            href={mapsOpenUrl(
                              `${done.attendance.latitude},${done.attendance.longitude}`
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {done.attendance.latitude.toFixed(5)},{' '}
                            {done.attendance.longitude.toFixed(5)}
                          </a>
                        </dd>
                      </div>
                    )}
                </dl>
                {onClose && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={onClose}
                  >
                    Done
                  </button>
                )}
              </div>
            ) : (
              <form className="meeting-join-card" onSubmit={onSubmit}>
                <h3>
                  <FaUsers aria-hidden /> Register attendance
                </h3>
                <p className="meeting-join-form-hint">
                  Check-in requires your contact details and your device
                  location. Both are shared with the meeting host on the
                  attendance list.
                </p>
                {error && (
                  <div className="meeting-join-error" role="alert">
                    {error}
                  </div>
                )}
                <label className="meeting-join-field">
                  <span>Full name</span>
                  <input
                    name="fullName"
                    className="form-input"
                    value={form.fullName}
                    onChange={onChange}
                    required
                    autoComplete="name"
                    placeholder="As on your badge"
                  />
                </label>
                <label className="meeting-join-field">
                  <span>Email</span>
                  <input
                    name="email"
                    type="email"
                    className="form-input"
                    value={form.email}
                    onChange={onChange}
                    required
                    autoComplete="email"
                    placeholder="you@company.com"
                  />
                </label>
                <label className="meeting-join-field">
                  <span>Phone number</span>
                  <input
                    name="phone"
                    type="tel"
                    className="form-input"
                    value={form.phone}
                    onChange={onChange}
                    required
                    autoComplete="tel"
                    placeholder="+233 …"
                  />
                </label>

                {(showBreakfast || showLunch || showDinner) && (
                  <div className="meeting-join-meals">
                    <p className="meeting-join-consent-title">
                      Choose your meals
                    </p>
                    {showBreakfast && (
                      <fieldset className="meeting-join-meal-set">
                        <legend>Breakfast</legend>
                        {mealMenu.breakfast.items.map((item) => (
                          <label key={item} className="meeting-join-meal-option">
                            <input
                              type="radio"
                              name="breakfastChoice"
                              value={item}
                              checked={breakfastChoice === item}
                              onChange={() => setBreakfastChoice(item)}
                              required
                            />
                            <span>{item}</span>
                          </label>
                        ))}
                      </fieldset>
                    )}
                    {showLunch && (
                      <fieldset className="meeting-join-meal-set">
                        <legend>Lunch</legend>
                        {mealMenu.lunch.items.map((item) => (
                          <label key={item} className="meeting-join-meal-option">
                            <input
                              type="radio"
                              name="lunchChoice"
                              value={item}
                              checked={lunchChoice === item}
                              onChange={() => setLunchChoice(item)}
                              required
                            />
                            <span>{item}</span>
                          </label>
                        ))}
                      </fieldset>
                    )}
                    {showDinner && (
                      <fieldset className="meeting-join-meal-set">
                        <legend>Dinner</legend>
                        {mealMenu.dinner.items.map((item) => (
                          <label key={item} className="meeting-join-meal-option">
                            <input
                              type="radio"
                              name="dinnerChoice"
                              value={item}
                              checked={dinnerChoice === item}
                              onChange={() => setDinnerChoice(item)}
                              required
                            />
                            <span>{item}</span>
                          </label>
                        ))}
                      </fieldset>
                    )}
                  </div>
                )}

                <div className="meeting-join-consent-box">
                  <p className="meeting-join-consent-title">
                    <FaShieldAlt aria-hidden /> Permissions required
                  </p>

                  <label className="meeting-join-consent">
                    <input
                      type="checkbox"
                      checked={consentDetails}
                      onChange={(e) => setConsentDetails(e.target.checked)}
                      required
                    />
                    <span>
                      I allow the host to see my <strong>name, email and phone
                      number</strong> on the meeting attendance register.
                    </span>
                  </label>

                  <label className="meeting-join-consent">
                    <input
                      type="checkbox"
                      checked={consentLocation}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setConsentLocation(on);
                        if (!on) {
                          setGeo(null);
                          setGeoError('');
                        } else {
                          // User gesture — required for mobile GPS prompt
                          captureLocation();
                        }
                      }}
                      required
                    />
                    <span>
                      I allow this app to access my <strong>device location</strong>{' '}
                      and share it with the host for check-in verification.
                    </span>
                  </label>

                  <div className="meeting-join-geo-status">
                    {!isSecureGeoContext() && (
                      <p className="meeting-join-geo-warn" role="alert">
                        This page is not on HTTPS, so the phone cannot share GPS.
                        Open the QR check-in link that starts with https://
                      </p>
                    )}
                    {geoLoading && (
                      <p className="meeting-join-geo-wait">
                        <FaLocationArrow aria-hidden /> Getting GPS…
                        keep this page open (up to ~20 seconds). Use Precise
                        Location if your phone asks.
                      </p>
                    )}
                    {geo && !geoLoading && (
                      <div className="meeting-join-geo-ok-block">
                        <p className="meeting-join-geo-ok">
                          <FaMapMarkerAlt aria-hidden /> Your GPS ready:{' '}
                          {Number(geo.latitude).toFixed(5)},{' '}
                          {Number(geo.longitude).toFixed(5)}
                          {Number.isFinite(geo.locationAccuracy)
                            ? ` (±${Math.round(geo.locationAccuracy)} m)`
                            : ''}
                          {guestMapUrl && (
                            <>
                              {' · '}
                              <a
                                href={guestMapUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                View your pin
                              </a>
                            </>
                          )}
                        </p>
                        {Number.isFinite(geo.locationAccuracy) &&
                          geo.locationAccuracy > 150 && (
                            <p className="meeting-join-geo-warn">
                              Accuracy is rough. Turn on Precise Location, step
                              outside, then tap Try GPS again before check-in.
                            </p>
                          )}
                        <button
                          type="button"
                          className="meeting-join-retry-geo"
                          onClick={captureLocation}
                        >
                          Refresh GPS
                        </button>
                      </div>
                    )}
                    {geoError && (
                      <div className="meeting-join-error" role="alert">
                        {geoError}
                        <button
                          type="button"
                          className="meeting-join-retry-geo"
                          onClick={captureLocation}
                        >
                          Try GPS again
                        </button>
                      </div>
                    )}
                    {consentLocation && !geo && !geoLoading && !geoError && (
                        <div className="meeting-join-geo-tap">
                          <p className="meeting-join-geo-hint">
                            Tap below so your phone can ask for location
                            permission (required on mobile).
                          </p>
                          <button
                            type="button"
                            className="meeting-join-share-geo"
                            onClick={captureLocation}
                          >
                            <FaLocationArrow aria-hidden /> Share my GPS location
                          </button>
                        </div>
                      )}
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary meeting-join-submit"
                  disabled={
                    submitting ||
                    geoLoading ||
                    !consentDetails ||
                    !consentLocation ||
                    !geo ||
                    (showBreakfast && !breakfastChoice) ||
                    (showLunch && !lunchChoice) ||
                    (showDinner && !dinnerChoice)
                  }
                >
                  {submitting
                    ? 'Checking in…'
                    : !consentDetails || !consentLocation
                      ? 'Allow permissions to continue'
                      : !geo
                        ? 'Share location to check in'
                        : (showBreakfast && !breakfastChoice) ||
                            (showLunch && !lunchChoice) ||
                            (showDinner && !dinnerChoice)
                          ? 'Choose your meal(s) to check in'
                          : 'Check in to meeting'}
                </button>
              </form>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default MeetingJoin;
