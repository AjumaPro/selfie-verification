/**
 * Build selfie-verification-ui.zip into frontend/build/downloads
 * so DigitalOcean / Express can serve it after copy-web-to-api.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const buildDir = path.join(root, 'frontend', 'build');
const outDir = path.join(buildDir, 'downloads');
const zipPath = path.join(outDir, 'selfie-verification-ui.zip');
const stagingDir = path.join(root, 'frontend', '.download-staging');
const publicDownloads = path.join(root, 'frontend', 'public', 'downloads');

function rimraf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === 'downloads') continue; // avoid nesting old zips
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

function writeInstallGuide(dest) {
  fs.writeFileSync(
    path.join(dest, 'INSTALL.txt'),
    `GLICO Platform — UI package
============================

1. Unzip this folder.
2. Serve it locally, e.g.:
     npx --yes serve -s . -l 5173
3. Open http://localhost:5173
4. Or use the hosted site and "Install via browser" (PWA).

Desktop .exe / .dmg installers are built separately with:
  cd frontend && npm run electron:build
`,
    'utf8'
  );
}

function zipWithCli(staging, zipFile) {
  execSync(`cd "${staging}" && zip -r "${zipFile}" . -x "*.DS_Store"`, {
    stdio: 'inherit',
  });
}

function zipWithArchiver(staging, zipFile) {
  const archiver = require('archiver');
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipFile);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(staging, false);
    archive.finalize();
  });
}

async function main() {
  if (!fs.existsSync(path.join(buildDir, 'index.html'))) {
    console.error('frontend/build missing — run the CRA build first');
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });
  rimraf(stagingDir);
  fs.mkdirSync(stagingDir, { recursive: true });
  copyDir(buildDir, stagingDir);
  writeInstallGuide(stagingDir);

  // Copy help text files into downloads folder for the live site
  fs.mkdirSync(outDir, { recursive: true });
  for (const name of ['MAC-INSTALL.txt', 'WINDOWS-INSTALL.txt']) {
    const src = path.join(publicDownloads, name);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(outDir, name));
  }

  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  let used = 'zip';
  try {
    zipWithCli(stagingDir, zipPath);
  } catch {
    used = 'archiver';
    await zipWithArchiver(stagingDir, zipPath);
  }

  rimraf(stagingDir);

  // Also mirror into public/downloads for local CRA static serving
  fs.mkdirSync(publicDownloads, { recursive: true });
  fs.copyFileSync(zipPath, path.join(publicDownloads, 'selfie-verification-ui.zip'));

  const sizeMb = (fs.statSync(zipPath).size / (1024 * 1024)).toFixed(2);
  console.log(`✓ UI ZIP ready via ${used}: ${zipPath} (${sizeMb} MB)`);
}

main().catch((err) => {
  console.error('make-ui-zip failed:', err.message);
  process.exit(1);
});
