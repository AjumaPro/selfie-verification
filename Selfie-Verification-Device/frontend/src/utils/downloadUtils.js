/**
 * Shared helpers for desktop / package file downloads.
 * Always prefer same-origin /downloads so LAN IPs (192.168.x) work in CRA.
 */

const rawPublic = process.env.PUBLIC_URL || '';
export const PUBLIC_BASE =
  rawPublic === '.' || rawPublic === './' ? '' : String(rawPublic).replace(/\/$/, '');

export const GH_RELEASE_BASE =
  process.env.REACT_APP_DESKTOP_DOWNLOAD_BASE ||
  process.env.REACT_APP_MEETINGS_DOWNLOAD_BASE ||
  'https://github.com/AjumaPro/selfie-verification/releases/download/desktop-v2.0.0';

/**
 * Assets published on the GitHub desktop-v2.0.0 release (fetched at DO build).
 * Help .txt files stay local/build-only — never invent a GH URL for them.
 */
const GH_REMOTE_ALLOWLIST = new Set([
  'Selfie-Verification-Mac.dmg',
  'Selfie-Verification-Mac.zip',
  'Selfie-Verification-Windows.exe',
  'selfie-verification-ui.zip',
  'Glico-Meetings-Windows.exe',
  'Glico-Meetings-Mac.dmg',
  'Glico-Meetings-Mac.zip',
]);

export function hasRemoteFallback(filename) {
  const name = String(filename || '').replace(/^\//, '');
  return GH_REMOTE_ALLOWLIST.has(name);
}

/** Loopback or private LAN — still served by CRA/API, not the public internet. */
export function isLocalDevHost() {
  if (typeof window === 'undefined') return true;
  const h = String(window.location.hostname || '').toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(h)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(h)) return true;
  return false;
}

/**
 * Primary: same-origin /downloads (works on DO when files are in build,
 * and on any local/LAN CRA server).
 * Optional force GH: REACT_APP_FORCE_REMOTE_DOWNLOADS=true
 */
export function downloadsRoot() {
  if (
    String(process.env.REACT_APP_FORCE_REMOTE_DOWNLOADS || '').toLowerCase() ===
    'true'
  ) {
    return GH_RELEASE_BASE.replace(/\/$/, '');
  }
  return `${PUBLIC_BASE}/downloads`;
}

export function assetUrl(filename) {
  const root = downloadsRoot().replace(/\/$/, '');
  const name = String(filename || '').replace(/^\//, '');
  return `${root}/${name}`;
}

export function remoteFallbackUrl(filename) {
  return `${GH_RELEASE_BASE.replace(/\/$/, '')}/${String(filename || '').replace(/^\//, '')}`;
}

export function looksLikeHtml(type, buf) {
  const t = (type || '').toLowerCase();
  if (t.includes('text/html')) return true;
  if (!buf || buf.byteLength < 15) return false;
  const head = new TextDecoder().decode(buf.slice(0, 64)).trim().toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html');
}

/** Probe that a URL is a real file (not SPA HTML fallback). */
export async function probeDownloadUrl(url) {
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

    const rangeTotal = Number(
      String(res.headers.get('content-range') || '').split('/')[1] || 0
    );
    const contentLen = Number(res.headers.get('content-length') || 0);
    const fileSize = rangeTotal > 0 ? rangeTotal : contentLen;
    // Tiny responses are almost always HTML shells (except tiny .txt helps ~1–2KB)
    if (fileSize > 0 && fileSize < 400 && !/\.txt$/i.test(url)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Trigger a browser download reliably (same-origin + large binaries).
 * Cross-origin (GitHub) opens in a new tab — browser downloads from Content-Disposition.
 */
export function triggerDownload(url, filename) {
  if (!url) return;
  const a = document.createElement('a');
  a.href = url;
  if (filename) a.setAttribute('download', filename);
  a.rel = 'noopener noreferrer';
  // Same-origin: stay in page with download attr. Cross-origin: new tab.
  try {
    const abs = new URL(url, window.location.href);
    if (abs.origin !== window.location.origin) {
      a.target = '_blank';
      a.removeAttribute('download');
    }
  } catch {
    a.target = '_blank';
  }
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Try same-origin file first; if missing, fall back to GitHub only when allowlisted.
 */
export async function resolveDownloadUrl(filename) {
  const name = String(filename || '').replace(/^\//, '');
  const primary = assetUrl(name);
  const ok = await probeDownloadUrl(primary);
  if (ok) return { url: primary, source: 'local' };

  if (!hasRemoteFallback(name)) {
    return { url: null, source: 'missing' };
  }

  // Allowlisted GitHub release assets — browser fetch probe often fails (CORS)
  // but the URL is still a valid direct download (opens in new tab).
  return { url: remoteFallbackUrl(name), source: 'remote' };
}

/**
 * Resolve first available filename from a list (e.g. Mac .dmg then .zip package).
 */
export async function resolveFirstDownloadUrl(filenames) {
  const list = Array.isArray(filenames) ? filenames : [filenames];
  for (const name of list) {
    const r = await resolveDownloadUrl(name);
    if (r?.url) return { ...r, filename: String(name || '').replace(/^\//, '') };
  }
  return { url: null, source: 'missing', filename: list[0] || null };
}
