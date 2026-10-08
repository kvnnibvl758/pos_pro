// ===== SYNCHRONISATION ENTRE ONGLETS =====
// Si la caisse est ouverte dans plusieurs onglets du même navigateur, un
// changement de données dans l'un (vente, produit, client...) est répercuté
// dans les autres via l'évènement "storage" (déclenché uniquement dans les
// AUTRES onglets par le navigateur — jamais dans l'onglet qui a écrit).
import { state } from './state.js';
import { KEYS } from './storage.js';
import { refreshAll } from './ui.js';
import { isCloudMode } from './supabaseClient.js';
import { renderBusinessIdentity, updateInventoryUI } from './settings.js';

function readJSON(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function initCrossTabSync() {
  // En mode cloud, la synchronisation entre appareils est assurée par le temps réel.
  if (isCloudMode()) return;

  window.addEventListener('storage', (event) => {
    if (!event.key) return;

    switch (event.key) {
      case KEYS.products:
        state.products.splice(0, state.products.length, ...readJSON(event.newValue, []));
        break;
      case KEYS.sales:
        state.salesHistory.splice(0, state.salesHistory.length, ...readJSON(event.newValue, []));
        break;
      case KEYS.customers:
        state.customers.splice(0, state.customers.length, ...readJSON(event.newValue, []));
        break;
      case KEYS.users:
        state.userAccounts = readJSON(event.newValue, state.userAccounts);
        break;
      case KEYS.business:
        Object.assign(state.businessConfig, readJSON(event.newValue, {}));
        renderBusinessIdentity();
        updateInventoryUI();
        break;
      default:
        return;
    }

    refreshAll();
  });
}
