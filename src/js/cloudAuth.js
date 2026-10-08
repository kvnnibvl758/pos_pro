// ===== AUTHENTIFICATION CLOUD (SUPABASE) =====
// Chaque personne (propriétaire ou caissier) se connecte avec son propre compte.
// Son rôle vient de la table business_members, pas du navigateur.
import { state } from './state.js';
import { el } from './elements.js';
import { cloudConfig, cloudClient } from './supabaseClient.js';
import * as cloudStore from './cloudStore.js';
import * as offline from './offlineStore.js';
import { showAuthGate, hideAuthGate, updateSessionUI, refreshAll } from './ui.js';
import { renderBusinessIdentity, updateInventoryUI } from './settings.js';

let applyingSession = false;

export function setCloudAuthMessage(message, isError = false) {
  if (!el.cloudAuthMessage) return;
  el.cloudAuthMessage.textContent = message;
  el.cloudAuthMessage.style.color = isError ? 'var(--danger)' : 'var(--muted)';
}

function friendlyAuthMessage(message) {
  if (/invalid login credentials/i.test(message)) return 'Email ou mot de passe incorrect.';
  if (/email not confirmed/i.test(message)) return 'Confirmez votre email (lien reçu par message) avant de vous connecter.';
  if (/user already registered/i.test(message)) return 'Un compte existe déjà avec cet email.';
  if (/password should be at least/i.test(message)) return 'Le mot de passe est trop court (6 caractères minimum).';
  if (/rate limit/i.test(message)) return 'Trop de tentatives. Patientez quelques minutes.';
  return message;
}

export function showCloudAuth() {
  if (!el.cloudAuthModal) return;
  el.authGate.classList.add('hidden');
  state.cloud.profileMode = false;
  state.cloud.signupMode = false;
  el.cloudAuthTitle.textContent = 'Connexion';
  el.cloudAuthEmail.readOnly = false;
  el.cloudAuthSubmitBtn.textContent = 'Se connecter';
  el.cloudAuthBackBtn.style.display = 'none';
  el.cloudSignupBtn.style.display = '';
  el.googleAuthBtn.style.display = '';
  el.appleAuthBtn.style.display = '';
  el.cloudSignupFields.classList.remove('visible');
  el.cloudAuthModal.classList.remove('hidden');
  el.loginModal.classList.add('hidden');
  setCloudAuthMessage(cloudConfig.enabled && !cloudClient
    ? 'Impossible de charger Supabase. Vérifiez votre connexion internet puis rechargez la page.'
    : '', Boolean(cloudConfig.enabled && !cloudClient));
}

export function hideCloudAuth() {
  if (el.cloudAuthModal) el.cloudAuthModal.classList.add('hidden');
}

export function openProfileModal() {
  if (!el.cloudAuthModal || !state.currentUser?.cloud) return;

  state.cloud.profileMode = true;
  el.cloudAuthTitle.textContent = 'Mon profil';
  el.cloudAuthEmail.value = state.currentUser.email || '';
  el.cloudAuthEmail.readOnly = true;
  el.cloudAuthPassword.value = '';
  el.cloudAuthName.value = state.currentUser.fullName || '';
  el.cloudAuthPhone.value = state.currentUser.phone || '';
  el.cloudSignupFields.classList.add('visible');
  el.cloudAuthSubmitBtn.textContent = 'Enregistrer';
  el.cloudSignupBtn.style.display = 'none';
  el.googleAuthBtn.style.display = 'none';
  el.appleAuthBtn.style.display = 'none';
  el.cloudAuthBackBtn.style.display = 'inline-flex';
  setCloudAuthMessage('Laissez le mot de passe vide pour le conserver.');
  el.cloudAuthModal.classList.remove('hidden');
}

// Appelé à chaque changement du temps réel : réaffiche l'interface avec les nouvelles données.
function onRealtimeChange() {
  renderBusinessIdentity();
  updateInventoryUI();
  refreshAll();
  cloudStore.saveSnapshot();
}

// Affiche l'application une fois la session (en ligne ou hors connexion) prête.
function enterApp() {
  hideCloudAuth();
  el.businessSetupModal.classList.add('hidden');
  hideAuthGate();
  renderBusinessIdentity();
  updateInventoryUI();
  updateSessionUI();
  refreshAll();
  window.dispatchEvent(new CustomEvent('pos:session'));
}

