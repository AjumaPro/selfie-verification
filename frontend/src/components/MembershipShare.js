import React, { useCallback, useEffect, useState } from 'react';
import {
  FaCopy,
  FaDownload,
  FaQrcode,
  FaLink,
  FaTrash,
  FaExpand,
  FaTimes,
} from 'react-icons/fa';
import {
  newMembershipSessionId,
  getMembershipFormUrl,
  upsertMembershipSession,
  listMyMembershipSessions,
  deleteMembershipSession,
} from '../services/membershipApi';
import {
  makeScannableQrDataUrl,
  downloadScannableQr,
} from '../utils/scannableQr';
import './VerifyShare.css';

const STORAGE_KEY = 'glico_tpfs_active_session_v1';

const MembershipShare = () => {
  const [sessionId, setSessionId] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [title, setTitle] = useState('TPFS membership registration');
  const [note, setNote] = useState(
    'Complete Ghana Card self-verification, then fill the rest of the form.'
  );
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [session, setSession] = useState(null);
  const [past, setPast] = useState([]);
  const [qrFullscreen, setQrFullscreen] = useState(false);

  const formUrl = sessionId ? getMembershipFormUrl(sessionId) : '';

  const persistId = (id) => {
    setSessionId(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  const refreshPast = useCallback(async () => {
    try {
      const data = await listMyMembershipSessions();
      setPast(data.sessions || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refreshPast();
  }, [refreshPast]);

  useEffect(() => {
    if (!formUrl) {
      setQrDataUrl('');
      return undefined;
    }
    let cancelled = false;
    makeScannableQrDataUrl(formUrl, 'preview')
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [formUrl]);

  useEffect(() => {
    if (!qrFullscreen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setQrFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [qrFullscreen]);

  const enableShare = async () => {
    setBusy(true);
    setError('');
    try {
      const id = sessionId || newMembershipSessionId();
      const data = await upsertMembershipSession(id, {
        title: title.trim() || 'TPFS membership form',
        note: note.trim(),
        status: 'open',
      });
      persistId(id);
      setSession(data.session);
      await refreshPast();
    } catch (err) {
      setError(err.message || 'Could not create form link.');
    } finally {
      setBusy(false);
    }
  };

  const closeLink = async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      await upsertMembershipSession(sessionId, {
        title,
        note,
        status: 'closed',
      });
      setSession((s) => (s ? { ...s, status: 'closed' } : s));
    } catch (err) {
      setError(err.message || 'Could not close link.');
    } finally {
      setBusy(false);
    }
  };

  const newLink = async () => {
    if (
      sessionId &&
      !window.confirm('Create a new QR / link? The previous link will stop working if you close it.')
    ) {
      return;
    }
    persistId('');
    setSession(null);
    setQrDataUrl('');
    const id = newMembershipSessionId();
    setBusy(true);
    setError('');
    try {
      const data = await upsertMembershipSession(id, {
        title: title.trim() || 'TPFS membership form',
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
    if (!formUrl) return;
    try {
      await navigator.clipboard.writeText(formUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy membership form link:', formUrl);
    }
  };

  const downloadQr = async () => {
    if (!formUrl) return;
    try {
      await downloadScannableQr(
        formUrl,
        `glico-tpfs-${(sessionId || 'link').slice(0, 8)}.png`
      );
    } catch (err) {
      setError(err.message || 'Could not save QR code.');
    }
  };

  const dropSession = async (id) => {
    if (!window.confirm('Delete this form link? Submitted forms are kept.')) return;
    try {
      await deleteMembershipSession(id);
      if (id === sessionId) {
        persistId('');
        setSession(null);
      }
      await refreshPast();
    } catch (err) {
      setError(err.message || 'Could not delete.');
    }
  };

  return (
    <div className="verify-share card is-open">
      <div className="verify-share-toggle" role="heading" aria-level={2}>
        <div className="verify-share-toggle-main">
          <FaQrcode aria-hidden />
          <div>
            <h2>Share membership form</h2>
            <p>
              Create a QR or link. Members fill the TPFS form on their phone —
              no staff login required.
            </p>
          </div>
        </div>
      </div>
      <div className="verify-share-body" id="tpfs-share-body">
        <div className="verify-share-hero">
          <div className="verify-share-hero-text">
            <p className="verify-share-lead">
              Guests scan the QR, verify their Ghana Card with a selfie, then
              complete school, contribution, and beneficiary details.
            </p>
          </div>
          <span className="verify-share-badge">
            <FaLink aria-hidden /> Guest link · no account
          </span>
        </div>

        <div className="verify-share-form">
          <label className="form-group full-width">
            <span>Link title (shown to members)</span>
            <input
              className="form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="form-group full-width">
            <span>Optional note</span>
            <input
              className="form-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
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
                {session?.status !== 'closed' && (
                  <button
                    type="button"
                    className="btn verify-share-close"
                    onClick={closeLink}
                    disabled={busy}
                  >
                    Close link
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {error && (
          <p className="verify-share-error" role="alert">
            {error}
          </p>
        )}

        {sessionId && formUrl && (
          <div className="verify-share-qr-grid">
            <div className="verify-share-qr-block">
              {qrDataUrl ? (
                <button
                  type="button"
                  className="verify-share-qr-tap"
                  onClick={() => setQrFullscreen(true)}
                  aria-label="Show QR full screen"
                >
                  <img
                    src={qrDataUrl}
                    alt="TPFS membership form QR code"
                    className="verify-share-qr"
                  />
                </button>
              ) : (
                <div className="verify-share-qr-ph">QR…</div>
              )}
              <div className="verify-share-qr-btns">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setQrFullscreen(true)}
                  disabled={!qrDataUrl}
                >
                  <FaExpand aria-hidden /> Show for scan
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={downloadQr}
                  disabled={!formUrl}
                >
                  <FaDownload aria-hidden /> Download QR
                </button>
              </div>
            </div>
            <div className="verify-share-link-block">
              <p className="verify-share-status">
                Status:{' '}
                <strong>
                  {session?.status === 'closed'
                    ? 'Closed'
                    : 'Open — members can fill the form'}
                </strong>
              </p>
              <label>
                Share URL
                <div className="verify-share-link-row">
                  <input
                    className="form-input"
                    readOnly
                    value={formUrl}
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={copyLink}
                  >
                    <FaCopy aria-hidden /> {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </label>
              <p className="verify-share-hint">
                Send by WhatsApp / SMS, or display the QR. Members should open
                the page in Chrome for the selfie camera.
              </p>
            </div>
          </div>
        )}

        {qrFullscreen && qrDataUrl && (
          <div
            className="verify-share-qr-fs"
            role="dialog"
            aria-modal="true"
            aria-label="QR code full screen"
          >
            <button
              type="button"
              className="verify-share-qr-fs-close"
              onClick={() => setQrFullscreen(false)}
              aria-label="Close"
            >
              <FaTimes aria-hidden /> Close
            </button>
            <img
              src={qrDataUrl}
              alt="TPFS form QR code"
              className="verify-share-qr-fs-img"
            />
            <p className="verify-share-qr-fs-hint">
              Raise brightness · hold phone steady · member scans with Camera
            </p>
          </div>
        )}

        {past.length > 0 && (
          <div className="verify-share-past">
            <h3>Your recent form links</h3>
            <ul>
              {past.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="verify-share-past-open"
                    onClick={() => {
                      persistId(s.id);
                      setTitle(s.title || title);
                      setNote(s.note || '');
                      setSession(s);
                    }}
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
    </div>
  );
};

export default MembershipShare;
