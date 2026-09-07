import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  FaEye,
  FaCopy,
  FaEyeSlash,
} from 'react-icons/fa';
import {
  listUsers,
  createUser,
  setUserStatus,
  deleteUser,
  changeOwnPassword,
  updateOwnProfile,
  resetUserPassword,
  fetchUserPassword,
  updateUser,
  fetchMeetingDepartments,
  saveMeetingDepartments,
} from '../services/authService';
import { useAuth } from '../context/AuthContext';
import { useAppToast } from '../hooks/useAppToast';
import PasswordInput from './PasswordInput';
import './AppToast.css';
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
  const { toast, flash } = useAppToast(4200);
  const actionBannerRef = useRef(null);
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
  const [viewTarget, setViewTarget] = useState(null);
  const [viewPassword, setViewPassword] = useState('');
  const [viewAvailable, setViewAvailable] = useState(false);
  const [viewMessage, setViewMessage] = useState('');
  const [viewLoading, setViewLoading] = useState(false);
  const [viewRevealed, setViewRevealed] = useState(false);
  const [passwordModalTab, setPasswordModalTab] = useState('view'); // view | reset
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

  const showFeedback = useCallback(
    (kind, message) => {
      const msg = String(message || '').trim();
      if (!msg) return;
      if (kind === 'error') {
        setError(msg);
        setInfo('');
      } else {
        setInfo(msg);
        setError('');
      }
      flash(msg);
      // Keep banner in view even when acting from bottom of the table
      window.requestAnimationFrame(() => {
        actionBannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    },
    [flash]
  );

  const runAction = async (id, action, successMsg) => {
    const userId = String(id || '').trim();
    if (!userId) {
      showFeedback('error', 'Missing user id — refresh the page and try again.');
      return;
    }
    setBusyId(userId);
    setError('');
    setInfo('');
    try {
      await action(userId);
      if (successMsg) showFeedback('info', successMsg);
      await load();
    } catch (err) {
      showFeedback('error', err.message || 'Action failed');
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
      const createdPassword = createForm.password;
      setCreateForm(emptyCreate);
      showFeedback(
        'info',
        `Account created. Password to share: ${createdPassword}`
      );
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
    setViewTarget(null);
    setError('');
    setInfo('');
  };

  const openPasswordModal = async (u, tab = 'view') => {
    setEditUser(null);
    setResetTarget(u);
    setResetPassword('');
    setViewTarget(u);
    setViewPassword('');
    setViewAvailable(false);
    setViewMessage('');
    setViewRevealed(false);
    setPasswordModalTab(tab);
    setError('');
    setInfo('');

    if (tab !== 'view') return;

    setViewLoading(true);
    setBusyId(String(u.id));
    try {
      const data = await fetchUserPassword(u.id);
      setViewAvailable(Boolean(data?.available && data?.password));
      setViewPassword(data?.password || '');
      setViewMessage('');
    } catch (err) {
      setViewAvailable(false);
      setViewPassword('');
      setViewMessage(
        err.message ||
          'No viewable password stored yet. Reset the password to create one you can share.'
      );
    } finally {
      setViewLoading(false);
      setBusyId(null);
    }
  };

  const closePasswordModal = () => {
    setResetTarget(null);
    setResetPassword('');
    setViewTarget(null);
    setViewPassword('');
    setViewAvailable(false);
    setViewMessage('');
    setViewRevealed(false);
    setPasswordModalTab('view');
  };

  const copyViewPassword = async () => {
    if (!viewPassword) return;
    try {
      await navigator.clipboard.writeText(viewPassword);
      showFeedback('info', 'Password copied. Share it securely with the user.');
    } catch {
      showFeedback('error', 'Could not copy password. Select and copy it manually.');
    }
  };

  const onSaveEdit = async (e) => {
    e.preventDefault();
    if (!editUser?.id) return;
    setBusyId(String(editUser.id));
    setError('');
    setInfo('');
    try {
      const next = await updateUser(editUser.id, editForm);
      if (String(next.id) === String(user?.id)) refreshUser?.(next);
      setEditUser(null);
      showFeedback('info', 'Account updated.');
      await load();
    } catch (err) {
      showFeedback('error', err.message || 'Could not update account');
    } finally {
      setBusyId(null);
    }
  };

  const onResetPassword = async (e) => {
    e.preventDefault();
    if (!resetTarget?.id) return;
    if (resetPassword.length < 6) {
      showFeedback('error', 'New password must be at least 6 characters.');
      return;
    }
    setBusyId(String(resetTarget.id));
    setError('');
    setInfo('');
    try {
      const result = await resetUserPassword(resetTarget.id, resetPassword);
      const nextPassword = result?.password || resetPassword;
      setViewPassword(nextPassword);
      setViewAvailable(true);
      setViewMessage('');
      setViewRevealed(true);
      setPasswordModalTab('view');
      setResetPassword('');
      showFeedback(
        'info',
        `Password reset for ${resetTarget.email}. Copy and share it securely.`
      );
    } catch (err) {
      showFeedback('error', err.message || 'Could not reset password');
    } finally {
      setBusyId(null);
    }
  };

  const pendingCount = users.filter((u) => u.status === 'pending').length;
  const approvedCount = users.filter((u) => u.status === 'approved').length;

  return (
    <section className="admin-dash card">
      {toast && (
        <div className="app-toast-fixed success" role="status">
          {toast}
        </div>
      )}
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

      <div ref={actionBannerRef}>
        {error && (
          <div className="admin-error" role="alert">
            {error}
          </div>
        )}
        {info && (
          <div className="admin-info" role="status">
            {info}
          </div>
        )}
      </div>

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
            <PasswordInput
              placeholder="Current password"
              value={passwordForm.currentPassword}
              onChange={(e) =>
                setPasswordForm((f) => ({ ...f, currentPassword: e.target.value }))
              }
              required
              autoComplete="current-password"
              aria-label="Current password"
            />
            <PasswordInput
              placeholder="New password (min 6)"
              value={passwordForm.newPassword}
              onChange={(e) =>
                setPasswordForm((f) => ({ ...f, newPassword: e.target.value }))
              }
              minLength={6}
              required
              autoComplete="new-password"
              aria-label="New password"
            />
            <PasswordInput
              placeholder="Confirm new password"
              value={passwordForm.confirmPassword}
              onChange={(e) =>
                setPasswordForm((f) => ({ ...f, confirmPassword: e.target.value }))
              }
              minLength={6}
              required
              autoComplete="new-password"
              aria-label="Confirm new password"
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
          <PasswordInput
            placeholder="Password (min 6)"
            value={createForm.password}
            onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
            minLength={6}
            required
            aria-label="Password"
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
        <div
          className="admin-modal-backdrop"
          role="presentation"
          onClick={() => setEditUser(null)}
        >
          <form
            className="admin-modal"
            onSubmit={onSaveEdit}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>
              <FaEdit /> Edit account
            </h3>
            <p className="admin-modal-sub">{editUser.email}</p>
            <div className="admin-modal-grid">
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
              <div className="admin-modal-actions">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busyId === String(editUser.id)}
                >
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
            </div>
          </form>
        </div>
      )}

      {(viewTarget || resetTarget) && (
        <div
          className="admin-modal-backdrop"
          role="presentation"
          onClick={closePasswordModal}
        >
          <div
            className="admin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-password-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="admin-password-modal-title">
              <FaKey /> Password — {(viewTarget || resetTarget)?.email}
            </h3>
            <p className="admin-modal-sub">
              View the stored password to share with the user, or set a new one.
            </p>

            <div className="admin-password-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={passwordModalTab === 'view'}
                className={`admin-password-tab ${
                  passwordModalTab === 'view' ? 'active' : ''
                }`}
                onClick={() => openPasswordModal(viewTarget || resetTarget, 'view')}
              >
                <FaEye /> View
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={passwordModalTab === 'reset'}
                className={`admin-password-tab ${
                  passwordModalTab === 'reset' ? 'active' : ''
                }`}
                onClick={() => setPasswordModalTab('reset')}
              >
                <FaKey /> Reset
              </button>
            </div>

            {passwordModalTab === 'view' && (
              <div className="admin-modal-grid">
                {viewLoading ? (
                  <p className="admin-modal-sub">Loading password…</p>
                ) : viewAvailable ? (
                  <>
                    <label className="admin-password-label" htmlFor="admin-view-password">
                      Current password
                    </label>
                    <div className="admin-password-reveal-row">
                      <input
                        id="admin-view-password"
                        className="form-input"
                        type={viewRevealed ? 'text' : 'password'}
                        value={viewPassword}
                        readOnly
                      />
                      <button
                        type="button"
                        className="action-btn"
                        title={viewRevealed ? 'Hide' : 'Show'}
                        onClick={() => setViewRevealed((v) => !v)}
                      >
                        {viewRevealed ? <FaEyeSlash /> : <FaEye />}
                      </button>
                      <button
                        type="button"
                        className="action-btn approve"
                        title="Copy password"
                        onClick={copyViewPassword}
                      >
                        <FaCopy /> Copy
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="admin-modal-sub admin-modal-warn">
                    {viewMessage ||
                      'No viewable password stored yet. Use Reset to set one, then you can view and share it.'}
                  </p>
                )}
                <div className="admin-modal-actions">
                  <button type="button" className="action-btn" onClick={closePasswordModal}>
                    Close
                  </button>
                  {!viewAvailable && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => setPasswordModalTab('reset')}
                    >
                      Set password
                    </button>
                  )}
                </div>
              </div>
            )}

            {passwordModalTab === 'reset' && (
              <form className="admin-modal-grid" onSubmit={onResetPassword}>
                <input
                  className="form-input"
                  type="text"
                  placeholder="New password (min 6)"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  minLength={6}
                  required
                  autoFocus
                  autoComplete="new-password"
                />
                <div className="admin-modal-actions">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={busyId === String((resetTarget || viewTarget)?.id || '')}
                  >
                    Set new password
                  </button>
                  <button type="button" className="action-btn" onClick={closePasswordModal}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
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
                const userId = String(u.id || '');
                const isSelf = userId && userId === String(user?.id || '');
                const isAdmin = u.role === 'superadmin';
                const busy = busyId === userId;
                return (
                  <tr key={userId || u.email} className={u.status === 'pending' ? 'row-pending' : ''}>
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
                          title="Edit account"
                          disabled={busy || !userId}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openEdit(u);
                          }}
                        >
                          <FaEdit /> Edit
                        </button>
                        <button
                          type="button"
                          className="action-btn"
                          title="View or reset password"
                          disabled={busy || !userId}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openPasswordModal(u, 'view');
                          }}
                        >
                          <FaKey /> Password
                        </button>
                        {!isAdmin && u.status !== 'approved' && (
                          <button
                            type="button"
                            className="action-btn approve"
                            disabled={busy || !userId}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              runAction(
                                userId,
                                (id) => setUserStatus(id, 'approved'),
                                `${u.email} approved.`
                              );
                            }}
                          >
                            <FaCheck /> Approve
                          </button>
                        )}
                        {!isAdmin && u.status !== 'rejected' && (
                          <button
                            type="button"
                            className="action-btn reject"
                            disabled={busy || !userId}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (
                                !window.confirm(
                                  `Reject account for ${u.email}? They will not be able to sign in.`
                                )
                              ) {
                                return;
                              }
                              runAction(
                                userId,
                                (id) => setUserStatus(id, 'rejected'),
                                `${u.email} rejected.`
                              );
                            }}
                          >
                            <FaTimes /> Reject
                          </button>
                        )}
                        {!isAdmin && !isSelf && (
                          <button
                            type="button"
                            className="action-btn delete"
                            disabled={busy || !userId}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (
                                !window.confirm(
                                  `Delete account for ${u.email}? This cannot be undone.`
                                )
                              ) {
                                return;
                              }
                              runAction(
                                userId,
                                (id) => deleteUser(id),
                                `${u.email} deleted.`
                              );
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
