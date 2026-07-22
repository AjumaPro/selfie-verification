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
import './InstallOnDevice.css';

const BASE = process.env.PUBLIC_URL || '';
const ZIP_URL = `${BASE}/downloads/selfie-verification-ui.zip`;
const DMG_URL = `${BASE}/downloads/Selfie-Verification-Mac.dmg`;
const MAC_ZIP_URL = `${BASE}/downloads/Selfie-Verification-Mac.zip`;
const EXE_URL = `${BASE}/downloads/Selfie-Verification-Windows.exe`;
const MAC_HELP_URL = `${BASE}/downloads/MAC-INSTALL.txt`;

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

const checkUrl = async (url) => {
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    if (!res.ok) return false;
    // CRA may return index.html (200) for missing files — reject HTML fallbacks
    const type = (res.headers.get('content-type') || '').toLowerCase();
    if (type.includes('text/html')) return false;
    const len = Number(res.headers.get('content-length') || 0);
    if (len > 0 && len < 10_000) return false; // too small to be an installer
    return true;
  } catch {
    return false;
  }
};

const downloadFile = (url, filename) => {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
};

/**
 * Desktop installers (EXE / DMG) + ZIP + PWA install.
 */
const InstallOnDevice = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState({
    zip: null,
    dmg: null,
    macZip: null,
    exe: null,
  });
  const [platform] = useState(() => getPlatform());
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (platform.isStandalone) setInstalled(true);

    Promise.all([
      checkUrl(ZIP_URL),
      checkUrl(DMG_URL),
      checkUrl(MAC_ZIP_URL),
      checkUrl(EXE_URL),
    ]).then(([zip, dmg, macZip, exe]) =>
      setAvailable({ zip, dmg, macZip, exe })
    );

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
                    <FaDesktop /> Desktop installers
                  </h3>
                  <p>Download a native app installer for your computer.</p>
                  <div className="desktop-btn-row">
                    <a
                      className={`install-primary-btn ${available.exe === false ? 'is-disabled' : ''}`}
                      href={EXE_URL}
                      download="Selfie-Verification-Windows.exe"
                    >
                      <FaWindows /> Download for Windows (.exe)
                    </a>
                    <a
                      className={`install-primary-btn mac-btn ${available.dmg === false ? 'is-disabled' : ''}`}
                      href={DMG_URL}
                      download="Selfie-Verification-Mac.dmg"
                    >
                      <FaApple /> Download for Mac (.dmg)
                    </a>
                    <a
                      className={`install-primary-btn mac-btn ${available.macZip === false ? 'is-disabled' : ''}`}
                      href={MAC_ZIP_URL}
                      download="Selfie-Verification-Mac.zip"
                    >
                      <FaApple /> Mac app (.zip)
                    </a>
                  </div>
                  {(available.exe === false ||
                    available.dmg === false ||
                    available.macZip === false) && (
                    <p className="install-note">
                      If a download fails, run <code>npm run electron:build</code> then refresh.
                    </p>
                  )}
                  <p className="install-note">
                    <strong>Windows:</strong> run the .exe. If SmartScreen appears, click{' '}
                    <em>More info</em> → <strong>Run anyway</strong>.
                    <br />
                    <strong>Mac:</strong> new builds are ~80–120&nbsp;MB (not 500&nbsp;MB). Open the
                    .dmg → drag to Applications. If you see “developer cannot be verified”, that is
                    expected for unsigned builds — in Finder{' '}
                    <strong>Control‑click the app → Open → Open</strong>, or use{' '}
                    <em>System Settings → Privacy &amp; Security → Open Anyway</em>.{' '}
                    <a href={MAC_HELP_URL} download="MAC-INSTALL.txt">
                      Full Mac steps
                    </a>
                    .
                  </p>
                </div>

                <div className="install-action-card">
                  <h3>
                    <FaFileArchive /> Web package (ZIP)
                  </h3>
                  <p>Portable UI folder for any platform (needs a browser).</p>
                  <button
                    type="button"
                    className="install-primary-btn secondary-action"
                    onClick={() => downloadFile(ZIP_URL, 'selfie-verification-ui.zip')}
                    disabled={available.zip === false}
                  >
                    <FaDownload />
                    {available.zip === false ? 'ZIP not ready' : 'Download UI (ZIP)'}
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
                    <li>Launch <strong>GLICO Platform</strong> from your apps list.</li>
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
                    <li>Open this site in <strong>Chrome</strong>.</li>
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
                    <li>Open in <strong>Safari</strong>.</li>
                    <li>
                      Tap <FaShareAlt className="inline-ico" /> Share → <strong>Add to Home Screen</strong>.
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
