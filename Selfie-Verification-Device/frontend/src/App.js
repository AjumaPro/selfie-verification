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
import { useAuth } from './context/AuthContext';
import { loadModels } from './services/faceDetection';
import apiConfig from './config/api';

/**
 * Selfie Verification device package — Image Recognition / KYC only.
 * Meetings lives in the website or Meetings-Device package.
 */
function getVerifySessionIdFromUrl() {
  if (typeof window === 'undefined') return '';
  try {
    const params = new URLSearchParams(window.location.search);
    return String(params.get('verify') || '').trim();
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
        Image Recognition
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
  const deviceOnly = true;
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
    const onPop = () => setVerifySessionId(getVerifySessionIdFromUrl());
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
        if (!cancelled) setModelsReady(true);
      })
      .catch((err) => {
        if (!cancelled) {
          setModelsError(err?.message || 'Could not load face models');
        }
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, section, modelsReady]);

  const openSection = (next) => {
    if (next === 'meetings') return;
    setSection(next);
  };

  const backToHub = () => setSection('hub');

  const leaveVerifyPage = () => {
    setVerifySessionId('');
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('verify');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    } catch {
      /* ignore */
    }
  };

  const shellClass = 'App App--device';
  const deviceBrand = (
    <GlicoBrandBar compact product={BRAND.name} tagline="Device · Image Recognition" />
  );

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
            <h2>Image Recognition</h2>
            <p>
              Sign in to use selfie verification and Ghana Card KYC on this device.
              Use Sign in, Register, or Admin below.
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
