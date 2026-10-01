/**
 * Copy built desktop installers into public/downloads for the web Download UI.
 * Run after: npm run electron:build
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist-desktop');
const outDir = path.join(root, 'public', 'downloads');

fs.mkdirSync(outDir, { recursive: true });

function findFile(dir, matchFn, depth = 0) {
  if (!fs.existsSync(dir) || depth > 3) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isFile() && matchFn(e.name)) return full;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name === 'win-unpacked' || e.name === 'mac' || e.name === 'mac-arm64') continue;
    const nested = findFile(path.join(dir, e.name), matchFn, depth + 1);
    if (nested) return nested;
  }
  return null;
}

function copyAs(src, destName) {
  if (!src) {
    console.warn(`⚠ Missing artifact for ${destName}`);
    return false;
  }
  const dest = path.join(outDir, destName);
  fs.copyFileSync(src, dest);
  try {
    // Clear quarantine so local downloads from this machine open more easily
    require('child_process').execSync(`xattr -cr ${JSON.stringify(dest)}`, {
      stdio: 'ignore',
    });
  } catch (_) {
    /* ignore */
  }
  const mb = (fs.statSync(dest).size / (1024 * 1024)).toFixed(1);
  console.log(`✓ ${destName} (${mb} MB) ← ${path.basename(src)}`);
  return true;
}

console.log('Looking in:', distDir);

const dmgPreferred = findFile(
  distDir,
  (n) => /^Selfie-Verification-Mac/i.test(n) && n.toLowerCase().endsWith('.dmg')
);
const dmgFallback = findFile(distDir, (n) => n.toLowerCase().endsWith('.dmg'));
const dmg = dmgPreferred || dmgFallback;

const zipPreferred = findFile(
  distDir,
  (n) =>
    /^Selfie-Verification-Mac/i.test(n) &&
    n.toLowerCase().endsWith('.zip') &&
    !/ui\.zip$/i.test(n)
);
const zipFallback = findFile(
  distDir,
  (n) =>
    n.toLowerCase().endsWith('.zip') &&
    /selfie.?verification/i.test(n) &&
    !/ui\.zip$/i.test(n) &&
    !n.toLowerCase().includes('windows')
);
const macZip = zipPreferred || zipFallback;

const exePreferred = findFile(
  distDir,
  (n) =>
    /^Selfie-Verification-Windows/i.test(n) &&
    n.toLowerCase().endsWith('.exe')
);
const exeFallback = findFile(
  distDir,
  (n) =>
    n.toLowerCase().endsWith('.exe') &&
    !n.toLowerCase().includes('uninstaller') &&
    !n.toLowerCase().includes('elevate')
);
const exe = exePreferred || exeFallback;

copyAs(dmg, 'Selfie-Verification-Mac.dmg');
copyAs(macZip, 'Selfie-Verification-Mac.zip');
copyAs(exe, 'Selfie-Verification-Windows.exe');

console.log(`\nDownloads folder: ${outDir}`);
