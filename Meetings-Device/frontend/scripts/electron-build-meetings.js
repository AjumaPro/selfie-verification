/**
 * Build FastHR Meetings Electron installers from Meetings-Device PWA.
 * Output → frontend/public/downloads/FastHR-Meetings-Windows.exe (etc.)
 *
 *   node scripts/electron-build-meetings.js --win
 *   node scripts/electron-build-meetings.js --mac --win
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const meetingsRoot = path.join(__dirname, '..');
const monorepoRoot = path.join(meetingsRoot, '..', '..');
const webDownloads = path.join(monorepoRoot, 'frontend', 'public', 'downloads');
const distDir = path.join(meetingsRoot, 'dist-desktop');

const ARTIFACT = {
  exe: 'FastHR-Meetings-Windows.exe',
  dmg: 'FastHR-Meetings-Mac.dmg',
  zip: 'FastHR-Meetings-Mac.zip',
};

const args = process.argv.slice(2);
const wantMac = args.includes('--mac') || args.length === 0;
const wantWin = args.includes('--win') || args.length === 0;

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}\n`);
  execSync(cmd, {
    cwd: meetingsRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      REACT_APP_DEVICE_APP: 'false',
      GENERATE_SOURCEMAP: 'false',
    },
    ...opts,
  });
}

function ensureElectronScaffold() {
  const electronDir = path.join(meetingsRoot, 'electron');
  fs.mkdirSync(electronDir, { recursive: true });
  const mainJs = path.join(electronDir, 'main.js');
  fs.writeFileSync(
    mainJs,
    `const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    title: 'FastHR Meetings',
    backgroundColor: '#f4f7fc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  if (isDev) {
    win.loadURL(process.env.ELECTRON_START_URL || 'http://localhost:3002');
  } else {
    win.loadFile(path.join(__dirname, '..', 'build', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
`
  );
  fs.writeFileSync(
    path.join(electronDir, 'preload.js'),
    `window.addEventListener('DOMContentLoaded', () => {
  document.body.dataset.desktopApp = 'true';
  document.body.dataset.meetingsApp = 'true';
});
`
  );
}

function copyArtifacts() {
  fs.mkdirSync(webDownloads, { recursive: true });
  if (!fs.existsSync(distDir)) {
    console.warn('[meetings-electron] no dist-desktop/');
    return;
  }

  const mapName = (name) => {
    if (/^FastHR-Meetings-Windows/i.test(name) || /\.exe$/i.test(name)) {
      if (!/blockmap/i.test(name)) return ARTIFACT.exe;
    }
    if (/\.dmg$/i.test(name)) return ARTIFACT.dmg;
    if (/\.zip$/i.test(name) && /mac|darwin|FastHR-Meetings|Meetings/i.test(name)) {
      return ARTIFACT.zip;
    }
    return null;
  };

  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        if (name === 'win-unpacked' || name === 'mac' || name.startsWith('mac-')) continue;
        walk(p);
        continue;
      }
      if (/\.blockmap$/i.test(name)) continue;
      if (!/\.(exe|dmg|zip)$/i.test(name) && !/^FastHR-Meetings-Windows/i.test(name)) continue;
      if (/fasthr-meetings-pwa|glico-meetings-pwa/i.test(name)) continue;
      if (st.size < 1_000_000 && /\.exe$/i.test(name) === false && !/^FastHR-Meetings-Windows/i.test(name)) {
        continue;
      }

      let destName = mapName(name);
      if (!destName && /meetings/i.test(name) && st.size > 1_000_000) {
        destName = ARTIFACT.exe;
      }
      if (!destName) continue;

      const dest = path.join(webDownloads, destName);
      fs.copyFileSync(p, dest);
      const mb = (st.size / (1024 * 1024)).toFixed(1);
      console.log(`[meetings-electron] ✓ ${destName} (${mb} MB)`);
    }
  };
  walk(distDir);
}

try {
  ensureElectronScaffold();

  const webRoot = path.join(monorepoRoot, 'frontend');
  const localEB = path.join(meetingsRoot, 'node_modules', '.bin', 'electron-builder');
  const webEB = path.join(webRoot, 'node_modules', '.bin', 'electron-builder');
  const hasLocalElectron = fs.existsSync(
    path.join(meetingsRoot, 'node_modules', 'electron')
  );

  if (!hasLocalElectron) {
    console.log('[meetings-electron] installing electron + electron-builder…');
    run('npm install --save-dev electron@33 electron-builder@25 --no-fund --no-audit');
  }

  run('node scripts/sync-from-web.js');
  run('npm run build');

  const ebBin = fs.existsSync(localEB)
    ? localEB
    : fs.existsSync(webEB)
      ? webEB
      : 'npx electron-builder';

  const targets = [];
  if (wantMac) targets.push('--mac');
  if (wantWin) targets.push('--win');
  if (wantWin) {
    targets.push('--config.win.target=portable');
  }

  const builderCmd = [
    `"${ebBin}"`,
    ...targets,
    '--x64',
    '--config.productName="FastHR Meetings"',
    '--config.appId=com.ajumapro.fasthr.meetings',
    '--config.directories.output=dist-desktop',
    '--config.extraMetadata.main=electron/main.js',
  ].join(' ');

  run(builderCmd);
  copyArtifacts();

  const destExe = path.join(webDownloads, ARTIFACT.exe);
  if (wantWin && !fs.existsSync(destExe) && fs.existsSync(distDir)) {
    for (const name of fs.readdirSync(distDir)) {
      const full = path.join(distDir, name);
      if (!fs.statSync(full).isFile()) continue;
      if (/^FastHR-Meetings-Windows/i.test(name) || /\.exe$/i.test(name)) {
        if (name.includes('blockmap')) continue;
        if (fs.statSync(full).size > 1_000_000) {
          fs.copyFileSync(full, destExe);
          console.log(`[meetings-electron] normalized → ${ARTIFACT.exe}`);
          break;
        }
      }
    }
  }

  if (wantWin && !fs.existsSync(destExe)) {
    const unpacked = path.join(distDir, 'win-unpacked', 'FastHR Meetings.exe');
    if (fs.existsSync(unpacked)) {
      fs.copyFileSync(unpacked, destExe);
      console.log(`[meetings-electron] used win-unpacked app as ${ARTIFACT.exe}`);
    }
  }

  if (wantWin && !fs.existsSync(destExe)) {
    console.error(
      `\n[meetings-electron] ${ARTIFACT.exe} was not produced.\n` +
        '  Check dist-desktop/ — ensure portable target completed.\n'
    );
    process.exit(1);
  }
  console.log('\n[meetings-electron] Done → frontend/public/downloads/');
} catch (err) {
  console.error(err);
  process.exit(1);
}
