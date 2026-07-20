import React, { useState } from 'react';
import { FaSignInAlt, FaUserPlus, FaShieldAlt, FaUserShield } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import './AuthPanel.css';

const emptyLogin = { email: '', password: '' };
const emptyRegister = {
  fullName: '',
  email: '',
  organization: '',
  password: '',
  confirmPassword: '',
};

/**
 * Login / Registration / Superadmin gate.
 */
const AuthPanel = () => {
  const { login, loginSuperAdmin, register, busy, rememberDefault } = useAuth();
  const [mode, setMode] = useState('login'); // login | register | superadmin
  const [loginForm, setLoginForm] = useState(emptyLogin);
  const [adminForm, setAdminForm] = useState(emptyLogin);
  const [registerForm, setRegisterForm] = useState(emptyRegister);
  const [rememberMe, setRememberMe] = useState(
    rememberDefault !== undefined ? rememberDefault : true
  );
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setInfo('');
  };

  const onLogin = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    try {
      await login(loginForm, { remember: rememberMe });
    } catch (err) {
      setError(err.message || 'Sign in failed.');
    }
  };

  const onSuperAdminLogin = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    try {
      await loginSuperAdmin(adminForm, { remember: rememberMe });
    } catch (err) {
      setError(err.message || 'Superadmin sign in failed.');
    }
  };

  const onRegister = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (registerForm.password !== registerForm.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    try {
      const result = await register(registerForm);
      setRegisterForm(emptyRegister);
      setInfo(
        result?.message ||
          'Registration submitted. Wait for a superadmin to approve your account, then sign in.'
      );
      setMode('login');
    } catch (err) {
      setError(err.message || 'Registration failed.');
    }
  };

  const rememberField = (
    <label className="auth-remember">
      <input
        type="checkbox"
        checked={rememberMe}
        onChange={(e) => setRememberMe(e.target.checked)}
      />
      <span>
        <strong>Stay signed in on this device</strong>
        <em>Skip login next time you open the app</em>
      </span>
    </label>
  );

  const emailPasswordFields = (prefix, form, setForm) => (
    <>
      <div className="form-group full-width">
        <label htmlFor={`${prefix}-email`}>Email</label>
        <input
          id={`${prefix}-email`}
          className="form-input"
          type="email"
          autoComplete="username"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          required
        />
      </div>
      <div className="form-group full-width">
        <label htmlFor={`${prefix}-password`}>Password</label>
        <input
          id={`${prefix}-password`}
          className="form-input"
          type="password"
          autoComplete="current-password"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          required
        />
      </div>
    </>
  );

  return (
    <section
      className={`auth-panel ${mode === 'superadmin' ? 'auth-panel-admin' : ''}`}
      aria-labelledby="auth-heading"
    >
      <div className="auth-hero">
        {mode === 'superadmin' ? (
          <FaUserShield className="auth-hero-icon admin" aria-hidden />
        ) : (
          <FaShieldAlt className="auth-hero-icon" aria-hidden />
        )}
        <h2 id="auth-heading">
          {mode === 'superadmin' ? 'Super Admin' : 'Welcome'}
        </h2>
        <p>
          {mode === 'superadmin'
            ? 'Sign in with a superadmin account to manage users and use all features.'
            : mode === 'register'
              ? 'Create an account. A superadmin must approve it before you can sign in.'
              : 'Sign in on first use. Choose Stay signed in for automatic login afterwards.'}
        </p>
      </div>

      <div className="auth-tabs auth-tabs-3" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
          onClick={() => switchMode('login')}
        >
          <FaSignInAlt /> Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'register'}
          className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
          onClick={() => switchMode('register')}
        >
          <FaUserPlus /> Register
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'superadmin'}
          className={`auth-tab admin ${mode === 'superadmin' ? 'active' : ''}`}
          onClick={() => switchMode('superadmin')}
        >
          <FaUserShield /> Admin
        </button>
      </div>

      {error && (
        <div className="auth-alert error" role="alert">
          {error}
        </div>
      )}
      {info && (
        <div className="auth-alert success" role="status">
          {info}
        </div>
      )}

      {mode === 'login' && (
        <form className="auth-form" onSubmit={onLogin} noValidate>
          {emailPasswordFields('login', loginForm, setLoginForm)}
          {rememberField}
          <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="auth-switch">
            New here?{' '}
            <button type="button" className="auth-link" onClick={() => switchMode('register')}>
              Create an account
            </button>
          </p>
        </form>
      )}

      {mode === 'superadmin' && (
        <form className="auth-form" onSubmit={onSuperAdminLogin} noValidate>
          {emailPasswordFields('admin', adminForm, setAdminForm)}
          {rememberField}
          <button
            type="submit"
            className="btn btn-primary auth-submit auth-submit-admin"
            disabled={busy}
          >
            {busy ? 'Signing in…' : 'Sign in as Super Admin'}
          </button>
        </form>
      )}

      {mode === 'register' && (
        <form className="auth-form" onSubmit={onRegister} noValidate>
          <div className="form-group full-width">
            <label htmlFor="reg-name">Full name</label>
            <input
              id="reg-name"
              className="form-input"
              type="text"
              autoComplete="name"
              value={registerForm.fullName}
              onChange={(e) =>
                setRegisterForm((f) => ({ ...f, fullName: e.target.value }))
              }
              required
            />
          </div>
          <div className="form-group full-width">
            <label htmlFor="reg-email">Email</label>
            <input
              id="reg-email"
              className="form-input"
              type="email"
              autoComplete="email"
              value={registerForm.email}
              onChange={(e) =>
                setRegisterForm((f) => ({ ...f, email: e.target.value }))
              }
              required
            />
          </div>
          <div className="form-group full-width">
            <label htmlFor="reg-org">
              Organization <span className="optional">(optional)</span>
            </label>
            <input
              id="reg-org"
              className="form-input"
              type="text"
              autoComplete="organization"
              value={registerForm.organization}
              onChange={(e) =>
                setRegisterForm((f) => ({ ...f, organization: e.target.value }))
              }
            />
          </div>
          <div className="form-group full-width">
            <label htmlFor="reg-password">Password</label>
            <input
              id="reg-password"
              className="form-input"
              type="password"
              autoComplete="new-password"
              value={registerForm.password}
              onChange={(e) =>
                setRegisterForm((f) => ({ ...f, password: e.target.value }))
              }
              minLength={6}
              required
            />
          </div>
          <div className="form-group full-width">
            <label htmlFor="reg-confirm">Confirm password</label>
            <input
              id="reg-confirm"
              className="form-input"
              type="password"
              autoComplete="new-password"
              value={registerForm.confirmPassword}
              onChange={(e) =>
                setRegisterForm((f) => ({
                  ...f,
                  confirmPassword: e.target.value,
                }))
              }
              minLength={6}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
            {busy ? 'Submitting…' : 'Submit registration'}
          </button>
          <p className="auth-switch">
            Already registered?{' '}
            <button type="button" className="auth-link" onClick={() => switchMode('login')}>
              Sign in
            </button>
          </p>
        </form>
      )}
    </section>
  );
};

export default AuthPanel;
