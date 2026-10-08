// ===== SERVICE WORKER =====
// Rôle : permettre l'installation de l'application et un démarrage rapide, même avec une
// connexion faible ou coupée (l'écran de caisse et les données locales restent accessibles).
//
// Stratégie :
//  - fichiers de l'application (même origine) : RÉSEAU D'ABORD, avec repli sur le cache si le
//    réseau est absent, trop lent, ou si l'hébergeur répond par une erreur. Ainsi une mise à jour du code est toujours récupérée dès
//    qu'il y a du réseau, sans jamais rester bloqué sur une vieille version.
//  - script Supabase (CDN) : cache d'abord, rafraîchi en arrière-plan.
//  - tout le reste (API Supabase, polices...) : jamais intercepté. Les données métier ne sont
//    JAMAIS mises en cache ici : elles viennent toujours du serveur.
const VERSION = 'pos-shell-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'src/icons/icon-192.png'];
const CDN_SCRIPT = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, event) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request, { ignoreSearch: true });

  const networkPromise = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
      return response;
    }
    // Erreur de l'hébergeur (ex. site suspendu ou en panne : 5xx) : fetch ne la signale pas comme
    // un échec réseau. Si on a une copie en cache, on la préfère à la page d'erreur.
    if (cached) throw new Error(`HTTP ${response.status}`);
    return response;
  });
  // Laisse la mise à jour du cache se terminer même si on a déjà répondu depuis le cache.
  event.waitUntil(networkPromise.catch(() => {}));

  try {
    if (!cached) return await networkPromise;
    return await Promise.race([
      networkPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS))
    ]);
  } catch (error) {
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell = await cache.match('index.html');
      if (shell) return shell;
    }
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request, { ignoreSearch: true });
  const refresh = fetch(request).then((response) => {
    // Un <script> chargé sans CORS donne une réponse « opaque » : on la garde aussi.
    if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
    return response;
  });
  if (cached) {
    refresh.catch(() => {});
    return cached;
  }
  return refresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, event));
  } else if (request.url.startsWith(CDN_SCRIPT)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

// La page envoie la liste des fichiers qu'elle vient de charger : on les met en cache tout de
// suite, pour que l'application démarre hors connexion dès la première visite.
async function cacheUrls(urls) {
  const cache = await caches.open(VERSION);
  await Promise.all(urls.map(async (url) => {
    try {
      const sameOrigin = new URL(url).origin === self.location.origin;
      if (!sameOrigin && !url.startsWith(CDN_SCRIPT)) return;
      const request = new Request(url, { mode: sameOrigin ? 'same-origin' : 'no-cors' });
      const response = await fetch(request);
      if (response.ok || response.type === 'opaque') await cache.put(request, response);
    } catch {
      // Hors connexion ou fichier indisponible : on réessaiera à la prochaine visite.
    }
  }));
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CACHE_URLS' && Array.isArray(event.data.urls)) {
    event.waitUntil(cacheUrls(event.data.urls));
  }
});
