#!/usr/bin/env node
/**
 * Copy Meetings stack from monorepo `frontend/` into this PWA package.
 * Run from Meetings-Device/frontend: npm run sync
 *
 * Does NOT overwrite Meetings-specific App.js (meetings-only shell).
 */
const fs = require('fs');
const path = require('path');

const here = __dirname;
const pkgRoot = path.join(here, '..');
const monorepoFrontend = path.join(pkgRoot, '..', '..', 'frontend', 'src');
const destSrc = path.join(pkgRoot, 'src');

const files = [
  'config/apiBase.js',
  'config/authUi.js',
  'context/AuthContext.js',
  'services/authService.js',
  'services/meetingsApi.js',
  'services/bookingApi.js',
  'hooks/useAppToast.js',
  'utils/scannableQr.js',
  'utils/publicWebOrigin.js',
  'utils/foodDownloadOptions.js',
  'utils/downloadUtils.js',
  'utils/brandAssets.js',
  'components/AppToast.css',
  'components/AuthPanel.js',
  'components/AuthPanel.css',
  'components/PasswordInput.js',
  'components/PasswordInput.css',
  'components/GlicoLifeLogo.js',
  'components/GlicoLifeLogo.css',
  'components/GlicoBrandBar.js',
  'components/GlicoBrandBar.css',
  'components/MeetingsApp.js',
  'components/MeetingsApp.css',
  'components/MeetingCalendar.js',
  'components/MeetingCalendar.css',
  'components/MeetingCheckIn.js',
  'components/MeetingCheckIn.css',
  'components/MeetingJoin.js',
  'components/MeetingJoin.css',
  'components/BookingHost.js',
  'components/BookingHost.css',
  'components/BookingGuest.js',
  'components/BookingGuest.css',
  'components/GooglePlacePicker.js',
  'components/GooglePlacePicker.css',
  'components/MeetingsDeviceDownloads.js',
  'components/MeetingsDeviceDownloads.css',
];

function copyFile(rel) {
  const from = path.join(monorepoFrontend, rel);
  const to = path.join(destSrc, rel);
  if (!fs.existsSync(from)) {
    console.warn('[sync] missing', from);
    return false;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  console.log('[sync]', rel);
  return true;
}

let ok = 0;
for (const f of files) {
  if (copyFile(f)) ok += 1;
}
console.log(`[sync] ${ok}/${files.length} files from frontend/src`);
console.log('[sync] skipped App.js (Meetings-Device keeps meetings-only shell)');
if (ok < files.length) process.exitCode = 1;
