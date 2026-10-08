// ===== PERSISTANCE LOCALE (localStorage) =====
import { state } from './state.js';
import { createPasswordRecord } from './crypto.js';
import { isCloudMode } from './supabaseClient.js';

export const KEYS = {
  products: 'pos-custom-products',
  sales: 'pos-sales-history',
  customers: 'pos-customers',
  users: 'pos-user-accounts',
  business: 'pos-business-config'
};

const defaultProducts = [
  { id: 1, name: 'Coca Cola', category: 'Boissons', price: 900, stock: 18, image: '' },
  { id: 2, name: 'Sandwich', category: 'Alimentaire', price: 1500, stock: 12, image: '' },
  { id: 3, name: 'Glace', category: 'Desserts', price: 5000, stock: 10, image: '' },
  { id: 4, name: 'Eau minérale', category: 'Boissons', price: 500, stock: 24, image: '' },
  { id: 5, name: 'Chips', category: 'Alimentaire', price: 700, stock: 30, image: '' },
  { id: 6, name: 'Chocolat', category: 'Desserts', price: 8000, stock: 15, image: '' },
  { id: 7, name: 'Jus d’orange', category: 'Boissons', price: 800, stock: 14, image: '' },
  { id: 8, name: 'Gâteau', category: 'Desserts', price: 25000, stock: 8, image: '' }
];

const defaultCustomers = [
  { id: 1, name: 'Mariam Diallo', phone: '+224 620 000 000', type: 'particulier' },
  { id: 2, name: 'Kéita Store', phone: '+224 621 111 111', type: 'entreprise' }
];

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.error(`Lecture impossible pour "${key}":`, error);
    return fallback;
  }
}

export function saveProducts() {
  localStorage.setItem(KEYS.products, JSON.stringify(state.products));
}

export function saveSales() {
  localStorage.setItem(KEYS.sales, JSON.stringify(state.salesHistory));
}

export function saveCustomers() {
  localStorage.setItem(KEYS.customers, JSON.stringify(state.customers));
}

export function saveUsers() {
  localStorage.setItem(KEYS.users, JSON.stringify(state.userAccounts));
}

export function saveBusinessConfig() {
  localStorage.setItem(KEYS.business, JSON.stringify(state.businessConfig));
}

function migrateLegacyCategories(products) {
  products.forEach((product) => {
    if (product.category === 'Électronique' || product.category === 'Electronique') {
      console.warn('Produit legacy détecté:', product.name, '- catégorie mise à jour vers "Autres"');
      product.category = 'Autres';
    }
  });
}

// Convertit d'anciens comptes stockés avec un mot de passe en clair (versions
// précédentes de l'app) vers le format haché + salé. Sans effet sur des comptes déjà migrés.
async function migratePlaintextPasswords(users) {
  for (const user of users) {
    if (user.password && !user.passwordHash) {
      console.warn(`Migration du mot de passe de "${user.username}" vers un format haché.`);
      const { salt, hash } = await createPasswordRecord(user.password);
      user.salt = salt;
      user.passwordHash = hash;
      delete user.password;
    }
  }
  return users;
}

async function ensurePrimaryAdmin(users) {
  const primaryAdmin = users.find((user) => user.isPrimary)
    || users.find((user) => String(user.username || '').trim().toLowerCase() === 'admin');

  if (primaryAdmin) {
    primaryAdmin.isPrimary = true;
    primaryAdmin.role = 'admin';
    return users;
  }

  console.warn('Création du compte admin par défaut - À CHANGER IMMEDIATEMENT');
  const { salt, hash } = await createPasswordRecord('Adminchange123');
  return [{ id: Date.now(), username: 'admin', salt, passwordHash: hash, role: 'admin', isPrimary: true }, ...users];
}

// Charge toutes les données depuis localStorage dans l'état partagé.
// A appeler une seule fois, au démarrage de l'application.
export async function loadInitialState() {
  // Mode cloud : le serveur est la source de vérité. Aucune donnée locale n'est
  // lue (ni démo, ni compte admin par défaut) : tout est chargé après connexion.
  if (isCloudMode()) {
    state.products = [];
    state.customers = [];
    state.salesHistory = [];
    state.userAccounts = [];
    return;
  }

  state.products = readJSON(KEYS.products, null) || defaultProducts;
  migrateLegacyCategories(state.products);
  saveProducts();

  state.salesHistory = readJSON(KEYS.sales, []);
  state.customers = readJSON(KEYS.customers, null) || defaultCustomers;

  // Les identifiants sont des chaînes opaques (uuid en cloud) : on normalise les anciens numéros.
  state.products.forEach((product) => { product.id = String(product.id); });
  state.customers.forEach((customer) => { customer.id = String(customer.id); });
  // Fusion avec les valeurs par défaut : une config enregistrée avant l'ajout
  // d'un nouveau réglage (devise, TVA...) ne doit pas perdre sa valeur par défaut.
  state.businessConfig = { ...state.businessConfig, ...(readJSON(KEYS.business, null) || {}) };

  const storedUsers = await migratePlaintextPasswords(readJSON(KEYS.users, null) || []);
  state.userAccounts = await ensurePrimaryAdmin(storedUsers);
  saveUsers();
}
