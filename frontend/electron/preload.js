// Preload kept minimal — renderer stays a normal web app (no Node APIs exposed).
window.addEventListener('DOMContentLoaded', () => {
  document.body.dataset.desktopApp = 'true';
});
