// ===== CODES-BARRES : lecture par la caméra et reconnaissance du produit =====
// La lecture par caméra utilise la bibliothèque html5-qrcode (Apache-2.0, copie locale dans src/vendor).
// La reconnaissance du produit interroge les bases ouvertes Open Beauty Facts (cosmétiques) et
// Open Food Facts (alimentation, boissons). Un produit absent de ces bases se remplit à la main.

const LIB_URL = 'src/vendor/html5-qrcode-2.3.8.min.js';
let libPromise = null;

function loadLibrary() {
  if (window.Html5Qrcode) return Promise.resolve();
  if (!libPromise) {
    libPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = LIB_URL;
      script.onload = () => (window.Html5Qrcode ? resolve() : reject(new Error('lecteur indisponible')));
      script.onerror = () => reject(new Error('lecteur indisponible'));
      document.head.appendChild(script);
    }).catch((error) => {
      libPromise = null;
      throw error;
    });
  }
  return libPromise;
}

export const cleanBarcode = (value) => String(value || '').trim().replace(/[^0-9A-Za-z-]/g, '').slice(0, 32);

// Ouvre la caméra dans une fenêtre et renvoie le code lu (ou null si la personne ferme la fenêtre).
export async function scanBarcodeWithCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('La caméra n’est pas disponible ici. Utilisez un lecteur USB ou tapez le code.');
  }
  await loadLibrary();

  const overlay = document.createElement('div');
  overlay.className = 'scanner-overlay';
  overlay.innerHTML = `
    <div class="scanner-box" role="dialog" aria-label="Scanner un code-barres">
      <p class="scanner-title">Placez le code-barres devant la caméra</p>
      <div id="barcodeReader" class="scanner-reader"></div>
      <p class="scanner-hint" id="scannerHint">Démarrage de la caméra…</p>
      <button type="button" class="secondary-btn" id="scannerCloseBtn">Annuler</button>
    </div>`;
  document.body.appendChild(overlay);
  const hint = overlay.querySelector('#scannerHint');

  const formats = window.Html5QrcodeSupportedFormats;
  const scanner = new window.Html5Qrcode('barcodeReader', {
    formatsToSupport: formats ? [formats.EAN_13, formats.EAN_8, formats.UPC_A, formats.UPC_E, formats.CODE_128, formats.CODE_39, formats.ITF, formats.QR_CODE] : undefined,
    verbose: false
  });

  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = async (result, error) => {
      if (finished) return;
      finished = true;
      try { await scanner.stop(); } catch { /* déjà arrêtée */ }
      try { scanner.clear(); } catch { /* rien à nettoyer */ }
      overlay.remove();
      if (error) reject(error); else resolve(result);
    };

    overlay.querySelector('#scannerCloseBtn').addEventListener('click', () => finish(null));
    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: (width, height) => ({ width: Math.floor(width * 0.85), height: Math.floor(Math.min(height, width) * 0.5) }) },
      (text) => finish(cleanBarcode(text) || null),
      () => { /* image sans code : on continue */ }
    ).then(() => {
      hint.textContent = 'Recherche du code…';
    }).catch((error) => {
      const denied = /permission|denied|notallowed/i.test(String(error));
      finish(null, new Error(denied
        ? 'L’accès à la caméra est refusé. Autorisez-la dans le navigateur, ou utilisez un lecteur USB.'
        : 'Impossible de démarrer la caméra. Utilisez un lecteur USB ou tapez le code.'));
    });
  });
}

// ---------- Reconnaissance du produit ----------
const SOURCES = [
  { host: 'https://world.openbeautyfacts.org', fixedCategory: 'Cosmétiques' },
  { host: 'https://world.openfoodfacts.org', fixedCategory: '' }
];
const FIELDS = 'product_name,product_name_fr,brands,categories,image_front_small_url,image_front_url';

async function fetchJson(url, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

// Réduit l'image du produit (petite, JPEG) pour qu'elle reste légère dans la base.
async function imageToDataUrl(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return '';
    const bitmap = await createImageBitmap(await response.blob());
    const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  } catch {
    return '';
  }
}

// Renvoie { name, category, image } ou null si le produit n'est connu d'aucune base.
export async function lookupProductByBarcode(code) {
  const barcode = cleanBarcode(code);
  if (!/^\d{6,14}$/.test(barcode)) return null;

  for (const source of SOURCES) {
    try {
      const data = await fetchJson(`${source.host}/api/v2/product/${barcode}.json?fields=${FIELDS}`);
      if (!data || data.status !== 1 || !data.product) continue;
      const product = data.product;
      const baseName = String(product.product_name_fr || product.product_name || '').trim();
      const brand = String(product.brands || '').split(',')[0].trim();
      if (!baseName && !brand) continue;
      const name = brand && !baseName.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${baseName}`.trim() : baseName;
      const firstCategory = String(product.categories || '').split(',')[0].trim();
      const imageUrl = product.image_front_small_url || product.image_front_url || '';
      return {
        name: name.slice(0, 80),
        category: (source.fixedCategory || firstCategory).slice(0, 40),
        image: imageUrl ? await imageToDataUrl(imageUrl) : ''
      };
    } catch {
      // base injoignable : on essaie la suivante
    }
  }
  return null;
}
