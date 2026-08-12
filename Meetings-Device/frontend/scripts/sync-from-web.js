#!/usr/bin/env node
/**
 * Copy Meetings stack from monorepo `frontend/` into this PWA package.
 * Run from Meetings-Device/frontend: npm run sync
 */
const fs = require('fs');
const path = require('path');

const here = __dirname;
const pkgRoot = path.join(here, '..');
const monorepoFrontend = path.join(pkgRoot, '..', '..', 'frontend', 'src');
const destSrc = path.join(pkgRoot, 'src');

const files = [
  'config/apiBase.js',
  'services/meetingsApi.js',
  'services/bookingApi.js',
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
  'utils/downloadUtils.js',
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
if (ok < files.length) process.exitCode = 1;
