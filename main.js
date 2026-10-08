const { app, BrowserWindow, Menu } = require('electron');
const path = require('node:path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    title: 'Wayfarer',
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    backgroundColor: '#101711',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.loadFile(path.join(__dirname, 'wayfarer.html'));
}

// Only one copy at a time, so two windows cannot overwrite each other's saves.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    // The menu bar stays hidden, but these keep standard shortcuts working
    // (copy/paste, F11 for fullscreen, quit).
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Game', submenu: [{ role: 'togglefullscreen' }, { role: 'quit' }] },
      { role: 'editMenu' }
    ]));
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
