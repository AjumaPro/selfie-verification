/**
 * Register the Progressive Web App service worker (production / HTTPS / localhost).
 */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  const isLocalhost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '[::1]';

  // Allow SW on localhost for install testing; always register in production builds
  const shouldRegister = process.env.NODE_ENV === 'production' || isLocalhost;
  if (!shouldRegister) return;

  window.addEventListener('load', () => {
    const swUrl = `${process.env.PUBLIC_URL || ''}/sw.js`;
    navigator.serviceWorker
      .register(swUrl)
      .then((reg) => {
        console.log('Service worker registered:', reg.scope);
      })
      .catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
  });
}
