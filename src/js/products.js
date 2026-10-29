// ===== CATALOGUE PRODUITS =====
import { state } from './state.js';
import { el } from './elements.js';
import { formatCurrency, escapeHtml, validateImageFile } from './utils.js';
import { canManageProducts, isInventoryEnabled, productTracksStock } from './permissions.js';
import * as store from './store.js';
import { addToCart } from './cart.js';
import { confirmDialog } from './confirmDialog.js';
import { openCategoriesManager } from './categoriesManager.js';
import { scanBarcodeWithCamera, lookupProductByBarcode, cleanBarcode, fixAzertyCode } from './barcode.js';

const PRODUCTS_PAGE_SIZE = 60;
let visibleProductCount = PRODUCTS_PAGE_SIZE;
let lastFilterKey = '';

// Suggestions proposées quand on tape une catégorie (la personne peut écrire n'importe quelle catégorie).
const SUGGESTED_CATEGORIES = [
  'Cosmétiques', 'Soins du visage', 'Soins du corps', 'Maquillage', 'Parfums', 'Cheveux',
  'Vêtements', 'Accessoires', 'Électronique'
];

function existingCategories() {
  const seen = new Map();
  state.products.forEach((product) => {
    const name = String(product.category || '').trim();
    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  });
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'fr'));
}

export function syncProductCategoryOptions() {
  if (!el.productCategoryPicker) return;
  const existing = existingCategories();
  const known = new Set(existing.map((name) => name.toLowerCase()));
  const suggestions = [...existing, ...SUGGESTED_CATEGORIES.filter((name) => !known.has(name.toLowerCase()))];
  el.productCategoryPicker.innerHTML = '<option value="">▾ Choisir dans la liste…</option>'
    + suggestions.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
}

// La liste déroulante des catégories suit les catégories réellement utilisées par les produits.
function renderCategoryChips() {
  if (!el.categoryChips) return;
  const categories = existingCategories();
  if (state.activeCategory && !categories.some((name) => name.toLowerCase() === state.activeCategory.toLowerCase())) {
    state.activeCategory = '';
  }
  const options = [{ label: 'Toutes les catégories', value: '' }, ...categories.map((name) => ({ label: name, value: name }))];
  if (el.manageCategoriesBtn) el.manageCategoriesBtn.classList.toggle('hidden', !canManageProducts());
  el.categoryChips.innerHTML = options.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join('');
  const active = categories.find((name) => name.toLowerCase() === (state.activeCategory || '').toLowerCase()) || '';
  el.categoryChips.value = active;
}

export function renderProducts(filter = el.searchInput.value) {
  renderCategoryChips();
  const filterKey = `${filter}|${state.activeCategory}`;
  if (filterKey !== lastFilterKey) {
    visibleProductCount = PRODUCTS_PAGE_SIZE;
    lastFilterKey = filterKey;
  }

  const filtered = state.products.filter((product) =>
    (product.name.toLowerCase().includes(filter.toLowerCase()) ||
      (product.barcode && product.barcode.includes(filter.trim())) ||
      product.category.toLowerCase().includes(filter.toLowerCase())) &&
    (!state.activeCategory || product.category.toLowerCase() === state.activeCategory.toLowerCase())
  );

  const visibleProducts = filtered.slice(0, visibleProductCount);
  const remaining = filtered.length - visibleProducts.length;

  el.productCount.textContent = remaining > 0
    ? `${visibleProducts.length} sur ${filtered.length} produits`
    : `${filtered.length} produit${filtered.length > 1 ? 's' : ''}`;

  el.loadMoreProductsBtn.classList.toggle('hidden', remaining <= 0);
  el.loadMoreProductsBtn.textContent = `Afficher plus de produits (${remaining} restant${remaining > 1 ? 's' : ''})`;

  el.productGrid.innerHTML = visibleProducts.map((product) => {
    const initials = escapeHtml(product.name.trim().slice(0, 2).toUpperCase());
    const safeName = escapeHtml(product.name);
    const safeCategory = escapeHtml(product.category);
    const imageMarkup = product.image
      ? `<img class="product-image" src="${escapeHtml(product.image)}" alt="${safeName}" />`
      : `<div class="product-thumb">${initials}</div>`;

    return `
      <article class="product-card" data-product-id="${product.id}" tabindex="0" role="button" aria-label="Ajouter ${safeName} au panier">
        ${imageMarkup}
        <div class="product-name">${safeName}</div>
        <div class="product-meta">
          <span>${safeCategory}</span>
          ${productTracksStock(product) ? `<span>Stock ${Number(product.stock) || 0}</span>` : (isInventoryEnabled() ? '<span>À la demande</span>' : '')}
        </div>
        <div class="product-footer">
          <div class="product-price">${formatCurrency(product.price)}</div>
        </div>
        ${canManageProducts() ? `
          <div class="product-admin-actions">
            <button class="edit-product-btn" data-product-id="${product.id}">Modifier</button>
            <button class="delete-product-btn" data-product-id="${product.id}">Supprimer</button>
          </div>
        ` : ''}
      </article>
    `;
  }).join('');

  el.productGrid.querySelectorAll('.product-card').forEach((card) => {
    const handleAdd = () => addToCart(card.dataset.productId);
    card.addEventListener('click', handleAdd);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleAdd();
      }
    });
  });

  el.productGrid.querySelectorAll('.edit-product-btn').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      openProductModal(button.dataset.productId);
    });
  });

  el.productGrid.querySelectorAll('.delete-product-btn').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      deleteProduct(button.dataset.productId);
    });
  });

  updateLowStockCount();
}

