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
} from 'react-icons/fa';
import MeetingsDeviceDownloads from './MeetingsDeviceDownloads';
import {
  assetUrl,
  resolveDownloadUrl,
  triggerDownload,
} from '../utils/downloadUtils';
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
 * Desktop installers (EXE / DMG) + install Web PWA on this device.
 * @param {{ deviceOnly?: boolean }} props
 */
const InstallOnDevice = ({ deviceOnly = false }) => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dlBusy, setDlBusy] = useState('');
  const [resolved, setResolved] = useState({
    dmg: null,
    exe: null,
  });
  const [platform] = useState(() => getPlatform());
  const [open, setOpen] = useState(false);

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
    const onOpenInstall = () => setOpen(true);

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('glico-open-install', onOpenInstall);
    return () => {
      cancelled = true;
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('glico-open-install', onOpenInstall);
    };
  }, [platform.isStandalone]);

  const handleInstallClick = useCallback(async () => {
    if (deferredPrompt) {
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
      return;
    }
    const el = document.getElementById(
      platform.isIOS ? 'install-ios' : platform.isAndroid ? 'install-android' : 'install-desktop-pwa'
    );
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
            <p>Desktop installers &amp; install Web PWA on this device</p>
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
                App is installed on this device. Open it from your home screen or apps list.
              </span>
            </div>
          ) : (
            <>
              <div className="install-actions">
                <div className="install-action-card install-pwa-card">
                  <h3>
                    <FaGlobe /> Install Web PWA on this device
                  </h3>
                  <p>
                    Add GLICO Life Platform to your phone or laptop — works in the browser, no
                    ZIP file.
                  </p>
                  <button
                    type="button"
                    className="install-primary-btn"
                    onClick={handleInstallClick}
                    disabled={busy}
                  >
                    <FaDownload />
                    {busy
                      ? 'Installing…'
                      : deferredPrompt
                        ? 'Install on this device'
                        : platform.isIOS
                          ? 'Show iPhone / iPad steps'
                          : platform.isAndroid
                            ? 'Show Android steps'
                            : 'Show browser install steps'}
                  </button>
                  {!deferredPrompt && !platform.isIOS && (
                    <p className="install-note">
                      On Chrome / Edge: menu (⋮) → <strong>Install app</strong> or{' '}
                      <strong>Add to Home screen</strong>.
                    </p>
                  )}
                </div>

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
                    <strong>Windows:</strong> run the .exe. SmartScreen → More info → Run anyway.
                    <br />
                    <strong>Mac:</strong> open the .dmg → drag to Applications → Control-click →
                    Open. See{' '}
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
                      Open this site in <strong>Chrome</strong> or <strong>Edge</strong>.
                    </li>
                    <li>
                      Click <strong>Install on this device</strong> above, or browser menu →{' '}
                      <strong>Install app</strong>.
                    </li>
                    <li>
                      Launch <strong>{BRAND.name}</strong> from your apps list / dock.
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
                    <li>
                      Tap <strong>Install on this device</strong> or menu →{' '}
                      <strong>Install app</strong> / <strong>Add to Home screen</strong>.
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

                <article
                  id="install-desktop"
                  className="install-step"
                >
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
