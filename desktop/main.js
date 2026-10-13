// ===== POS Pro — application Windows =====
// Une fenêtre qui ouvre le site POS. Le site se met à jour tout seul (rien à réinstaller) et garde
// ses données et ses ventes hors connexion comme dans le navigateur (service worker + stockage local).
const { app, BrowserWindow, Menu, session, shell } = require('electron');
const path = require('node:path');

const APP_URL = 'https://pos-pro-dki5.netlify.app/';
const APP_ORIGIN = new URL(APP_URL).origin;

// Connexion Google : la page de Google ne peut pas s'afficher dans cette fenêtre (elle la refuse).
// Elle s'ouvre donc dans le navigateur ; une fois connecté, le navigateur appelle l'adresse
// « pospro://auth#... », Windows relance cette application, et la session est ouverte ici.
const PROTOCOL = 'pospro';
const USER_AGENT_MARK = 'POSProDesktop/1';

let mainWindow = null;
let pendingDeepLink = null;

// Cherche un lien « pospro://... » dans les arguments de lancement.
function findDeepLink(argv) {
  return (argv || []).find((arg) => typeof arg === 'string' && arg.toLowerCase().startsWith(`${PROTOCOL}://`)) || null;
}

// Transforme le lien reçu en adresse de NOTRE site (jamais un autre site), en gardant seulement
// les paramètres de connexion. Retourne null si le lien n'est pas une réponse de connexion.
function appUrlFromDeepLink(link) {
  try {
    if (typeof link !== 'string' || link.length > 6000) return null;
    const parsed = new URL(link);
    if (parsed.protocol !== `${PROTOCOL}:` || parsed.hostname !== 'auth') return null;
    const hasLogin = /(^|[#?&])(access_token|code|error)=/.test(`${parsed.search}${parsed.hash}`);
    if (!hasLogin) return null;
    const target = new URL(APP_URL);
    target.search = parsed.search;
    target.hash = parsed.hash;
    return target.toString();
  } catch {
    return null;
  }
}

function handleDeepLink(link) {
  const target = appUrlFromDeepLink(link);
  if (!target) return;
  if (!mainWindow) {
    pendingDeepLink = link;
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  mainWindow.loadURL(target);
}

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

  // Le site reconnaît ainsi qu'il tourne dans l'application Windows (connexion Google adaptée).
  mainWindow.webContents.setUserAgent(`${mainWindow.webContents.getUserAgent()} ${USER_AGENT_MARK}`);

  const startUrl = appUrlFromDeepLink(pendingDeepLink) || APP_URL;
  pendingDeepLink = null;
  mainWindow.loadURL(startUrl);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    const link = findDeepLink(commandLine);
    if (link) {
      handleDeepLink(link);
      return;
    }
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  // Lancement de l'application par le lien de connexion (application fermée au retour du navigateur).
  pendingDeepLink = findDeepLink(process.argv);

  app.whenReady().then(() => {
    app.setAppUserModelId('com.pospro.desktop');
    if (process.defaultApp) {
      if (process.argv.length >= 2) app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
    } else {
      app.setAsDefaultProtocolClient(PROTOCOL);
    }
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
