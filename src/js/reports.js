// ===== HISTORIQUE ET RAPPORTS =====
import { state } from './state.js';
import { el } from './elements.js';
import { formatCurrency, getVisibleSales, escapeHtml } from './utils.js';
import { isInventoryEnabled, productTracksStock } from './permissions.js';

const HISTORY_PAGE_SIZE = 50;
let historyVisibleCount = HISTORY_PAGE_SIZE;

function renderHistoryDashboard() {
  const visibleSales = getVisibleSales();
  if (!visibleSales.length) {
    el.dashboardContent.innerHTML = '<div class="empty-cart">Aucune vente enregistrée.</div>';
    return;
  }

  const totalSales = visibleSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const pagedSales = visibleSales.slice(0, historyVisibleCount);
  const remaining = visibleSales.length - pagedSales.length;

  el.dashboardContent.innerHTML = `
    <div class="dashboard-summary">
      <div class="dashboard-stat"><span>Ventes</span><strong>${visibleSales.length}</strong></div>
      <div class="dashboard-stat"><span>Chiffre d’affaires</span><strong>${formatCurrency(totalSales)}</strong></div>
      <div class="dashboard-stat"><span>Panier moyen</span><strong>${formatCurrency(totalSales / visibleSales.length)}</strong></div>
    </div>
    <div class="report-block">
      <table class="dashboard-table">
        <thead>
          <tr><th>Date</th><th>Caissier</th><th>Client</th><th>Paiement</th><th>Articles</th><th>Total</th></tr>
        </thead>
        <tbody>
          ${pagedSales.map((sale) => `
            <tr>
              <td>${escapeHtml(sale.time || 'Date inconnue')}${
                sale.failed ? ' <span class="sale-flag">refusée</span>'
                  : sale.pending ? ' <span class="sale-flag">en attente d’envoi</span>'
                    : sale.stockShortfall ? ' <span class="sale-flag">stock insuffisant</span>' : ''}</td>
              <td>${escapeHtml(sale.cashierName || 'Caissier inconnu')}</td>
              <td>${escapeHtml(sale.customer || 'Client général')}</td>
              <td>${escapeHtml(sale.paymentMethod || 'Espèces')}</td>
              <td>${(sale.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)}</td>
              <td><strong>${escapeHtml(sale.totalLabel || formatCurrency(sale.total || 0))}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ${remaining > 0 ? `<button id="loadMoreHistoryBtn" class="secondary-btn full-width" type="button">Afficher plus de ventes (${remaining} restante${remaining > 1 ? 's' : ''})</button>` : ''}
  `;
}

function renderReportsDashboard() {
  const visibleSales = getVisibleSales();
  const totalSales = visibleSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const productSales = {};

  visibleSales.forEach((sale) => {
    (sale.items || []).forEach((item) => {
      productSales[item.name] = (productSales[item.name] || 0) + Number(item.quantity || 0);
    });
  });

  const bestProducts = Object.entries(productSales)
    .sort(([, firstCount], [, secondCount]) => secondCount - firstCount)
    .slice(0, 5);
  const lowStockProducts = isInventoryEnabled()
    ? state.products.filter((product) => productTracksStock(product) && Number(product.stock) <= Number(state.businessConfig.lowStockThreshold || 5))
    : [];

  el.dashboardContent.innerHTML = `
    <div class="dashboard-summary">
      <div class="dashboard-stat"><span>Chiffre d’affaires</span><strong>${formatCurrency(totalSales)}</strong></div>
      <div class="dashboard-stat"><span>Transactions</span><strong>${visibleSales.length}</strong></div>
      <div class="dashboard-stat"><span>Produits en stock faible</span><strong>${lowStockProducts.length}</strong></div>
    </div>
    <div class="report-block">
      <strong>Produits les plus vendus</strong>
      <div class="report-list">
        ${bestProducts.length ? bestProducts.map(([name, quantity]) => `<div class="report-line"><span>${escapeHtml(name)}</span><strong>${quantity} vendu${quantity > 1 ? 's' : ''}</strong></div>`).join('') : '<small>Aucune vente enregistrée.</small>'}
      </div>
    </div>
    ${isInventoryEnabled() ? `<div class="report-block">
      <strong>Stock à surveiller</strong>
      <div class="report-list">
        ${lowStockProducts.length ? lowStockProducts.map((product) => `<div class="report-line"><span>${escapeHtml(product.name)}</span><strong>${product.stock} restant${product.stock > 1 ? 's' : ''}</strong></div>`).join('') : '<small>Aucun produit en stock faible.</small>'}
      </div>
    </div>` : ''}
  `;
}

export function openDashboard(view) {
  el.dashboardTitle.textContent = view === 'reports' ? 'Rapports' : 'Historique des ventes';
  if (view === 'reports') {
    renderReportsDashboard();
  } else {
    historyVisibleCount = HISTORY_PAGE_SIZE;
    renderHistoryDashboard();
  }
  el.dashboardModal.classList.remove('hidden');
}

export function closeDashboard() {
  el.dashboardModal.classList.add('hidden');
}

export function initReports() {
  el.closeDashboardBtn.addEventListener('click', closeDashboard);

  el.dashboardContent.addEventListener('click', (event) => {
    if (event.target.id === 'loadMoreHistoryBtn') {
      historyVisibleCount += HISTORY_PAGE_SIZE;
      renderHistoryDashboard();
    }
  });
}
