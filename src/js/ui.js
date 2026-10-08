// ===== ORCHESTRATION DE L'INTERFACE =====
import { state } from './state.js';
import { el } from './elements.js';
import { canManageCustomers, canManageProducts } from './permissions.js';
import { renderProducts } from './products.js';
import { renderCart, updateTotals } from './cart.js';
import { syncCustomerOptions, renderCustomers, openCustomerModal } from './customers.js';
import { renderSalesHistory } from './sales.js';
import { openDashboard } from './reports.js';
import { openProductModal } from './products.js';
import { openSettingsModal } from './settings.js';
import { shouldShowBackupReminder } from './backupReminder.js';

export function refreshAll() {
  syncCustomerOptions();
  renderCustomers();
  renderProducts(el.searchInput.value);
  renderCart();
  renderSalesHistory();
}

export function showAuthGate() {
  el.authGate.classList.remove('hidden');
  el.appShell.classList.add('hidden');
}

export function hideAuthGate() {
  el.authGate.classList.add('hidden');
  el.appShell.classList.remove('hidden');
}

export function closeAllOverlays() {
  el.productModal.classList.add('hidden');
  el.customerModal.classList.add('hidden');
  el.dashboardModal.classList.add('hidden');
  el.settingsModal.classList.add('hidden');
}

export function clearPostSessionData() {
  state.currentUser = null;
  state.cart.length = 0;
  state.discount = 0;

  el.loginForm.reset();
  el.cloudAuthForm.reset();
  el.userForm.reset();
  el.customerSelect.value = '';
  el.searchInput.value = '';

  updateSessionUI();
  renderCart();
  renderProducts();
}

export function showSection(section) {
  if (!state.currentUser && section !== 'vente') {
    alert('Connectez-vous pour accéder à cette partie.');
    return;
  }

  closeAllOverlays();

  if (section === 'produits') return openProductModal();
  if (section === 'clients') return openCustomerModal();
  if (section === 'historique') return openDashboard('history');
  if (section === 'rapports') return openDashboard('reports');
  if (section === 'parametres') return openSettingsModal();
}

export function updateSessionUI() {
  if (el.sessionUser) {
    el.sessionUser.textContent = state.currentUser ? state.currentUser.username : 'Non connecté';
  }

  updateTotals();

  if (el.logoutBtn) el.logoutBtn.style.display = state.currentUser ? 'inline-flex' : 'none';
  if (el.loginAgainBtn) el.loginAgainBtn.style.display = state.currentUser ? 'none' : 'inline-flex';

  el.navItems.forEach((button) => {
    const isSaleSection = button.dataset.section === 'vente';
    button.disabled = !state.currentUser && !isSaleSection;
    button.classList.toggle('locked-nav', !state.currentUser && !isSaleSection);
  });

  if (el.customerForm) el.customerForm.style.display = canManageCustomers() ? 'grid' : 'none';
  if (el.settingsNav) el.settingsNav.style.display = state.currentUser ? 'block' : 'none';

  if (el.productGrid && el.searchInput) renderProducts(el.searchInput.value);

  if (el.backupReminderBanner) {
    const showReminder = Boolean(state.currentUser) && canManageProducts() && shouldShowBackupReminder(state.salesHistory.length);
    el.backupReminderBanner.classList.toggle('hidden', !showReminder);
  }
}

export function initNavigation() {
  el.navItems.forEach((button) => {
    button.addEventListener('click', () => {
      if (!state.currentUser && button.dataset.section !== 'vente') {
        alert('Connectez-vous pour accéder à cette partie.');
        return;
      }

      el.navItems.forEach((nav) => nav.classList.remove('active'));
      button.classList.add('active');
      showSection(button.dataset.section);
    });
  });
}

// Deconnecte automatiquement la session en cours apres une periode d'inactivite,
// pour eviter qu'une caisse laissee sans surveillance reste ouverte.
const INACTIVITY_LIMIT_MS = 15 * 60 * 1000;

// La déconnexion réelle (qui dépend du mode local/cloud) est fournie par auth.js au démarrage.
let logoutHandler = null;
export function setLogoutHandler(handler) {
  logoutHandler = handler;
}

export function initInactivityTimeout() {
  let timer = null;

  function scheduleLogout() {
    clearTimeout(timer);
    if (!state.currentUser) return;

    timer = setTimeout(() => {
      if (!state.currentUser) return;
      if (logoutHandler) logoutHandler();
      else {
        clearPostSessionData();
        showAuthGate();
      }
      alert('Session fermée après une période d’inactivité. Reconnectez-vous.');
    }, INACTIVITY_LIMIT_MS);
  }

  ['mousedown', 'keydown', 'touchstart', 'click'].forEach((eventName) => {
    document.addEventListener(eventName, scheduleLogout, { passive: true });
  });

  scheduleLogout();
}
