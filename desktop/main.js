// ===== POS Pro — application Windows =====
// Une fenêtre qui ouvre le site POS. Le site se met à jour tout seul (rien à réinstaller) et garde
// ses données et ses ventes hors connexion comme dans le navigateur (service worker + stockage local).
const { app, BrowserWindow, Menu, session, shell } = require('electron');
const path = require('node:path');

const APP_URL = 'https://pos-pro-dki5.netlify.app/';
const APP_ORIGIN = new URL(APP_URL).origin;

let mainWindow = null;

function isAppUrl(url) {
  try {
    return new URL(url).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

function openInBrowser(url) {
  // Seuls les liens web sont ouverts dans le navigateur (jamais de fichier ni de programme).
  try {
    const { protocol } = new URL(url);
    if (protocol === 'https:' || protocol === 'http:') shell.openExternal(url);
  } catch {
    // Adresse invalide : ignorée.
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 360,
    minHeight: 560,
    show: false,
    backgroundColor: '#f4f5f7',
    title: 'POS Pro',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  // Premier lancement sans internet (le site n'est pas encore en cache) : page d'explication.
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, _description, validatedUrl, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 || !isAppUrl(validatedUrl)) return; // -3 : chargement annulé
    mainWindow.loadFile(path.join(__dirname, 'offline.html'));
  });

  mainWindow.loadURL(APP_URL);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('com.pospro.desktop');
    Menu.setApplicationMenu(null);

    // Aucune autorisation (caméra, micro, localisation...) n'est accordée au site.
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);

    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  // Règles communes à toutes les fenêtres (principale et ticket de caisse).
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      if (url.startsWith('file:') && contents === mainWindow?.webContents) return; // page hors connexion
      if (!isAppUrl(url)) {
        event.preventDefault();
        openInBrowser(url);
      }
    });

    contents.setWindowOpenHandler(({ url }) => {
      // Le ticket de caisse s'ouvre dans une fenêtre vide (about:blank) remplie par l'application.
      if (url === 'about:blank' || url === '') {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: { width: 440, height: 700, autoHideMenuBar: true, title: 'Ticket' }
        };
      }
      if (isAppUrl(url)) return { action: 'allow' };
      openInBrowser(url);
      return { action: 'deny' };
    });
  });

  app.on('window-all-closed', () => app.quit());
}
