// ===== APPLICATION INSTALLABLE (PWA) =====
// - enregistre le service worker (HTTPS ou localhost uniquement : le navigateur l'impose) ;
// - affiche un bouton « Installer l'application » quand le navigateur le permet.
// Sur iPhone/iPad, il n'existe pas de bouton : Partager → « Sur l'écran d'accueil ».
import { el } from './elements.js';

let installPrompt = null;

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches
  || window.navigator.standalone === true;

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;

    // Met en cache ce que la page a déjà chargé (modules JS, CSS...) pour le mode hors connexion.
    const urls = performance.getEntriesByType('resource').map((entry) => entry.name);
    const worker = registration.active || navigator.serviceWorker.controller;
    if (worker) worker.postMessage({ type: 'CACHE_URLS', urls });
  } catch (error) {
    console.warn('Service worker indisponible :', error.message);
  }
}

// ----- Mises à jour : détecte une nouvelle version publiée et propose de l'appliquer (sans vieux fichiers). -----
const UPDATE_CHECK_MS = 5 * 60 * 1000;
let baseline = null;
let updateShown = false;

async function fingerprint() {
  const urls = new Set([location.pathname]);
  performance.getEntriesByType('resource').forEach((entry) => {
    try {
      const url = new URL(entry.name);
      if (url.origin === location.origin && /\.(js|css)$/.test(url.pathname)) urls.add(url.pathname);
    } catch { /* ignoré */ }
  });
  const result = {};
  await Promise.all([...urls].map(async (path) => {
    try {
      const response = await fetch(path, { method: 'HEAD', cache: 'no-cache' });
      if (response.ok) result[path] = response.headers.get('etag') || response.headers.get('last-modified') || response.headers.get('content-length') || '';
    } catch { /* hors connexion : on réessaiera */ }
  }));
  return result;
}

function showUpdateBanner() {
  if (updateShown) return;
  updateShown = true;
  const bar = document.createElement('div');
  bar.className = 'update-banner';
  bar.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = 'Une nouvelle version de POS Pro est disponible.';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Mettre à jour';
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Mise à jour…';
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      const registration = await navigator.serviceWorker?.getRegistration();
      await registration?.update();
    } catch { /* on recharge quand même */ }
    location.reload();
  });
  bar.append(text, button);
  document.body.appendChild(bar);
}

async function checkForUpdate() {
  if (!navigator.onLine || updateShown) return;
  const current = await fingerprint();
  if (!Object.keys(current).length) return;
  if (!baseline) { baseline = current; return; }
  const changed = Object.keys(current).some((path) => path in baseline && baseline[path] !== current[path]);
  if (changed) showUpdateBanner();
}

function watchForUpdates() {
  setTimeout(checkForUpdate, 3000);
  setInterval(checkForUpdate, UPDATE_CHECK_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
}

export function initPwa() {
  if (el.installAppBtn) {
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      installPrompt = event;
      if (!isStandalone()) el.installAppBtn.classList.remove('hidden');
    });

    window.addEventListener('appinstalled', () => {
      installPrompt = null;
      el.installAppBtn.classList.add('hidden');
    });

    el.installAppBtn.addEventListener('click', async () => {
      if (!installPrompt) return;
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      el.installAppBtn.classList.add('hidden');
    });
  }

  registerServiceWorker();
  watchForUpdates();
}
