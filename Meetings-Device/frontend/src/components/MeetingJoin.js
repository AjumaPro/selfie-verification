import React, { useEffect, useMemo, useState, useCallback } from 'react';
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

function requestDeviceLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(
        new Error(
          'This device does not support location. Use a phone or browser with GPS / location services.'
        )
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          locationAccuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        let msg =
          'Location access is required to check in. Please allow location when prompted.';
        if (err && err.code === 1) {
          msg =
            'Location permission was denied. Enable location for this site in your browser settings, then try again.';
        } else if (err && err.code === 2) {
          msg =
            'Could not determine your position. Turn on GPS / Location Services and try again.';
        } else if (err && err.code === 3) {
          msg = 'Location request timed out. Try again outdoors or with a stronger signal.';
        }
        reject(new Error(msg));
      },
      {
        enableHighAccuracy: true,
        timeout: 25000,
        maximumAge: 0,
      }
    );
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
  useEffect(() => {
    const nameOk = form.fullName.trim().length >= 2;
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
    const phoneDigits = form.phone.replace(/\D/g, '');
    const phoneStarted = phoneDigits.length >= 3;
    const anyFilled =
      form.fullName.trim().length > 0 ||
      form.email.trim().length > 0 ||
      form.phone.trim().length > 0;

    // Share-details consent once name + email look valid (phone often typed last)
    if (nameOk && emailOk) {
      setConsentDetails(true);
    }
    // Start location early so GPS is ready by the time they submit
    if (anyFilled || phoneStarted) {
      setConsentLocation(true);
    }
  }, [form.fullName, form.email, form.phone]);

  const captureLocation = useCallback(async () => {
    setGeoError('');
    setGeoLoading(true);
    try {
      const loc = await requestDeviceLocation();
      setGeo(loc);
      setConsentLocation(true);
      return loc;
    } catch (err) {
      setGeo(null);
      setGeoError(err.message || 'Could not get location.');
      return null;
    } finally {
      setGeoLoading(false);
    }
  }, []);

  // When guest ticks location consent, prompt browser geolocation
  useEffect(() => {
    if (!consentLocation || geo || geoLoading) return undefined;
    captureLocation();
    return undefined;
  }, [consentLocation, geo, geoLoading, captureLocation]);

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
      let loc = geo;
      if (!loc) {
        loc = await captureLocation();
      }
      if (!loc) {
        setError(
          geoError ||
            'Location is required. Allow location access to complete check-in.'
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
                    <FaMapMarkerAlt aria-hidden /> Meeting venue
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
                    {geoLoading && (
                      <p className="meeting-join-geo-wait">
                        <FaLocationArrow aria-hidden /> Waiting for location
                        permission…
                      </p>
                    )}
                    {geo && !geoLoading && (
                      <p className="meeting-join-geo-ok">
                        <FaMapMarkerAlt aria-hidden /> Location ready
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
                              View on map
                            </a>
                          </>
                        )}
                      </p>
                    )}
                    {geoError && (
                      <div className="meeting-join-error" role="alert">
                        {geoError}
                        <button
                          type="button"
                          className="meeting-join-retry-geo"
                          onClick={captureLocation}
                        >
                          Try location again
                        </button>
                      </div>
                    )}
                    {consentLocation && !geo && !geoLoading && !geoError && (
                      <button
                        type="button"
                        className="meeting-join-retry-geo"
                        onClick={captureLocation}
                      >
                        Allow location now
                      </button>
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