function updateLowStockCount() {
  if (!el.lowStockCount) return;
  const count = state.products.filter((product) => productTracksStock(product) && Number(product.stock) <= Number(state.businessConfig.lowStockThreshold || 5)).length;
  el.lowStockCount.textContent = String(count);
}

export async function deleteProduct(productId) {
  if (!canManageProducts()) {
    alert('Seul l’administrateur principal peut supprimer un produit.');
    return;
  }

  const product = state.products.find((entry) => entry.id === productId);
  if (!product) return;
  const confirmed = await confirmDialog({
    title: 'Supprimer ce produit ?',
    message: `Voulez-vous vraiment supprimer « ${product.name} » ? Cette action est définitive.`,
    confirmLabel: 'Oui, supprimer',
    cancelLabel: 'Non, garder',
    danger: true
  });
  if (!confirmed) return;

  try {
    await store.removeProduct(productId);
  } catch (error) {
    alert(error.message);
  }
  renderProducts(el.searchInput.value);
}

function syncProductStockFieldVisibility() {
  const showStockField = isInventoryEnabled() && el.productTrackStock.checked;
  el.productStockField.style.display = showStockField ? '' : 'none';
  el.productStock.required = showStockField;
}

export function openProductModal(productId = null) {
  if (!canManageProducts()) {
    alert('Seul l’administrateur principal peut gérer les produits.');
    return;
  }

  state.editingProductId = productId;
  syncProductCategoryOptions();

  if (state.editingProductId) {
    const product = state.products.find((entry) => entry.id === state.editingProductId);
    if (!product) return;

    el.productName.value = product.name;
    el.productBarcode.value = product.barcode || '';
    el.productCategory.value = product.category;
    el.productPrice.value = product.price;
    el.productTrackStock.checked = product.trackStock !== false;
    el.productStock.value = product.stock || 0;
    if (product.image) {
      el.imagePreview.src = product.image;
      el.imagePreview.classList.add('visible');
    }
    el.productModalTitle.textContent = 'Modifier le produit';
    el.productSubmitBtn.textContent = 'Enregistrer les modifications';
  } else {
    el.productTrackStock.checked = true;
    el.productModalTitle.textContent = 'Ajouter un produit';
    el.productSubmitBtn.textContent = 'Enregistrer';
  }

  syncProductStockFieldVisibility();
  el.productModal.classList.remove('hidden');
}

const BARCODE_HINT = 'Avec un lecteur USB : cliquez dans ce champ puis scannez.';
const setBarcodeStatus = (text) => {
  if (!el.barcodeStatus) return;
  el.barcodeStatus.textContent = text;
  el.barcodeStatus.classList.remove('barcode-warning');
};

// Après un scan (ou une saisie) : détecte un doublon, puis reconnaît le produit et remplit les champs vides.
async function handleBarcode(rawCode) {
  const code = cleanBarcode(rawCode);
  el.productBarcode.value = code;
  if (!code) { setBarcodeStatus(BARCODE_HINT); return; }

  const duplicate = state.products.find((product) => product.barcode === code && product.id !== state.editingProductId);
  if (duplicate) {
    setBarcodeStatus(`⚠️ Produit déjà enregistré : « ${duplicate.name} ». Modifiez-le au lieu d’en créer un second.`);
    el.barcodeStatus?.classList.add('barcode-warning');
    return;
  }

  setBarcodeStatus('Recherche du produit…');
  const found = await lookupProductByBarcode(code);
  if (cleanBarcode(el.productBarcode.value) !== code) return; // le code a changé entre-temps
  if (!found) {
    setBarcodeStatus('Produit non reconnu : remplissez les informations, le code sera retenu pour les prochains scans.');
    return;
  }
  if (!el.productName.value.trim() && found.name) el.productName.value = found.name;
  if (!el.productCategory.value.trim() && found.category) el.productCategory.value = found.category;
  if (found.image && !el.imagePreview.classList.contains('visible')) {
    el.imagePreview.src = found.image;
    el.imagePreview.classList.add('visible');
  }
  setBarcodeStatus('Produit reconnu : vérifiez les informations, puis indiquez le prix.');
  if (!el.productPrice.value) el.productPrice.focus();
}

