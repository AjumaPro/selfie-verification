/**
 * Resolve backend API origin for auth / meetings / booking.
 *
 * - Web (DigitalOcean or CRA proxy): empty string = same origin (`/api/...`)
 * - Electron Mac/Windows (file://): must call an absolute HTTPS/http API URL
 * - Dev browser: empty → CRA proxies /api → 127.0.0.1:4000
 *
 * Env (baked at build time):
 *   REACT_APP_AUTH_API_URL          — primary (empty = same-origin on web)
 *   REACT_APP_DESKTOP_AUTH_API_URL  — Electron fallback when AUTH is empty
 */
function isDesktopRuntime() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.location.protocol === 'file:') return true;
    if (document.body && document.body.dataset.desktopApp === 'true') return true;
    if (typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent || '')) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function normalize(url) {
  const s = String(url || '').trim();
  if (!s || s === '/' || s === 'same-origin') return '';
  return s.replace(/\/$/, '');
}

export function resolveApiBase() {
  const primary = normalize(process.env.REACT_APP_AUTH_API_URL);
  const desktopFallback = normalize(process.env.REACT_APP_DESKTOP_AUTH_API_URL);

  if (isDesktopRuntime()) {
    // Packaged installers cannot use same-origin (file:// has no /api)
    if (primary) return primary;
    if (desktopFallback) return desktopFallback;
    // Local Electron while API runs on this machine
    return 'http://127.0.0.1:4000';
  }

  if (primary) return primary;
  // CRA: null env → same-origin proxy; production web build often has empty string
  if (process.env.REACT_APP_AUTH_API_URL === undefined && process.env.NODE_ENV !== 'development') {
    return 'http://127.0.0.1:4000';
  }
  return '';
}

export function getApiBase() {
  return resolveApiBase();
}

export default resolveApiBase;
