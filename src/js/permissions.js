// ===== DROITS D'ACCES ET VALIDATIONS =====
// Aucune dépendance vers les modules d'UI : évite les imports circulaires.
import { state } from './state.js';

export function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

export function isStrongCashierPassword(password) {
  return Boolean(password) && password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);
}

export function getUserRoleLabel(role) {
  return role === 'admin' ? 'Administrateur' : 'Caissier';
}

export function canManageUsers() {
  return Boolean(state.currentUser && state.currentUser.isPrimary);
}

export function canManageCustomers() {
  return Boolean(state.currentUser && state.currentUser.isPrimary);
}

export function canManageProducts() {
  return Boolean(state.currentUser && state.currentUser.isPrimary);
}

export function isInventoryEnabled() {
  const { inventoryMode, typeLabel } = state.businessConfig;
  if (inventoryMode === 'enabled') return true;
  if (inventoryMode === 'disabled') return false;

  const establishmentType = (typeLabel || '').toLowerCase();
  return !/(restaurant|restauration|café|cafe|snack|bar)/i.test(establishmentType);
}

// Un produit est suivi en stock seulement si le stock est activé globalement
// ET que ce produit n'a pas été marqué "préparé à la demande" (trackStock: false).
// L'absence du champ (anciens produits) équivaut à "suivi" par défaut.
export function productTracksStock(product) {
  return isInventoryEnabled() && product?.trackStock !== false;
}
