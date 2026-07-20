import React, { useCallback, useEffect, useState } from 'react';
import {
  FaUserShield,
  FaUsers,
  FaSync,
  FaCheck,
  FaTimes,
  FaTrash,
  FaUserPlus,
} from 'react-icons/fa';
import {
  listUsers,
  createUser,
  setUserStatus,
  deleteUser,
} from '../services/authService';
import { useAuth } from '../context/AuthContext';
import './SuperAdminDashboard.css';

const emptyCreate = {
  fullName: '',
  email: '',
  organization: '',
  password: '',
  status: 'approved',
};

const SuperAdminDashboard = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await listUsers();
      setUsers(list);
    } catch (err) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const formatDate = (value) => {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString();
    } catch {
      return String(value);
    }
  };

  const runAction = async (id, action) => {
    setBusyId(id);
    setError('');
    setInfo('');
    try {
      await action();
      await load();
    } catch (err) {
      setError(err.message || 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const onCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    setInfo('');
    try {
      await createUser({
        ...createForm,
        role: 'user',
      });
      setCreateForm(emptyCreate);
      setInfo('Account created.');
      await load();
    } catch (err) {
      setError(err.message || 'Could not create account');
    } finally {
      setCreating(false);
    }
  };

  const pendingCount = users.filter((u) => u.status === 'pending').length;
  const approvedCount = users.filter((u) => u.status === 'approved').length;

  return (
    <section className="admin-dash card">
      <div className="admin-dash-header">
        <div>
          <h2>
            <FaUserShield /> Super Admin
          </h2>
          <p>
            Signed in as <strong>{user?.email}</strong>. Approve, reject, create, or delete
            accounts. You also have full access to verification below.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary admin-refresh"
          onClick={load}
          disabled={loading}
        >
          <FaSync /> Refresh
        </button>
      </div>

      <div className="admin-stats">
        <div className="admin-stat">
          <FaUsers />
          <span>
            <strong>{users.length}</strong> total
          </span>
        </div>
        <div className="admin-stat pending">
          <span>
            <strong>{pendingCount}</strong> pending
          </span>
        </div>
        <div className="admin-stat approved">
          <span>
            <strong>{approvedCount}</strong> approved
          </span>
        </div>
      </div>

      {error && <div className="admin-error">{error}</div>}
      {info && <div className="admin-info">{info}</div>}

      <form className="admin-create" onSubmit={onCreate}>
        <h3>
          <FaUserPlus /> Create account
        </h3>
        <div className="admin-create-grid">
          <input
            className="form-input"
            placeholder="Full name"
            value={createForm.fullName}
            onChange={(e) => setCreateForm((f) => ({ ...f, fullName: e.target.value }))}
            required
          />
          <input
            className="form-input"
            type="email"
            placeholder="Email"
            value={createForm.email}
            onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
            required
          />
          <input
            className="form-input"
            placeholder="Organization (optional)"
            value={createForm.organization}
            onChange={(e) =>
              setCreateForm((f) => ({ ...f, organization: e.target.value }))
            }
          />
          <input
            className="form-input"
            type="password"
            placeholder="Password (min 6)"
            value={createForm.password}
            onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
            minLength={6}
            required
          />
          <select
            className="form-input"
            value={createForm.status}
            onChange={(e) => setCreateForm((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="approved">Approved (can sign in)</option>
            <option value="pending">Pending approval</option>
          </select>
          <button type="submit" className="btn btn-primary" disabled={creating}>
            {creating ? 'Creating…' : 'Create account'}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="admin-loading">Loading users…</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Organization</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === user?.id;
                const isAdmin = u.role === 'superadmin';
                const busy = busyId === u.id;
                return (
                  <tr key={u.id} className={u.status === 'pending' ? 'row-pending' : ''}>
                    <td>{u.fullName}</td>
                    <td>{u.email}</td>
                    <td>{u.organization || '—'}</td>
                    <td>
                      <span className={`role-badge ${isAdmin ? 'super' : ''}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${u.status}`}>{u.status}</span>
                    </td>
                    <td>{formatDate(u.createdAt)}</td>
                    <td>
                      <div className="admin-actions">
                        {!isAdmin && u.status !== 'approved' && (
                          <button
                            type="button"
                            className="action-btn approve"
                            title="Approve"
                            disabled={busy}
                            onClick={() =>
                              runAction(u.id, () => setUserStatus(u.id, 'approved'))
                            }
                          >
                            <FaCheck /> Approve
                          </button>
                        )}
                        {!isAdmin && u.status !== 'rejected' && (
                          <button
                            type="button"
                            className="action-btn reject"
                            title="Reject"
                            disabled={busy}
                            onClick={() =>
                              runAction(u.id, () => setUserStatus(u.id, 'rejected'))
                            }
                          >
                            <FaTimes /> Reject
                          </button>
                        )}
                        {!isAdmin && !isSelf && (
                          <button
                            type="button"
                            className="action-btn delete"
                            title="Delete"
                            disabled={busy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Delete account for ${u.email}? This cannot be undone.`
                                )
                              ) {
                                runAction(u.id, () => deleteUser(u.id));
                              }
                            }}
                          >
                            <FaTrash /> Delete
                          </button>
                        )}
                        {isAdmin && <span className="admin-actions-muted">—</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={7} className="admin-empty">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default SuperAdminDashboard;
