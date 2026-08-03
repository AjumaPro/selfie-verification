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

/** CRA `homepage: "./"` sets PUBLIC_URL to "." which breaks absolute download paths */
const rawPublic = process.env.PUBLIC_URL || '';
const BASE = rawPublic === '.' || rawPublic === './' ? '' : rawPublic.replace(/\/$/, '');

/** GitHub Release assets — reliable on DigitalOcean (files not kept in git) */
const GH_RELEASE_BASE =
  process.env.REACT_APP_DESKTOP_DOWNLOAD_BASE ||
  'https://github.com/AjumaPro/selfie-verification/releases/download/desktop-v2.0.0';

const isBrowserLocal = () => {
  if (typeof window === 'undefined') return true;
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
};

/** Prefer local /downloads when developing; use GitHub Release on hosted apps */
const downloadsRoot = () =>
  isBrowserLocal() ? `${BASE}/downloads` : GH_RELEASE_BASE;

const ZIP_URL = () =>
  isBrowserLocal()
    ? `${BASE}/downloads/selfie-verification-ui.zip`
    : `${GH_RELEASE_BASE}/selfie-verification-ui.zip`;
const DMG_URL = () => `${downloadsRoot()}/Selfie-Verification-Mac.dmg`;
const MAC_ZIP_URL = () => `${downloadsRoot()}/Selfie-Verification-Mac.zip`;
const EXE_URL = () => `${downloadsRoot()}/Selfie-Verification-Windows.exe`;
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

const looksLikeHtml = (type, buf) => {
  const t = (type || '').toLowerCase();
  if (t.includes('text/html')) return true;
  if (!buf || buf.byteLength < 15) return false;
  const head = new TextDecoder().decode(buf.slice(0, 64)).trim().toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html');
};

/** HEAD is unreliable on CRA / some hosts — probe with a tiny ranged GET */
const checkUrl = async (url) => {
  try {
    let res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-1023' },
      cache: 'no-store',
    });
    if (!res.ok && res.status !== 206) {
      res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    }
    if (!res.ok && res.status !== 206) return false;

    const type = res.headers.get('content-type') || '';
    let sample = null;
    try {
      sample = await res.arrayBuffer();
    } catch {
      sample = null;
    }
    if (looksLikeHtml(type, sample)) return false;

    // For 206 Partial Content, Content-Length is the *chunk* size (e.g. 1024),
    // not the file size — use Content-Range total instead.
    const rangeTotal = Number(
      String(res.headers.get('content-range') || '').split('/')[1] || 0
    );
    const contentLen = Number(res.headers.get('content-length') || 0);
    const fileSize = rangeTotal > 0 ? rangeTotal : contentLen;

    // Reject SPA HTML fallbacks that are tiny; keep real installers/zips
    if (fileSize > 0 && fileSize < 10_000) return false;
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

  const zipUrl = ZIP_URL();
  const dmgUrl = DMG_URL();
  const macZipUrl = MAC_ZIP_URL();
  const exeUrl = EXE_URL();
  const usingRemoteDownloads = !isBrowserLocal();

  useEffect(() => {
    if (platform.isStandalone) setInstalled(true);

    // Hosted (DigitalOcean): use GitHub Release URLs — always enabled (no CORS probe)
    if (usingRemoteDownloads) {
      setAvailable({ zip: true, dmg: true, macZip: true, exe: true });
    } else {
      Promise.all([
        checkUrl(zipUrl),
        checkUrl(dmgUrl),
        checkUrl(macZipUrl),
        checkUrl(exeUrl),
      ]).then(([zip, dmg, macZip, exe]) =>
        setAvailable({ zip, dmg, macZip, exe })
      );
    }

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
  }, [platform.isStandalone, usingRemoteDownloads, zipUrl, dmgUrl, macZipUrl, exeUrl]);

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
                      href={available.exe ? exeUrl : undefined}
                      download={
                        available.exe && isBrowserLocal()
                          ? 'Selfie-Verification-Windows.exe'
                          : undefined
                      }
                      target={usingRemoteDownloads ? '_blank' : undefined}
                      rel={usingRemoteDownloads ? 'noopener noreferrer' : undefined}
                      onClick={(e) => {
                        if (available.exe === false) e.preventDefault();
                      }}
                      aria-disabled={available.exe === false}
                    >
                      <FaWindows /> Download for Windows (.exe)
                    </a>
                    <a
                      className={`install-primary-btn mac-btn ${available.dmg === false ? 'is-disabled' : ''}`}
                      href={available.dmg ? dmgUrl : undefined}
                      download={
                        available.dmg && isBrowserLocal()
                          ? 'Selfie-Verification-Mac.dmg'
                          : undefined
                      }
                      target={usingRemoteDownloads ? '_blank' : undefined}
                      rel={usingRemoteDownloads ? 'noopener noreferrer' : undefined}
                      onClick={(e) => {
                        if (available.dmg === false) e.preventDefault();
                      }}
                      aria-disabled={available.dmg === false}
                    >
                      <FaApple /> Download for Mac (.dmg)
                    </a>
                    <a
                      className={`install-primary-btn mac-btn ${available.macZip === false ? 'is-disabled' : ''}`}
                      href={available.macZip ? macZipUrl : undefined}
                      download={
                        available.macZip && isBrowserLocal()
                          ? 'Selfie-Verification-Mac.zip'
                          : undefined
                      }
                      target={usingRemoteDownloads ? '_blank' : undefined}
                      rel={usingRemoteDownloads ? 'noopener noreferrer' : undefined}
                      onClick={(e) => {
                        if (available.macZip === false) e.preventDefault();
                      }}
                      aria-disabled={available.macZip === false}
                    >
                      <FaApple /> Mac app (.zip)
                    </a>
                  </div>
                  {usingRemoteDownloads && (
                    <p className="install-note">
                      Desktop installers download from the public GitHub release{' '}
                      <code>desktop-v2.0.0</code> (same files used for DigitalOcean).
                    </p>
                  )}
                  {!usingRemoteDownloads &&
                    (available.exe === false ||
                      available.dmg === false ||
                      available.macZip === false) && (
                    <p className="install-note">
                      Missing local installers in <code>frontend/public/downloads/</code>. Run{' '}
                      <code>npm run electron:build</code> or place the files there.
                    </p>
                  )}
                  <p className="install-note">
                    <strong>Windows:</strong> run the .exe. If SmartScreen appears, click{' '}
                    <em>More info</em> → <strong>Run anyway</strong>.
                    <br />
                    <strong>Mac:</strong> open the .dmg → drag to Applications. If “developer cannot
                    be verified”, Control‑click the app → <strong>Open</strong>, or use{' '}
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
                    onClick={() => {
                      if (usingRemoteDownloads) {
                        window.open(zipUrl, '_blank', 'noopener,noreferrer');
                      } else {
                        downloadFile(zipUrl, 'selfie-verification-ui.zip');
                      }
                    }}
                    disabled={available.zip === false}
                  >
                    <FaDownload />
                    {available.zip === false
                      ? 'ZIP not ready'
                      : available.zip == null
                        ? 'Checking ZIP…'
                        : 'Download UI (ZIP)'}
                  </button>
                </div>                <div className="install-action-card">
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
