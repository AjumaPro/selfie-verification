/**
 * Download desktop installers into frontend/build/downloads for DigitalOcean.
 * Source: GitHub Release assets (files are too large for git).
 *
 * Override with DESKTOP_DOWNLOAD_BASE_URL, e.g.
 *   https://github.com/AjumaPro/selfie-verification/releases/download/desktop-v2.0.0
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'frontend', 'build', 'downloads');
const publicDir = path.join(root, 'frontend', 'public', 'downloads');

const DEFAULT_BASE =
  process.env.DESKTOP_DOWNLOAD_BASE_URL ||
  'https://github.com/AjumaPro/selfie-verification/releases/download/desktop-v2.0.0';

const FILES = [
  'Selfie-Verification-Windows.exe',
  'Selfie-Verification-Mac.dmg',
  'Glico-Meetings-Windows.exe',
  'Glico-Meetings-Mac.dmg',
];

function fetchToFile(url, dest) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(
      url,
      {
        headers: { 'User-Agent': 'selfie-verification-build' },
        timeout: 600000,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return fetchToFile(res.headers.location, dest).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const out = fs.createWriteStream(dest);
        res.pipe(out);
        out.on('finish', () => out.close(() => resolve()));
        out.on('error', reject);
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout downloading ${url}`));
    });
  });
}

async function ensureFile(name) {
  const destBuild = path.join(outDir, name);
  const localPublic = path.join(publicDir, name);

  // Prefer already-built local public copy (developer machine)
  if (fs.existsSync(localPublic) && fs.statSync(localPublic).size > 1_000_000) {
    fs.copyFileSync(localPublic, destBuild);
    console.log(`✓ ${name} from local public/downloads`);
    return true;
  }

  if (fs.existsSync(destBuild) && fs.statSync(destBuild).size > 1_000_000) {
    console.log(`✓ ${name} already in build/downloads`);
    return true;
  }

  const url = `${DEFAULT_BASE.replace(/\/$/, '')}/${name}`;
  console.log(`↓ Downloading ${name}…`);
  console.log(`  ${url}`);
  try {
    await fetchToFile(url, destBuild);
    const mb = (fs.statSync(destBuild).size / (1024 * 1024)).toFixed(1);
    console.log(`✓ ${name} (${mb} MB)`);
    return true;
  } catch (err) {
    console.warn(`⚠ Could not fetch ${name}: ${err.message}`);
    if (fs.existsSync(destBuild)) fs.unlinkSync(destBuild);
    return false;
  }
}

async function main() {
  if (!fs.existsSync(path.join(root, 'frontend', 'build', 'index.html'))) {
    console.error('frontend/build missing — run CRA build first');
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  let ok = 0;
  for (const name of FILES) {
    if (await ensureFile(name)) ok += 1;
  }

  console.log(`Desktop installers ready: ${ok}/${FILES.length}`);
  if (ok === 0) {
    console.warn(
      'No desktop installers available. Create GitHub release desktop-v2.0.0 with the .exe/.dmg/.zip assets.'
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
