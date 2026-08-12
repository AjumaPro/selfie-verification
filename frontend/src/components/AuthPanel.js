import React, { useEffect, useState } from 'react';
import {
  FaSignInAlt,
  FaUserPlus,
  FaUserShield,
  FaDesktop,
  FaWindows,
  FaApple,
} from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { resolveApiBase } from '../config/apiBase';
import { glicoLogoUrl } from '../utils/brandAssets';
import './AuthPanel.css';

const emptyLogin = { email: '', password: '' };
const emptyRegister = {
  fullName: '',
  email: '',
  organization: '',
  password: '',
  confirmPassword: '',
};

function detectDesktopShell() {
  if (typeof window === 'undefined') return { desktop: false, platform: '' };
  const ua = navigator.userAgent || '';
  const file = window.location.protocol === 'file:';
  const electron =
    file ||
    /Electron/i.test(ua) ||
    (document.body && document.body.dataset.desktopApp === 'true');
  if (!electron) return { desktop: false, platform: '' };
  if (/Windows/i.test(ua)) return { desktop: true, platform: 'windows' };
  if (/Mac/i.test(ua)) return { desktop: true, platform: 'mac' };
  return { desktop: true, platform: 'desktop' };
}

/**
 * Authentication sections: Sign in · Register · Super Admin.
 * Shown for Image Recognition on web and for Windows/Mac Electron installs.
 */
const AuthPanel = () => {
  const { login, loginSuperAdmin, register, busy } = useAuth();
  const [mode, setMode] = useState('login'); // login | register | superadmin
  const [loginForm, setLoginForm] = useState(emptyLogin);
  const [adminForm, setAdminForm] = useState(emptyLogin);
  const [registerForm, setRegisterForm] = useState(emptyRegister);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [shell, setShell] = useState(() => detectDesktopShell());

  useEffect(() => {
    // Preload may set data-desktop-app after first paint
    const t = window.setTimeout(() => setShell(detectDesktopShell()), 50);
    return () => window.clearTimeout(t);
  }, []);

  const apiHint = resolveApiBase();

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
    <div className="auth-remember">
      <input
        id="stay-signed-in"
        type="checkbox"
        checked={rememberMe}
        onChange={(e) => setRememberMe(e.target.checked)}
      />
      <label htmlFor="stay-signed-in">
        <strong>Stay signed in on this device</strong>
        <em>
          {shell.desktop
            ? 'Recommended for Mac / Windows desktop — skip login next launch'
            : 'Skip login next time you open the app'}
        </em>
      </label>
    </div>
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

  const platformIcon =
    shell.platform === 'windows' ? (
      <FaWindows aria-hidden />
    ) : shell.platform === 'mac' ? (
      <FaApple aria-hidden />
    ) : (
      <FaDesktop aria-hidden />
    );

  return (
    <section
      className={`auth-panel ${mode === 'superadmin' ? 'auth-panel-admin' : ''}`}
      aria-labelledby="auth-heading"
    >
      <div className="auth-hero">
        <img
          src={glicoLogoUrl()}
          alt="GLICO"
          className="auth-hero-logo"
        />
        <div className="auth-hero-mark" aria-hidden>
          <span className="stripe stripe-red" />
          <span className="stripe stripe-sky" />
          <span className="stripe stripe-navy" />
        </div>
        <p className="auth-brand-label">GLICO Platform</p>
        <h2 id="auth-heading">
          {mode === 'superadmin'
            ? 'Super Admin'
            : mode === 'register'
              ? 'Create account'
              : 'Sign in'}
        </h2>
        <p>
          {mode === 'superadmin'
            ? 'Administrator access — approve users and manage the platform.'
            : mode === 'register'
              ? 'Request access. A superadmin must approve you before Image Recognition works.'
              : 'Use your approved account for Image Recognition and Ghana Card KYC.'}
        </p>
      </div>

      {shell.desktop && (
        <div className="auth-desktop-banner" role="status">
          <span className="auth-desktop-icon">{platformIcon}</span>
          <div>
            <strong>
              {shell.platform === 'windows'
                ? 'Windows desktop app'
                : shell.platform === 'mac'
                  ? 'Mac desktop app'
                  : 'Desktop app'}
            </strong>
            <p>
              Authentication uses the same GLICO accounts as the website. Choose a
              section below — Sign in, Register, or Admin.
              {apiHint ? (
                <>
                  {' '}
                  Auth server: <code>{apiHint}</code>
                </>
              ) : null}
            </p>
          </div>
        </div>
      )}

      <h3 className="auth-sections-label">Authentication</h3>
      <div className="auth-tabs auth-tabs-3" role="tablist" aria-label="Authentication sections">
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
          <p className="auth-section-hint">
            Section: <strong>Sign in</strong> — approved users only
          </p>
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
          <p className="auth-section-hint">
            Section: <strong>Admin</strong> — superadmin credentials only (not regular staff login)
          </p>
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
          <p className="auth-section-hint">
            Section: <strong>Register</strong> — account stays pending until a superadmin approves it
          </p>
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
