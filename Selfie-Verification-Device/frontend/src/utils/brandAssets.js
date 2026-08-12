/**
 * GLICO Life Platform brand — logo, colours, and shared copy.
 * Public asset URLs work with CRA homepage "./" (Electron file://).
 */

export const BRAND = {
  name: 'GLICO Life Platform',
  shortName: 'GLICO Life',
  adminName: 'GLICO Life Platform Admin',
  meetingsName: 'GLICO Life Meetings',
  tagline: 'Identity · Meetings · Services',
  description:
    'GLICO Life Platform — identity verification, meetings, and Ghana Card KYC',
  hubTitle: 'GLICO Life Platform applications',
  deviceHubTitle: 'GLICO Life Platform on this device',
  deviceAriaLabel: 'GLICO Life Platform device applications',
  hubAriaLabel: 'GLICO Life Platform applications',
};

export function publicAsset(path) {
  const raw = process.env.PUBLIC_URL || '';
  const base =
    raw === '.' || raw === './' ? '' : String(raw).replace(/\/$/, '');
  const name = String(path || '').replace(/^\//, '');
  return `${base}/${name}`;
}

/** Official GLICO wordmark (full colour) — used with Life lockup in UI. */
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
