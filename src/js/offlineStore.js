// ===== STOCKAGE HORS CONNEXION (mode cloud) =====
// Deux choses sont gardées sur l'appareil :
//  1. la FILE D'ATTENTE des ventes faites sans réseau (localStorage, petite, une clé par compte) ;
//  2. une COPIE du catalogue (produits, clients, ventes récentes, réglages) pour pouvoir ouvrir
//     l'application et vendre sans réseau (IndexedDB : les images de produits peuvent être lourdes).
// Le serveur reste la source de vérité : la file est vidée dès que chaque vente est acceptée.

const QUEUE_PREFIX = 'pos-offline-queue:';
const DB_NAME = 'pos-offline';
const STORE = 'kv';
const SNAPSHOT_KEY = 'snapshot';

// ---------- File d'attente ----------
function readQueue(userId) {
  try {
    const list = JSON.parse(localStorage.getItem(QUEUE_PREFIX + userId) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeQueue(userId, list) {
  try {
    localStorage.setItem(QUEUE_PREFIX + userId, JSON.stringify(list));
  } catch {
    // Espace plein ou stockage bloqué : mieux vaut refuser la vente que la perdre en silence.
    throw new Error('Impossible d’enregistrer la vente sur cet appareil (stockage plein ou bloqué).');
  }
}

export const getQueue = (userId) => (userId ? readQueue(userId) : []);

export function enqueueSale(userId, entry) {
  const list = readQueue(userId);
  list.push(entry);
  writeQueue(userId, list);
}

export function updateEntry(userId, clientId, patch) {
  const list = readQueue(userId).map((entry) => (entry.clientId === clientId ? { ...entry, ...patch } : entry));
  writeQueue(userId, list);
}

export function removeEntries(userId, clientIds) {
  const ids = new Set(clientIds);
  writeQueue(userId, readQueue(userId).filter((entry) => !ids.has(entry.clientId)));
}

// ---------- Copie du catalogue (IndexedDB) ----------
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB indisponible'));
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

async function withStore(mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = action(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve(request ? request.result : undefined);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function saveSnapshot(snapshot) {
  try {
    await withStore('readwrite', (store) => store.put(snapshot, SNAPSHOT_KEY));
  } catch (error) {
    console.warn('Copie hors connexion impossible :', error?.message);
  }
}

export async function loadSnapshot() {
  try {
    return (await withStore('readonly', (store) => store.get(SNAPSHOT_KEY))) || null;
  } catch {
    return null;
  }
}

export async function clearSnapshot() {
  try {
    await withStore('readwrite', (store) => store.delete(SNAPSHOT_KEY));
  } catch {
    // Rien à effacer ou stockage bloqué.
  }
}
