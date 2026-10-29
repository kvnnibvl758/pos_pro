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
}
