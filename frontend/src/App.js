import React, { useState, useEffect } from 'react';
import './App.css';
import './components/GlicoBrandBar.css';
import Header from './components/Header';
import GlicoBrandBar from './components/GlicoBrandBar';
import { BRAND } from './utils/brandAssets';
import AuthPanel from './components/AuthPanel';
import InstallOnDevice from './components/InstallOnDevice';
import SelfieVerification from './components/SelfieVerification';
import SuperAdminDashboard from './components/SuperAdminDashboard';
import AppHub from './components/AppHub';
import MeetingsApp from './components/MeetingsApp';
import MeetingJoin from './components/MeetingJoin';
import BookingGuest from './components/BookingGuest';
import VerifyJoin from './components/VerifyJoin';
import VerifyShare from './components/VerifyShare';
import { useAuth } from './context/AuthContext';
import { loadModels } from './services/faceDetection';
import apiConfig from './config/api';

/**
 * Device / Windows-Mac installer builds: full web KYC features, no Meetings.
 * Set REACT_APP_DEVICE_APP=true for Electron (see electron-build.js).
 * Website (DigitalOcean) leaves this unset so Meetings remains available.
 */
function isDeviceAppBuild() {
  const flag = String(process.env.REACT_APP_DEVICE_APP || '')
    .toLowerCase()
    .trim();
  if (flag === '1' || flag === 'true' || flag === 'yes') return true;
  if (typeof window === 'undefined') return false;
  try {
    if (window.location.protocol === 'file:') return true;
    if (document.body && document.body.dataset.desktopApp === 'true') return true;
    if (/Electron/i.test(navigator.userAgent || '')) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function getJoinMeetingIdFromUrl() {
  if (typeof window === 'undefined') return '';
  try {
    const params = new URLSearchParams(window.location.search);
    return String(params.get('join') || '').trim();
  } catch {
    return '';
  }
}

function getBookPageIdFromUrl() {
  if (typeof window === 'undefined') return '';
  try {
    const params = new URLSearchParams(window.location.search);
    return String(params.get('book') || '').trim();
  } catch {
    return '';
  }
}

function getVerifySessionIdFromUrl() {
  if (typeof window === 'undefined') return '';
  try {
    const params = new URLSearchParams(window.location.search);
    return String(params.get('verify') || '').trim();
  } catch {
    return '';
  }
}

/**
 * Public hub + app nav.
 * Web: Meetings and Image Recognition require sign-in. Guest QR check-in stays public.
 */
function AppNav({ section, onChange, isAuthenticated, deviceOnly }) {
  return (
    <nav className="app-nav" aria-label="Applications">
      <button
        type="button"
        className={`app-nav-btn ${section === 'hub' ? 'active' : ''}`}
        onClick={() => onChange('hub')}
      >
        Home
      </button>
      <button
        type="button"
        className={`app-nav-btn ${section === 'recognition' ? 'active' : ''}`}
        onClick={() => onChange('recognition')}
      >
        Image Recognition
        {!isAuthenticated && (
          <span className="app-nav-lock" title="Sign in required">
            · sign in
          </span>
        )}
      </button>
      {!deviceOnly && (
        <button
          type="button"
          className={`app-nav-btn ${section === 'meetings' ? 'active' : ''}`}
          onClick={() => onChange('meetings')}
        >
          Meetings
          {!isAuthenticated && (
            <span className="app-nav-lock" title="Sign in required">
              · sign in
            </span>
          )}
        </button>
      )}
    </nav>
  );
}

function App() {
  const { isAuthenticated, isSuperAdmin, booting } = useAuth();
  const [deviceOnly, setDeviceOnly] = useState(() => isDeviceAppBuild());
  const [section, setSection] = useState('hub');
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [modelsError, setModelsError] = useState(null);
  const [joinMeetingId, setJoinMeetingId] = useState(() =>
    isDeviceAppBuild() ? '' : getJoinMeetingIdFromUrl()
  );
  const [bookPageId, setBookPageId] = useState(() =>
    isDeviceAppBuild() ? '' : getBookPageIdFromUrl()
  );
  const [verifySessionId, setVerifySessionId] = useState(() =>
    getVerifySessionIdFromUrl()
  );
  const apiReady = apiConfig.isAutoVerificationEnabled;
  const missingConfig = apiConfig.missingConfig || [];

  // Electron preload sets data-desktop-app after first paint
  useEffect(() => {
    const sync = () => setDeviceOnly(isDeviceAppBuild());
    sync();
    const t = window.setTimeout(sync, 80);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (deviceOnly && section === 'meetings') setSection('hub');
  }, [deviceOnly, section]);

  // Deep-link: /?app=meetings opens Meetings in the browser / PWA
  useEffect(() => {
    if (deviceOnly) return undefined;
    try {
      const params = new URLSearchParams(window.location.search);
      if (String(params.get('app') || '').toLowerCase() === 'meetings') {
        setSection('meetings');
      }
    } catch {
      /* ignore */
    }
    return undefined;
  }, [deviceOnly]);

  useEffect(() => {
    const onPop = () => {
      if (!deviceOnly) {
        setJoinMeetingId(getJoinMeetingIdFromUrl());
        setBookPageId(getBookPageIdFromUrl());
      }
      setVerifySessionId(getVerifySessionIdFromUrl());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [deviceOnly]);

  // Face models only when authenticated user is in Image Recognition
  useEffect(() => {
    if (!isAuthenticated || section !== 'recognition') {
      return undefined;
    }

    if (modelsReady) return undefined;

    let cancelled = false;
    setModelsLoading(true);
    setModelsError(null);

    loadModels()
      .then(() => {
        if (!cancelled) {
          setModelsReady(true);
          setModelsLoading(false);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setModelsError(error.message);
          setModelsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, section, modelsReady]);

  const openSection = (next) => {
    if (deviceOnly && next === 'meetings') return;
    setSection(next);
  };
  const backToHub = () => setSection('hub');

  const shellClass = deviceOnly ? 'App App--device' : 'App';
  const deviceBrand = deviceOnly ? (
    <GlicoBrandBar
      product={BRAND.name}
      tagline="Identity · Ghana Card KYC · Windows & Mac"
    />
  ) : null;

  const leaveJoinPage = () => {
    setJoinMeetingId('');
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('join');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    } catch {
      /* ignore */
    }
    setSection(deviceOnly ? 'hub' : 'meetings');
  };

  const leaveBookPage = () => {
    setBookPageId('');
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('book');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    } catch {
      /* ignore */
    }
    setSection(deviceOnly ? 'hub' : 'meetings');
  };

  const leaveVerifyPage = () => {
    setVerifySessionId('');
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('verify');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    } catch {
      /* ignore */
    }
    setSection('hub');
  };

  // Public guest identity verification (QR / shared link)
  if (verifySessionId) {
    return (
      <VerifyJoin sessionId={verifySessionId} onClose={leaveVerifyPage} />
    );
  }

  // Public QR check-in (web only)
  if (!deviceOnly && joinMeetingId) {
    return (
      <MeetingJoin meetingId={joinMeetingId} onClose={leaveJoinPage} />
    );
  }

  // Public guest booking (web only)
  if (!deviceOnly && bookPageId) {
    return <BookingGuest pageId={bookPageId} onClose={leaveBookPage} />;
  }

  if (booting) {
    return (
      <div className={shellClass}>
        {deviceBrand}
        <Header activeApp="hub" deviceOnly={deviceOnly} />
        <div className="container">
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <h2>Loading…</h2>
          </div>
        </div>
      </div>
    );
  }

  const nav = (
    <AppNav
      section={section}
      onChange={openSection}
      isAuthenticated={isAuthenticated}
      deviceOnly={deviceOnly}
    />
  );

  // ——— Home ———
  if (section === 'hub') {
    return (
      <div className={shellClass}>
        {deviceBrand}
        <Header activeApp="hub" onBackToApps={null} deviceOnly={deviceOnly} />
        <div className="container">
          {nav}
          <AppHub onSelect={openSection} deviceOnly={deviceOnly} />
          {isAuthenticated && isSuperAdmin && <SuperAdminDashboard />}
        </div>
      </div>
    );
  }

  // ——— Meetings (web only) ———
  if (!deviceOnly && section === 'meetings' && !isAuthenticated) {
    return (
      <div className={shellClass}>
        <Header activeApp="meetings" onBackToApps={backToHub} />
        <div className="container">
          {nav}
          <div className="app-auth-banner">
            <h2>Meetings</h2>
            <p>
              Sign in to create meetings, publish QR check-in, and manage
              attendance. Guests can still scan QR links without an account.
            </p>
          </div>
          <AuthPanel />
        </div>
      </div>
    );
  }

  if (!deviceOnly && section === 'meetings') {
    return (
      <div className={shellClass}>
        <Header activeApp="meetings" onBackToApps={backToHub} />
        <div className="container">
          {nav}
          <MeetingsApp />
        </div>
      </div>
    );
  }

  // ——— Image Recognition: requires sign-in ———
  if (section === 'recognition' && !isAuthenticated) {
    return (
      <div className={shellClass}>
        {deviceBrand}
        <Header activeApp="recognition" onBackToApps={backToHub} deviceOnly={deviceOnly} />
        <div className="container">
          {nav}
          <div className="app-auth-banner">
            <h2>Image Recognition</h2>
            <p>
              {deviceOnly
                ? 'Sign in to use selfie verification and Ghana Card KYC on this device. Use Sign in, Register, or Admin below.'
                : 'Sign in to share a verification QR / link, or verify Ghana Card KYC on this device.'}
            </p>
          </div>
          <AuthPanel deviceOnly={deviceOnly} />
        </div>
      </div>
    );
  }

  if (section === 'recognition' && isAuthenticated) {
    return (
      <div className={shellClass}>
        {deviceBrand}
        <Header activeApp="recognition" onBackToApps={backToHub} deviceOnly={deviceOnly} />
        <div className="container">
          {nav}
          {!apiReady && (
            <div className="config-banner" role="alert">
              <strong>API not fully configured.</strong>
              <p>
                Missing: <code>{missingConfig.join(', ') || 'unknown'}</code>
              </p>
            </div>
          )}

          {/* Always visible — does not wait for face models */}
          <VerifyShare />

          {modelsLoading && (
            <div className="loading-container" style={{ padding: '1.5rem 0' }}>
              <div className="loading-spinner" />
              <h2>Loading face models for on-device selfie…</h2>
              <p>You can still create and share the QR link above.</p>
            </div>
          )}

          {modelsError && (
            <div className="error-container" style={{ marginBottom: '1rem' }}>
              <h2>Face models issue</h2>
              <p>{modelsError}</p>
              <p>
                QR share still works. On-device selfie may need a refresh after
                models are available.
              </p>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => window.location.reload()}
              >
                Retry models
              </button>
            </div>
          )}

          {modelsReady && <SelfieVerification />}

          <InstallOnDevice deviceOnly={deviceOnly} />
          {isSuperAdmin && <SuperAdminDashboard />}
        </div>
      </div>
    );
  }

  // Fallback hub if section unknown
  return (
    <div className={shellClass}>
      {deviceBrand}
      <Header activeApp="hub" onBackToApps={null} deviceOnly={deviceOnly} />
      <div className="container">
        {nav}
        <AppHub onSelect={openSection} deviceOnly={deviceOnly} />
      </div>
    </div>
  );
}

export default App;
