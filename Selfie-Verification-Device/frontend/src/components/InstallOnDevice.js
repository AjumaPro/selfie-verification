import React, { useEffect, useState, useCallback } from 'react';
import {
  FaMobileAlt,
  FaDownload,
  FaApple,
  FaAndroid,
  FaDesktop,
  FaCheckCircle,
  FaShareAlt,
  FaWindows,
  FaGlobe,
  FaChrome,
  FaCopy,
  FaLink,
} from 'react-icons/fa';
import MeetingsDeviceDownloads from './MeetingsDeviceDownloads';
import {
  assetUrl,
  resolveDownloadUrl,
  triggerDownload,
} from '../utils/downloadUtils';
import {
  getDeferredInstallPrompt,
  subscribeInstallPrompt,
  promptPwaInstall,
  isPwaInstalled,
} from '../utils/pwaInstall';
import { BRAND } from '../utils/brandAssets';
import './InstallOnDevice.css';

const KYC_FILES = {
  dmg: 'Selfie-Verification-Mac.dmg',
  exe: 'Selfie-Verification-Windows.exe',
};

const MAC_HELP_URL = assetUrl('MAC-INSTALL.txt');

const getPlatform = () => {
  const ua = navigator.userAgent || '';
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isMac = /Mac/i.test(ua) && !isIOS;
  const isWindows = /Win/i.test(ua);
  const isChrome =
    /Chrome|CriOS|Edg|EdgiOS/i.test(ua) && !/OPR|Opera/i.test(ua);
  const isSafari =
    /Safari/i.test(ua) && !/Chrome|CriOS|Chromium|Edg|EdgiOS|Android/i.test(ua);
  const isStandalone = isPwaInstalled();
  return {
    isIOS,
    isAndroid,
    isMac,
    isWindows,
    isChrome,
    isSafari,
    isStandalone,
    isDesktop: !isIOS && !isAndroid,
  };
};

/**
 * Desktop installers (EXE / DMG) + install Web PWA on this device.
 * @param {{ deviceOnly?: boolean }} props
 */
