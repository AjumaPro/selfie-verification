/**
 * Public asset URLs work with CRA homepage "./" (Electron file://).
 */
export function publicAsset(path) {
  const raw = process.env.PUBLIC_URL || '';
  const base =
    raw === '.' || raw === './' ? '' : String(raw).replace(/\/$/, '');
  const name = String(path || '').replace(/^\//, '');
  return `${base}/${name}`;
}

/** Official GLICO logo wordmark (full colour). */
export function glicoLogoUrl() {
  return publicAsset('Glico.png');
}

/** Square app icon (three-bar mark). */
export function glicoIconUrl() {
  return publicAsset('icons/icon-512.png');
}

export const GLICO = {
  red: '#d03038',
  redDark: '#a8242c',
  sky: '#48a8e8',
  skyDark: '#1a7ab8',
  navy: '#103078',
};
