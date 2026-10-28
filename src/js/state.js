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
    phone: '',
    inventoryMode: 'auto',
    currency: 'GNF',
    taxRate: 0,
    lowStockThreshold: 5,
    logo: '',
    // Abonnement (mode cloud) : fin de l'essai gratuit et fin de la période payée, en ISO.
    trialEndsAt: null,
    paidUntil: null
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
    userId: null,
    role: null,
    // Hors connexion : `offline` = le réseau est (probablement) coupé ; `offlineSession` = la
    // session a été ouverte depuis la copie locale, sans parler au serveur.
    offline: false,
    offlineSession: false,
    syncMessage: '',
    // Administrateur de la plateforme (celui qui active les abonnements).
    platformAdmin: false
  }
};
