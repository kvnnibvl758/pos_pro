// ===== PARAMETRES : ENTREPRISE, APPARENCE, COMPTE, CAISSIERS, DONNEES =====
import { state } from './state.js';
import { el } from './elements.js';
import { canManageProducts, canManageUsers, isInventoryEnabled } from './permissions.js';
import { escapeHtml, validateImageFile } from './utils.js';
import * as store from './store.js';
import * as cloudStore from './cloudStore.js';
import { isCloudMode } from './supabaseClient.js';
import { renderProducts } from './products.js';
import { renderUserManagementList } from './users.js';
import { openProfileModal } from './cloudAuth.js';
import { recordBackupDone, dismissBackupReminderToday } from './backupReminder.js';

export function renderBusinessIdentity() {
  const safeName = escapeHtml(state.businessConfig.name);
  const safeLogo = escapeHtml(state.businessConfig.logo);

  if (el.brandName) el.brandName.textContent = state.businessConfig.name;
  if (el.businessTypeLabel) el.businessTypeLabel.textContent = state.businessConfig.typeLabel || 'Boutique';
  if (el.pageTitle) el.pageTitle.textContent = state.businessConfig.name;
  if (el.brandIcon) {
    el.brandIcon.innerHTML = state.businessConfig.logo
      ? `<img class="brand-logo" src="${safeLogo}" alt="Logo ${safeName}" />`
      : 'POS';
  }

  if (el.authGateName) el.authGateName.textContent = state.businessConfig.name;
  if (el.authGateType) el.authGateType.textContent = state.businessConfig.typeLabel || 'Boutique';
  if (el.authGateLogo) {
    el.authGateLogo.innerHTML = state.businessConfig.logo
      ? `<img class="brand-logo" src="${safeLogo}" alt="Logo ${safeName}" />`
      : 'POS';
  }
}

export function updateInventoryUI() {
  const inventoryEnabled = isInventoryEnabled();
  document.querySelectorAll('.inventory-only').forEach((element) => {
    element.style.display = inventoryEnabled ? '' : 'none';
  });

  if (el.productStock) {
    el.productStock.required = inventoryEnabled;
    if (!inventoryEnabled) el.productStock.value = '0';
  }
}

function switchSettingsTab(tabName) {
  el.settingsTabs.querySelectorAll('.settings-tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tabName);
  });

  document.querySelectorAll('.settings-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.panel === tabName);
  });
}

export function openSettingsModal() {
  const isAdmin = canManageProducts();

  // Onglet Entreprise : consultable par tous, modifiable par l'administrateur principal uniquement.
  el.settingsForm.querySelectorAll('input, select').forEach((field) => { field.disabled = !isAdmin; });
  const settingsSubmitBtn = el.settingsForm.querySelector('button[type="submit"]');
  if (settingsSubmitBtn) settingsSubmitBtn.disabled = !isAdmin;
  el.businessNameInput.value = state.businessConfig.name;
  el.businessTypeInput.value = state.businessConfig.typeLabel || 'Boutique';
  el.currencyInput.value = state.businessConfig.currency || 'GNF';
  el.taxRateInput.value = state.businessConfig.taxRate ?? 0;
  el.inventoryModeInput.value = state.businessConfig.inventoryMode;
  el.lowStockThresholdInput.value = state.businessConfig.lowStockThreshold ?? 5;
  el.businessLogoInput.value = '';
  el.businessLogoPreview.src = state.businessConfig.logo;
  el.businessLogoPreview.classList.toggle('visible', Boolean(state.businessConfig.logo));

  // Onglet Mon compte : formulaire local ou renvoi vers le profil cloud.
  const isCloudUser = Boolean(state.currentUser?.cloud);
  el.localAccountPanel.classList.toggle('hidden', isCloudUser);
  el.cloudAccountPanel.classList.toggle('hidden', !isCloudUser);
  if (!isCloudUser && state.currentUser) {
    el.accountUsernameInput.value = state.currentUser.username;
  }

  // Onglet Caissiers : réservé à l'administrateur principal.
  const canSeeUsers = canManageUsers();
  el.settingsTabCaissiers.style.display = canSeeUsers ? '' : 'none';
  el.newUserEmailField.classList.toggle('hidden', !isCloudMode());
  el.newUserEmail.required = isCloudMode();
  el.newUserNameLabel.textContent = isCloudMode() ? 'Nom du caissier' : 'Identifiant du caissier';
  if (canSeeUsers) {
    renderUserManagementList();
    if (isCloudMode()) {
      cloudStore.loadMembers().then(renderUserManagementList).catch((error) => console.error(error.message));
    }
  }

  // Onglet Données : réservé à l'administrateur principal.
  el.settingsTabDonnees.style.display = isAdmin ? '' : 'none';

  switchSettingsTab('general');
  el.settingsModal.classList.remove('hidden');
}

