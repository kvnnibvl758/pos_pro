// ===== PANIER =====
import { state } from './state.js';
import { el } from './elements.js';
import { formatCurrency, getCurrentCashierSalesTotal, escapeHtml } from './utils.js';
import { productTracksStock } from './permissions.js';

export function addToCart(productId) {
  if (!state.currentUser) {
    alert('Connectez-vous pour commencer une vente.');
    return;
  }

  const product = state.products.find((item) => item.id === productId);
  if (!product) return;

  if (productTracksStock(product) && product.stock <= 0) {
    alert('Produit en rupture de stock.');
    return;
  }

  const existingItem = state.cart.find((item) => item.id === productId);

  if (productTracksStock(product) && existingItem && existingItem.quantity >= product.stock) {
    alert('Quantité maximale atteinte pour ce produit.');
    return;
  }

  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    state.cart.push({ ...product, quantity: 1 });
  }

  renderCart();
}

export function updateQuantity(productId, change) {
  const item = state.cart.find((entry) => entry.id === productId);
  if (!item) return;

  item.quantity += change;

  if (item.quantity <= 0) {
    const index = state.cart.findIndex((entry) => entry.id === productId);
    state.cart.splice(index, 1);
  }

  renderCart();
}

export function removeItem(productId) {
  const index = state.cart.findIndex((entry) => entry.id === productId);
  if (index >= 0) state.cart.splice(index, 1);
  renderCart();
}

export function getCartSubtotal() {
  return state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

export function renderCart() {
  if (!state.cart.length) {
    el.cartItems.innerHTML = '<div class="empty-cart">Le panier est vide.</div>';
  } else {
    el.cartItems.innerHTML = state.cart.map((item) => `
      <div class="cart-item">
        <div class="cart-item-head">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${formatCurrency(item.price * item.quantity)}</span>
        </div>
        <div class="cart-item-controls">
          <div class="qty-box">
            <button data-action="decrease" data-id="${item.id}">−</button>
            <span>${item.quantity}</span>
            <button data-action="increase" data-id="${item.id}">+</button>
          </div>
          <button class="remove-btn" data-id="${item.id}">Supprimer</button>
        </div>
      </div>
    `).join('');
  }

  el.cartItems.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const productId = button.dataset.id;
      updateQuantity(productId, button.dataset.action === 'increase' ? 1 : -1);
    });
  });

  el.cartItems.querySelectorAll('.remove-btn').forEach((button) => {
    button.addEventListener('click', () => removeItem(button.dataset.id));
  });

  updateTotals();
}

export function updateTotals() {
  const subtotal = getCartSubtotal();
  const tax = subtotal * (Number(state.businessConfig.taxRate || 0) / 100);
  const total = subtotal - state.discount + tax;

  el.subtotal.textContent = formatCurrency(subtotal);
  el.discount.textContent = formatCurrency(state.discount);
  el.tax.textContent = formatCurrency(tax);
  el.total.textContent = formatCurrency(total);
  el.todaySales.textContent = formatCurrency(getCurrentCashierSalesTotal());
}

export function printReceipt(preopenedWindow = null) {
  if (!state.cart.length) {
    alert('Le panier est vide, ajoutez au moins un produit.');
    return;
  }

  const subtotal = getCartSubtotal();
  const tax = subtotal * (Number(state.businessConfig.taxRate || 0) / 100);
  const total = subtotal + tax;
  const chosenCustomer = state.customers.find((customer) => String(customer.id) === String(el.customerSelect.value));
  const customerLabel = chosenCustomer ? chosenCustomer.name : 'Client général';

  const receiptHtml = `
    <html>
      <head>
        <title>Ticket POS</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h2 { text-align: center; margin-bottom: 20px; }
          .line { display: flex; justify-content: space-between; margin: 6px 0; }
          hr { border: 1px dashed #999; margin: 12px 0; }
        </style>
      </head>
      <body>
        <h2>${escapeHtml(state.businessConfig.name)}</h2>
        <div class="line"><span>Client</span><strong>${escapeHtml(customerLabel)}</strong></div>
        <div class="line"><span>Caissier</span><strong>${escapeHtml(state.currentUser ? state.currentUser.username : 'Agent')}</strong></div>
        <div class="line"><span>Paiement</span><strong>${escapeHtml(state.selectedPaymentMethod)}</strong></div>
        <hr />
        ${state.cart.map((item) => `
          <div class="line"><span>${escapeHtml(item.name)} x${item.quantity}</span><span>${formatCurrency(item.price * item.quantity)}</span></div>
        `).join('')}
        <hr />
        <div class="line"><span>Sous-total</span><span>${formatCurrency(subtotal)}</span></div>
        <div class="line"><span>TVA</span><span>${formatCurrency(tax)}</span></div>
        <div class="line"><span>Total</span><strong>${formatCurrency(total)}</strong></div>
        <hr />
        <p style="text-align:center; font-weight:700; margin-top:18px;">Merci pour votre visite, revenez vite !</p>
      </body>
    </html>
  `;

  const printWindow = preopenedWindow || window.open('', '_blank');
  if (!printWindow) {
    alert('Le ticket n’a pas pu s’ouvrir : autorisez les fenêtres pop-up pour ce site.');
    return;
  }
  printWindow.document.write(receiptHtml);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 300);
}

export function initCart() {
  el.clearCartBtn.addEventListener('click', () => {
    state.cart.length = 0;
    renderCart();
  });

  el.paymentOptions.querySelectorAll('.payment-btn[data-payment]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedPaymentMethod = button.dataset.payment;
      el.paymentOptions.querySelectorAll('.payment-btn[data-payment]').forEach((paymentButton) => {
        paymentButton.classList.toggle('active', paymentButton === button);
      });
    });
  });
}