const InstallOnDevice = ({ deviceOnly = false }) => {
  const [deferredPrompt, setDeferredPrompt] = useState(() =>
    getDeferredInstallPrompt()
  );
  const [installed, setInstalled] = useState(() => isPwaInstalled());
  const [busy, setBusy] = useState(false);
  const [dlBusy, setDlBusy] = useState('');
  const [copied, setCopied] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [resolved, setResolved] = useState({
    dmg: null,
    exe: null,
  });
  const [platform] = useState(() => getPlatform());
  // Open by default so PWA install is visible; collapse still available
  const [open, setOpen] = useState(() => !isPwaInstalled());

  useEffect(() => {
    if (platform.isStandalone) setInstalled(true);

    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        Object.entries(KYC_FILES).map(async ([key, name]) => {
          const r = await resolveDownloadUrl(name);
          return [key, r];
        })
      );
      if (cancelled) return;
      const next = {};
      for (const [k, r] of entries) next[k] = r;
      setResolved(next);
    })();

    const unsub = subscribeInstallPrompt((ev) => setDeferredPrompt(ev));
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    const onOpenInstall = () => {
      setOpen(true);
      setShowGuide(true);
    };

    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('glico-open-install', onOpenInstall);
    return () => {
      cancelled = true;
      unsub();
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('glico-open-install', onOpenInstall);
    };
  }, [platform.isStandalone]);

  const handleInstallClick = useCallback(async () => {
    if (deferredPrompt) {
      setBusy(true);
      try {
        const { outcome } = await promptPwaInstall();
        if (outcome === 'accepted') setInstalled(true);
        setDeferredPrompt(getDeferredInstallPrompt());
      } finally {
        setBusy(false);
      }
      return;
    }
    setShowGuide(true);
    const el = document.getElementById('install-pwa-guide');
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [deferredPrompt]);

  const copyAppLink = useCallback(async () => {
    const url = window.location.origin + '/';
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link and open it on your phone:', url);
    }
  }, []);

  const onDownload = useCallback(
    async (key, filename) => {
      setDlBusy(key);
      try {
        let r = resolved[key];
        if (!r || r.source === 'missing') {
          r = await resolveDownloadUrl(KYC_FILES[key] || filename);
        }
        if (!r?.url) {
          window.alert(
            `File not available: ${filename}\n\n` +
              `Place it in frontend/public/downloads/ or build with:\n` +
              `  npm run electron:build`
          );
          return;
        }
        triggerDownload(r.url, filename);
      } finally {
        setDlBusy('');
      }
    },
    [resolved]
  );

  const kycBtn = (key, filename, label, Icon, extraClass = '') => {
    const r = resolved[key];
    const missing = r && r.source === 'missing';
    const checking = r === null;
    return (
      <button
        type="button"
        className={`install-primary-btn ${extraClass} ${missing ? 'is-disabled' : ''}`}
        disabled={missing || dlBusy === key}
        onClick={() => onDownload(key, filename)}
      >
        <Icon />{' '}
        {dlBusy === key ? 'Starting…' : checking ? `${label}…` : label}
      </button>
    );
  };

  const canOneTapInstall = Boolean(deferredPrompt);

  return (
    <section className="install-device" id="install-on-device">
      <button
        type="button"
        className="install-device-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="install-device-title">
          <FaMobileAlt className="install-device-icon" />
          <div>
            <h2>Download &amp; install (optional)</h2>
            <p>Install Web PWA on this device · Windows / Mac desktop apps</p>
          </div>
        </div>
        <span className="install-device-chevron">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="install-device-body">
          {installed ? (
            <div className="install-status success">
              <FaCheckCircle />
              <span>
                App is installed on this device. Open it from your home screen,
                dock, or apps list.
              </span>
            </div>
          ) : (
            <>
              <div className="install-pwa-hero" id="install-pwa-guide">
                <div className="install-pwa-hero-copy">
                  <h3>
                    <FaGlobe aria-hidden /> Install {BRAND.name} on this device
                  </h3>
                  <p>
                    Save it like an app — home screen, dock, or Start menu. No ZIP
                    download required.
                  </p>
                </div>

                <div className="install-pwa-hero-actions">
                  <button
                    type="button"
                    className="install-primary-btn install-pwa-main-btn"
                    onClick={handleInstallClick}
                    disabled={busy}
                  >
                    <FaDownload />
                    {busy
                      ? 'Installing…'
                      : canOneTapInstall
                        ? 'Install on this device'
                        : platform.isIOS
                          ? 'How to add to Home Screen'
                          : platform.isAndroid
                            ? 'How to install on Android'
                            : platform.isSafari
                              ? 'How to add to Dock (Safari)'
                              : 'How to install in browser'}
                  </button>
                  <button
                    type="button"
                    className="install-secondary-btn"
                    onClick={copyAppLink}
                  >
                    {copied ? (
                      <>
                        <FaCheckCircle /> Link copied
                      </>
                    ) : (
                      <>
                        <FaCopy /> Copy app link
                      </>
                    )}
                  </button>
                </div>

                {(showGuide || !canOneTapInstall) && (
                  <div className="install-pwa-guide" role="region" aria-label="PWA install steps">
                    {platform.isIOS && (
                      <ol>
                        <li>
                          Stay in <strong>Safari</strong> on this page.
                        </li>
                        <li>
                          Tap <FaShareAlt className="inline-ico" />{' '}
                          <strong>Share</strong>.
                        </li>
                        <li>
                          Tap <strong>Add to Home Screen</strong>, then{' '}
                          <strong>Add</strong>.
                        </li>
                      </ol>
                    )}
                    {platform.isAndroid && (
                      <ol>
                        <li>
                          Open this site in <strong>Chrome</strong>.
                        </li>
                        <li>
                          Tap menu <strong>⋮</strong> →{' '}
                          <strong>Install app</strong> or{' '}
                          <strong>Add to Home screen</strong>.
                        </li>
                        <li>
                          Or tap <strong>Install on this device</strong> when the
                          red button appears above.
                        </li>
                      </ol>
                    )}
                    {platform.isDesktop && platform.isSafari && (
                      <ol>
                        <li>
                          In Safari menu bar: <strong>File</strong> →{' '}
                          <strong>Add to Dock</strong> (macOS Sonoma+).
                        </li>
                        <li>
                          Or open this link in <strong>Chrome</strong> /{' '}
                          <strong>Edge</strong> for one-tap install.
                        </li>
                        <li>
                          <FaChrome aria-hidden /> Chrome: menu →{' '}
                          <strong>Install GLICO Life Platform…</strong>
                        </li>
                      </ol>
                    )}
                    {platform.isDesktop && !platform.isSafari && (
                      <ol>
                        <li>
                          Click <strong>Install on this device</strong> when it
                          appears (Chrome / Edge).
                        </li>
                        <li>
                          Or browser menu <strong>⋮</strong> →{' '}
                          <strong>Install app</strong> /{' '}
                          <strong>Apps → Install this site as an app</strong>.
                        </li>
                        <li>
                          Launch <strong>{BRAND.name}</strong> from your apps list
                          or dock.
                        </li>
                      </ol>
                    )}
                    <p className="install-pwa-guide-link">
                      <FaLink aria-hidden /> Phone users: copy the app link above,
                      open it on the phone, then follow the steps for that device.
                    </p>
                  </div>
                )}
              </div>

              <div className="install-actions">
                <div className="install-action-card desktop-downloads">
                  <h3>
                    <FaDesktop /> Image Recognition (desktop)
                  </h3>
                  <p>Windows .exe / Mac .dmg for Ghana Card verification.</p>
                  <div className="desktop-btn-row">
                    {kycBtn('exe', KYC_FILES.exe, 'Windows KYC (.exe)', FaWindows)}
                    {kycBtn('dmg', KYC_FILES.dmg, 'Mac KYC (.dmg)', FaApple, 'mac-btn')}
                  </div>
                  <p className="install-note">
                    After install: <strong>Sign in · Register · Admin</strong>.
                  </p>
                  <p className="install-note">
                    <strong>Windows:</strong> run the .exe. SmartScreen → More info → Run
                    anyway.
                    <br />
                    <strong>Mac:</strong> open the .dmg → drag to Applications →
                    Control-click → Open. See{' '}
                    <a href={MAC_HELP_URL} download="MAC-INSTALL.txt">
                      Mac steps
                    </a>
                    .
                  </p>
                </div>

                <div className="install-action-card desktop-downloads install-meetings-col">
                  <h3>
                    <FaDesktop /> Meetings (desktop)
                  </h3>
                  <p>
                    Windows / Mac Meetings app — check-in QR, venue map, booking (no
                    KYC login).
                  </p>
                  <MeetingsDeviceDownloads compact />
                </div>
              </div>

              <div className="install-steps">
                <article
                  id="install-desktop-pwa"
                  className={`install-step ${platform.isDesktop ? 'highlight' : ''}`}
                >
                  <div className="install-step-badge">
                    <FaGlobe /> Laptop (PWA)
                  </div>
                  <ol>
                    <li>
                      Prefer <strong>Chrome</strong> or <strong>Edge</strong> for
                      one-tap install.
                    </li>
                    <li>
                      Use <strong>Install on this device</strong> above, or menu →{' '}
                      <strong>Install app</strong>.
                    </li>
                    <li>
                      Launch <strong>{BRAND.name}</strong> from apps / dock.
                    </li>
                  </ol>
                </article>

                <article
                  id="install-android"
                  className={`install-step ${platform.isAndroid ? 'highlight' : ''}`}
                >
                  <div className="install-step-badge">
                    <FaAndroid /> Android
                  </div>
                  <ol>
                    <li>
                      Open in <strong>Chrome</strong>.
                    </li>
                    <li>
                      Tap <strong>Install on this device</strong> or menu →{' '}
                      <strong>Install app</strong>.
                    </li>
                  </ol>
                </article>

                <article
                  id="install-ios"
                  className={`install-step ${platform.isIOS ? 'highlight' : ''}`}
                >
                  <div className="install-step-badge">
                    <FaApple /> iPhone / iPad
                  </div>
                  <ol>
                    <li>
                      Open in <strong>Safari</strong>.
                    </li>
                    <li>
                      Tap <FaShareAlt className="inline-ico" /> Share →{' '}
                      <strong>Add to Home Screen</strong>.
                    </li>
                  </ol>
                </article>

                <article id="install-desktop" className="install-step">
                  <div className="install-step-badge">
                    <FaDesktop /> Desktop .exe / .dmg
                  </div>
                  <ol>
                    <li>
                      {platform.isMac
                        ? 'Download the Mac .dmg'
                        : 'Download the Windows .exe'}
                    </li>
                    <li>Run the installer (Windows) or drag to Applications (Mac).</li>
                    <li>
                      Launch <strong>{BRAND.name}</strong> from your apps list.
                    </li>
                  </ol>
                </article>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
};

export default InstallOnDevice;
