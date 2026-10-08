// ===== BACKEND CLOUD (SUPABASE) =====
// Le serveur est la source de vérité. `state` n'est qu'un cache en mémoire,
// rempli par loadAll() et tenu à jour par les opérations ci-dessous et par le temps réel.
import { state } from './state.js';
import { cloudClient } from './supabaseClient.js';
import { formatCurrency, getDateKey } from './utils.js';
import { productTracksStock } from './permissions.js';

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
    time: created.toLocaleString('fr-FR'),
    saleDate: getDateKey(created),
    total: Number(row.total),
    totalLabel: formatCurrency(Number(row.total)),
    paymentMethod: row.payment_method,
    cashierId: row.cashier_id,
    cashierName: row.cashier_name,
    customer: row.customer_name,
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
  invalid_name: 'Le nom du commerce est obligatoire.'
};

export function toFriendlyError(error) {
  const entry = ERROR_MESSAGES[error?.message];
  let message = typeof entry === 'function' ? entry(error) : entry;
  if (!message && error?.code === '42501') message = 'Action non autorisée pour votre rôle.';
  if (!message && error?.code === 'PGRST116') message = 'Élément introuvable ou action non autorisée.';
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
export async function checkout({ paymentMethod, customerId }) {
  const items = state.cart.map((item) => ({ product_id: item.id, quantity: item.quantity }));
  let result;
  try {
    result = unwrap(await cloudClient.rpc('checkout_sale', {
      p_business_id: businessId(),
      p_items: items,
      p_payment_method: paymentMethod,
      p_customer_id: customerId || null
    }));
  } catch (error) {
    await refreshProducts().catch(() => {});
    throw error;
  }

  const customer = state.customers.find((entry) => entry.id === customerId);
  const now = new Date();
  const sale = {
    id: result.sale_id,
    time: now.toLocaleString('fr-FR'),
    saleDate: getDateKey(now),
    total: Number(result.total),
    totalLabel: formatCurrency(Number(result.total)),
    paymentMethod,
    cashierId: state.currentUser.id,
    cashierName: state.currentUser.username,
    customer: customer ? customer.name : 'Client général',
    items: state.cart.map((item) => ({ name: item.name, quantity: item.quantity }))
  };

  state.salesHistory.unshift(sale);
  state.cart.forEach((item) => {
    const product = state.products.find((entry) => entry.id === item.id);
    if (product && productTracksStock(product)) product.stock = Math.max(0, product.stock - item.quantity);
  });
  return sale;
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
