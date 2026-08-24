/**
 * Capture beforeinstallprompt as early as possible — Chrome often fires it
 * before React mounts, so listeners in components miss it.
 */
let deferredPromptEvent = null;
const listeners = new Set();

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

export function getDeferredInstallPrompt() {
  return deferredPromptEvent;
}

export function clearDeferredInstallPrompt() {
  deferredPromptEvent = null;
  listeners.forEach((fn) => {
    try {
      fn(null);
    } catch {
      /* ignore */
    }
  });
}

export function subscribeInstallPrompt(fn) {
  listeners.add(fn);
  if (deferredPromptEvent) fn(deferredPromptEvent);
  return () => listeners.delete(fn);
}

export function isPwaInstalled() {
  return isStandalone();
}

/** Prompt the browser install UI when available. */
export async function promptPwaInstall() {
  const ev = deferredPromptEvent;
  if (!ev) return { outcome: 'unavailable' };
  try {
    ev.prompt();
    const { outcome } = await ev.userChoice;
    deferredPromptEvent = null;
    listeners.forEach((fn) => {
      try {
        fn(null);
      } catch {
        /* ignore */
      }
    });
    return { outcome };
  } catch (err) {
    console.warn('PWA install prompt failed:', err);
    return { outcome: 'error', error: err };
  }
}

export function initPwaInstallCapture() {
  if (typeof window === 'undefined') return;
  if (window.__glicoPwaInstallInit) return;
  window.__glicoPwaInstallInit = true;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPromptEvent = e;
    listeners.forEach((fn) => {
      try {
        fn(e);
      } catch {
        /* ignore */
      }
    });
  });

  window.addEventListener('appinstalled', () => {
    deferredPromptEvent = null;
    listeners.forEach((fn) => {
      try {
        fn(null);
      } catch {
        /* ignore */
      }
    });
  });
}
