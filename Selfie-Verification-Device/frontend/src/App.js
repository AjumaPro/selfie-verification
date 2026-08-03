import React, { useState, useEffect } from 'react';
import './App.css';
import Header from './components/Header';
import AuthPanel from './components/AuthPanel';
import InstallOnDevice from './components/InstallOnDevice';
import SelfieVerification from './components/SelfieVerification';
import SuperAdminDashboard from './components/SuperAdminDashboard';
import AppHub from './components/AppHub';
import MeetingsApp from './components/MeetingsApp';
import { useAuth } from './context/AuthContext';
import { loadModels } from './services/faceDetection';
import apiConfig from './config/api';

const APP_SECTION_KEY = 'glico_active_app_v1';

function readSavedSection() {
  try {
    const v = sessionStorage.getItem(APP_SECTION_KEY);
    if (v === 'recognition' || v === 'meetings' || v === 'hub') return v;
  } catch {
    /* ignore */
  }
  return 'hub';
}

function App() {
  const { isAuthenticated, isSuperAdmin, booting } = useAuth();
  const [section, setSection] = useState(readSavedSection);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [modelsError, setModelsError] = useState(null);
  const apiReady = apiConfig.isAutoVerificationEnabled;
  const missingConfig = apiConfig.missingConfig || [];

  useEffect(() => {
    try {
      sessionStorage.setItem(APP_SECTION_KEY, section);
    } catch {
      /* ignore */
    }
  }, [section]);

  useEffect(() => {
    if (!isAuthenticated) {
      setSection('hub');
      setModelsLoading(false);
      setModelsReady(false);
      setModelsError(null);
    }
  }, [isAuthenticated]);

  // Face models only when using Image Recognition
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

  if (booting) {
    return (
      <div className="App">
        <Header />
        <div className="container">
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <h2>Checking session…</h2>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="App">
        <Header />
        <div className="container">
          <AuthPanel />
        </div>
      </div>
    );
  }

  if (section === 'hub') {
    return (
      <div className="App">
        <Header activeApp="hub" onBackToApps={null} />
        <div className="container">
          {isSuperAdmin && <SuperAdminDashboard />}
          <AppHub onSelect={openSection} isSuperAdmin={isSuperAdmin} />
        </div>
      </div>
    );
  }

  if (section === 'meetings') {
    return (
      <div className="App">
        <Header activeApp="meetings" onBackToApps={backToHub} />
        <div className="container">
          {isSuperAdmin && <SuperAdminDashboard />}
          <MeetingsApp />
        </div>
      </div>
    );
  }

  // Image Recognition
  if (modelsLoading) {
    return (
      <div className="App">
        <Header activeApp="recognition" onBackToApps={backToHub} />
        <div className="container">
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <h2>Loading Face Detection Models...</h2>
            <p>This may take a few moments on first load</p>
          </div>
        </div>
      </div>
    );
  }

  if (modelsError) {
    return (
      <div className="App">
        <Header activeApp="recognition" onBackToApps={backToHub} />
        <div className="container">
          <div className="error-container">
            <h2>Error Loading Models</h2>
            <p>{modelsError}</p>
            <p>Please make sure the models are in the /public/models directory</p>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!modelsReady) return null;

  return (
    <div className="App">
      <Header activeApp="recognition" onBackToApps={backToHub} />
      <div className="container">
        {isSuperAdmin && <SuperAdminDashboard />}

        {!apiReady && (
          <div className="config-banner" role="alert">
            <strong>API not fully configured.</strong>
            <p>
              Verify Selfie needs KYC credentials baked into the UI build.
              Missing: <code>{missingConfig.join(', ') || 'unknown'}</code>
            </p>
            <p>
              On DigitalOcean, set <code>REACT_APP_*</code> as{' '}
              <strong>Build Time</strong>, then <strong>Force Rebuild and Deploy</strong>.
              Locally use <code>frontend/.env</code> and <code>npm start</code>.
            </p>
          </div>
        )}
        <InstallOnDevice />
        <SelfieVerification />
      </div>
    </div>
  );
}

export default App;
