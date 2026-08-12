const { app, BrowserWindow, shell, nativeImage } = require('electron');
const path = require('path');
const isDev = !app.isPackaged;

function resolveIcon() {
  const candidates = [
    path.join(__dirname, 'assets', 'icon.png'),
    path.join(__dirname, '..', 'build', 'icons', 'icon-512.png'),
    path.join(__dirname, '..', 'public', 'icons', 'icon-512.png'),
    path.join(__dirname, '..', 'public', 'Glico.png'),
  ];
  for (const p of candidates) {
    try {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) return img;
    } catch {
      /* try next */
    }
  }
  return undefined;
}

function createWindow() {
  const icon = resolveIcon();
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    title: 'GLICO Meetings',
    backgroundColor: '#103078',
    icon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
  });
  win.once('ready-to-show', () => {
    win.setTitle('GLICO Meetings');
    win.show();
  });
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
  if (process.platform === 'darwin' && app.dock) {
    const icon = resolveIcon();
    if (icon) app.dock.setIcon(icon);
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
