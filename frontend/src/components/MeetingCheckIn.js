import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { FaCopy, FaQrcode, FaSync, FaExternalLinkAlt, FaDownload } from 'react-icons/fa';
import {
  getJoinUrl,
  publishMeeting,
  fetchAttendance,
  removeAttendance,
  mapsEmbedUrl,
  mapsOpenUrl,
} from '../services/meetingsApi';
import './MeetingCheckIn.css';

function tallyChoices(list, key) {
  const map = new Map();
  (list || []).forEach((a) => {
    const v = String(a[key] || '').trim();
    if (!v) return;
    map.set(v, (map.get(v) || 0) + 1);
  });
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

function locationStatusLabel(a) {
  if (!a) return { text: '—', cls: '' };
  if (a.locationMatch === 'at_venue') {
    return {
      text:
        a.distanceM != null
          ? `At venue · ${Math.round(a.distanceM)} m`
          : 'At venue',
      cls: 'match-ok',
    };
  }
  if (a.locationMatch === 'away') {
    return {
      text:
        a.distanceM != null
          ? `Not at venue · ${Math.round(a.distanceM)} m away`
          : 'Not at venue',
      cls: 'match-away',
    };
  }
  return { text: 'Unverified', cls: 'match-unknown' };
}

/**
 * QR check-in panel + live attendance + Google Map + meal choices.
 */
const MeetingCheckIn = ({ meeting, onPublished }) => {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [pubError, setPubError] = useState('');
  const [published, setPublished] = useState(!!meeting.qrEnabled);
  const [attendance, setAttendance] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState('');
  const [copied, setCopied] = useState(false);

  const joinUrl = getJoinUrl(meeting.id);
  const venueQuery =
    meeting.venueLat != null && meeting.venueLng != null
      ? `${meeting.venueLat},${meeting.venueLng}`
      : meeting.googlePlace || meeting.location || '';
  const place = meeting.googlePlace || meeting.location || venueQuery;
  const embed = mapsEmbedUrl(venueQuery || place);
  const openMap = mapsOpenUrl(venueQuery || place);
  const hasVenue =
    meeting.venueLat != null &&
    meeting.venueLng != null &&
    Number.isFinite(Number(meeting.venueLat)) &&
    Number.isFinite(Number(meeting.venueLng));
  const isInPerson = meeting.isInPerson !== false;
  const mealMenu = meeting.mealMenu || {};
  const program = meeting.programSchedule || {};
  const showBreakfastCol = !!(
    mealMenu.breakfast?.enabled || attendance.some((a) => a.breakfastChoice)
  );
  const showLunchCol = !!(
    mealMenu.lunch?.enabled || attendance.some((a) => a.lunchChoice)
  );
  const showDinnerCol = !!(
    mealMenu.dinner?.enabled || attendance.some((a) => a.dinnerChoice)
  );
  const hasProgram = !!(program.text || program.fileData);

  const breakfastTally = useMemo(
    () => tallyChoices(attendance, 'breakfastChoice'),
    [attendance]
  );
  const lunchTally = useMemo(
    () => tallyChoices(attendance, 'lunchChoice'),
    [attendance]
  );
  const dinnerTally = useMemo(
    () => tallyChoices(attendance, 'dinnerChoice'),
    [attendance]
  );

  const matchStats = useMemo(() => {
    let at = 0;
    let away = 0;
    let unknown = 0;
    attendance.forEach((a) => {
      if (a.locationMatch === 'at_venue') at += 1;
      else if (a.locationMatch === 'away') away += 1;
      else unknown += 1;
    });
    return { at, away, unknown };
  }, [attendance]);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(joinUrl, {
      width: 240,
      margin: 2,
      color: { dark: '#103078', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [joinUrl]);

  const loadAttendance = async () => {
    setLoadingList(true);
    setListError('');
    try {
      const data = await fetchAttendance(meeting.id);
      setAttendance(data.attendance || []);
      setPublished(true);
    } catch (err) {
      setListError(
        err.status === 404
          ? 'Enable check-in QR to collect attendance from scanners.'
          : err.message || 'Could not load attendance.'
      );
      setAttendance([]);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadAttendance();
    const t = setInterval(loadAttendance, 12000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.id]);

  const enableQr = async () => {
    setPublishing(true);
    setPubError('');
    if (
      isInPerson &&
      (meeting.venueLat == null ||
        meeting.venueLng == null ||
        !Number.isFinite(Number(meeting.venueLat)) ||
        !Number.isFinite(Number(meeting.venueLng)))
    ) {
      setPubError(
        'In-person meetings need a map pin (Place → Map) before check-in. Or edit the meeting and set Online only.'
      );
      setPublishing(false);
      return;
    }
    try {
      await publishMeeting(meeting);
      setPublished(true);
      onPublished?.(meeting.id);
      await loadAttendance();
    } catch (err) {
      setPubError(
        err.message ||
          'Could not publish meeting. Is the auth API running on port 4000?'
      );
    } finally {
      setPublishing(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy check-in link:', joinUrl);
    }
  };

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const safeTitle = String(meeting.title || 'meeting')
      .replace(/[^\w\s-]+/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 40);
    const datePart = String(meeting.date || '').replace(/[^\d-]/g, '') || 'qr';
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `glico-checkin-${safeTitle || 'meeting'}-${datePart}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const drop = async (attId) => {
    if (!window.confirm('Remove this person from attendance?')) return;
    try {
      await removeAttendance(meeting.id, attId);
      setAttendance((list) => list.filter((a) => a.id !== attId));
    } catch (err) {
      setListError(err.message || 'Could not remove.');
    }
  };

  return (
    <div className="meeting-checkin">
      <div className="meeting-checkin-grid">
        <div className="meeting-checkin-qr-block">
          <h4>
            <FaQrcode aria-hidden /> Check-in QR code
          </h4>
          <p className="meeting-checkin-hint">
            {isInPerson
              ? `Guests scan this code on site. Their GPS is compared to the host venue pin${hasVenue ? ` (±${meeting.venueRadiusM || 200} m)` : ''}.`
              : 'Online meeting — guests check in with details (and location if their browser allows). No venue pin required.'}
          </p>
          {hasVenue && (
            <p className="meeting-checkin-venue-pin">
              Venue pin · {Number(meeting.venueLat).toFixed(5)},{' '}
              {Number(meeting.venueLng).toFixed(5)}
            </p>
          )}
          {isInPerson && !hasVenue && (
            <p className="meeting-checkin-hint warn">
              No venue pin — edit the meeting, open Place → Map, save, then enable QR.
            </p>
          )}

          {!published && (
            <button
              type="button"
              className="btn btn-primary meeting-checkin-enable"
              onClick={enableQr}
              disabled={publishing}
            >
              {publishing ? 'Publishing…' : 'Enable check-in QR'}
            </button>
          )}
          {published && (
            <button
              type="button"
              className="meeting-checkin-republish"
              onClick={enableQr}
              disabled={publishing}
            >
              {publishing
                ? 'Updating…'
                : 'Refresh QR publish (sync menu & details)'}
            </button>
          )}

          {pubError && (
            <div className="meeting-checkin-error" role="alert">
              {pubError}
            </div>
          )}

          {qrDataUrl ? (
            <div className="meeting-checkin-qr-wrap">
              <img
                src={qrDataUrl}
                alt={`QR code to check in to ${meeting.title}`}
                className="meeting-checkin-qr"
              />
              <button
                type="button"
                className="meeting-checkin-download-qr"
                onClick={downloadQr}
              >
                <FaDownload aria-hidden /> Download QR code
              </button>
            </div>
          ) : (
            <div className="meeting-checkin-qr-ph">Generating QR…</div>
          )}

          <div className="meeting-checkin-link-row">
            <input
              className="form-input"
              readOnly
              value={joinUrl}
              aria-label="Check-in link"
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              className="meeting-checkin-copy"
              onClick={copyLink}
            >
              <FaCopy /> {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="meeting-checkin-map-block">
          <div className="meeting-checkin-map-head">
            <h4>Google location</h4>
            {openMap && (
              <a href={openMap} target="_blank" rel="noopener noreferrer">
                Open Maps <FaExternalLinkAlt />
              </a>
            )}
          </div>
          {place ? (
            <>
              <p className="meeting-checkin-place">{place}</p>
              {embed && (
                <iframe
                  title={`Google Map — ${meeting.title}`}
                  className="meeting-checkin-map"
                  src={embed}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
              )}
            </>
          ) : (
            <p className="meeting-checkin-hint">
              Add a Google place / address on the meeting form so the map
              appears here and on the check-in page.
            </p>
          )}
        </div>
      </div>

      {(breakfastTally.length > 0 ||
        lunchTally.length > 0 ||
        dinnerTally.length > 0) && (
        <div className="meeting-checkin-tally">
          {breakfastTally.length > 0 && (
            <div>
              <strong>Breakfast totals</strong>
              <ul>
                {breakfastTally.map(([item, n]) => (
                  <li key={`b-${item}`}>
                    {item} <span>{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {lunchTally.length > 0 && (
            <div>
              <strong>Lunch totals</strong>
              <ul>
                {lunchTally.map(([item, n]) => (
                  <li key={`l-${item}`}>
                    {item} <span>{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {dinnerTally.length > 0 && (
            <div>
              <strong>Dinner totals</strong>
              <ul>
                {dinnerTally.map(([item, n]) => (
                  <li key={`d-${item}`}>
                    {item} <span>{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {hasProgram && (
        <div className="meeting-checkin-program">
          <h4>Program schedule</h4>
          {program.text && (
            <pre className="meeting-checkin-program-text">{program.text}</pre>
          )}
          {program.fileData && (
            <a
              href={program.fileData}
              download={program.fileName || 'program-schedule'}
              target="_blank"
              rel="noopener noreferrer"
              className="meeting-checkin-program-file"
            >
              Download {program.fileName || 'program file'}
            </a>
          )}
        </div>
      )}

      {(matchStats.at > 0 || matchStats.away > 0 || matchStats.unknown > 0) &&
        attendance.length > 0 && (
          <div className="meeting-checkin-match-stats">
            <span className="match-ok">At venue: {matchStats.at}</span>
            <span className="match-away">Not at venue: {matchStats.away}</span>
            {matchStats.unknown > 0 && (
              <span className="match-unknown">Unverified: {matchStats.unknown}</span>
            )}
          </div>
        )}

      <div className="meeting-checkin-table-wrap">
        <div className="meeting-checkin-table-head">
          <h4>
            Attendance register
            <span className="meeting-checkin-count">{attendance.length}</span>
          </h4>
          <button
            type="button"
            className="meeting-checkin-refresh"
            onClick={loadAttendance}
            disabled={loadingList}
          >
            <FaSync className={loadingList ? 'spin' : ''} /> Refresh
          </button>
        </div>
        {listError && <p className="meeting-checkin-hint">{listError}</p>}
        {attendance.length === 0 ? (
          <p className="meeting-checkin-empty">
            No one has scanned in yet. Guests must allow contact details and
            location at the venue. At-venue vs not-at-venue status appears here.
          </p>
        ) : (
          <div className="meeting-checkin-table-scroll">
            <table className="meeting-checkin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Full name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  {showBreakfastCol && <th>Breakfast</th>}
                  {showLunchCol && <th>Lunch</th>}
                  {showDinnerCol && <th>Dinner</th>}
                  <th>Location status</th>
                  <th>Guest GPS</th>
                  <th>Checked in</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {attendance.map((a, i) => {
                  const status = locationStatusLabel(a);
                  return (
                  <tr
                    key={a.id}
                    className={
                      a.locationMatch === 'away' ? 'row-away' : undefined
                    }
                  >
                    <td data-label="#">{i + 1}</td>
                    <td className="name" data-label="Name">
                      {a.fullName}
                    </td>
                    <td data-label="Email">
                      <a href={`mailto:${a.email}`}>{a.email}</a>
                    </td>
                    <td data-label="Phone">
                      <a href={`tel:${a.phone}`}>{a.phone}</a>
                    </td>
                    {showBreakfastCol && (
                      <td data-label="Breakfast">
                        {a.breakfastChoice || '—'}
                      </td>
                    )}
                    {showLunchCol && (
                      <td data-label="Lunch">{a.lunchChoice || '—'}</td>
                    )}
                    {showDinnerCol && (
                      <td data-label="Dinner">{a.dinnerChoice || '—'}</td>
                    )}
                    <td data-label="Status">
                      <span
                        className={`meeting-checkin-loc-badge ${status.cls}`}
                      >
                        {status.text}
                      </span>
                    </td>
                    <td data-label="GPS">
                      {a.latitude != null && a.longitude != null ? (
                        <a
                          href={mapsOpenUrl(`${a.latitude},${a.longitude}`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open guest location in Google Maps"
                        >
                          {Number(a.latitude).toFixed(4)},{' '}
                          {Number(a.longitude).toFixed(4)}
                          {a.locationAccuracy != null
                            ? ` (±${Math.round(a.locationAccuracy)}m)`
                            : ''}
                        </a>
                      ) : (
                        <span className="meeting-checkin-no-loc">
                          No location
                        </span>
                      )}
                    </td>
                    <td data-label="Checked in">
                      {a.checkedInAt
                        ? new Date(a.checkedInAt).toLocaleString()
                        : '—'}
                    </td>
                    <td data-label="" className="meeting-checkin-actions-cell">
                      <button
                        type="button"
                        className="meeting-checkin-remove"
                        onClick={() => drop(a.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default MeetingCheckIn;
