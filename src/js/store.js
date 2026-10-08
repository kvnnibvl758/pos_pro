// ===== COUCHE DE DONNEES UNIQUE =====
// Les modules d'interface n'appellent que ces fonctions : ils ne savent pas si les
// données vivent dans le navigateur (mode local) ou sur Supabase (mode cloud).
// Chaque fonction met à jour `state` ET persiste ; l'appelant n'a plus qu'à réafficher.
import { state } from './state.js';
import { isCloudMode } from './supabaseClient.js';
import * as cloud from './cloudStore.js';
import { saveProducts, saveCustomers, saveSales, saveBusinessConfig as persistBusinessConfig } from './storage.js';
import { formatCurrency, getDateKey } from './utils.js';
import { productTracksStock } from './permissions.js';

const newId = () => (typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

// ---------- Backend local (localStorage) ----------
const local = {
  async saveProduct(data, id) {
    if (id) {
      const existing = state.products.find((product) => product.id === id);
      if (!existing) throw new Error('Produit introuvable.');
      Object.assign(existing, data);
      saveProducts();
      return existing;
    }
    const created = { id: newId(), emoji: '', ...data };
    state.products.unshift(created);
    saveProducts();
    return created;
  },

  async removeProduct(id) {
    const index = state.products.findIndex((product) => product.id === id);
    if (index >= 0) state.products.splice(index, 1);
    saveProducts();
  },

  async saveCustomer(data) {
    const created = { id: newId(), name: data.name, phone: data.phone || '', type: data.type };
    state.customers.unshift(created);
    saveCustomers();
    return created;
  },

  async removeCustomer(id) {
    const index = state.customers.findIndex((customer) => customer.id === id);
    if (index >= 0) state.customers.splice(index, 1);
    saveCustomers();
  },

  async saveBusinessConfig() {
    persistBusinessConfig();
  },

  async checkout({ paymentMethod, customerId }) {
    const subtotal = state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const tax = subtotal * (Number(state.businessConfig.taxRate || 0) / 100);
    const total = subtotal + tax;
    const customer = state.customers.find((entry) => entry.id === customerId);
    const now = new Date();

    const sale = {
      id: newId(),
      time: now.toLocaleString('fr-FR'),
      saleDate: getDateKey(now),
      total,
      totalLabel: formatCurrency(total),
      paymentMethod,
      cashierId: state.currentUser.id,
      cashierName: state.currentUser.username,
      customer: customer ? customer.name : 'Client général',
      items: state.cart.map((item) => ({ name: item.name, quantity: item.quantity }))
    };

    state.salesHistory.unshift(sale);
    saveSales();

    state.cart.forEach((item) => {
      const product = state.products.find((entry) => entry.id === item.id);
      if (product && productTracksStock(product)) {
        product.stock = Math.max(0, product.stock - item.quantity);
      }
    });
    saveProducts();
    return sale;
  }
};

const backend = () => (isCloudMode() ? cloud : local);

export const saveProduct = (data, id) => backend().saveProduct(data, id);
export const removeProduct = (id) => backend().removeProduct(id);
export const saveCustomer = (data) => backend().saveCustomer(data);
export const removeCustomer = (id) => backend().removeCustomer(id);
export const saveBusinessConfig = () => backend().saveBusinessConfig();
export const checkout = (options) => backend().checkout(options);
