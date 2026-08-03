import React, { useState, useEffect } from 'react';
import './App.css';
import Header from './components/Header';
import AuthPanel from './components/AuthPanel';
import InstallOnDevice from './components/InstallOnDevice';
import SelfieVerification from './components/SelfieVerification';
import SuperAdminDashboard from './components/SuperAdminDashboard';
import AppHub from './components/AppHub';
import MeetingsApp from './components/MeetingsApp';
import MeetingJoin from './components/MeetingJoin';
import BookingGuest from './components/BookingGuest';
import { useAuth } from './context/AuthContext';
import { loadModels } from './services/faceDetection';
import apiConfig from './config/api';

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

/**
 * Public hub + app nav.
 * Meetings never requires login. Image Recognition does.
 */
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
      <button
        type="button"
        className={`app-nav-btn ${section === 'meetings' ? 'active' : ''}`}
        onClick={() => onChange('meetings')}
      >
        Meetings
        <span className="app-nav-open" title="No login needed">
          · open
        </span>
      </button>
    </nav>
  );
}

function App() {
  const { isAuthenticated, isSuperAdmin, booting } = useAuth();
  // Public default: app home (not forced behind login)
  const [section, setSection] = useState('hub');
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [modelsError, setModelsError] = useState(null);
  const [joinMeetingId, setJoinMeetingId] = useState(() =>
    getJoinMeetingIdFromUrl()
  );
  const [bookPageId, setBookPageId] = useState(() => getBookPageIdFromUrl());
  const apiReady = apiConfig.isAutoVerificationEnabled;
  const missingConfig = apiConfig.missingConfig || [];

  useEffect(() => {
    const onPop = () => {
      setJoinMeetingId(getJoinMeetingIdFromUrl());
      setBookPageId(getBookPageIdFromUrl());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

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

  const openSection = (next) => setSection(next);
  const backToHub = () => setSection('hub');

  const leaveJoinPage = () => {
    setJoinMeetingId('');
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('join');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    } catch {
      /* ignore */
    }
    setSection('meetings');
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
    setSection('meetings');
  };

  // Public QR check-in (no login)
  if (joinMeetingId) {
    return (
      <MeetingJoin meetingId={joinMeetingId} onClose={leaveJoinPage} />
    );
  }

  // Public guest booking (no login)
  if (bookPageId) {
    return <BookingGuest pageId={bookPageId} onClose={leaveBookPage} />;
  }

  if (booting) {
    return (
      <div className="App">
        <Header activeApp="hub" />
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

  // ——— Public home: both apps (Meetings free, Recognition needs sign-in) ———
  if (section === 'hub') {
    return (
      <div className="App">
        <Header activeApp="hub" onBackToApps={null} />
        <div className="container">
          {nav}
          <AppHub onSelect={openSection} />
          {isAuthenticated && isSuperAdmin && <SuperAdminDashboard />}
        </div>
      </div>
    );
  }

  // ——— Meetings: always public, never under login ———
  if (section === 'meetings') {
    return (
      <div className="App">
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
      <div className="App">
        <Header activeApp="recognition" onBackToApps={backToHub} />
        <div className="container">
          {nav}
          <div className="app-auth-banner">
            <h2>Image Recognition</h2>
            <p>
              Sign in to use selfie verification and Ghana Card KYC. Meetings stay
              available without an account — use the <strong>Meetings</strong> tab.
            </p>
          </div>
          <AuthPanel />
        </div>
      </div>
    );
  }

  if (modelsLoading) {
    return (
      <div className="App">
        <Header activeApp="recognition" onBackToApps={backToHub} />
        <div className="container">
          {nav}
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
          {nav}
          <div className="error-container">
            <h2>Error Loading Models</h2>
            <p>{modelsError}</p>
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
        {nav}
        {isSuperAdmin && <SuperAdminDashboard />}

        {!apiReady && (
          <div className="config-banner" role="alert">
            <strong>API not fully configured.</strong>
            <p>
              Missing: <code>{missingConfig.join(', ') || 'unknown'}</code>
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