// Ouvre la session depuis la copie locale (appareil sans réseau) : le rôle et le catalogue
// viennent de la dernière connexion réussie. Rien n'est envoyé tant que le réseau est absent.
async function startOfflineSession(snapshot) {
  state.cloud.userId = snapshot.userId;
  state.cloud.businessId = snapshot.businessId;
  state.cloud.role = snapshot.role;
  state.cloud.offline = true;
  state.cloud.offlineSession = true;
  state.cloud.sessionActive = true;
  cloudStore.restoreFromSnapshot(snapshot);
  state.currentUser = { ...snapshot.user };
  enterApp();
}

// Appelée par la synchronisation quand le réseau revient : vérifie que la session est valide et,
// si la session avait été ouverte hors connexion, recharge les données du serveur.
// Renvoie false si la personne doit se reconnecter.
export async function goOnline() {
  if (!cloudClient || !state.currentUser?.cloud) return false;
  const { data } = await cloudClient.auth.getSession();
  if (!data.session || data.session.user.id !== state.cloud.userId) return false;

  if (state.cloud.offlineSession) {
    const memberships = await cloudStore.fetchMemberships(state.cloud.userId);
    const membership = memberships.find((entry) => entry.business_id === state.cloud.businessId && entry.active);
    if (!membership) {
      await signOutCloud();
      showCloudAuth();
      setCloudAuthMessage('Ce compte a été désactivé par l’administrateur.', true);
      return false;
    }
    state.cloud.role = membership.role;
    state.currentUser.role = membership.role === 'owner' ? 'admin' : 'cashier';
    state.currentUser.isPrimary = membership.role === 'owner';
    await cloudStore.loadAll();
    cloudStore.subscribeRealtime(onRealtimeChange);
    state.cloud.offlineSession = false;
    updateSessionUI();
    onRealtimeChange();
  }
  return true;
}

// Avant une déconnexion volontaire : prévient si des ventes ne sont pas encore envoyées, ou si
// l'appareil est hors connexion (on ne pourrait pas se reconnecter avant le retour du réseau).
export function confirmCloudLogout() {
  if (!state.currentUser?.cloud) return true;
  const pending = cloudStore.pendingCount();
  if (pending) {
    return confirm(`${pending} vente(s) ne sont pas encore envoyées au serveur. Elles resteront sur cet appareil `
      + 'et seront envoyées à la prochaine connexion de ce compte. Se déconnecter quand même ?');
  }
  if (state.cloud.offline) {
    return confirm('Vous êtes hors connexion : il sera impossible de vous reconnecter avant le retour du réseau. '
      + 'Se déconnecter quand même ?');
  }
  return true;
}

function resetSessionState() {
  cloudStore.unsubscribeRealtime();
  state.currentUser = null;
  state.cloud.sessionActive = false;
  state.cloud.businessId = null;
  state.cloud.userId = null;
  state.cloud.role = null;
  state.cloud.offline = false;
  state.cloud.offlineSession = false;
  state.cloud.syncMessage = '';
  state.cart.length = 0;
  state.products.length = 0;
  state.customers.length = 0;
  state.salesHistory.length = 0;
  state.members.length = 0;
}

function showSignedOutScreen() {
  resetSessionState();
  offline.clearSnapshot();
  window.dispatchEvent(new CustomEvent('pos:queue-changed'));
  el.cloudAuthForm.reset();
  updateSessionUI();
  refreshAll();
  showAuthGate();
}

// Évènement SIGNED_OUT reçu de Supabase (ex. session expirée ou déconnexion depuis un autre onglet).
function handleSignedOut() {
  if (!state.currentUser && !state.cloud.sessionActive) return;
  showSignedOutScreen();
}

function openBusinessSetup() {
  hideCloudAuth();
  el.authGate.classList.add('hidden');
  el.businessSetupModal.classList.remove('hidden');
  el.setupBusinessName.focus();
}

