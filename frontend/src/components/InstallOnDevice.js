import React, { useEffect, useState, useCallback } from 'react';
import {
  FaMobileAlt,
  FaDownload,
  FaApple,
  FaAndroid,
  FaDesktop,
  FaCheckCircle,
  FaShareAlt,
  FaFileArchive,
  FaWindows,
} from 'react-icons/fa';
import MeetingsDeviceDownloads from './MeetingsDeviceDownloads';
import {
  assetUrl,
  resolveDownloadUrl,
  triggerDownload,
} from '../utils/downloadUtils';
import './InstallOnDevice.css';

const KYC_FILES = {
  zip: 'selfie-verification-ui.zip',
  dmg: 'Selfie-Verification-Mac.dmg',
  macZip: 'Selfie-Verification-Mac.zip',
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
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  return {
    isIOS,
    isAndroid,
    isMac,
    isWindows,
    isStandalone,
    isDesktop: !isIOS && !isAndroid,
  };
};

/**
 * Desktop installers (EXE / DMG) + ZIP + PWA install.
 * Same-origin /downloads first (LAN + local + DO when files are in the build).
 * @param {{ deviceOnly?: boolean }} props
 */
const InstallOnDevice = ({ deviceOnly = false }) => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dlBusy, setDlBusy] = useState('');
  const [resolved, setResolved] = useState({
    zip: null,
    dmg: null,
    macZip: null,
    exe: null,
  });
  const [platform] = useState(() => getPlatform());
  const [open, setOpen] = useState(true);

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

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      cancelled = true;
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [platform.isStandalone]);

  const handleInstallClick = useCallback(async () => {
    if (!deferredPrompt) {
      const el = document.getElementById(
        platform.isIOS ? 'install-ios' : platform.isAndroid ? 'install-android' : 'install-desktop'
      );
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setBusy(true);
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setInstalled(true);
      setDeferredPrompt(null);
    } catch (err) {
      console.warn('Install prompt failed:', err);
    } finally {
      setBusy(false);
    }
  }, [deferredPrompt, platform]);

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
              `  npm run electron:build\n` +
              `  npm run package:download`
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

  const zipMissing = resolved.zip && resolved.zip.source === 'missing';
  const zipChecking = resolved.zip === null;

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
            <h2>Download &amp; install</h2>
            <p>Windows .exe · Mac .dmg / .zip · UI ZIP · or install in browser</p>
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
                App is installed on this device. Open it from your home screen or Applications.
              </span>
            </div>
          ) : (
            <>
              <div className="install-actions">
                <div className="install-action-card desktop-downloads">
                  <h3>
                    <FaDesktop /> Image Recognition (desktop)
                  </h3>
                  <p>Windows / Mac KYC installers for Ghana Card verification.</p>
                  <div className="desktop-btn-row">
                    {kycBtn('exe', KYC_FILES.exe, 'Windows KYC (.exe)', FaWindows)}
                    {kycBtn('dmg', KYC_FILES.dmg, 'Mac KYC (.dmg)', FaApple, 'mac-btn')}
                    {kycBtn('macZip', KYC_FILES.macZip, 'Mac KYC (.zip)', FaApple, 'mac-btn')}
                  </div>
                  <p className="install-note">
                    After install: <strong>Sign in · Register · Admin</strong>. KYC only — Meetings
                    is the separate column below / on Home.
                  </p>
                  <p className="install-note">
                    <strong>Windows:</strong> run the .exe. SmartScreen → More info → Run anyway.
                    <br />
                    <strong>Mac:</strong> Control-click app → Open. See{' '}
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
                    Windows / Mac Meetings app — check-in QR, venue map, booking (no KYC login).
                  </p>
                  <MeetingsDeviceDownloads compact />
                </div>

                <div className="install-action-card">
                  <h3>
                    <FaFileArchive /> Web package (ZIP)
                  </h3>
                  <p>Portable UI folder for any platform (needs a browser).</p>
                  <button
                    type="button"
                    className={`install-primary-btn secondary-action ${zipMissing ? 'is-disabled' : ''}`}
                    onClick={() => onDownload('zip', KYC_FILES.zip)}
                    disabled={zipMissing || dlBusy === 'zip'}
                  >
                    <FaDownload />
                    {dlBusy === 'zip'
                      ? 'Starting…'
                      : zipMissing
                        ? 'ZIP not ready'
                        : zipChecking
                          ? 'Checking ZIP…'
                          : 'Download UI (ZIP)'}
                  </button>
                </div>
                <div className="install-action-card">
                  <h3>
                    <FaDownload /> Install in browser
                  </h3>
                  <p>Add this site as an app on phone or laptop (PWA).</p>
                  <button
                    type="button"
                    className="install-primary-btn secondary-action"
                    onClick={handleInstallClick}
                    disabled={busy}
                  >
                    <FaDownload />
                    {busy
                      ? 'Opening install…'
                      : deferredPrompt
                        ? 'Install on this device'
                        : platform.isIOS
                          ? 'Show iPhone steps'
                          : 'Install via browser'}
                  </button>
                </div>
              </div>

              <div className="install-steps">
                <article
                  id="install-desktop"
                  className={`install-step ${platform.isDesktop ? 'highlight' : ''}`}
                >
                  <div className="install-step-badge">
                    <FaDesktop /> Laptop
                  </div>
                  <ol>
                    <li>
                      {platform.isWindows || (!platform.isMac && !platform.isIOS)
                        ? 'Download the Windows .exe'
                        : 'Download the Mac .dmg'}
                    </li>
                    <li>Run the installer (Windows) or drag to Applications (Mac).</li>
                    <li>
                      Launch <strong>GLICO Platform</strong> from your apps list.
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
                      Open this site in <strong>Chrome</strong>.
                    </li>
                    <li>Tap <strong>Install via browser</strong> or menu → Install app.</li>
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
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
};

export default InstallOnDevice;
