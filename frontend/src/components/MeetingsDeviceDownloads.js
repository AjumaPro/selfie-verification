import React, { useEffect, useState, useCallback } from 'react';
import {
  FaApple,
  FaWindows,
  FaMobileAlt,
  FaGlobe,
  FaDownload,
} from 'react-icons/fa';
import {
  resolveDownloadUrl,
  resolveFirstDownloadUrl,
  triggerDownload,
  isLocalDevHost,
} from '../utils/downloadUtils';
import './MeetingsDeviceDownloads.css';

const FILES = {
  exe: 'Glico-Meetings-Windows.exe',
  /** Prefer .dmg; fall back to desktop .zip package until .dmg is published */
  macCandidates: ['Glico-Meetings-Mac.dmg', 'Glico-Meetings-Mac.zip'],
};

/** Browser / PWA URL for Meetings (no web ZIP package). */
export function getMeetingsWebPwaUrl() {
  const fromEnv = String(process.env.REACT_APP_MEETINGS_PWA_URL || '').trim();
  if (fromEnv) return fromEnv;
  if (typeof window === 'undefined') return '';
  if (isLocalDevHost()) {
    const { protocol, hostname, port } = window.location;
    if (port === '3002') return `${protocol}//${hostname}:3002/`;
    return `${protocol}//${hostname}:3002/`;
  }
  try {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('app', 'meetings');
    return url.toString();
  } catch {
    return `${window.location.origin}/?app=meetings`;
  }
}

function isStandalonePwa() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

/**
 * Meetings: Windows .exe · Mac (.dmg or desktop package) · Install Web PWA.
 */
const MeetingsDeviceDownloads = ({
  compact = false,
  showOpenPwa = true,
  className = '',
}) => {
  const [resolved, setResolved] = useState({
    exe: null,
    mac: null,
  });
  const [busy, setBusy] = useState('');
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [pwaInstalled, setPwaInstalled] = useState(() => isStandalonePwa());
  const [pwaBusy, setPwaBusy] = useState(false);
  const pwaUrl = getMeetingsWebPwaUrl();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [exe, mac] = await Promise.all([
        resolveDownloadUrl(FILES.exe),
        resolveFirstDownloadUrl(FILES.macCandidates),
      ]);
      if (cancelled) return;
      setResolved({ exe, mac });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isStandalonePwa()) setPwaInstalled(true);
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onInstalled = () => {
      setPwaInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const onDownload = useCallback(
    async (key) => {
      setBusy(key);
      try {
        let r = resolved[key];
        if (!r || r.source === 'missing') {
          if (key === 'exe') r = await resolveDownloadUrl(FILES.exe);
          else if (key === 'mac') r = await resolveFirstDownloadUrl(FILES.macCandidates);
        }
        if (!r?.url) {
          window.alert(
            key === 'mac'
              ? 'Mac Meetings installer not available yet. Use Install PWA, or build Glico-Meetings-Mac.dmg.'
              : `File not available: ${FILES.exe}`
          );
          return;
        }
        triggerDownload(r.url, r.filename || (key === 'exe' ? FILES.exe : 'Glico-Meetings-Mac'));
      } finally {
        setBusy('');
      }
    },
    [resolved]
  );

  const installPwaOnDevice = useCallback(async () => {
    if (pwaInstalled) {
      if (pwaUrl) window.open(pwaUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (deferredPrompt) {
      setPwaBusy(true);
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') setPwaInstalled(true);
        setDeferredPrompt(null);
      } catch (err) {
        console.warn('PWA install failed:', err);
      } finally {
        setPwaBusy(false);
      }
      return;
    }
    window.dispatchEvent(new CustomEvent('glico-open-install'));
    const panel = document.getElementById('install-on-device');
    if (panel) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (pwaUrl) window.open(pwaUrl, '_blank', 'noopener,noreferrer');
  }, [deferredPrompt, pwaInstalled, pwaUrl]);

  const ready = (key) => resolved[key] !== null;
  const ok = (key) => resolved[key] && resolved[key].source !== 'missing';

  const macFilename = resolved.mac?.filename || '';
  const macIsDmg = /\.dmg$/i.test(macFilename);

  const items = [];
  if (!ready('exe') || ok('exe')) {
    items.push({
      key: 'exe',
      title: 'Windows',
      sub: '.exe installer',
      Icon: FaWindows,
      tone: 'win',
      kind: 'download',
    });
  }

  if (!ready('mac') || ok('mac')) {
    items.push({
      key: 'mac',
      title: 'Mac',
      sub: macIsDmg || !ready('mac') ? '.dmg installer' : 'desktop installer',
      Icon: FaApple,
      tone: 'mac',
      kind: 'download',
    });
  }

  if (showOpenPwa) {
    items.push({
      key: 'pwa',
      title: pwaInstalled ? 'Web PWA' : 'Install PWA',
      sub: pwaInstalled
        ? 'Open on this device'
        : deferredPrompt
          ? 'Add to this device'
          : 'Add to home screen',
      Icon: pwaInstalled ? FaGlobe : FaDownload,
      tone: 'web',
      kind: 'pwa',
    });
  }

  const cols = Math.min(Math.max(items.length, 1), 3);

  return (
    <div className={`meet-device-dl ${compact ? 'compact' : ''} ${className}`.trim()}>
      {!compact && (
        <div className="meet-device-dl-head">
          <FaMobileAlt aria-hidden />
          <div>
            <strong>Meetings on this device</strong>
            <p>Desktop installers or install the web app (PWA)</p>
          </div>
        </div>
      )}

      <div
        className={`meet-device-dl-grid meet-device-dl-grid--${cols}`}
        role="group"
        aria-label="Meetings downloads"
      >
        {items.map((item) => {
          const { key, title, sub, Icon, tone, kind } = item;
          if (kind === 'pwa') {
            return (
              <button
                key={key}
                type="button"
                className={`meet-dl-btn meet-dl-tone-${tone}`}
                disabled={pwaBusy}
                onClick={installPwaOnDevice}
              >
                <span className="meet-dl-btn-icon" aria-hidden>
                  <Icon />
                </span>
                <span className="meet-dl-btn-text">
                  <span className="meet-dl-btn-title">
                    {pwaBusy ? 'Installing…' : title}
                  </span>
                  <span className="meet-dl-btn-sub">{sub}</span>
                </span>
              </button>
            );
          }
          const waiting = !ready(key);
          const missing = ready(key) && !ok(key);
          return (
            <button
              key={key}
              type="button"
              className={`meet-dl-btn meet-dl-tone-${tone} ${missing ? 'is-disabled' : ''}`}
              disabled={missing || busy === key || waiting}
              onClick={() => onDownload(key)}
            >
              <span className="meet-dl-btn-icon" aria-hidden>
                <Icon />
              </span>
              <span className="meet-dl-btn-text">
                <span className="meet-dl-btn-title">
                  {busy === key ? 'Starting…' : waiting ? 'Checking…' : title}
                </span>
                <span className="meet-dl-btn-sub">{sub}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MeetingsDeviceDownloads;
