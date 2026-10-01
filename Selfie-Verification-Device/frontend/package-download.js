/**
 * Build a downloadable ZIP of the UI for laptop / phone install.
 * Output: public/downloads/selfie-verification-ui.zip
 *
 * Usage:
 *   npm run build
 *   node package-download.js
 * or:
 *   npm run package:download
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = __dirname;
const buildDir = path.join(root, 'build');
const outDir = path.join(root, 'public', 'downloads');
const zipPath = path.join(outDir, 'selfie-verification-ui.zip');
const stagingDir = path.join(root, '.download-staging');

function rimraf(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function ensureBuild() {
  if (!fs.existsSync(path.join(buildDir, 'index.html'))) {
    console.log('No build found — running npm run build…');
    execSync('npm run build', { cwd: root, stdio: 'inherit' });
  }
}

function writeInstallGuide(dest) {
  const guide = `Selfie Verification — Install Guide
=====================================

This ZIP contains the app UI (web interface).

LAPTOP (Windows / Mac / Linux)
------------------------------
1. Unzip this folder.
2. Open a terminal in the unzipped folder.
3. Run one of:
     npx --yes serve -s . -l 5173
   or open index.html in Chrome (some features need a local server).
4. Open http://localhost:5173 in Chrome or Edge.
5. Click the install icon in the address bar to add it as a desktop app.

PHONE (Android)
---------------
Best option: open the hosted / local network URL in Chrome → Install app.
Or: copy this folder to a phone-accessible host, then Install from Chrome.

PHONE (iPhone / iPad)
---------------------
1. Open the app URL in Safari.
2. Tap Share → Add to Home Screen.

API SETTINGS
------------
API base URL and keys are baked in at build time from frontend/.env.
Rebuild after changing .env if you need different credentials.

`;
  fs.writeFileSync(path.join(dest, 'INSTALL.txt'), guide, 'utf8');
}

function main() {
  ensureBuild();
  fs.mkdirSync(outDir, { recursive: true });
  rimraf(stagingDir);
  fs.mkdirSync(stagingDir, { recursive: true });

  // Copy build → staging
  execSync(`cp -R "${buildDir}/." "${stagingDir}/"`);
  writeInstallGuide(stagingDir);

  // Zip staging
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  execSync(`cd "${stagingDir}" && zip -r "${zipPath}" . -x "*.DS_Store"`);
  rimraf(stagingDir);

  const sizeMb = (fs.statSync(zipPath).size / (1024 * 1024)).toFixed(2);
  console.log(`\n✓ Download package ready: ${zipPath} (${sizeMb} MB)`);
  console.log('  Served at: /downloads/selfie-verification-ui.zip');
}

main();