export function closeProductModal() {
  const savedMsg = document.getElementById('productSavedMsg');
  if (savedMsg) savedMsg.hidden = true;
  setBarcodeStatus(BARCODE_HINT);
  el.productModal.classList.add('hidden');
  state.editingProductId = null;
  el.addProductForm.reset();
  el.imagePreview.src = '';
  el.imagePreview.classList.remove('visible');
  el.productModalTitle.textContent = 'Ajouter un produit';
  el.productSubmitBtn.textContent = 'Enregistrer';
}

export function initProducts() {
  el.searchInput.addEventListener('input', (event) => renderProducts(event.target.value));
  // Scan à la caisse : lecteur USB (le code est « tapé » puis Entrée) ou caméra → le produit est ajouté au panier.
  let feedbackTimer = 0;
  const showScanFeedback = (message, ok) => {
    const box = el.scanFeedback;
    if (!box) return;
    box.textContent = message;
    box.className = `scan-feedback ${ok ? 'ok' : 'error'}`;
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => { box.className = 'scan-feedback hidden'; }, 3500);
  };
  const addScannedCode = (rawCode) => {
    const code = cleanBarcode(rawCode);
    if (!code) return false;
    const match = state.products.find((product) => product.barcode && product.barcode === code);
    if (!match) {
      showScanFeedback(`Code ${code} inconnu : ajoutez d’abord ce produit au catalogue.`, false);
      return false;
    }
    addToCart(match.id);
    showScanFeedback(`${match.name} ajouté au panier`, true);
    return true;
  };
  el.searchInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const typed = fixAzertyCode(el.searchInput.value);
    // Seuls les codes (chiffres) sont traités comme un scan ; un nom reste une simple recherche.
    if (!/^[0-9]{6,}$/.test(typed)) return;
    event.preventDefault();
    addScannedCode(typed);
    el.searchInput.value = '';
    renderProducts('');
  });
  // Lecteur USB sans cliquer dans la recherche : une rafale de touches rapides terminée par Entrée.
  let scanBuffer = '';
  let lastKeyAt = 0;
  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const now = Date.now();
    if (now - lastKeyAt > 80) scanBuffer = '';
    lastKeyAt = now;
    if (event.key === 'Enter') {
      if (scanBuffer.length >= 6) addScannedCode(scanBuffer);
      scanBuffer = '';
    } else if (/^[0-9A-Za-z\-&é"'(è_çà]$/.test(event.key)) {
      scanBuffer += event.key;
    }
  });
  if (el.scanCartBtn) {
    el.scanCartBtn.addEventListener('click', async () => {
      el.scanCartBtn.disabled = true;
      try {
        const code = await scanBarcodeWithCamera();
        if (code) addScannedCode(code);
      } catch (error) {
        showScanFeedback(error.message, false);
      } finally {
        el.scanCartBtn.disabled = false;
      }
    });
  }

  el.loadMoreProductsBtn.addEventListener('click', () => {
    visibleProductCount += PRODUCTS_PAGE_SIZE;
    renderProducts(el.searchInput.value);
  });

  // Liste déroulante des catégories dans le formulaire produit : le choix remplit le champ (qu'on peut aussi taper).
  el.productCategoryPicker.addEventListener('change', () => {
    if (el.productCategoryPicker.value) el.productCategory.value = el.productCategoryPicker.value;
    el.productCategoryPicker.value = '';
    el.productCategory.focus();
  });

  el.manageCategoriesBtn?.addEventListener('click', () => {
    openCategoriesManager(() => {
      syncProductCategoryOptions();
      renderProducts(el.searchInput.value);
    });
  });

  el.categoryChips.addEventListener('change', () => {
    state.activeCategory = el.categoryChips.value || '';
    renderProducts(el.searchInput.value);
  });

  // Code-barres : bouton caméra, lecteur USB (le lecteur « tape » le code puis Entrée) et saisie manuelle.
  el.scanBarcodeBtn.addEventListener('click', async () => {
    el.scanBarcodeBtn.disabled = true;
    try {
      const code = await scanBarcodeWithCamera();
      if (code) await handleBarcode(code);
    } catch (error) {
      setBarcodeStatus(error.message);
    } finally {
      el.scanBarcodeBtn.disabled = false;
    }
  });
  el.productBarcode.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault(); // le lecteur USB envoie Entrée : on ne doit pas valider le formulaire
    handleBarcode(el.productBarcode.value);
  });
  // Corrige à l'écran un code arrivé en & é " ' ( (lecteur QWERTY sur clavier AZERTY).
  const fixField = (input) => { const fixed = fixAzertyCode(input.value); if (fixed !== input.value.trim()) input.value = fixed; };
  el.productBarcode.addEventListener('input', () => fixField(el.productBarcode));
  el.searchInput.addEventListener('input', () => {
    const before = el.searchInput.value;
    fixField(el.searchInput);
    if (el.searchInput.value !== before) renderProducts(el.searchInput.value);
  });
  el.productBarcode.addEventListener('change', () => handleBarcode(el.productBarcode.value));

  el.closeModalBtn.addEventListener('click', closeProductModal);
  el.cancelProductBtn.addEventListener('click', closeProductModal);
  el.productTrackStock.addEventListener('change', syncProductStockFieldVisibility);

  el.productImageInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) {
      el.imagePreview.src = '';
      el.imagePreview.classList.remove('visible');
      return;
    }

    const { valid, error } = validateImageFile(file);
    if (!valid) {
      alert(error);
      event.target.value = '';
      el.imagePreview.src = '';
      el.imagePreview.classList.remove('visible');
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      el.imagePreview.src = loadEvent.target.result;
      el.imagePreview.classList.add('visible');
    };
    reader.readAsDataURL(file);
  });

  el.addProductForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!canManageProducts()) {
      alert('Seul l’administrateur principal peut gérer les produits.');
      return;
    }

    const formData = new FormData(el.addProductForm);
    const name = formData.get('productName').toString().trim();
    const category = formData.get('productCategory').toString().trim();
    const price = Number(formData.get('productPrice'));
    const trackStock = isInventoryEnabled() ? el.productTrackStock.checked : false;
    const stock = trackStock ? Number(formData.get('productStock')) : 0;

    if (!name || !category || !price || price <= 0) {
      alert('Remplis tous les champs requis avec des valeurs correctes.');
      return;
    }

    const existingProduct = state.editingProductId
      ? state.products.find((product) => product.id === state.editingProductId)
      : null;

    // Pas de doublon : même code-barres ou même nom qu'un produit déjà enregistré.
    const newBarcode = cleanBarcode(formData.get('productBarcode'));
    const others = state.products.filter((product) => product.id !== state.editingProductId);
    const sameBarcode = newBarcode && others.find((product) => product.barcode === newBarcode);
    if (sameBarcode) {
      alert(`Ce produit est déjà enregistré : « ${sameBarcode.name} » utilise déjà ce code-barres.\nModifiez le produit existant au lieu d’en créer un second.`);
      return;
    }
    const sameName = others.find((product) => product.name.trim().toLowerCase() === name.toLowerCase());
    if (sameName) {
      alert(`Un produit nommé « ${sameName.name} » est déjà enregistré.\nModifiez-le, ou donnez un nom différent à celui-ci (par exemple avec sa taille ou sa marque).`);
      return;
    }

    const productData = {
      name,
      category,
      price,
      trackStock,
      stock: stock > 0 ? stock : 0,
      emoji: existingProduct?.emoji || '',
      barcode: cleanBarcode(formData.get('productBarcode')),
      image: el.imagePreview.src && el.imagePreview.classList.contains('visible') ? el.imagePreview.src : ''
    };

    el.productSubmitBtn.disabled = true;
    try {
      await store.saveProduct(productData, existingProduct ? existingProduct.id : null);
    } catch (error) {
      alert(/duplicate|unique|23505/i.test(String(error.message))
        ? 'Ce produit est déjà enregistré (même code-barres).'
        : error.message);
      return;
    } finally {
      el.productSubmitBtn.disabled = false;
    }

    renderProducts(el.searchInput.value);
    if (existingProduct) {
      closeProductModal();
      return;
    }

    // Nouveau produit : la fenêtre reste ouverte pour en enregistrer d'autres à la suite.
    const keptCategory = category;
    el.addProductForm.reset();
    el.productCategory.value = keptCategory;
    el.imagePreview.src = '';
    el.imagePreview.classList.remove('visible');
    syncProductStockFieldVisibility();
    setBarcodeStatus(BARCODE_HINT);
    let saved = document.getElementById('productSavedMsg');
    if (!saved) {
      saved = document.createElement('div');
      saved.id = 'productSavedMsg';
      saved.className = 'product-saved-msg';
      saved.setAttribute('role', 'status');
      el.addProductForm.prepend(saved);
    }
    saved.textContent = `✅ « ${name} » est enregistré. Vous pouvez en ajouter un autre.`;
    saved.hidden = false;
    clearTimeout(saved._timer);
    saved._timer = setTimeout(() => { saved.hidden = true; }, 6000);
    el.productBarcode.focus();
  });
}