export function closeSettingsModal() {
  el.settingsModal.classList.add('hidden');
  el.settingsForm.reset();
}

// Sauvegarde manuelle : exporte les données locales (hors comptes/mots de passe)
// en fichier JSON téléchargeable, à conserver en lieu sûr.
function exportBackup() {
  if (!canManageProducts()) {
    alert('Seul l’administrateur principal peut exporter une sauvegarde.');
    return;
  }

  const backup = {
    exportedAt: new Date().toISOString(),
    businessConfig: state.businessConfig,
    products: state.products,
    customers: state.customers,
    salesHistory: state.salesHistory
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStamp = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `sauvegarde-pos-${dateStamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  recordBackupDone();
  if (el.backupReminderBanner) el.backupReminderBanner.classList.add('hidden');
}

export function initSettings() {
  el.settingsTabs.querySelectorAll('.settings-tab').forEach((button) => {
    button.addEventListener('click', () => switchSettingsTab(button.dataset.tab));
  });

  el.businessLogoInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const { valid, error } = validateImageFile(file);
    if (!valid) {
      alert(error);
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      el.businessLogoPreview.src = loadEvent.target.result;
      el.businessLogoPreview.classList.add('visible');
    };
    reader.readAsDataURL(file);
  });

  el.settingsForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!canManageProducts()) {
      alert('Seul l’administrateur principal peut modifier la configuration.');
      return;
    }

    const name = el.businessNameInput.value.trim();
    const typeLabel = el.businessTypeInput.value.trim();
    if (!name || !typeLabel) {
      alert('Le nom et le libellé de l’établissement sont obligatoires.');
      return;
    }

    const taxRate = Number(el.taxRateInput.value);
    const lowStockThreshold = Number(el.lowStockThresholdInput.value);
    const previousConfig = { ...state.businessConfig };

    state.businessConfig.name = name;
    state.businessConfig.typeLabel = typeLabel;
    state.businessConfig.currency = el.currencyInput.value;
    state.businessConfig.taxRate = Number.isFinite(taxRate) && taxRate >= 0 ? taxRate : 0;
    state.businessConfig.inventoryMode = el.inventoryModeInput.value;
    state.businessConfig.lowStockThreshold = Number.isFinite(lowStockThreshold) && lowStockThreshold >= 1 ? lowStockThreshold : 5;
    if (el.businessLogoPreview.src && el.businessLogoPreview.classList.contains('visible')) {
      state.businessConfig.logo = el.businessLogoPreview.src;
    }

    try {
      await store.saveBusinessConfig();
    } catch (error) {
      Object.assign(state.businessConfig, previousConfig);
      alert(error.message);
      return;
    }

    renderBusinessIdentity();
    updateInventoryUI();
    renderProducts(el.searchInput.value);
    alert('Paramètres de l’entreprise enregistrés.');
  });

  el.closeSettingsBtn.addEventListener('click', closeSettingsModal);

  if (el.exportBackupBtn) {
    el.exportBackupBtn.addEventListener('click', exportBackup);
  }

  if (el.backupBannerExportBtn) {
    el.backupBannerExportBtn.addEventListener('click', exportBackup);
  }

  if (el.backupBannerDismissBtn) {
    el.backupBannerDismissBtn.addEventListener('click', () => {
      dismissBackupReminderToday();
      el.backupReminderBanner.classList.add('hidden');
    });
  }

  if (el.cloudProfileEditBtn) {
    el.cloudProfileEditBtn.addEventListener('click', () => {
      closeSettingsModal();
      openProfileModal();
    });
  }
}
