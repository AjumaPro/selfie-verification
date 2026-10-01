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
import VerifyJoin from './components/VerifyJoin';
import VerifyShare from './components/VerifyShare';
import VerificationDashboard from './components/VerificationDashboard';
import { useAuth } from './context/AuthContext';
import { loadModels } from './services/faceDetection';
import apiConfig from './config/api';

/**
 * Device / Windows-Mac installer builds: Ghana Card KYC only.
 * Set REACT_APP_DEVICE_APP=true for Electron (see electron-build.js).
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

function getVerifySessionIdFromUrl() {
  if (typeof window === 'undefined') return '';
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = String(params.get('verify') || '').trim();
    if (fromQuery) return fromQuery;
    const path = String(window.location.pathname || '');
    const match = path.match(/^\/verify\/([A-Za-z0-9_-]+)\/?$/);
    return match ? match[1] : '';
  } catch {
    return '';
  }
}

function AppNav({ section, onChange, isAuthenticated }) {
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
        ID Verification
        {!isAuthenticated && (
          <span className="app-nav-lock" title="Sign in required">
            · sign in
          </span>
        )}
      </button>
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
  const [verifySessionId, setVerifySessionId] = useState(() =>
    getVerifySessionIdFromUrl()
  );
  const apiReady = apiConfig.isAutoVerificationEnabled;
  const missingConfig = apiConfig.missingConfig || [];

  useEffect(() => {
    const sync = () => setDeviceOnly(isDeviceAppBuild());
    sync();
    const t = window.setTimeout(sync, 80);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const onPop = () => {
      setVerifySessionId(getVerifySessionIdFromUrl());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

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

  const openSection = (next) => setSection(next);
  const backToHub = () => setSection('hub');

  const shellClass = deviceOnly ? 'App App--device' : 'App';
  const deviceBrand = deviceOnly ? (
    <GlicoBrandBar
      product={BRAND.name}
      tagline="Member KYC · Ghana Card · Windows & Mac"
    />
  ) : null;

  const leaveVerifyPage = () => {
    setVerifySessionId('');
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('verify');
      if (/^\/verify\//i.test(url.pathname)) {
        url.pathname = '/';
      }
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    } catch {
      /* ignore */
    }
    setSection('hub');
  };

  if (verifySessionId) {
    return (
      <VerifyJoin sessionId={verifySessionId} onClose={leaveVerifyPage} />
    );
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
    />
  );

  if (section === 'hub') {
    return (
      <div className={shellClass}>
        {deviceBrand}
        <Header activeApp="hub" onBackToApps={null} deviceOnly={deviceOnly} />
        <div className="container">
          {nav}
          <AppHub onSelect={openSection} deviceOnly={deviceOnly} />
          {isAuthenticated && <VerificationDashboard />}
          {isAuthenticated && isSuperAdmin && <SuperAdminDashboard />}
        </div>
      </div>
    );
  }

  if (section === 'recognition' && !isAuthenticated) {
    return (
      <div className={shellClass}>
        {deviceBrand}
        <Header activeApp="recognition" onBackToApps={backToHub} deviceOnly={deviceOnly} />
        <div className="container">
          {nav}
          <div className="app-auth-banner">
            <h2>ID Verification</h2>
            <p>
              {deviceOnly
                ? 'Sign in with your GLICO Pensions account to run Ghana Card KYC on this device.'
                : 'Sign in to share a verification QR, or complete Ghana Card KYC on this workstation.'}
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

          {isAuthenticated && <VerificationDashboard />}
          <InstallOnDevice deviceOnly={deviceOnly} />
          {isSuperAdmin && <SuperAdminDashboard />}
        </div>
      </div>
    );
  }

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
