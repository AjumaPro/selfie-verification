#!/usr/bin/env node
/**
 * Zip Meetings-Device production build → frontend/public/downloads/glico-meetings-pwa.zip
 *
 *   npm run package:meetings-zip   (from frontend/)
 *   SKIP_BUILD=1 node …            (reuse existing build/)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

// scripts/ → frontend/ → Meetings-Device/ → monorepo
const meetingsFrontend = path.resolve(__dirname, '..');
const monorepo = path.resolve(meetingsFrontend, '..', '..');
const buildDir = path.join(meetingsFrontend, 'build');
const outDir = path.join(monorepo, 'frontend', 'public', 'downloads');
const zipPath = path.join(outDir, 'glico-meetings-pwa.zip');
const staging = path.join(meetingsFrontend, '.zip-staging');

function rimraf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

const skipBuild = String(process.env.SKIP_BUILD || '') === '1';
if (!skipBuild) {
  console.log('[package-meetings-zip] building Meetings-Device…');
  execSync('npm run build', {
    cwd: meetingsFrontend,
    stdio: 'inherit',
    env: process.env,
  });
} else {
  console.log('[package-meetings-zip] SKIP_BUILD=1 — using existing build/');
}

if (!fs.existsSync(path.join(buildDir, 'index.html'))) {
  console.error('Meetings build missing index.html — run build first');
  process.exit(1);
}

rimraf(staging);
copyDir(buildDir, staging);
fs.writeFileSync(
  path.join(staging, 'INSTALL.txt'),
  `GLICO Meetings — web package
=============================

1. Unzip this folder.
2. Serve it (must be able to reach the API):
     npx --yes serve -s . -l 3002
3. Open http://localhost:3002
4. Or deploy the build to HTTPS and "Install" as a PWA.

Point REACT_APP_AUTH_API_URL at your API when rebuilding for production:
  REACT_APP_AUTH_API_URL=https://YOUR-APP.ondigitalocean.app npm run build
`,
  'utf8'
);

fs.mkdirSync(outDir, { recursive: true });
rimraf(zipPath);

console.log('[package-meetings-zip] creating zip…');
try {
  execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', staging, zipPath], {
    stdio: 'inherit',
  });
} catch {
  try {
    execFileSync('zip', ['-r', '-q', zipPath, path.basename(staging)], {
      cwd: path.dirname(staging),
      stdio: 'inherit',
    });
  } catch (err) {
    console.error('Could not create zip (need ditto or zip on PATH)', err.message);
    process.exit(1);
  }
}

rimraf(staging);
if (!fs.existsSync(zipPath)) {
  console.error('Zip not created:', zipPath);
  process.exit(1);
}
const mb = (fs.statSync(zipPath).size / (1024 * 1024)).toFixed(2);
console.log(`[package-meetings-zip] ✓ ${zipPath} (${mb} MB)`);
