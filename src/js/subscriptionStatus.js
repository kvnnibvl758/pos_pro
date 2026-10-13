// ===== ÉTAT DE L'ABONNEMENT (logique pure, sans interface) =====
// Le serveur est le vrai gardien (voir la migration 20261012000001) ; ces fonctions servent à
// prévenir l'utilisateur et à éviter des appels voués au refus. En mode local ou si la base n'a pas
// encore été mise à jour (dates absentes), il n'y a aucun abonnement : rien n'est bloqué.
import { state } from './state.js';
import { isCloudMode } from './supabaseClient.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const RENEWAL_WARNING_DAYS = 30;

export const subscriptionConfig = {
  priceLabel: '',
  payLink: '',
  instructions: '',
  contact: '',
  ...(window.POS_SUBSCRIPTION_CONFIG || {})
};

// Retourne { phase: 'none' | 'trial' | 'active' | 'expired', expiresAt, daysLeft }.
export function getSubscription(now = Date.now()) {
  const { trialEndsAt, paidUntil } = state.businessConfig;
  if (!isCloudMode() || !trialEndsAt) return { phase: 'none', expiresAt: null, daysLeft: null };

  const trialEnd = new Date(trialEndsAt).getTime();
  const paidEnd = paidUntil ? new Date(paidUntil).getTime() : 0;
  const expiresAt = Math.max(trialEnd, paidEnd);
  const daysLeft = Math.ceil((expiresAt - now) / DAY_MS);

  if (expiresAt <= now) return { phase: 'expired', expiresAt, daysLeft: 0 };
  return { phase: paidEnd > now ? 'active' : 'trial', expiresAt, daysLeft };
}

export const isSubscriptionBlocked = () => getSubscription().phase === 'expired';

export const SUBSCRIPTION_EXPIRED_MESSAGE =
  'Votre abonnement est expiré. Le propriétaire doit le renouveler (Paramètres → Abonnement) pour continuer à vendre et à modifier le catalogue.';
