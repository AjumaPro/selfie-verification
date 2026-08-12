import React, { useCallback, useEffect, useState } from 'react';
import { FaDownload, FaMobileAlt, FaCheckCircle } from 'react-icons/fa';
import MeetingsApp from './components/MeetingsApp';
import MeetingJoin from './components/MeetingJoin';
import BookingGuest from './components/BookingGuest';
import GlicoLifeLogo from './components/GlicoLifeLogo';
import { BRAND } from './utils/brandAssets';
import './App.css';

function getQueryParam(name) {
  if (typeof window === 'undefined') return '';
  try {
    return String(new URLSearchParams(window.location.search).get(name) || '').trim();
  } catch {
    return '';
  }
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

/**
 * GLICO Life Meetings PWA — schedule, QR check-in, venue map, booking.
 */
function App() {
  const [joinId, setJoinId] = useState(() => getQueryParam('join'));
  const [bookId, setBookId] = useState(() => getQueryParam('book'));
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [installHint, setInstallHint] = useState('');

  useEffect(() => {
    const onPop = () => {
      setJoinId(getQueryParam('join'));
      setBookId(getQueryParam('book'));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const onBip = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    window.addEventListener('appinstalled', () => {
      setInstalled(true);
      setDeferredPrompt(null);
    });
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  const clearParam = useCallback((key) => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete(key);
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    } catch {
      /* ignore */
    }
  }, []);

  const leaveJoin = () => {
    setJoinId('');
    clearParam('join');
  };

  const leaveBook = () => {
    setBookId('');
    clearParam('book');
  };

  const onInstall = async () => {
    setInstallHint('');
    if (installed) return;
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice.catch(() => null);
      setDeferredPrompt(null);
      if (choice && choice.outcome === 'accepted') setInstalled(true);
      return;
    }
    const ua = navigator.userAgent || '';
    if (
      /iPad|iPhone|iPod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    ) {
      setInstallHint('iOS: tap Share → Add to Home Screen');
    } else if (/Android/i.test(ua)) {
      setInstallHint('Android: browser menu → Install app / Add to Home screen');
    } else {
      setInstallHint('Use your browser Install icon, or menu → Install GLICO Life Meetings');
    }
  };

  if (joinId) {
    return <MeetingJoin meetingId={joinId} onClose={leaveJoin} />;
  }

  if (bookId) {
    return <BookingGuest pageId={bookId} onClose={leaveBook} />;
  }

  return (
    <div className="meetings-pwa">
      <div className="glico-brand-stripes" aria-hidden>
        <span className="stripe stripe-red" />
        <span className="stripe stripe-sky" />
        <span className="stripe stripe-navy" />
      </div>
      <header className="meetings-pwa-header">
        <div className="meetings-pwa-brand">
          <GlicoLifeLogo compact markClassName="meetings-pwa-logo" />
          <div>
            <h1>{BRAND.meetingsName}</h1>
            <p>{BRAND.name} · schedule · QR · booking</p>
          </div>
        </div>
        <div className="meetings-pwa-actions">
          <button
            type="button"
            className={`meetings-pwa-install ${installed ? 'installed' : ''}`}
            onClick={onInstall}
            disabled={installed}
          >
            {installed ? (
              <>
                <FaCheckCircle aria-hidden /> Installed
              </>
            ) : (
              <>
                <FaDownload aria-hidden /> Install app
              </>
            )}
          </button>
        </div>
      </header>

      <main className="meetings-pwa-main">
        <div className="meetings-pwa-banner">
          <strong>
            <FaMobileAlt aria-hidden /> Meetings-only device app
          </strong>
          <p style={{ margin: '0.35rem 0 0' }}>
            Same features as the website Meetings section — no sign-in, no Image
            Recognition. Guests open QR / booking links on any phone.
          </p>
          <div className="meetings-pwa-features" aria-label="Features">
            <span className="meetings-pwa-chip">Create &amp; edit</span>
            <span className="meetings-pwa-chip">Calendar</span>
            <span className="meetings-pwa-chip">Recurring series</span>
            <span className="meetings-pwa-chip">QR check-in</span>
            <span className="meetings-pwa-chip">Venue GPS</span>
            <span className="meetings-pwa-chip">Meals</span>
            <span className="meetings-pwa-chip">Program file</span>
            <span className="meetings-pwa-chip">Book with me</span>
            <span className="meetings-pwa-chip">Attendance</span>
          </div>
          {installHint && (
            <p style={{ margin: '0.55rem 0 0', color: '#0b5f8a', fontWeight: 650 }}>
              {installHint}
            </p>
          )}
        </div>

        <MeetingsApp />
      </main>
    </div>
  );
}

export default App;
