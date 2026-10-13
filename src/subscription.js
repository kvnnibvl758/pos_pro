// ===== ABONNEMENT : bandeau, onglet « Abonnement » et écran d'administration =====
// Règle serveur (migration 20261012000001) : 14 jours d'essai, puis abonnement annuel. À l'expiration,
// plus de vente ni de modification du catalogue ; l'historique et les rapports restent consultables.
import { state } from './state.js';
import { el } from './elements.js';
import { escapeHtml } from './utils.js';
import { isCloudMode } from './supabaseClient.js';
import * as cloudStore from './cloudStore.js';
import {
  getSubscription,
  subscriptionConfig,
  RENEWAL_WARNING_DAYS
} from './subscriptionStatus.js';

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
const formatDate = (value) => (value ? dateFormatter.format(new Date(value)) : '—');
const plural = (count) => `${count} jour${count > 1 ? 's' : ''}`;

// Retour de la page de paiement Djomy (?paiement=retour) : on attend la confirmation du serveur.
const RETURN_FLAG = 'pos-payment-return';
const RETURN_WINDOW_MS = 15 * 60 * 1000;
function paymentWaiting() {
  try {
    const startedAt = Number(sessionStorage.getItem(RETURN_FLAG) || 0);
    return startedAt > 0 && Date.now() - startedAt < RETURN_WINDOW_MS;
  } catch {
    return false;
  }
}

const isOwner = () => Boolean(state.currentUser?.cloud && state.currentUser.isPrimary);

// Phrase d'état + gravité, partagée par le bandeau et l'onglet.
function describe(sub) {
  if (sub.phase === 'trial') {
    return { level: 'info', text: `Essai gratuit : ${plural(sub.daysLeft)} restant${sub.daysLeft > 1 ? 's' : ''} (jusqu’au ${formatDate(sub.expiresAt)}).` };
  }
  if (sub.phase === 'active') {
    return { level: sub.daysLeft <= RENEWAL_WARNING_DAYS ? 'warn' : 'ok', text: `Abonnement actif jusqu’au ${formatDate(sub.expiresAt)} (${plural(sub.daysLeft)}).` };
  }
  if (sub.phase === 'expired') {
    return { level: 'error', text: `Abonnement expiré depuis le ${formatDate(sub.expiresAt)} : les ventes et la modification du catalogue sont bloquées.` };
  }
  return null;
}

// ---------- Bandeau en haut de la caisse ----------
export function renderSubscriptionBanner() {
  if (!el.subscriptionBanner) return;
  const sub = getSubscription();
  const info = describe(sub);
  // Le bandeau ne s'affiche que pour le propriétaire (c'est lui qui paie) et seulement quand il faut agir.
  const needsAttention = info && (sub.phase === 'expired' || sub.phase === 'trial' || info.level === 'warn');
  const waiting = paymentWaiting() && sub.phase !== 'active';
  const visible = Boolean(state.currentUser) && (needsAttention || waiting) && isOwner();

  el.subscriptionBanner.classList.toggle('hidden', !visible);
  el.subscriptionBanner.classList.toggle('is-error', visible && sub.phase === 'expired');
  if (visible) {
    el.subscriptionBannerText.textContent = waiting
      ? 'Paiement en cours de confirmation : votre abonnement s’active automatiquement dans quelques instants.'
      : info.text;
  }
  if (sub.phase === 'active') {
    try { sessionStorage.removeItem(RETURN_FLAG); } catch { /* stockage bloqué : sans importance */ }
  }

  // Un caissier ne peut pas payer : il voit seulement que la caisse est bloquée.
  if (Boolean(state.currentUser) && sub.phase === 'expired' && !isOwner()) {
    el.subscriptionBanner.classList.remove('hidden');
    el.subscriptionBanner.classList.add('is-error');
    el.subscriptionBannerText.textContent = 'L’abonnement du commerce a expiré : prévenez le propriétaire pour reprendre les ventes.';
  }
  el.subscriptionBannerBtn.classList.toggle('hidden', !isOwner());
}

// ---------- Onglet « Abonnement » ----------
export async function renderSubscriptionPanel() {
  const sub = getSubscription();
  const info = describe(sub);
  el.subStatusBox.className = `sub-status sub-${info ? info.level : 'info'}`;
  el.subStatusBox.textContent = info ? info.text : 'Aucun abonnement requis dans ce mode.';

  el.subPriceLine.textContent = subscriptionConfig.priceLabel ? `Tarif : ${subscriptionConfig.priceLabel}.` : '';

  const link = String(subscriptionConfig.payLink || '');
  const safeLink = /^https:\/\//i.test(link);
  const onlinePayment = Boolean(subscriptionConfig.onlinePayment) && isCloudMode();
  el.subPayForm.classList.toggle('hidden', !onlinePayment);
  el.subPayMessage.textContent = '';
  if (onlinePayment && !el.subPayerNumber.value) el.subPayerNumber.value = state.currentUser?.phone || '';
  // Le lien de paiement manuel ne sert que si le paiement automatique n'est pas en place.
  el.subPayLink.classList.toggle('hidden', !safeLink || onlinePayment);
  if (safeLink) el.subPayLink.href = link;

  el.subInstructions.textContent = subscriptionConfig.instructions
    || (safeLink || onlinePayment ? '' : 'Pour payer ou renouveler, contactez l’administrateur de la plateforme.');

  el.subPaymentList.innerHTML = '<p class="security-note">Chargement…</p>';
  try {
    const payments = await cloudStore.loadPayments();
    el.subPaymentList.innerHTML = payments.length
      ? payments.map((payment) => `
        <div class="user-item">
          <div>
            <strong>${escapeHtml(formatDate(payment.created_at))} · ${payment.months} mois</strong>
            <small>${escapeHtml(payment.method || '—')}${payment.reference ? ` · ${escapeHtml(payment.reference)}` : ''} · valable jusqu’au ${escapeHtml(formatDate(payment.paid_until_after))}</small>
          </div>
        </div>`).join('')
      : '<p class="security-note">Aucun paiement enregistré.</p>';
  } catch (error) {
    el.subPaymentList.innerHTML = `<p class="security-note">${escapeHtml(error.message)}</p>`;
  }
}

