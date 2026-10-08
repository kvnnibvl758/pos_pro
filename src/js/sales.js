// ===== VENTES ET ENCAISSEMENT =====
import { state } from './state.js';
import { el } from './elements.js';
import { getVisibleSales, escapeHtml } from './utils.js';
import * as store from './store.js';
import { renderCart, printReceipt } from './cart.js';
import { renderProducts } from './products.js';

export function renderSalesHistory() {
  const visibleSales = getVisibleSales();
  if (!visibleSales.length) {
    el.salesHistory.innerHTML = '<div class="empty-cart">Aucune vente aujourd’hui.</div>';
    return;
  }

  const recentSales = visibleSales.slice(0, 4);
  el.salesHistory.innerHTML = recentSales.map((sale) => `
    <div class="sale-item">
      <strong>${escapeHtml(sale.totalLabel)}</strong>
      <small>${escapeHtml(sale.time)} · ${escapeHtml(sale.cashierName || 'Caissier')}${
        sale.failed ? '<span class="sale-flag">refusée</span>'
          : sale.pending ? '<span class="sale-flag">en attente d’envoi</span>'
            : sale.stockShortfall ? '<span class="sale-flag">stock insuffisant</span>' : ''}</small>
    </div>
  `).join('');
}

export function initSales() {
  el.checkoutBtn.addEventListener('click', async () => {
    if (!state.currentUser) {
      alert('Connectez-vous pour enregistrer une vente.');
      return;
    }

    if (!state.cart.length) {
      alert('Ajoutez au moins un produit avant de payer.');
      return;
    }

    // La fenêtre du ticket est ouverte tout de suite (geste de l'utilisateur) : après une
    // attente réseau, les navigateurs pourraient bloquer l'ouverture d'une pop-up.
    const receiptWindow = window.open('', '_blank');
    el.checkoutBtn.disabled = true;
    let sale;
    try {
      sale = await store.checkout({
        paymentMethod: state.selectedPaymentMethod,
        customerId: el.customerSelect.value || null
      });
    } catch (error) {
      if (receiptWindow) receiptWindow.close();
      alert(error.message);
      renderProducts(el.searchInput.value);
      renderCart();
      return;
    } finally {
      el.checkoutBtn.disabled = false;
    }

    printReceipt(receiptWindow);
    alert(sale.pending
      ? `Vente enregistrée hors connexion : ${sale.totalLabel}\nElle sera envoyée automatiquement dès le retour du réseau.`
      : `Paiement enregistré : ${sale.totalLabel}`);
    state.cart.length = 0;
    renderProducts(el.searchInput.value);
    renderCart();
    renderSalesHistory();
  });
}
