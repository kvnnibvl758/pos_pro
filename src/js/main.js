// ===== POINT D'ENTREE DE L'APPLICATION =====
import { loadInitialState } from './storage.js';
import { renderBusinessIdentity, updateInventoryUI, initSettings } from './settings.js';
import { syncCustomerOptions, renderCustomers, initCustomers } from './customers.js';
import { renderProducts, initProducts } from './products.js';
import { renderCart, initCart } from './cart.js';
import { renderSalesHistory, initSales } from './sales.js';
import { renderUserManagementList, initUsers } from './users.js';
import { initReports } from './reports.js';
import { initNavigation, updateSessionUI, showAuthGate, initInactivityTimeout, setLogoutHandler } from './ui.js';
import { initAuth, performLogout } from './auth.js';
import { initCloudAuth, initializeCloudAuth } from './cloudAuth.js';
import { initTheme } from './theme.js';
import { initCrossTabSync } from './crossTabSync.js';
import { initPwa } from './pwa.js';

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
