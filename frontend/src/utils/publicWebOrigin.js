/**
 * Public HTTPS origin for guest links (QR / share).
 * Never use file:// — phones cannot open Electron local origins.
 */
export function getPublicWebOrigin() {
  const candidates = [
    process.env.REACT_APP_PUBLIC_WEB_URL,
    process.env.REACT_APP_AUTH_API_URL,
    process.env.REACT_APP_DESKTOP_AUTH_API_URL,
  ];
  for (const raw of candidates) {
    const s = String(raw || '')
      .trim()
      .replace(/\/$/, '');
    if (/^https?:\/\//i.test(s)) return s;
  }

  if (typeof window !== 'undefined') {
    try {
      const origin = String(window.location.origin || '').replace(/\/$/, '');
      if (origin && !/^file:/i.test(origin) && origin !== 'null') {
        return origin;
      }
    } catch {
      /* ignore */
    }
  }
  return '';
}