// ---------- Administration de la plateforme ----------
let adminRows = [];
let adminTarget = null;

function phaseOf(row) {
  const expires = new Date(row.expires_at).getTime();
  if (expires <= Date.now()) return { label: 'Expiré', className: 'sub-error' };
  return row.paid_until && new Date(row.paid_until).getTime() > Date.now()
    ? { label: 'Payé', className: 'sub-ok' }
    : { label: 'Essai', className: 'sub-info' };
}

function renderAdminList() {
  el.adminBusinessList.innerHTML = adminRows.length
    ? adminRows.map((row) => {
      const phase = phaseOf(row);
      return `
        <div class="user-item">
          <div>
            <strong>${escapeHtml(row.business_name)} <span class="sub-chip ${phase.className}">${phase.label}</span></strong>
            <small>${escapeHtml(row.owner_name || '—')} · ${escapeHtml(row.owner_email || '—')} · ${row.sales_count} vente(s)</small>
            <small>Accès jusqu’au ${escapeHtml(formatDate(row.expires_at))}</small>
          </div>
          <button type="button" class="secondary-btn" data-business="${escapeHtml(row.business_id)}">Enregistrer un paiement</button>
        </div>`;
    }).join('')
    : '<p class="security-note">Aucun commerce.</p>';
}

export async function renderAdminPanel() {
  el.adminMessage.textContent = 'Chargement…';
  el.adminPayForm.classList.add('hidden');
  adminTarget = null;
  try {
    adminRows = await cloudStore.adminListBusinesses();
    el.adminMessage.textContent = '';
    renderAdminList();
  } catch (error) {
    el.adminMessage.textContent = error.message;
    el.adminBusinessList.innerHTML = '';
  }
}

export function initSubscription() {
  // Retour de la page de paiement : on garde un témoin de quelques minutes et on nettoie l'adresse.
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('paiement') === 'retour') {
      sessionStorage.setItem(RETURN_FLAG, String(Date.now()));
      ['paiement', 'transactionId', 'status'].forEach((name) => params.delete(name));
      const query = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    }
  } catch {
    // Adresse ou stockage inaccessible : sans importance, la page se mettra à jour d'elle-même.
  }

  el.subPayForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    el.subPayOnlineBtn.disabled = true;
    el.subPayMessage.textContent = 'Ouverture de la page de paiement…';
    try {
      const redirectUrl = await cloudStore.startOnlinePayment({ payerNumber: el.subPayerNumber.value.trim() });
      window.location.assign(redirectUrl);
    } catch (error) {
      el.subPayMessage.textContent = error.message;
      el.subPayOnlineBtn.disabled = false;
    }
  });

  el.subscriptionBannerBtn.addEventListener('click', () => {
    el.settingsNav?.click();
    document.querySelector('#settingsTabs [data-tab="abonnement"]')?.click();
  });

  el.adminBusinessList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-business]');
    if (!button) return;
    adminTarget = adminRows.find((row) => row.business_id === button.dataset.business) || null;
    if (!adminTarget) return;
    el.adminPayTarget.textContent = adminTarget.business_name;
    el.adminPayForm.classList.remove('hidden');
    el.adminPayMonths.focus();
  });

  el.adminPayCancelBtn.addEventListener('click', () => {
    adminTarget = null;
    el.adminPayForm.classList.add('hidden');
  });

  el.adminPayForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!adminTarget) return;
    const months = Number(el.adminPayMonths.value);
    if (!Number.isInteger(months) || months < 1 || months > 36) {
      el.adminMessage.textContent = 'La durée doit être comprise entre 1 et 36 mois.';
      return;
    }
    const submitBtn = el.adminPayForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      const until = await cloudStore.adminExtendSubscription({
        businessId: adminTarget.business_id,
        months,
        amount: Number(el.adminPayAmount.value) || 0,
        currency: state.businessConfig.currency || 'GNF',
        method: el.adminPayMethod.value,
        reference: el.adminPayReference.value.trim()
      });
      const name = adminTarget.business_name;
      el.adminPayReference.value = '';
      await renderAdminPanel();
      el.adminMessage.textContent = `Abonnement de « ${name} » activé jusqu’au ${formatDate(until)}.`;
    } catch (error) {
      el.adminMessage.textContent = error.message;
    } finally {
      submitBtn.disabled = false;
    }
  });

  // L'état change avec le temps (fin d'essai) même sans action : on met le bandeau à jour régulièrement.
  setInterval(renderSubscriptionBanner, 60 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') renderSubscriptionBanner();
  });
}

export const subscriptionAvailable = () => isCloudMode();
