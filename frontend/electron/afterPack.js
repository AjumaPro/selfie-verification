/**
 * electron-builder afterPack: ad-hoc sign Mac .app before DMG/ZIP are created.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  if (!fs.existsSync(appPath)) {
    console.warn('afterPack: app not found at', appPath);
    return;
  }

  console.log('afterPack: ad-hoc codesign', appPath);
  execSync(`xattr -cr ${JSON.stringify(appPath)}`, { stdio: 'inherit' });
  execSync(`codesign --force --deep --sign - ${JSON.stringify(appPath)}`, {
    stdio: 'inherit',
  });
};
