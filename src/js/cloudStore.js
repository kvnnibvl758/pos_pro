// ===== BACKEND CLOUD (SUPABASE) =====
// Le serveur est la source de vérité. `state` n'est qu'un cache en mémoire,
// rempli par loadAll() et tenu à jour par les opérations ci-dessous et par le temps réel.
import { state } from './state.js';
import { cloudClient } from './supabaseClient.js';
import { formatCurrency, getDateKey } from './utils.js';
import { productTracksStock } from './permissions.js';
import * as offline from './offlineStore.js';

const SALES_LIMIT = 1000;

// ---------- Conversions ligne SQL -> objets de l'application ----------
const productFromRow = (row) => ({
  id: row.id,
  name: row.name,
  category: row.category,
  price: Number(row.price),
  stock: row.stock,
  trackStock: row.track_stock,
  image: row.image || '',
  emoji: ''
});

const customerFromRow = (row) => ({
  id: row.id,
  name: row.name,
  phone: row.phone || '',
  type: row.type
});

function saleFromRow(row) {
  const created = new Date(row.created_at);
  return {
    id: row.id,
    clientId: row.client_id || null,
    time: created.toLocaleString('fr-FR'),
    saleDate: getDateKey(created),
    total: Number(row.total),
    totalLabel: formatCurrency(Number(row.total)),
    paymentMethod: row.payment_method,
    cashierId: row.cashier_id,
    cashierName: row.cashier_name,
    customer: row.customer_name,
    stockShortfall: Boolean(row.stock_shortfall),
    items: (row.sale_items || []).map((item) => ({ name: item.name, quantity: item.quantity }))
  };
}

const configFromRow = (row) => ({
  name: row.name,
  typeLabel: row.type_label,
  inventoryMode: row.inventory_mode,
  currency: row.currency,
  taxRate: Number(row.tax_rate),
  lowStockThreshold: row.low_stock_threshold,
  logo: row.logo || ''
});

// ---------- Erreurs lisibles ----------
const ERROR_MESSAGES = {
  insufficient_stock: (error) => `Stock insuffisant pour « ${error.details || 'ce produit'} ».`,
  unknown_product: 'Un produit du panier n’existe plus. Le catalogue vient d’être actualisé.',
  invalid_cart: 'Le panier est vide ou invalide.',
  invalid_quantity: 'Quantité invalide.',
  invalid_payment_method: 'Mode de paiement invalide.',
  unknown_customer: 'Ce client n’existe plus.',
  not_authenticated: 'Session expirée. Reconnectez-vous.',
  forbidden: 'Action non autorisée pour votre compte.',
  business_already_exists: 'Un commerce existe déjà pour ce compte.',
  invalid_name: 'Le nom du commerce est obligatoire.',
  PGRST202: 'Le serveur n’est pas à jour (mise à jour de la base manquante). Contactez l’administrateur.'
};

// Refus définitifs du serveur : réessayer ne changerait rien. Tout le reste (réseau coupé,
// serveur indisponible, session à renouveler) est temporaire : la vente est alors gardée.
const REJECTION_MESSAGES = new Set([
  'insufficient_stock', 'unknown_product', 'invalid_cart', 'invalid_quantity',
  'invalid_payment_method', 'unknown_customer', 'forbidden', 'business_already_exists', 'invalid_name'
]);
const REJECTION_CODES = new Set(['42501', '22023', 'P0001', 'PGRST202']);

const rawError = (error) => error?.cause || error;

export function isRejected(error) {
  const raw = rawError(error);
  return REJECTION_MESSAGES.has(raw?.message) || REJECTION_CODES.has(raw?.code);
}

// Erreur de communication (pas de réponse du serveur) : aucun code SQL/HTTP exploitable.
export function isNetworkError(error) {
  const raw = rawError(error);
  if (!raw || isRejected(raw)) return false;
  if (raw.name === 'AuthRetryableFetchError') return true;
  return !raw.code && /fetch|network|abort|timeout|timed out|load failed|offline/i.test(String(raw.message));
}

