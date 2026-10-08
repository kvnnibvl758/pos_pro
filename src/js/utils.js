// ===== FORMATAGE ET CALCULS PARTAGES =====
import { state } from './state.js';

const HTML_ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Empeche l'injection HTML/JS quand une donnée saisie par un utilisateur
// (nom de produit, de client, d'utilisateur...) est insérée via innerHTML.
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: state.businessConfig.currency || 'GNF',
    maximumFractionDigits: 0
  }).format(value || 0);
}

export function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getSaleDateKey(sale) {
  if (sale.saleDate) return sale.saleDate;
  const parsedDate = new Date(sale.time);
  return Number.isNaN(parsedDate.getTime()) ? '' : getDateKey(parsedDate);
}

export function getCurrentCashierSalesTotal() {
  const todayKey = getDateKey();
  return state.salesHistory
    .filter((sale) => getSaleDateKey(sale) === todayKey && state.currentUser && String(sale.cashierId) === String(state.currentUser.id))
    .reduce((sum, sale) => sum + Number(sale.total || 0), 0);
}

export function getVisibleSales() {
  if (!state.currentUser) return [];

  const isAdministrator = state.currentUser.isPrimary || state.currentUser.role === 'admin';
  if (isAdministrator) return state.salesHistory;

  return state.salesHistory.filter((sale) => String(sale.cashierId) === String(state.currentUser.id));
}

// Verifie qu'un fichier choisi par l'utilisateur est bien une image et reste
// sous la taille limite, avant de la lire en base64.
const MAX_IMAGE_SIZE_MB = 2;

export function validateImageFile(file) {
  if (!file) return { valid: false, error: 'Aucun fichier sélectionné.' };
  if (!file.type || !file.type.startsWith('image/')) {
    return { valid: false, error: 'Le fichier doit être une image (JPG, PNG, WEBP...).' };
  }
  if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
    return { valid: false, error: `L’image dépasse ${MAX_IMAGE_SIZE_MB} Mo. Choisissez un fichier plus léger.` };
  }
  return { valid: true, error: '' };
}
