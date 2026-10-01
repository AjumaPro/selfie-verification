/**
 * GLICO Pensions brand — logo, colours, and shared copy.
 * Public asset URLs work with CRA homepage "./" (Electron file://).
 */

export const BRAND = {
  name: 'GLICO Pensions',
  shortName: 'GLICO Pensions',
  adminName: 'GLICO Pensions Admin',
  meetingsName: 'GLICO Pensions Meetings',
  tagline: 'We cushion you for life',
  description:
    'GLICO Pensions — member identity verification, meetings, and Ghana Card KYC',
  hubTitle: 'GLICO Pensions applications',
  deviceHubTitle: 'GLICO Pensions on this device',
  deviceAriaLabel: 'GLICO Pensions device applications',
  hubAriaLabel: 'GLICO Pensions applications',
};

export function publicAsset(path) {
  const raw = process.env.PUBLIC_URL || '';
  const base =
    raw === '.' || raw === './' ? '' : String(raw).replace(/\/$/, '');
  const name = String(path || '').replace(/^\//, '');
  return `${base}/${name}`;
}

/** Official GLICO Pensions wordmark (full colour). */
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