export function toFriendlyError(error) {
  const entry = ERROR_MESSAGES[error?.message];
  let message = typeof entry === 'function' ? entry(error) : entry;
  if (!message && error?.code === '42501') message = 'Action non autorisée pour votre rôle.';
  if (!message && error?.code === 'PGRST116') message = 'Élément introuvable ou action non autorisée.';
  if (!message && isNetworkError(error)) message = 'Connexion internet indisponible : cette action nécessite le réseau.';
  if (!message) message = ERROR_MESSAGES[error?.code];
  const friendly = new Error(message || error?.message || 'Erreur serveur.');
  friendly.cause = error;
  return friendly;
}

function unwrap({ data, error }) {
  if (error) throw toFriendlyError(error);
  return data;
}

function replaceContents(list, items) {
  list.splice(0, list.length, ...items);
}

function upsertInState(list, item, atFront) {
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index >= 0) list[index] = item;
  else if (atFront) list.unshift(item);
  else list.push(item);
}

const businessId = () => state.cloud.businessId;


// ---------- Ventes hors connexion : file d'attente ----------
const userId = () => state.cloud.userId;
const queue = () => offline.getQueue(userId());
const notifyQueueChanged = () => window.dispatchEvent(new CustomEvent('pos:queue-changed'));

export const pendingCount = () => queue().filter((entry) => !entry.failed).length;
export const failedEntries = () => queue().filter((entry) => entry.failed);

// Le serveur ne connaît pas encore les ventes en attente : on retire leur quantité du stock affiché.
function applyPendingStock() {
  queue().filter((entry) => !entry.failed).forEach((entry) => {
    entry.items.forEach((item) => {
      const product = state.products.find((candidate) => candidate.id === item.product_id);
      if (product && productTracksStock(product)) product.stock = Math.max(0, product.stock - item.quantity);
    });
  });
}

// Les ventes en attente (ou en échec) restent visibles dans l'historique, marquées comme telles.
function mergePendingSales() {
  const known = new Set(state.salesHistory.map((sale) => sale.clientId).filter(Boolean));
  const pending = queue().filter((entry) => !known.has(entry.clientId)).map((entry) => ({
    ...entry.sale,
    pending: !entry.failed,
    failed: entry.failed || ''
  }));
  state.salesHistory.unshift(...pending.reverse());
}

const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

// Même calcul que le serveur (qui, lui, refait le calcul avec ses propres prix à l'envoi).
function estimateTotals(items) {
  const subtotal = round2(items.reduce((sum, item) => {
    const product = state.products.find((candidate) => candidate.id === item.product_id);
    return sum + (product ? product.price * item.quantity : 0);
  }, 0));
  const tax = round2(subtotal * Number(state.businessConfig.taxRate || 0) / 100);
  return { subtotal, tax, total: round2(subtotal + tax) };
}

const RPC_TIMEOUT_MS = 8000;

