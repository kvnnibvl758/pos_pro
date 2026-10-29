// ===== POINT D'ENTREE DE L'APPLICATION =====
import { loadInitialState } from './storage.js';
import { state } from './state.js';
import { renderBusinessIdentity, updateInventoryUI, initSettings } from './settings.js';
import { syncCustomerOptions, renderCustomers, initCustomers } from './customers.js';
import { renderProducts, initProducts } from './products.js';
import { renderCart, initCart } from './cart.js';
import { renderSalesHistory, initSales } from './sales.js';
import { renderUserManagementList, initUsers } from './users.js';
import { initReports } from './reports.js';
import { initNavigation, updateSessionUI, showAuthGate, initInactivityTimeout, setLogoutHandler } from './ui.js';
import { initAuth, performLogout } from './auth.js';
import { initCloudAuth, initializeCloudAuth, goOnline } from './cloudAuth.js';
import { initSync } from './sync.js';
import { initSubscription } from './subscription.js';
import { initTheme } from './theme.js';
import { initCrossTabSync } from './crossTabSync.js';
import { initPwa } from './pwa.js';
import { initPasswordToggles } from './passwordToggle.js';
import { showLoading } from './loading.js';

// Bouton « Actualiser » : recharge l'application pour récupérer la dernière version (utile dans l'application
// Windows, qui n'a pas de bouton de rechargement). Les ventes hors connexion en attente restent sur l'appareil.
function initRefreshButton() {
  const button = document.getElementById('refreshAppBtn');
  if (!button) return;
  button.addEventListener('click', async () => {
    if (state.cart.length && !confirm('Le panier en cours sera vidé. Actualiser quand même ?')) return;
    showLoading('Actualisation…');
    // En ligne : on efface les anciens fichiers gardés en mémoire pour récupérer la dernière version publiée.
    // Hors connexion on les garde, sinon l'application ne pourrait plus démarrer.
    if (navigator.onLine) {
      try {
        const registration = await navigator.serviceWorker?.getRegistration();
        await registration?.update();
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch { /* on recharge quand même */ }
    }
    window.location.reload();
  });
}

async function init() {
  // 1. Charger toutes les données (localStorage) dans l'état partagé.
  await loadInitialState();

  // 2. Brancher les écouteurs d'évènements de chaque module.
  initNavigation();
  initProducts();
  initCart();
  initCustomers();
  initSales();
  initReports();
  initSettings();
  initUsers();
  initAuth();
  initCloudAuth();
  initSync({ goOnline });
  initSubscription();
  initPasswordToggles();
  initRefreshButton();

  // 3. Premier rendu de l'interface.
  syncCustomerOptions();
  renderCustomers();
  renderProducts();
  renderCart();
  renderSalesHistory();
  renderUserManagementList();
  renderBusinessIdentity();
  updateInventoryUI();
  updateSessionUI();
  setLogoutHandler(performLogout);
  initInactivityTimeout();
  initTheme();
  initCrossTabSync();
  initPwa();

  // 4. Ecran de connexion + session cloud éventuelle.
  try {
    showAuthGate();
  } catch (error) {
    console.error('Erreur lors de l’affichage de l’écran de connexion:', error);
  }

  try {
    initializeCloudAuth();
  } catch (error) {
    console.error('Erreur lors de l’initialisation du cloud:', error);
  }
}

init();
