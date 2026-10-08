// ===== REFERENCES AUX ELEMENTS DE L'INTERFACE =====
// Centralise tous les document.getElementById() en un seul endroit.
const byId = (id) => document.getElementById(id);

export const el = {
  // Ecran d'acces et coquille de l'app
  authGate: byId('authGate'),
  authGateLogo: byId('authGateLogo'),
  authGateName: byId('authGateName'),
  authGateType: byId('authGateType'),
  authGateLoginBtn: byId('authGateLoginBtn'),
  authGateSignupBtn: byId('authGateSignupBtn'),
  appShell: document.querySelector('.app-shell'),
  pageTitle: byId('pageTitle'),

  // Marque / identite
  brandName: byId('brandName'),
  brandIcon: byId('brandIcon'),
  businessTypeLabel: byId('businessTypeLabel'),

  // Navigation et session
  navItems: document.querySelectorAll('.nav-item'),
  settingsNav: byId('settingsNav'),
  sessionUser: byId('sessionUser'),
  todaySales: byId('todaySales'),
  lowStockStat: byId('lowStockStat'),
  lowStockCount: byId('lowStockCount'),
  installAppBtn: byId('installAppBtn'),
  logoutBtn: byId('logoutBtn'),
  loginAgainBtn: byId('loginAgainBtn'),
  backupReminderBanner: byId('backupReminderBanner'),
  backupBannerExportBtn: byId('backupBannerExportBtn'),
  backupBannerDismissBtn: byId('backupBannerDismissBtn'),

  // Catalogue / recherche
  searchInput: byId('searchInput'),
  categoryChips: byId('categoryChips'),
  productGrid: byId('productGrid'),
  loadMoreProductsBtn: byId('loadMoreProductsBtn'),
  productCount: byId('productCount'),

  // Panier
  cartItems: byId('cartItems'),
  clearCartBtn: byId('clearCartBtn'),
  customerSelect: byId('customerSelect'),
  salesHistory: byId('salesHistory'),
  subtotal: byId('subtotal'),
  discount: byId('discount'),
  tax: byId('tax'),
  total: byId('total'),
  paymentOptions: byId('paymentOptions'),
  checkoutBtn: byId('checkoutBtn'),

  // Connexion locale
  loginModal: byId('loginModal'),
  loginForm: byId('loginForm'),
  loginUser: byId('loginUser'),
  loginPassword: byId('loginPassword'),

  // Creation du commerce (cloud)
  businessSetupModal: byId('businessSetupModal'),
  businessSetupForm: byId('businessSetupForm'),
  setupBusinessName: byId('setupBusinessName'),
  setupBusinessType: byId('setupBusinessType'),
  setupOwnerName: byId('setupOwnerName'),
  setupCancelBtn: byId('setupCancelBtn'),

  // Connexion cloud
  cloudAuthModal: byId('cloudAuthModal'),
  cloudAuthForm: byId('cloudAuthForm'),
  cloudAuthTitle: byId('cloudAuthTitle'),
  cloudAuthEmail: byId('cloudAuthEmail'),
  cloudAuthPassword: byId('cloudAuthPassword'),
  cloudAuthName: byId('cloudAuthName'),
  cloudAuthPhone: byId('cloudAuthPhone'),
  cloudAuthSubmitBtn: byId('cloudAuthSubmitBtn'),
  cloudSignupFields: byId('cloudSignupFields'),
  cloudAuthBackBtn: byId('cloudAuthBackBtn'),
  cloudAuthMessage: byId('cloudAuthMessage'),
  cloudSignupBtn: byId('cloudSignupBtn'),
  googleAuthBtn: byId('googleAuthBtn'),
  appleAuthBtn: byId('appleAuthBtn'),

  // Mot de passe compte local
  passwordForm: byId('passwordForm'),
  accountUsernameInput: byId('accountUsernameInput'),
  currentPasswordInput: byId('currentPasswordInput'),
  newPasswordInput: byId('newPasswordInput'),
  confirmPasswordInput: byId('confirmPasswordInput'),

  // Gestion des caissiers
  userForm: byId('userForm'),
  newUserEmailField: byId('newUserEmailField'),
  newUserEmail: byId('newUserEmail'),
  newUserNameLabel: byId('newUserNameLabel'),
  userList: byId('userList'),

  // Produits
  productModal: byId('productModal'),
  productModalTitle: byId('productModalTitle'),
  productSubmitBtn: byId('productSubmitBtn'),
  addProductForm: byId('addProductForm'),
  productName: byId('productName'),
  productCategory: byId('productCategory'),
  productPrice: byId('productPrice'),
  productStock: byId('productStock'),
  productStockField: byId('productStockField'),
  productTrackStock: byId('productTrackStock'),
  productTrackStockField: byId('productTrackStockField'),
  productImageInput: byId('productImage'),
  imagePreview: byId('imagePreview'),
  closeModalBtn: byId('closeModalBtn'),
  cancelProductBtn: byId('cancelProductBtn'),

  // Clients
  customerModal: byId('customerModal'),
  customerForm: byId('customerForm'),
  customerName: byId('customerName'),
  customerPhone: byId('customerPhone'),
  customerType: byId('customerType'),
  customerList: byId('customerList'),
  closeCustomerModalBtn: byId('closeCustomerModalBtn'),
  cancelCustomerBtn: byId('cancelCustomerBtn'),

  // Historique / rapports
  dashboardModal: byId('dashboardModal'),
  dashboardTitle: byId('dashboardTitle'),
  dashboardContent: byId('dashboardContent'),
  closeDashboardBtn: byId('closeDashboardBtn'),

  // Parametres (entreprise / apparence / compte / caissiers / donnees)
  settingsModal: byId('settingsModal'),
  settingsTabs: byId('settingsTabs'),
  settingsTabCaissiers: byId('settingsTabCaissiers'),
  settingsTabDonnees: byId('settingsTabDonnees'),
  settingsForm: byId('settingsForm'),
  businessNameInput: byId('businessNameInput'),
  businessTypeInput: byId('businessTypeInput'),
  currencyInput: byId('currencyInput'),
  taxRateInput: byId('taxRateInput'),
  inventoryModeInput: byId('inventoryModeInput'),
  lowStockThresholdField: byId('lowStockThresholdField'),
  lowStockThresholdInput: byId('lowStockThresholdInput'),
  businessLogoInput: byId('businessLogoInput'),
  businessLogoPreview: byId('businessLogoPreview'),
  closeSettingsBtn: byId('closeSettingsBtn'),
  exportBackupBtn: byId('exportBackupBtn'),
  themeOptions: byId('themeOptions'),
  localAccountPanel: byId('localAccountPanel'),
  cloudAccountPanel: byId('cloudAccountPanel'),
  cloudProfileEditBtn: byId('cloudProfileEditBtn')
};
