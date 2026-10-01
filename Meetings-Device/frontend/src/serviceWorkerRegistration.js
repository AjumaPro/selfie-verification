export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    const swUrl = `${process.env.PUBLIC_URL || ''}/sw.js`.replace(/\/{2,}/g, '/');
    const fixed = (process.env.PUBLIC_URL || '') === '.' || (process.env.PUBLIC_URL || '') === './'
      ? './sw.js'
      : swUrl.startsWith('/')
        ? swUrl
        : `./sw.js`;

    navigator.serviceWorker
      .register(fixed)
      .then((reg) => {
        reg.update().catch(() => {});
      })
      .catch((err) => {
        console.warn('Meetings PWA SW registration failed:', err);
      });
  });
}
