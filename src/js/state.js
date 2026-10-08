// ===== ETAT CENTRAL DE L'APPLICATION =====
// Un seul objet mutable partagé par tous les modules. Chaque module importe
// `state` et lit/modifie ses propriétés directement (comme les variables
// globales du script original, mais regroupées et explicites).

export const state = {
  products: [],
  customers: [],
  salesHistory: [],
  userAccounts: [],
  members: [],
  businessConfig: {
    name: 'POS Pro',
    typeLabel: 'Boutique',
    inventoryMode: 'auto',
    currency: 'GNF',
    taxRate: 0,
    lowStockThreshold: 5,
    logo: ''
  },

  cart: [],
  discount: 0,
  currentUser: null,
  activeCategory: '',
  selectedPaymentMethod: 'Espèces',
  editingProductId: null,

  cloud: {
    profileMode: false,
    signupMode: false,
    sessionActive: false,
    businessId: null,
    role: null
  }
};