export async function applyCloudSession(session) {
  if (!session?.user || applyingSession) return;
  if (state.currentUser?.cloud && state.currentUser.id === session.user.id) return;

  applyingSession = true;
  try {
    // Un évènement de connexion peut arriver en retard, après une déconnexion (ex. compte
    // désactivé) : on n'applique la session que si elle est toujours celle en cours.
    const { data: current } = await cloudClient.auth.getSession();
    if (!current.session || current.session.user.id !== session.user.id) return;

    const memberships = await cloudStore.fetchMemberships(session.user.id);

    if (!memberships.length) {
      openBusinessSetup();
      return;
    }

    const membership = memberships.find((entry) => entry.active);
    if (!membership) {
      await cloudClient.auth.signOut();
      showCloudAuth();
      setCloudAuthMessage('Ce compte a été désactivé par l’administrateur.', true);
      return;
    }

    state.cloud.userId = session.user.id;
    state.cloud.businessId = membership.business_id;
    state.cloud.role = membership.role;
    state.cloud.offline = false;
    state.cloud.offlineSession = false;
    await cloudStore.loadAll();

    const user = session.user;
    const email = user.email || '';
    const metadata = user.user_metadata || {};
    const isOwner = membership.role === 'owner';

    state.cloud.sessionActive = true;
    state.currentUser = {
      id: user.id,
      username: membership.display_name || metadata.full_name || email,
      email,
      phone: metadata.phone || '',
      fullName: metadata.full_name || membership.display_name || '',
      role: isOwner ? 'admin' : 'cashier',
      isPrimary: isOwner,
      cloud: true
    };

    cloudStore.subscribeRealtime(onRealtimeChange);
    cloudStore.saveSnapshot();
    enterApp();
  } catch (error) {
    console.error('Ouverture de session impossible:', error);
    // Réseau absent alors qu'une session valide existe : on ouvre la caisse depuis la copie locale.
    if (cloudStore.isNetworkError(error)) {
      const snapshot = await offline.loadSnapshot();
      if (snapshot && snapshot.userId === session.user.id) {
        await startOfflineSession(snapshot);
        return;
      }
    }
    resetSessionState();
    showCloudAuth();
    setCloudAuthMessage(`Connexion impossible : ${error.message}`, true);
  } finally {
    applyingSession = false;
  }
}

export async function signOutCloud() {
  if (cloudClient) {
    // Sans réseau, la fermeture « locale » suffit (le serveur ne peut pas être prévenu).
    const localOnly = state.cloud.offline || state.cloud.offlineSession || navigator.onLine === false;
    try {
      const { error } = await cloudClient.auth.signOut(localOnly ? { scope: 'local' } : undefined);
      if (error) await cloudClient.auth.signOut({ scope: 'local' });
    } catch {
      await cloudClient.auth.signOut({ scope: 'local' }).catch(() => {});
    }
  }
  showSignedOutScreen();
}

function showOAuthErrorFromUrl() {
  const params = new URLSearchParams(`${window.location.search}${window.location.hash}`);
  const errorDescription = params.get('error_description') || params.get('error');
  if (!errorDescription) return;

  showCloudAuth();
  setCloudAuthMessage(`Connexion impossible : ${errorDescription.replace(/\+/g, ' ')}`, true);
}

export async function initializeCloudAuth() {
  if (!cloudConfig.enabled) return;

  showOAuthErrorFromUrl();

  if (!cloudClient) {
    showCloudAuth();
    return;
  }

  // Le listener est TOUJOURS enregistré (même sans session au démarrage), sinon une
  // première connexion ne serait jamais détectée. Il ne faut pas attendre d'appel
  // Supabase dans le callback lui-même : on diffère avec setTimeout.
  cloudClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      handleSignedOut();
      return;
    }
    if (event === 'SIGNED_IN' && session) {
      setTimeout(() => applyCloudSession(session), 0);
    }
  });

  const { data, error } = await cloudClient.auth.getSession();
  if (!error && data.session) {
    await applyCloudSession(data.session);
    return;
  }

  // Pas de session lisible : si c'est parce que le réseau est absent (jeton à renouveler) et qu'une
  // copie locale existe, on ouvre la caisse hors connexion plutôt que de bloquer les ventes.
  const unreachable = navigator.onLine === false || cloudStore.isNetworkError(error);
  if (unreachable) {
    const snapshot = await offline.loadSnapshot();
    if (snapshot) await startOfflineSession(snapshot);
  }
}

async function signInWithCloud() {
  const { data, error } = await cloudClient.auth.signInWithPassword({
    email: el.cloudAuthEmail.value.trim(),
    password: el.cloudAuthPassword.value
  });

  if (error) {
    setCloudAuthMessage(friendlyAuthMessage(error.message), true);
    return;
  }
  await applyCloudSession(data.session);
}

async function signUpAccount() {
  const fullName = el.cloudAuthName.value.trim();
  const phone = el.cloudAuthPhone.value.trim();
  if (!fullName) {
    setCloudAuthMessage('Saisissez votre nom complet avant de créer le compte.', true);
    el.cloudAuthName.focus();
    return;
  }

  if (!phone) {
    setCloudAuthMessage('Saisissez votre numéro de téléphone avant de créer le compte.', true);
    el.cloudAuthPhone.focus();
    return;
  }

  const { data, error } = await cloudClient.auth.signUp({
    email: el.cloudAuthEmail.value.trim(),
    password: el.cloudAuthPassword.value,
    options: { data: { full_name: fullName, phone } }
  });

  if (error) {
    setCloudAuthMessage(friendlyAuthMessage(error.message), true);
    return;
  }

  if (data.session) {
    await applyCloudSession(data.session);
    return;
  }
  setCloudAuthMessage('Compte créé. Confirmez votre email, puis connectez-vous.');
}

