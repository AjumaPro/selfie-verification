import React, { useEffect, useMemo, useState } from 'react';
import {
  FaCopy,
  FaQrcode,
  FaSync,
  FaExternalLinkAlt,
  FaDownload,
  FaFilePdf,
  FaFileWord,
  FaTimes,
} from 'react-icons/fa';
import {
  getJoinUrl,
  publishMeeting,
  fetchAttendance,
  removeAttendance,
  mapsEmbedUrl,
  mapsOpenUrl,
} from '../services/meetingsApi';
import {
  hasPerPersonFoodDownload,
  resolveFoodDownloadVisibility,
} from '../utils/foodDownloadOptions';
import {
  ATTENDANCE_DOWNLOAD_FIELDS,
  ATTENDANCE_FILTERS,
  defaultAttendanceDownloadOptions,
  filterApprovedAttendance,
  locationStatusLabel,
  meetingFileSlug,
  normalizeAttendanceDownloadOptions,
} from '../utils/attendanceDownloadOptions';
import { downloadAttendanceList } from '../utils/attendanceExport';
import {
  makeScannableQrDataUrl,
  downloadScannableQr,
} from '../utils/scannableQr';
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

function csvEscape(cell) {
  const s = String(cell ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** CSV: each person + the food they selected (for catering / kitchen). */
function buildFoodSelectionsCsv(meeting, attendance) {
  const list = attendance || [];
  const vis = resolveFoodDownloadVisibility(
    meeting,
    list,
    meeting?.mealMenu?.downloadOptions
  );
  const showPeople = hasPerPersonFoodDownload(vis);

  const header = [];
  if (showPeople) header.push('#');
  if (vis.name) header.push('Full name');
  if (vis.department) header.push('Department');
  if (vis.email) header.push('Email');
  if (vis.phone) header.push('Phone');
  if (vis.breakfast) header.push('Breakfast');
  if (vis.lunch) header.push('Lunch');
  if (vis.dinner) header.push('Dinner');
  if (vis.locationStatus) header.push('Location status');
  if (vis.checkedIn) header.push('Checked in');

  const rows = header.length ? [header] : [];
  if (showPeople) {
    list.forEach((a, i) => {
      const row = [];
      row.push(i + 1);
      if (vis.name) row.push(a.fullName || '');
      if (vis.department) row.push(a.department || '');
      if (vis.email) row.push(a.email || '');
      if (vis.phone) row.push(a.phone || '');
      if (vis.breakfast) row.push(a.breakfastChoice || '');
      if (vis.lunch) row.push(a.lunchChoice || '');
      if (vis.dinner) row.push(a.dinnerChoice || '');
      if (vis.locationStatus) {
        row.push(locationStatusLabel(a).text);
      }
      if (vis.checkedIn) {
        row.push(
          a.checkedInAt ? new Date(a.checkedInAt).toLocaleString() : ''
        );
      }
      rows.push(row);
    });
  }

  if (vis.totals) {
    if (rows.length) rows.push([]);
    rows.push(['Meal totals']);
    [
      ['Breakfast', 'breakfastChoice', vis.breakfast],
      ['Lunch', 'lunchChoice', vis.lunch],
      ['Dinner', 'dinnerChoice', vis.dinner],
    ].forEach(([label, key, show]) => {
      if (!show) return;
      tallyChoices(list, key).forEach(([item, n]) => {
        rows.push([label, item, n]);
      });
    });
  }

  if (!rows.length) {
    rows.push(['No fields selected for download']);
  }

  return `\uFEFF${rows.map((r) => r.map(csvEscape).join(',')).join('\n')}`;
}

function buildFoodSelectionsTxt(meeting, attendance) {
  const list = attendance || [];
  const vis = resolveFoodDownloadVisibility(
    meeting,
    list,
    meeting?.mealMenu?.downloadOptions
  );
  const showPeople = hasPerPersonFoodDownload(vis);
  const lines = [
    'GLICO Life Platform — Food selections',
    '================================',
    `Meeting: ${meeting?.title || 'Untitled'}`,
    `Date: ${meeting?.date || '—'}  Time: ${meeting?.time || '—'}`,
    `People: ${list.length}`,
    '',
  ];

  if (showPeople) {
    list.forEach((a, i) => {
      lines.push(
        vis.name ? `${i + 1}. ${a.fullName || '—'}` : `${i + 1}. Participant`
      );
      if (vis.email && a.email) lines.push(`   Email: ${a.email}`);
      if (vis.department && a.department) {
        lines.push(`   Department: ${a.department}`);
      }
      if (vis.phone && a.phone) lines.push(`   Phone: ${a.phone}`);
      if (vis.breakfast && a.breakfastChoice) {
        lines.push(`   Breakfast: ${a.breakfastChoice}`);
      }
      if (vis.lunch && a.lunchChoice) lines.push(`   Lunch: ${a.lunchChoice}`);
      if (vis.dinner && a.dinnerChoice) {
        lines.push(`   Dinner: ${a.dinnerChoice}`);
      }
      if (vis.locationStatus) {
        lines.push(`   Location: ${locationStatusLabel(a).text}`);
      }
      if (vis.checkedIn) {
        lines.push(
          `   Checked in: ${
            a.checkedInAt
              ? new Date(a.checkedInAt).toLocaleString()
              : '—'
          }`
        );
      }
      const hasFood =
        (vis.breakfast && a.breakfastChoice) ||
        (vis.lunch && a.lunchChoice) ||
        (vis.dinner && a.dinnerChoice);
      if ((vis.breakfast || vis.lunch || vis.dinner) && !hasFood) {
        lines.push('   Food: (none selected)');
      }
      lines.push('');
    });
  }

  if (vis.totals) {
    const hasTally =
      (vis.breakfast && tallyChoices(list, 'breakfastChoice').length) ||
      (vis.lunch && tallyChoices(list, 'lunchChoice').length) ||
      (vis.dinner && tallyChoices(list, 'dinnerChoice').length);
    if (hasTally) {
      lines.push('Totals');
      lines.push('------');
      [
        ['Breakfast', 'breakfastChoice', vis.breakfast],
        ['Lunch', 'lunchChoice', vis.lunch],
        ['Dinner', 'dinnerChoice', vis.dinner],
      ].forEach(([label, key, show]) => {
        if (!show) return;
        const tallies = tallyChoices(list, key);
        if (!tallies.length) return;
        lines.push(`${label}:`);
        tallies.forEach(([item, n]) => lines.push(`  ${item} — ${n}`));
      });
      lines.push('');
    }
  }

  if (!showPeople && !vis.totals) {
    lines.push('No fields selected for download.');
    lines.push('');
  }

  lines.push(`Generated ${new Date().toLocaleString()}`);
  return lines.join('\n');
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
  const [exportOpen, setExportOpen] = useState(false);
  const [exportOptions, setExportOptions] = useState(() =>
    defaultAttendanceDownloadOptions()
  );
  const [exportFilter, setExportFilter] = useState('all');
  const [exportBusy, setExportBusy] = useState('');

  useEffect(() => {
    if (!exportOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !exportBusy) setExportOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [exportOpen, exportBusy]);

  const joinUrl = getJoinUrl(meeting.id);
  const approvedCount = useMemo(
    () => filterApprovedAttendance(attendance, 'all').length,
    [attendance]
  );
  const exportPreviewCount = useMemo(
    () => filterApprovedAttendance(attendance, exportFilter).length,
    [attendance, exportFilter]
  );
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
    makeScannableQrDataUrl(joinUrl, 'preview')
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

  const downloadQr = async () => {
    if (!joinUrl) return;
    const { safeTitle, datePart } = meetingFileSlug(meeting);
    try {
      await downloadScannableQr(
        joinUrl,
        `glico-checkin-${safeTitle}-${datePart}.png`
      );
    } catch (err) {
      window.alert(err?.message || 'Could not save QR code.');
    }
  };

  const downloadFoodList = (format = 'csv') => {
    if (!attendance.length) return;
    const { safeTitle, datePart } = meetingFileSlug(meeting);
    const base = `glico-food-list-${safeTitle}-${datePart}`;
    if (format === 'txt') {
      downloadBlob(
        `${base}.txt`,
        buildFoodSelectionsTxt(meeting, attendance),
        'text/plain;charset=utf-8'
      );
      return;
    }
    downloadBlob(
      `${base}.csv`,
      buildFoodSelectionsCsv(meeting, attendance),
      'text/csv;charset=utf-8'
    );
  };

  const openAttendanceExport = () => {
    setExportOptions(defaultAttendanceDownloadOptions());
    setExportFilter('all');
    setExportOpen(true);
  };

  const runAttendanceExport = async (format) => {
    setExportBusy(format);
    try {
      await downloadAttendanceList(meeting, attendance, {
        options: normalizeAttendanceDownloadOptions(exportOptions),
        filterKey: exportFilter,
        format,
      });
      setExportOpen(false);
    } catch (err) {
      window.alert(err?.message || 'Could not download attendance list.');
    } finally {
      setExportBusy('');
    }
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
              ? `Guests scan this code on site. Their GPS is compared to the host venue pin${hasVenue ? ` (±${meeting.venueRadiusM || 200} m)` : ''}. Ask them to open in Chrome (or Safari on iPhone) — camera in-app browsers often block GPS.`
              : 'Online meeting — guests check in with details (and location if their browser allows). Ask them to use Chrome when possible.'}
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
          <div className="meeting-checkin-table-actions">
            {attendance.length > 0 && (
              <>
                <button
                  type="button"
                  className="meeting-checkin-download-food primary-export"
                  onClick={openAttendanceExport}
                  title="Download attendance list as PDF or Word"
                >
                  <FaDownload aria-hidden /> Attendance list
                </button>
                <button
                  type="button"
                  className="meeting-checkin-download-food"
                  onClick={() => downloadFoodList('csv')}
                  title="Download names and food selections as CSV"
                >
                  <FaDownload aria-hidden /> Food list (.csv)
                </button>
                <button
                  type="button"
                  className="meeting-checkin-download-food secondary"
                  onClick={() => downloadFoodList('txt')}
                  title="Download names and food selections as text"
                >
                  <FaDownload aria-hidden /> Food list (.txt)
                </button>
              </>
            )}
            <button
              type="button"
              className="meeting-checkin-refresh"
              onClick={loadAttendance}
              disabled={loadingList}
            >
              <FaSync className={loadingList ? 'spin' : ''} /> Refresh
            </button>
          </div>
        </div>
        {listError && <p className="meeting-checkin-hint">{listError}</p>}
        {attendance.length === 0 ? (
          <p className="meeting-checkin-empty">
            No one has scanned in yet. Guests must allow name, department, phone and
            location at the venue. At-venue vs not-at-venue status appears here.
          </p>
        ) : (
          <div className="meeting-checkin-table-scroll">
            <table className="meeting-checkin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Full name</th>
                  <th>Department</th>
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
                    <td data-label="Department">{a.department || '—'}</td>
                    <td data-label="Email">
                      {a.email ? (
                        <a href={`mailto:${a.email}`}>{a.email}</a>
                      ) : (
                        '—'
                      )}
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

      {exportOpen && (
        <div
          className="meeting-checkin-export-overlay"
          role="presentation"
          onClick={() => !exportBusy && setExportOpen(false)}
        >
          <div
            className="meeting-checkin-export-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="attendance-export-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="meeting-checkin-export-head">
              <div>
                <h3 id="attendance-export-title">Download attendance list</h3>
                <p>
                  Guests who approved to join ({approvedCount}). Choose columns,
                  filter, then download PDF or Word.
                </p>
              </div>
              <button
                type="button"
                className="meeting-checkin-export-close"
                onClick={() => !exportBusy && setExportOpen(false)}
                aria-label="Close"
              >
                <FaTimes aria-hidden />
              </button>
            </div>

            <fieldset className="meeting-checkin-export-fieldset">
              <legend>Who to include</legend>
              <div className="meeting-checkin-export-filters">
                {ATTENDANCE_FILTERS.map((f) => (
                  <label key={f.key} className="meeting-checkin-export-option">
                    <input
                      type="radio"
                      name="attendance-filter"
                      checked={exportFilter === f.key}
                      onChange={() => setExportFilter(f.key)}
                      disabled={!!exportBusy}
                    />
                    <span>{f.label}</span>
                  </label>
                ))}
              </div>
              <p className="meeting-checkin-export-count">
                {exportPreviewCount} attendant
                {exportPreviewCount === 1 ? '' : 's'} with current filter
              </p>
            </fieldset>

            <fieldset className="meeting-checkin-export-fieldset">
              <legend>Columns to include</legend>
              <div className="meeting-checkin-export-grid">
                {ATTENDANCE_DOWNLOAD_FIELDS.map((field) => {
                  const checked = exportOptions[field.key] !== false;
                  return (
                    <label
                      key={field.key}
                      className={`meeting-checkin-export-option${
                        field.alwaysOn ? ' is-locked' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!!field.alwaysOn || !!exportBusy}
                        onChange={(e) =>
                          setExportOptions((prev) =>
                            normalizeAttendanceDownloadOptions({
                              ...prev,
                              [field.key]: e.target.checked,
                            })
                          )
                        }
                      />
                      <span>{field.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="meeting-checkin-export-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!!exportBusy}
                onClick={() => runAttendanceExport('pdf')}
              >
                <FaFilePdf aria-hidden />{' '}
                {exportBusy === 'pdf' ? 'Preparing PDF…' : 'Download PDF'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!!exportBusy}
                onClick={() => runAttendanceExport('word')}
              >
                <FaFileWord aria-hidden />{' '}
                {exportBusy === 'word' ? 'Preparing Word…' : 'Download Word'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MeetingCheckIn;
