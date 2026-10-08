// ===== CATALOGUE PRODUITS =====
import { state } from './state.js';
import { el } from './elements.js';
import { formatCurrency, escapeHtml, validateImageFile } from './utils.js';
import { canManageProducts, isInventoryEnabled, productTracksStock } from './permissions.js';
import * as store from './store.js';
import { addToCart } from './cart.js';

const PRODUCTS_PAGE_SIZE = 60;
let visibleProductCount = PRODUCTS_PAGE_SIZE;
let lastFilterKey = '';

export function syncProductCategoryOptions() {
  if (!el.productCategory) return;

  const categories = [...new Set([
    'Boissons',
    'Desserts',
    'Alimentaire',
    ...state.products.map((product) => product.category).filter(Boolean)
  ])];
  const currentValue = el.productCategory.value;

  el.productCategory.innerHTML = '<option value="">Choisir une catégorie</option>' + categories.map((category) => `
    <option value="${escapeHtml(category)}">${escapeHtml(category)}</option>
  `).join('');
  el.productCategory.value = currentValue;
}

export function renderProducts(filter = el.searchInput.value) {
  const filterKey = `${filter}|${state.activeCategory}`;
  if (filterKey !== lastFilterKey) {
    visibleProductCount = PRODUCTS_PAGE_SIZE;
    lastFilterKey = filterKey;
  }

  const filtered = state.products.filter((product) =>
    (product.name.toLowerCase().includes(filter.toLowerCase()) ||
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
  if (!window.confirm(`Supprimer le produit « ${product.name} » ?`)) return;

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

export function closeProductModal() {
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

  el.loadMoreProductsBtn.addEventListener('click', () => {
    visibleProductCount += PRODUCTS_PAGE_SIZE;
    renderProducts(el.searchInput.value);
  });

  el.categoryChips.querySelectorAll('.chip[data-category]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeCategory = button.dataset.category || '';
      el.categoryChips.querySelectorAll('.chip[data-category]').forEach((chip) => chip.classList.remove('active'));
      button.classList.add('active');
      renderProducts(el.searchInput.value);
    });
  });

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

    const productData = {
      name,
      category,
      price,
      trackStock,
      stock: stock > 0 ? stock : 0,
      emoji: existingProduct?.emoji || '',
      image: el.imagePreview.src && el.imagePreview.classList.contains('visible') ? el.imagePreview.src : ''
    };

    el.productSubmitBtn.disabled = true;
    try {
      await store.saveProduct(productData, existingProduct ? existingProduct.id : null);
    } catch (error) {
      alert(error.message);
      return;
    } finally {
      el.productSubmitBtn.disabled = false;
    }

    closeProductModal();
    renderProducts(el.searchInput.value);
  });
}