async function signInWithProvider(provider) {
  try {
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    setCloudAuthMessage(`Redirection vers ${provider === 'apple' ? 'Apple' : 'Google'}...`);
    const { error } = await cloudClient.auth.signInWithOAuth({ provider, options: { redirectTo } });

    if (error) {
      setCloudAuthMessage(`Connexion ${provider} impossible : ${error.message}`, true);
      console.error(`Erreur OAuth ${provider}:`, error);
    }
  } catch (error) {
    setCloudAuthMessage(`Connexion ${provider} impossible. Vérifiez le fournisseur dans Supabase.`, true);
    console.error(`Erreur de connexion ${provider}:`, error);
  }
}

async function saveProfile() {
  const password = el.cloudAuthPassword.value;
  const phone = el.cloudAuthPhone.value.trim();
  if (!phone) {
    setCloudAuthMessage('Veuillez saisir un numéro de téléphone.', true);
    return;
  }
  if (password && password.length < 6) {
    setCloudAuthMessage('Le nouveau mot de passe est trop court (6 caractères minimum).', true);
    return;
  }

  const attributes = { data: { full_name: el.cloudAuthName.value.trim(), phone } };
  if (password) attributes.password = password;

  const { error } = await cloudClient.auth.updateUser(attributes);
  if (error) {
    setCloudAuthMessage(`Impossible d’enregistrer : ${friendlyAuthMessage(error.message)}`, true);
    return;
  }

  state.currentUser.phone = phone;
  state.currentUser.fullName = el.cloudAuthName.value.trim();
  hideCloudAuth();
}

export function initCloudAuth() {
  el.cloudAuthForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!cloudClient) {
      setCloudAuthMessage('Impossible de charger Supabase. Rechargez la page.', true);
      return;
    }

    el.cloudAuthSubmitBtn.disabled = true;
    try {
      if (state.cloud.profileMode) await saveProfile();
      else if (state.cloud.signupMode) await signUpAccount();
      else await signInWithCloud();
    } finally {
      el.cloudAuthSubmitBtn.disabled = false;
    }
  });

  el.cloudSignupBtn.addEventListener('click', async () => {
    if (!cloudClient) {
      setCloudAuthMessage('Impossible de charger Supabase. Rechargez la page.', true);
      return;
    }

    state.cloud.signupMode = true;
    el.cloudAuthTitle.textContent = 'Créer un compte';
    el.cloudSignupFields.classList.add('visible');
    el.cloudAuthSubmitBtn.textContent = 'Créer un compte';
    el.cloudSignupBtn.style.display = 'none';
    el.cloudAuthBackBtn.style.display = 'inline-flex';
    setCloudAuthMessage('Complétez votre nom et votre numéro de téléphone.');
  });

  el.googleAuthBtn.addEventListener('click', () => {
    if (cloudClient) signInWithProvider('google');
    else setCloudAuthMessage('Impossible de charger Supabase. Rechargez la page.', true);
  });

  el.appleAuthBtn.addEventListener('click', () => {
    if (cloudClient) signInWithProvider('apple');
    else setCloudAuthMessage('Impossible de charger Supabase. Rechargez la page.', true);
  });

  el.cloudAuthBackBtn.addEventListener('click', () => {
    if (state.cloud.profileMode) {
      hideCloudAuth();
      return;
    }
    showCloudAuth();
    el.cloudAuthEmail.value = '';
    el.cloudAuthPassword.value = '';
    el.cloudAuthName.value = '';
    el.cloudAuthPhone.value = '';
  });

  el.businessSetupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await cloudStore.createBusiness({
        name: el.setupBusinessName.value,
        typeLabel: el.setupBusinessType.value,
        displayName: el.setupOwnerName.value
      });
      const { data } = await cloudClient.auth.getSession();
      el.businessSetupModal.classList.add('hidden');
      await applyCloudSession(data.session);
    } catch (error) {
      alert(error.message);
    }
  });

  el.setupCancelBtn.addEventListener('click', async () => {
    el.businessSetupModal.classList.add('hidden');
    await signOutCloud();
  });
}
