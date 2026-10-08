// ===== CLIENTS =====
import { state } from './state.js';
import { el } from './elements.js';
import { canManageCustomers } from './permissions.js';
import { escapeHtml } from './utils.js';
import * as store from './store.js';

export function syncCustomerOptions() {
  if (!el.customerSelect) return;

  const previousValue = el.customerSelect.value;
  el.customerSelect.innerHTML = '<option value="">Client général</option>' + state.customers.map((customer) => `
    <option value="${escapeHtml(customer.id)}">${escapeHtml(customer.name)}</option>
  `).join('');
  if (state.customers.some((customer) => customer.id === previousValue)) {
    el.customerSelect.value = previousValue;
  }
}

export function renderCustomers() {
  if (!el.customerList) return;

  el.customerList.innerHTML = state.customers.map((customer) => `
    <div class="customer-item">
      <div>
        <strong>${escapeHtml(customer.name)}</strong><br />
        <small>${escapeHtml(customer.type)}</small>
      </div>
      <div class="customer-actions">
        <small>${escapeHtml(customer.phone || 'Sans téléphone')}</small>
        ${canManageCustomers() ? `<button class="danger-btn" data-customer-id="${escapeHtml(customer.id)}">Supprimer</button>` : ''}
      </div>
    </div>
  `).join('');

  el.customerList.querySelectorAll('.danger-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!canManageCustomers()) {
        alert('Seul l’administrateur principal peut supprimer un client.');
        return;
      }

      try {
        await store.removeCustomer(button.dataset.customerId);
      } catch (error) {
        alert(error.message);
      }
      syncCustomerOptions();
      renderCustomers();
    });
  });
}

export function openCustomerModal() {
  el.customerForm.style.display = canManageCustomers() ? 'grid' : 'none';
  el.customerModal.classList.remove('hidden');
}

export function closeCustomerModal() {
  el.customerModal.classList.add('hidden');
}

export function initCustomers() {
  el.customerForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!canManageCustomers()) {
      alert('Seul l’administrateur principal peut ajouter ou supprimer un client.');
      return;
    }

    if (!el.customerName.value.trim()) {
      alert('Le nom du client est obligatoire.');
      return;
    }

    try {
      await store.saveCustomer({
        name: el.customerName.value.trim(),
        phone: el.customerPhone.value.trim(),
        type: el.customerType.value
      });
    } catch (error) {
      alert(error.message);
      return;
    }

    syncCustomerOptions();
    renderCustomers();
    el.customerForm.reset();
  });

  el.closeCustomerModalBtn.addEventListener('click', closeCustomerModal);
  el.cancelCustomerBtn.addEventListener('click', closeCustomerModal);
}
