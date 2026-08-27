import React, { useCallback, useEffect, useState } from 'react';
import {
  FaUserShield,
  FaUsers,
  FaSync,
  FaCheck,
  FaTimes,
  FaTrash,
  FaUserPlus,
  FaKey,
  FaEdit,
  FaUserCog,
  FaBuilding,
} from 'react-icons/fa';
import {
  listUsers,
  createUser,
  setUserStatus,
  deleteUser,
  changeOwnPassword,
  updateOwnProfile,
  resetUserPassword,
  updateUser,
  fetchMeetingDepartments,
  saveMeetingDepartments,
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
  const { user, refreshUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [creating, setCreating] = useState(false);

  const [profileForm, setProfileForm] = useState({
    fullName: user?.fullName || '',
    email: user?.email || '',
    organization: user?.organization || '',
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({
    fullName: '',
    email: '',
    organization: '',
  });
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [departmentsText, setDepartmentsText] = useState('');
  const [savingDepartments, setSavingDepartments] = useState(false);
  const [loadingDepartments, setLoadingDepartments] = useState(true);

  useEffect(() => {
    if (user) {
      setProfileForm({
        fullName: user.fullName || '',
        email: user.email || '',
        organization: user.organization || '',
      });
    }
  }, [user]);

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

  const loadDepartments = useCallback(async () => {
    setLoadingDepartments(true);
    try {
      const data = await fetchMeetingDepartments();
      const list = Array.isArray(data?.departments) ? data.departments : [];
      setDepartmentsText(list.join('\n'));
    } catch (err) {
      setError(err.message || 'Failed to load meeting departments');
    } finally {
      setLoadingDepartments(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadDepartments();
  }, [load, loadDepartments]);

  const formatDate = (value) => {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString();
    } catch {
      return String(value);
    }
  };

  const runAction = async (id, action, successMsg) => {
    setBusyId(id);
    setError('');
    setInfo('');
    try {
      await action();
      if (successMsg) setInfo(successMsg);
      await load();
    } catch (err) {
      setError(err.message || 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const onSaveDepartments = async (e) => {
    e.preventDefault();
    setSavingDepartments(true);
    setError('');
    setInfo('');
    try {
      const departments = departmentsText
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const data = await saveMeetingDepartments(departments);
      const saved = Array.isArray(data?.departments) ? data.departments : [];
      setDepartmentsText(saved.join('\n'));
      setInfo('Meeting departments saved.');
    } catch (err) {
      setError(err.message || 'Could not save departments');
    } finally {
      setSavingDepartments(false);
    }
  };

  const onCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    setInfo('');
    try {
      await createUser({ ...createForm, role: 'user' });
      setCreateForm(emptyCreate);
      setInfo('Account created.');
      await load();
    } catch (err) {
      setError(err.message || 'Could not create account');
    } finally {
      setCreating(false);
    }
  };

  const onSaveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setError('');
    setInfo('');
    try {
      const next = await updateOwnProfile(profileForm);
      refreshUser?.(next);
      setInfo('Your account details were updated.');
      await load();
    } catch (err) {
      setError(err.message || 'Could not update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const onChangePassword = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    setSavingPassword(true);
    try {
      await changeOwnPassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      setInfo('Your password was changed. Use it next time you sign in.');
    } catch (err) {
      setError(err.message || 'Could not change password');
    } finally {
      setSavingPassword(false);
    }
  };

  const openEdit = (u) => {
    setEditUser(u);
    setEditForm({
      fullName: u.fullName || '',
      email: u.email || '',
      organization: u.organization || '',
    });
    setResetTarget(null);
    setError('');
    setInfo('');
  };

  const onSaveEdit = async (e) => {
    e.preventDefault();
    if (!editUser) return;
    setBusyId(editUser.id);
    setError('');
    setInfo('');
    try {
      const next = await updateUser(editUser.id, editForm);
      if (next.id === user?.id) refreshUser?.(next);
      setEditUser(null);
      setInfo('Account updated.');
      await load();
    } catch (err) {
      setError(err.message || 'Could not update account');
    } finally {
      setBusyId(null);
    }
  };

  const onResetPassword = async (e) => {
    e.preventDefault();
    if (!resetTarget) return;
    if (resetPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    setBusyId(resetTarget.id);
    setError('');
    setInfo('');
    try {
      await resetUserPassword(resetTarget.id, resetPassword);
      setInfo(`Password reset for ${resetTarget.email}.`);
      setResetTarget(null);
      setResetPassword('');
    } catch (err) {
      setError(err.message || 'Could not reset password');
    } finally {
      setBusyId(null);
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
            Manage your account, create users, approve registrations, and reset passwords.
            Verification tools are available below.
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

      <div className="admin-self-grid">
        <form className="admin-create" onSubmit={onSaveProfile}>
          <h3>
            <FaUserCog /> My account
          </h3>
          <div className="admin-create-grid">
            <input
              className="form-input"
              placeholder="Full name"
              value={profileForm.fullName}
              onChange={(e) =>
                setProfileForm((f) => ({ ...f, fullName: e.target.value }))
              }
              required
            />
            <input
              className="form-input"
              type="email"
              placeholder="Email"
              value={profileForm.email}
              onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
            <input
              className="form-input"
              placeholder="Organization"
              value={profileForm.organization}
              onChange={(e) =>
                setProfileForm((f) => ({ ...f, organization: e.target.value }))
              }
            />
            <button type="submit" className="btn btn-primary" disabled={savingProfile}>
              {savingProfile ? 'Saving…' : 'Save account'}
            </button>
          </div>
        </form>

        <form className="admin-create" onSubmit={onChangePassword}>
          <h3>
            <FaKey /> Change my password
          </h3>
          <div className="admin-create-grid">
            <input
              className="form-input"
              type="password"
              placeholder="Current password"
              value={passwordForm.currentPassword}
              onChange={(e) =>
                setPasswordForm((f) => ({ ...f, currentPassword: e.target.value }))
              }
              required
              autoComplete="current-password"
            />
            <input
              className="form-input"
              type="password"
              placeholder="New password (min 6)"
              value={passwordForm.newPassword}
              onChange={(e) =>
                setPasswordForm((f) => ({ ...f, newPassword: e.target.value }))
              }
              minLength={6}
              required
              autoComplete="new-password"
            />
            <input
              className="form-input"
              type="password"
              placeholder="Confirm new password"
              value={passwordForm.confirmPassword}
              onChange={(e) =>
                setPasswordForm((f) => ({ ...f, confirmPassword: e.target.value }))
              }
              minLength={6}
              required
              autoComplete="new-password"
            />
            <button type="submit" className="btn btn-primary" disabled={savingPassword}>
              {savingPassword ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </form>
      </div>

      <form className="admin-create admin-departments-panel" onSubmit={onSaveDepartments}>
        <h3>
          <FaBuilding /> Meeting departments
        </h3>
        <p className="admin-departments-hint">
          Guests see this list when they scan a meeting QR code. They can pick a
          department or type their own. One department per line.
        </p>
        <textarea
          className="form-input admin-departments-textarea"
          value={departmentsText}
          onChange={(e) => setDepartmentsText(e.target.value)}
          rows={6}
          placeholder={'Micro Insurance\nIndividual Life\nFinance\nUnderwriting\nClaims'}
          disabled={loadingDepartments}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={savingDepartments || loadingDepartments}
        >
          {savingDepartments ? 'Saving…' : 'Save departments'}
        </button>
      </form>

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

      {editUser && (
        <form className="admin-create admin-edit-panel" onSubmit={onSaveEdit}>
          <h3>
            <FaEdit /> Edit account — {editUser.email}
          </h3>
          <div className="admin-create-grid">
            <input
              className="form-input"
              value={editForm.fullName}
              onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))}
              placeholder="Full name"
              required
            />
            <input
              className="form-input"
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="Email"
              required
            />
            <input
              className="form-input"
              value={editForm.organization}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, organization: e.target.value }))
              }
              placeholder="Organization"
            />
            <button type="submit" className="btn btn-primary" disabled={busyId === editUser.id}>
              Save changes
            </button>
            <button
              type="button"
              className="action-btn"
              onClick={() => setEditUser(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {resetTarget && (
        <form className="admin-create admin-edit-panel" onSubmit={onResetPassword}>
          <h3>
            <FaKey /> Reset password — {resetTarget.email}
          </h3>
          <div className="admin-create-grid">
            <input
              className="form-input"
              type="password"
              placeholder="New password (min 6)"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              minLength={6}
              required
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busyId === resetTarget.id}
            >
              Set new password
            </button>
            <button
              type="button"
              className="action-btn"
              onClick={() => {
                setResetTarget(null);
                setResetPassword('');
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

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
                        <button
                          type="button"
                          className="action-btn"
                          title="Edit"
                          disabled={busy}
                          onClick={() => openEdit(u)}
                        >
                          <FaEdit /> Edit
                        </button>
                        <button
                          type="button"
                          className="action-btn"
                          title="Reset password"
                          disabled={busy}
                          onClick={() => {
                            setResetTarget(u);
                            setResetPassword('');
                            setEditUser(null);
                            setError('');
                            setInfo('');
                          }}
                        >
                          <FaKey /> Password
                        </button>
                        {!isAdmin && u.status !== 'approved' && (
                          <button
                            type="button"
                            className="action-btn approve"
                            disabled={busy}
                            onClick={() =>
                              runAction(
                                u.id,
                                () => setUserStatus(u.id, 'approved'),
                                'Account approved.'
                              )
                            }
                          >
                            <FaCheck /> Approve
                          </button>
                        )}
                        {!isAdmin && u.status !== 'rejected' && (
                          <button
                            type="button"
                            className="action-btn reject"
                            disabled={busy}
                            onClick={() =>
                              runAction(
                                u.id,
                                () => setUserStatus(u.id, 'rejected'),
                                'Account rejected.'
                              )
                            }
                          >
                            <FaTimes /> Reject
                          </button>
                        )}
                        {!isAdmin && !isSelf && (
                          <button
                            type="button"
                            className="action-btn delete"
                            disabled={busy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Delete account for ${u.email}? This cannot be undone.`
                                )
                              ) {
                                runAction(u.id, () => deleteUser(u.id), 'Account deleted.');
                              }
                            }}
                          >
                            <FaTrash /> Delete
                          </button>
                        )}
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
