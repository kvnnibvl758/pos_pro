// ===== SYNCHRONISATION DES VENTES HORS CONNEXION =====
// Affiche l'état du réseau et envoie les ventes en attente dès que possible :
// au retour du réseau, à l'ouverture de l'onglet, après une connexion, puis toutes les 20 secondes.
import { state } from './state.js';
import { el } from './elements.js';
import * as cloudStore from './cloudStore.js';
import { refreshAll } from './ui.js';

const CHECK_INTERVAL_MS = 20000;
let goOnline = async () => true;
let running = false;

function plural(count, one, many) {
  return `${count} ${count > 1 ? many : one}`;
}

export function renderSyncBanner() {
  if (!el.syncBanner) return;
  const active = Boolean(state.currentUser?.cloud);
  const pending = active ? cloudStore.pendingCount() : 0;
  const failed = active ? cloudStore.failedEntries().length : 0;
  const offlineNow = active && state.cloud.offline;

  let text = '';
  let isError = false;
  if (failed) {
    text = `${plural(failed, 'vente n’a pas pu être enregistrée', 'ventes n’ont pas pu être enregistrées')} par le serveur.`;
    isError = true;
  } else if (offlineNow) {
    text = pending
      ? `Hors connexion — ${plural(pending, 'vente en attente', 'ventes en attente')} d’envoi. Vous pouvez continuer à vendre.`
      : 'Hors connexion — vous pouvez continuer à vendre, les ventes seront envoyées au retour du réseau.';
  } else if (pending) {
    text = state.cloud.syncMessage || `${plural(pending, 'vente en attente', 'ventes en attente')} d’envoi…`;
  }

  el.syncBanner.classList.toggle('hidden', !text);
  el.syncBanner.classList.toggle('is-error', isError);
  el.syncBannerText.textContent = text;
  el.syncRetryBtn.classList.toggle('hidden', !offlineNow && !pending);
  el.syncDetailsBtn.classList.toggle('hidden', !failed);
}

function reportResult(summary) {
  if (summary.shortfall.length) {
    const names = [...new Set(summary.shortfall)].join(', ');
    alert(`${plural(summary.synced, 'vente envoyée', 'ventes envoyées')} au serveur.\n\n`
      + `Attention : le stock était insuffisant pour « ${names} ». Les ventes ont été acceptées `
      + 'et le stock remis à 0. Vérifiez votre inventaire.');
  }
}

// Un passage de synchronisation : teste le réseau, renouvelle la session, envoie la file.
export async function syncNow() {
  if (running || !state.currentUser?.cloud) return;
  running = true;
  try {
    if (navigator.onLine === false) {
      cloudStore.setOffline(true);
      return;
    }

    const needsServer = state.cloud.offline || state.cloud.offlineSession || cloudStore.pendingCount() > 0;
    if (!needsServer) return;

    if (!(await cloudStore.probeServer())) {
      cloudStore.setOffline(true);
      return;
    }
    cloudStore.setOffline(false);

    if (!(await goOnline())) {
      state.cloud.syncMessage = 'Session expirée : déconnectez-vous puis reconnectez-vous pour envoyer vos ventes.';
      return;
    }
    state.cloud.syncMessage = '';

    const summary = await cloudStore.flushQueue();
    if (summary.stopped === 'auth') {
      state.cloud.syncMessage = 'Session expirée : déconnectez-vous puis reconnectez-vous pour envoyer vos ventes.';
    }
    if (summary.synced || summary.failed) refreshAll();
    reportResult(summary);
  } catch (error) {
    console.error('Synchronisation impossible :', error);
  } finally {
    running = false;
    renderSyncBanner();
  }
}

function showFailedDetails() {
  const failed = cloudStore.failedEntries();
  if (!failed.length) return;
  const lines = failed.map((entry) => `• ${entry.sale.time} — ${entry.sale.totalLabel} : ${entry.failed}`);
  const discard = confirm(
    `Ventes refusées par le serveur :\n\n${lines.join('\n')}\n\n`
    + 'Ces ventes ne seront pas enregistrées. Notez-les si besoin, puis supprimez-les de cet appareil ?'
  );
  if (discard) {
    cloudStore.discardFailedSales();
    renderSyncBanner();
  }
}

export function initSync({ goOnline: goOnlineFn }) {
  goOnline = goOnlineFn;

  window.addEventListener('pos:queue-changed', renderSyncBanner);
  window.addEventListener('pos:session', () => {
    renderSyncBanner();
    syncNow();
  });
  window.addEventListener('online', () => syncNow());
  window.addEventListener('offline', () => {
    if (state.currentUser?.cloud) cloudStore.setOffline(true);
    renderSyncBanner();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow();
  });
  setInterval(syncNow, CHECK_INTERVAL_MS);

  el.syncRetryBtn.addEventListener('click', () => {
    state.cloud.syncMessage = '';
    syncNow();
  });
  el.syncDetailsBtn.addEventListener('click', showFailedDetails);
}
