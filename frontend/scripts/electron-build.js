/**
 * Build Electron installers without baking public/downloads into the app.
 * Large .exe/.dmg files in public/ are moved aside before `npm run build`.
 * After Mac build: ad-hoc codesign the .app and clear quarantine flags.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const downloads = path.join(root, 'public', 'downloads');
const parkDir = path.join(root, '.downloads-park');
const distDir = path.join(root, 'dist-desktop');

const args = process.argv.slice(2);
const wantMac = args.includes('--mac') || args.length === 0;
const wantWin = args.includes('--win') || args.length === 0;

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}\n`);
  execSync(cmd, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
    ...opts,
  });
}

function parkDownloads() {
  if (!fs.existsSync(downloads)) return;
  fs.mkdirSync(parkDir, { recursive: true });
  for (const name of fs.readdirSync(downloads)) {
    if (!/\.(exe|dmg|zip|blockmap)$/i.test(name)) continue;
    const from = path.join(downloads, name);
    const to = path.join(parkDir, name);
    console.log(`Parking ${name} (exclude from CRA build)`);
    fs.renameSync(from, to);
  }
}

function restoreParked() {
  if (!fs.existsSync(parkDir)) return;
  fs.mkdirSync(downloads, { recursive: true });
  for (const name of fs.readdirSync(parkDir)) {
    fs.renameSync(path.join(parkDir, name), path.join(downloads, name));
  }
  fs.rmSync(parkDir, { recursive: true, force: true });
}

function findApps(dir, depth = 0, out = []) {
  if (!fs.existsSync(dir) || depth > 3) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory() && e.name.endsWith('.app')) out.push(full);
    else if (e.isDirectory() && (e.name === 'mac' || e.name === 'mac-arm64' || e.name === 'mac-universal')) {
      findApps(full, depth + 1, out);
    }
  }
  return out;
}

/** Ad-hoc sign helps local open; Gatekeeper still needs Open Anyway for downloaded builds. */
function signMacApps() {
  const apps = findApps(distDir);
  for (const appPath of apps) {
    console.log(`Ad-hoc codesign: ${appPath}`);
    try {
      execSync(`xattr -cr ${JSON.stringify(appPath)}`, { stdio: 'inherit' });
      execSync(
        `codesign --force --deep --sign - ${JSON.stringify(appPath)}`,
        { stdio: 'inherit' }
      );
      execSync(`codesign --verify --verbose=2 ${JSON.stringify(appPath)}`, {
        stdio: 'inherit',
      });
    } catch (err) {
      console.warn('codesign warning:', err.message);
    }
  }
}

try {
  parkDownloads();
  run('npm run build');

  const targets = [];
  if (wantMac) targets.push('--mac dmg zip');
  if (wantWin) targets.push('--win nsis');
  run(`npx electron-builder ${targets.join(' ')}`);

  if (wantMac) signMacApps();

  restoreParked();
  run('node scripts/copy-desktop-downloads.js');
} catch (err) {
  try {
    restoreParked();
  } catch (_) {
    /* ignore */
  }
  console.error(err);
  process.exit(1);
}
