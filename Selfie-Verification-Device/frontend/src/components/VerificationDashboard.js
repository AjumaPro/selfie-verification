import React, { useCallback, useEffect, useState } from 'react';
import {
  FaCheckCircle,
  FaClipboardList,
  FaSync,
  FaTimesCircle,
} from 'react-icons/fa';
import { fetchVerifyDashboard } from '../services/verifyApi';
import { useAuth } from '../context/AuthContext';
import { resultToApiResult } from '../utils/kycAttempt';
import VerificationResultCard from './VerificationResultCard';
import './VerificationDashboard.css';

const VerificationDashboard = () => {
  const { isSuperAdmin } = useAuth();
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [counts, setCounts] = useState({
    total: 0,
    approved: 0,
    attempted: 0,
  });
  const [scope, setScope] = useState('mine');
  const [results, setResults] = useState([]);
  const [openId, setOpenId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchVerifyDashboard({ status, limit: 200 });
      setResults(data.results || []);
      setCounts(
        data.counts || {
          total: (data.results || []).length,
          approved: 0,
          attempted: 0,
        }
      );
      setScope(data.scope || 'mine');
    } catch (err) {
      setError(err.message || 'Could not load verification dashboard.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 15000);
    return () => window.clearInterval(t);
  }, [load]);

  return (
    <section className="vdash" aria-label="Verification dashboard">
      <div className="vdash-header">
        <div>
          <h2>
            <FaClipboardList aria-hidden /> Verification dashboard
          </h2>
          <p>
            {isSuperAdmin || scope === 'all'
              ? 'All member KYC attempts. Approved checks show NIA details.'
              : 'Your shared-link and on-device attempts. Approved means Ghana Card matched.'}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary vdash-refresh"
          onClick={load}
          disabled={loading}
        >
          <FaSync aria-hidden /> Refresh
        </button>
      </div>

      <div className="vdash-stats">
        <div className="vdash-stat">
          <strong>{counts.total}</strong>
          <span>Total</span>
        </div>
        <div className="vdash-stat vdash-stat-ok">
          <strong>{counts.approved}</strong>
          <span>Approved</span>
        </div>
        <div className="vdash-stat vdash-stat-attempt">
          <strong>{counts.attempted}</strong>
          <span>Attempted</span>
        </div>
      </div>

      <div className="vdash-filters" role="tablist" aria-label="Filter attempts">
        {[
          ['all', 'All'],
          ['approved', 'Approved'],
          ['attempted', 'Attempted'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={status === id}
            className={`vdash-filter ${status === id ? 'active' : ''}`}
            onClick={() => setStatus(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <p className="vdash-error" role="alert">
          {error}
        </p>
      )}

      {loading && results.length === 0 ? (
        <p className="vdash-empty">Loading attempts…</p>
      ) : results.length === 0 ? (
        <p className="vdash-empty">
          No {status === 'all' ? 'attempts' : status} yet. Shared QR checks and
          on-device KYC both appear here.
        </p>
      ) : (
        <div className="vdash-table-wrap">
          <table className="vdash-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Name</th>
                <th>Ghana Card</th>
                <th>Source</th>
                {(isSuperAdmin || scope === 'all') && <th>Staff</th>}
                <th>When</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const approved = !!(r.approved || r.verified);
                const open = openId === r.id;
                const source =
                  r.source === 'device' ? 'On-device' : 'Shared link';
                return (
                  <React.Fragment key={r.id}>
                    <tr>
                      <td>
                        {approved ? (
                          <span className="verify-ok">
                            <FaCheckCircle aria-hidden /> Approved
                          </span>
                        ) : (
                          <span className="verify-fail">
                            <FaTimesCircle aria-hidden /> Attempted
                          </span>
                        )}
                      </td>
                      <td>
                        {[r.forenames, r.surname].filter(Boolean).join(' ') ||
                          '—'}
                      </td>
                      <td>{r.ghanaCard || r.nationalId || '—'}</td>
                      <td>{source}</td>
                      {(isSuperAdmin || scope === 'all') && (
                        <td>{r.hostName || r.hostEmail || '—'}</td>
                      )}
                      <td>
                        {r.createdAt
                          ? new Date(r.createdAt).toLocaleString()
                          : '—'}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="vdash-details"
                          onClick={() => setOpenId(open ? '' : r.id)}
                        >
                          {open ? 'Hide details' : 'View details'}
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr className="vdash-detail-row">
                        <td colSpan={isSuperAdmin || scope === 'all' ? 7 : 6}>
                          {(r.message || r.errorText) && !approved ? (
                            <p className="vdash-note">
                              {r.message || r.errorText}
                            </p>
                          ) : null}
                          <VerificationResultCard
                            apiResult={resultToApiResult(r)}
                            title={approved ? 'Approved' : 'Attempted'}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default VerificationDashboard;