// Un réseau faible peut laisser une requête pendre longtemps : on abandonne au bout de 8 s et la
// vente est mise en file d'attente (le serveur ignore un doublon grâce à l'identifiant client).
async function rpcWithTimeout(name, args) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    return await cloudClient.rpc(name, args).abortSignal(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export function setOffline(value) {
  if (state.cloud.offline === value) return;
  state.cloud.offline = value;
  notifyQueueChanged();
}

// Teste si le serveur répond (une requête minuscule, sans effet).
export async function probeServer() {
  if (!cloudClient || !businessId()) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const { error } = await cloudClient.from('businesses').select('id').eq('id', businessId())
      .limit(1).abortSignal(controller.signal);
    return !error || !isNetworkError(error);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Copie du catalogue pour démarrer sans réseau ----------
export function saveSnapshot() {
  if (!userId() || !businessId() || !state.currentUser) return;
  offline.saveSnapshot({
    userId: userId(),
    businessId: businessId(),
    role: state.cloud.role,
    user: { ...state.currentUser },
    config: { ...state.businessConfig },
    products: state.products.map((product) => ({ ...product })),
    customers: state.customers.map((customer) => ({ ...customer })),
    sales: state.salesHistory.filter((sale) => !sale.pending && !sale.failed).slice(0, 300),
    savedAt: Date.now()
  });
}

// Remplit l'état depuis la copie locale. Les stocks de la copie tiennent déjà compte des ventes
// en attente (elle est réécrite à chaque vente) : on ne les retire pas une seconde fois.
export function restoreFromSnapshot(snapshot) {
  Object.assign(state.businessConfig, snapshot.config);
  replaceContents(state.products, snapshot.products);
  replaceContents(state.customers, snapshot.customers);
  replaceContents(state.salesHistory, snapshot.sales);
  mergePendingSales();
}

// ---------- Appartenance et chargement ----------
export async function fetchMemberships(userId) {
  return unwrap(await cloudClient
    .from('business_members')
    .select('business_id, role, display_name, active')
    .eq('user_id', userId));
}

export async function refreshBusiness() {
  const row = unwrap(await cloudClient.from('businesses').select('*').eq('id', businessId()).single());
  Object.assign(state.businessConfig, configFromRow(row));
}

export async function refreshProducts() {
  const rows = unwrap(await cloudClient.from('products').select('*')
    .eq('business_id', businessId()).order('created_at', { ascending: false }));
  replaceContents(state.products, rows.map(productFromRow));
  applyPendingStock();
}

export async function refreshCustomers() {
  const rows = unwrap(await cloudClient.from('customers').select('*')
    .eq('business_id', businessId()).order('created_at', { ascending: false }));
  replaceContents(state.customers, rows.map(customerFromRow));
}

export async function refreshSales() {
  const rows = unwrap(await cloudClient.from('sales').select('*, sale_items(name, quantity, unit_price)')
    .eq('business_id', businessId()).order('created_at', { ascending: false }).limit(SALES_LIMIT));
  replaceContents(state.salesHistory, rows.map(saleFromRow));
  mergePendingSales();
}

export async function loadMembers() {
  const rows = unwrap(await cloudClient.from('business_members')
    .select('user_id, role, display_name, active, created_at')
    .eq('business_id', businessId()).order('created_at', { ascending: true }));
  replaceContents(state.members, rows.map((row) => ({
    userId: row.user_id,
    role: row.role,
    displayName: row.display_name,
    active: row.active
  })));
}

export async function loadAll() {
  await Promise.all([refreshBusiness(), refreshProducts(), refreshCustomers(), refreshSales()]);
}

export async function createBusiness({ name, typeLabel, displayName }) {
  return unwrap(await cloudClient.rpc('create_business', {
    p_name: name,
    p_type_label: typeLabel,
    p_display_name: displayName
  }));
}

// ---------- Produits ----------
export async function saveProduct(data, id) {
  const row = {
    name: data.name,
    category: data.category,
    price: data.price,
    stock: data.stock,
    track_stock: data.trackStock,
    image: data.image || ''
  };
  const query = id
    ? cloudClient.from('products').update(row).eq('id', id)
    : cloudClient.from('products').insert({ ...row, business_id: businessId() });
  const saved = productFromRow(unwrap(await query.select().single()));
  upsertInState(state.products, saved, !id);
  return saved;
}

export async function removeProduct(id) {
  const deleted = unwrap(await cloudClient.from('products').delete().eq('id', id).select('id'));
  if (!deleted.length) throw new Error('Suppression non autorisée pour votre rôle.');
  const index = state.products.findIndex((product) => product.id === id);
  if (index >= 0) state.products.splice(index, 1);
}

// ---------- Clients ----------
export async function saveCustomer(data) {
  const row = { name: data.name, phone: data.phone || '', type: data.type, business_id: businessId() };
  const saved = customerFromRow(unwrap(await cloudClient.from('customers').insert(row).select().single()));
  upsertInState(state.customers, saved, true);
  return saved;
}

export async function removeCustomer(id) {
  const deleted = unwrap(await cloudClient.from('customers').delete().eq('id', id).select('id'));
  if (!deleted.length) throw new Error('Suppression non autorisée pour votre rôle.');
  const index = state.customers.findIndex((customer) => customer.id === id);
  if (index >= 0) state.customers.splice(index, 1);
}

// ---------- Configuration du commerce ----------
export async function saveBusinessConfig() {
  const config = state.businessConfig;
  const updated = unwrap(await cloudClient.from('businesses').update({
    name: config.name,
    type_label: config.typeLabel,
    inventory_mode: config.inventoryMode,
    currency: config.currency,
    tax_rate: config.taxRate,
    low_stock_threshold: config.lowStockThreshold,
    logo: config.logo || ''
  }).eq('id', businessId()).select('id'));
  if (!updated.length) throw new Error('Modification non autorisée pour votre rôle.');
}

// ---------- Encaissement (atomique, calculé par le serveur) ----------
// En ligne : une seule requête atomique côté serveur. Réseau coupé ou trop lent : la vente est
// gardée sur l'appareil (file d'attente) et envoyée plus tard par flushQueue().
export async function checkout({ paymentMethod, customerId }) {
  const items = state.cart.map((item) => ({ product_id: item.id, quantity: item.quantity }));
  const clientId = crypto.randomUUID();
  const soldAt = new Date();
  const customer = state.customers.find((entry) => entry.id === customerId);
  const cartItems = state.cart.map((item) => ({ name: item.name, quantity: item.quantity }));

  const buildSale = (id, total, extra = {}) => ({
    id,
    clientId,
    time: soldAt.toLocaleString('fr-FR'),
    saleDate: getDateKey(soldAt),
    total,
    totalLabel: formatCurrency(total),
    paymentMethod,
    cashierId: state.currentUser.id,
    cashierName: state.currentUser.username,
    customer: customer ? customer.name : 'Client général',
    items: cartItems,
    ...extra
  });

  let result = null;
  if (!state.cloud.offline) {
    try {
      result = unwrap(await rpcWithTimeout('checkout_sale', {
        p_business_id: businessId(),
        p_items: items,
        p_payment_method: paymentMethod,
        p_customer_id: customerId || null,
        p_client_id: clientId,
        p_sold_at: soldAt.toISOString(),
        p_allow_shortfall: false
      }));
      setOffline(false);
    } catch (error) {
      if (isRejected(error)) {
        await refreshProducts().catch(() => {});
        throw error;
      }
      setOffline(true); // réseau coupé, trop lent ou session à renouveler : on garde la vente
    }
  }

  if (result) {
    const sale = buildSale(result.sale_id, Number(result.total));
    state.salesHistory.unshift(sale);
    state.cart.forEach((item) => {
      const product = state.products.find((entry) => entry.id === item.id);
      if (product && productTracksStock(product)) product.stock = Math.max(0, product.stock - item.quantity);
    });
    saveSnapshot();
    return sale;
  }

  // Hors connexion : mise en file d'attente (lève une erreur si l'appareil ne peut pas la garder).
  const totals = estimateTotals(items);
  const sale = buildSale(`local-${clientId}`, totals.total, { pending: true });
  offline.enqueueSale(userId(), {
    clientId,
    businessId: businessId(),
    items,
    paymentMethod,
    customerId: customerId || null,
    soldAt: soldAt.toISOString(),
    sale
  });
  state.salesHistory.unshift(sale);
  state.cart.forEach((item) => {
    const product = state.products.find((entry) => entry.id === item.id);
    if (product && productTracksStock(product)) product.stock = Math.max(0, product.stock - item.quantity);
  });
  saveSnapshot();
  notifyQueueChanged();
  return sale;
}

async function sendQueued(entry) {
  const send = async (customerId) => unwrap(await rpcWithTimeout('checkout_sale', {
    p_business_id: entry.businessId,
    p_items: entry.items,
    p_payment_method: entry.paymentMethod,
    p_customer_id: customerId,
    p_client_id: entry.clientId,
    p_sold_at: entry.soldAt,
    p_allow_shortfall: true // la vente a déjà eu lieu : on l'accepte même si le stock est devenu insuffisant
  }));
  try {
    return await send(entry.customerId);
  } catch (error) {
    // Client supprimé entre-temps : la vente est enregistrée comme « Client général ».
    if (rawError(error)?.message === 'unknown_customer' && entry.customerId) return send(null);
    throw error;
  }
}

let flushing = false;

// Envoie les ventes en attente, dans l'ordre. S'arrête au premier problème de réseau ou de session
// (rien n'est perdu : tout reste dans la file) ; une vente refusée par le serveur est marquée en échec.
export async function flushQueue() {
  const summary = { synced: 0, failed: 0, shortfall: [], stopped: null };
  if (flushing || !userId()) return summary;
  const entries = queue().filter((entry) => !entry.failed && entry.businessId === businessId());
  if (!entries.length) return summary;

  flushing = true;
  try {
    for (const entry of entries) {
      try {
        const result = await sendQueued(entry);
        offline.removeEntries(userId(), [entry.clientId]);
        summary.synced += 1;
        (result.shortfall || []).forEach((name) => summary.shortfall.push(name));
      } catch (error) {
        if (isRejected(error)) {
          offline.updateEntry(userId(), entry.clientId, { failed: error.message });
          summary.failed += 1;
          continue;
        }
        const raw = rawError(error);
        const authProblem = raw?.code === '28000' || raw?.code === 'PGRST301' || raw?.message === 'not_authenticated';
        summary.stopped = authProblem ? 'auth' : 'network';
        break;
      }
    }
    if (summary.synced || summary.failed) {
      await Promise.all([refreshProducts(), refreshSales()]).catch(() => {});
      saveSnapshot();
    }
    if (summary.stopped === 'network') setOffline(true);
    else if (summary.synced) setOffline(false);
  } finally {
    flushing = false;
    notifyQueueChanged();
  }
  return summary;
}

export function discardFailedSales() {
  offline.removeEntries(userId(), failedEntries().map((entry) => entry.clientId));
  replaceContents(state.salesHistory, state.salesHistory.filter((sale) => !sale.failed));
  notifyQueueChanged();
}

// ---------- Équipe (caissiers) ----------
async function functionError(error) {
  try {
    const body = await error.context.json();
    return new Error(body.error || error.message);
  } catch {
    return new Error(error.message || 'Erreur serveur.');
  }
}

async function callCashiersFunction(body) {
  const { data, error } = await cloudClient.functions.invoke('cashiers', {
    body: { ...body, business_id: businessId() }
  });
  if (error) throw await functionError(error);
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function createCashier({ email, password, displayName }) {
  await callCashiersFunction({ action: 'create', email, password, display_name: displayName });
  await loadMembers();
}

export async function removeCashier(userId) {
  await callCashiersFunction({ action: 'delete', user_id: userId });
  await loadMembers();
}

export async function setMemberActive(userId, active) {
  const updated = unwrap(await cloudClient.from('business_members').update({ active })
    .eq('business_id', businessId()).eq('user_id', userId).select('user_id'));
  if (!updated.length) throw new Error('Modification non autorisée pour votre rôle.');
  await loadMembers();
}

// ---------- Temps réel ----------
// Les évènements regroupés (anti-rafale) déclenchent un rechargement ciblé des tables touchées.
// Les suppressions faites depuis un autre appareil ne sont pas filtrables par Realtime :
// on recharge donc aussi tout lorsque l'onglet redevient visible.
let channel = null;
let debounceTimer = null;
let visibilityHandler = null;
const pendingTables = new Set();

export function subscribeRealtime(onChange) {
  unsubscribeRealtime();
  const id = businessId();
  const refreshers = {
    products: refreshProducts,
    customers: refreshCustomers,
    sales: refreshSales,
    businesses: refreshBusiness
  };

  const schedule = (table) => {
    pendingTables.add(table);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const tables = [...pendingTables];
      pendingTables.clear();
      try {
        await Promise.all(tables.map((name) => refreshers[name]()));
        onChange();
      } catch (error) {
        console.error('Actualisation temps réel impossible:', error.message);
      }
    }, 300);
  };

  channel = cloudClient.channel(`pos-${id}`);
  [
    ['products', `business_id=eq.${id}`],
    ['customers', `business_id=eq.${id}`],
    ['sales', `business_id=eq.${id}`],
    ['businesses', `id=eq.${id}`]
  ].forEach(([table, filter]) => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table, filter }, () => schedule(table));
  });
  channel.subscribe();

  visibilityHandler = () => {
    if (document.visibilityState === 'visible') Object.keys(refreshers).forEach(schedule);
  };
  document.addEventListener('visibilitychange', visibilityHandler);
}

export function unsubscribeRealtime() {
  if (channel && cloudClient) cloudClient.removeChannel(channel);
  channel = null;
  clearTimeout(debounceTimer);
  pendingTables.clear();
  if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler);
  visibilityHandler = null;
}
