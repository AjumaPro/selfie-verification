import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  FaCopy,
  FaDownload,
  FaQrcode,
  FaSync,
  FaLink,
  FaTrash,
  FaCheckCircle,
  FaTimesCircle,
} from 'react-icons/fa';
import {
  newVerifySessionId,
  getVerifyUrl,
  upsertVerifySession,
  fetchVerifyResults,
  removeVerifyResult,
  deleteVerifySession,
  listMyVerifySessions,
} from '../services/verifyApi';
import './VerifyShare.css';

const STORAGE_KEY = 'glico_verify_active_session_v1';
const COLLAPSE_KEY = 'glico_verify_share_open_v1';

/**
 * Host panel: create shareable URL + QR for guests to verify Ghana Card + selfie.
 * Results appear live for the signed-in host.
 */
const VerifyShare = () => {
  const [sessionId, setSessionId] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(COLLAPSE_KEY);
      if (v === '0') return false;
      if (v === '1') return true;
    } catch {
      /* ignore */
    }
    return true;
  });
  const [title, setTitle] = useState('GLICO Life identity check');
  const [note, setNote] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [results, setResults] = useState([]);
  const [session, setSession] = useState(null);
  const [past, setPast] = useState([]);

  const verifyUrl = sessionId ? getVerifyUrl(sessionId) : '';

  const toggleOpen = () => {
    setOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const persistId = (id) => {
    setSessionId(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  const loadResults = useCallback(async (id) => {
    if (!id) return;
    try {
      const data = await fetchVerifyResults(id);
      setSession(data.session || null);
      setResults(data.results || []);
      setError('');
    } catch (err) {
      if (err.status === 404) {
        setResults([]);
        setSession(null);
      } else {
        setError(err.message || 'Could not load results.');
      }
    }
  }, []);

  const refreshPast = useCallback(async () => {
    try {
      const data = await listMyVerifySessions();
      setPast(data.sessions || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!verifyUrl) {
      setQrDataUrl('');
      return undefined;
    }
    let cancelled = false;
    QRCode.toDataURL(verifyUrl, {
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
  }, [verifyUrl]);

  useEffect(() => {
    if (!sessionId) return undefined;
    loadResults(sessionId);
    const t = setInterval(() => loadResults(sessionId), 10000);
    return () => clearInterval(t);
  }, [sessionId, loadResults]);

  useEffect(() => {
    refreshPast();
  }, [refreshPast]);

  const enableShare = async () => {
    setBusy(true);
    setError('');
    try {
      const id = sessionId || newVerifySessionId();
      const data = await upsertVerifySession(id, {
        title: title.trim() || 'Identity verification',
        note: note.trim(),
        status: 'open',
      });
      persistId(id);
      setSession(data.session);
      await loadResults(id);
      await refreshPast();
    } catch (err) {
      setError(err.message || 'Could not create share link.');
    } finally {
      setBusy(false);
    }
  };

  const closeLink = async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      await upsertVerifySession(sessionId, {
        title,
        note,
        status: 'closed',
      });
      await loadResults(sessionId);
    } catch (err) {
      setError(err.message || 'Could not close link.');
    } finally {
      setBusy(false);
    }
  };

  const newLink = async () => {
    if (
      sessionId &&
      !window.confirm(
        'Create a new QR / link? Guests with the old link will no longer submit to this session.'
      )
    ) {
      return;
    }
    persistId('');
    setResults([]);
    setSession(null);
    setQrDataUrl('');
    const id = newVerifySessionId();
    setBusy(true);
    setError('');
    try {
      const data = await upsertVerifySession(id, {
        title: title.trim() || 'Identity verification',
        note: note.trim(),
        status: 'open',
      });
      persistId(id);
      setSession(data.session);
      await refreshPast();
    } catch (err) {
      setError(err.message || 'Could not create link.');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!verifyUrl) return;
    try {
      await navigator.clipboard.writeText(verifyUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy verification link:', verifyUrl);
    }
  };

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `glico-verify-${sessionId.slice(0, 8)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const dropResult = async (resultId) => {
    if (!window.confirm('Remove this verification from your list?')) return;
    try {
      await removeVerifyResult(sessionId, resultId);
      setResults((list) => list.filter((r) => r.id !== resultId));
    } catch (err) {
      setError(err.message || 'Could not remove.');
    }
  };

  const dropSession = async (id) => {
    if (!window.confirm('Delete this session and all its results?')) return;
    try {
      await deleteVerifySession(id);
      if (id === sessionId) {
        persistId('');
        setResults([]);
        setSession(null);
      }
      await refreshPast();
    } catch (err) {
      setError(err.message || 'Could not delete.');
    }
  };

  const openPast = (s) => {
    persistId(s.id);
    setTitle(s.title || title);
    setNote(s.note || '');
  };

  return (
    <div className={`verify-share card ${open ? 'is-open' : 'is-minimized'}`}>
      <button
        type="button"
        className="verify-share-toggle"
        onClick={toggleOpen}
        aria-expanded={open}
        aria-controls="verify-share-body"
      >
        <div className="verify-share-toggle-main">
          <FaQrcode aria-hidden />
          <div>
            <h2>Share verification link</h2>
            <p>
              {open
                ? 'Guests scan QR / open URL — selfie + Ghana Card → results here'
                : sessionId
                  ? `${results.length} result${results.length === 1 ? '' : 's'} · link ${session?.status === 'closed' ? 'closed' : 'open'} · tap to expand`
                  : 'Create QR & link for guests · tap to expand'}
            </p>
          </div>
        </div>
        <span className="verify-share-chevron" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>

      {open && (
        <div className="verify-share-body" id="verify-share-body">
          <div className="verify-share-hero">
            <div className="verify-share-hero-text">
              <p className="verify-share-lead">
                Guests scan your QR or open the URL — no login. They take a selfie,
                enter their Ghana Card number, and you receive the result here.
              </p>
              <ol className="verify-share-steps">
                <li>
                  <span className="step-n">1</span>
                  Create QR &amp; link below
                </li>
                <li>
                  <span className="step-n">2</span>
                  Share by WhatsApp, SMS, or print the QR
                </li>
                <li>
                  <span className="step-n">3</span>
                  Watch verified names appear in the list
                </li>
              </ol>
            </div>
            <span className="verify-share-badge">
              <FaLink aria-hidden /> Guest link · no account
            </span>
          </div>

      <div className="verify-share-form">
        <label className="form-group full-width">
          <span>Link title (shown to guests)</span>
          <input
            className="form-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Branch walk-in KYC"
          />
        </label>
        <label className="form-group full-width">
          <span>Optional note for guests</span>
          <input
            className="form-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Hold phone at eye level, good lighting"
          />
        </label>
        <div className="verify-share-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={enableShare}
            disabled={busy}
          >
            {sessionId ? 'Update & keep open' : 'Create QR & link'}
          </button>
          {sessionId && (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={newLink}
                disabled={busy}
              >
                New link
              </button>
              {session?.status !== 'closed' ? (
                <button
                  type="button"
                  className="btn verify-share-close"
                  onClick={closeLink}
                  disabled={busy}
                >
                  Close link
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

      {error && (
        <p className="verify-share-error" role="alert">
          {error}
        </p>
      )}

      {sessionId && verifyUrl && (
        <div className="verify-share-qr-grid">
          <div className="verify-share-qr-block">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Verification QR code" className="verify-share-qr" />
            ) : (
              <div className="verify-share-qr-ph">QR…</div>
            )}
            <div className="verify-share-qr-btns">
              <button type="button" className="btn btn-secondary" onClick={downloadQr}>
                <FaDownload aria-hidden /> Download QR
              </button>
            </div>
          </div>
          <div className="verify-share-link-block">
            <p className="verify-share-status">
              Status:{' '}
              <strong>
                {session?.status === 'closed' ? 'Closed' : 'Open — accepting submissions'}
              </strong>
            </p>
            <label>
              Share URL
              <div className="verify-share-link-row">
                <input
                  className="form-input"
                  readOnly
                  value={verifyUrl}
                  onFocus={(e) => e.target.select()}
                />
                <button type="button" className="btn btn-secondary" onClick={copyLink}>
                  <FaCopy aria-hidden /> {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </label>
            <p className="verify-share-hint">
              <FaLink aria-hidden /> Send this link by WhatsApp / SMS, or print the
              QR for guests to scan.
            </p>
          </div>
        </div>
      )}

      {sessionId && (
        <div className="verify-share-results">
          <div className="verify-share-results-head">
            <h3>
              Received verifications
              <span className="verify-share-count">{results.length}</span>
            </h3>
            <button
              type="button"
              className="verify-share-refresh"
              onClick={() => loadResults(sessionId)}
            >
              <FaSync aria-hidden /> Refresh
            </button>
          </div>
          {results.length === 0 ? (
            <p className="verify-share-empty">
              No submissions yet. When a guest finishes, their name and Ghana Card
              result appear here.
            </p>
          ) : (
            <div className="verify-share-table-scroll">
              <table className="verify-share-table">
                <thead>
                  <tr>
                    <th>Result</th>
                    <th>Name</th>
                    <th>Ghana Card</th>
                    <th>Code</th>
                    <th>When</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {r.verified ? (
                          <span className="verify-ok">
                            <FaCheckCircle aria-hidden /> Verified
                          </span>
                        ) : (
                          <span className="verify-fail">
                            <FaTimesCircle aria-hidden /> Not verified
                          </span>
                        )}
                      </td>
                      <td>
                        {[r.forenames, r.surname].filter(Boolean).join(' ') ||
                          '—'}
                      </td>
                      <td>{r.ghanaCard || r.nationalId || '—'}</td>
                      <td>{r.code || '—'}</td>
                      <td>
                        {r.createdAt
                          ? new Date(r.createdAt).toLocaleString()
                          : '—'}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="verify-share-remove"
                          onClick={() => dropResult(r.id)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {past.length > 0 && (
        <div className="verify-share-past">
          <h3>Your recent links</h3>
          <ul>
            {past.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="verify-share-past-open"
                  onClick={() => openPast(s)}
                >
                  {s.title} · {s.status}
                </button>
                <button
                  type="button"
                  className="verify-share-remove"
                  onClick={() => dropSession(s.id)}
                  title="Delete"
                >
                  <FaTrash aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
        </div>
      )}
    </div>
  );
};

export default VerifyShare;
