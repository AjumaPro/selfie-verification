/**
 * Copy frontend/build → backend/public for Express to serve on DigitalOcean.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'frontend', 'build');
const dest = path.join(root, 'backend', 'public');

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
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

if (!fs.existsSync(path.join(src, 'index.html'))) {
  console.error('frontend/build/index.html missing. Run the frontend build first.');
  process.exit(1);
}

rmrf(dest);
copyDir(src, dest);
console.log('✓ Copied frontend/build → backend/public');
