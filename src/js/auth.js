// ===== CONNEXION LOCALE (CAISSE) =====
import { state } from './state.js';
import { el } from './elements.js';
import { normalizeUsername } from './permissions.js';
import { verifyPassword } from './crypto.js';
import { getLockRemainingMs, registerFailedAttempt, clearFailedAttempts } from './loginSecurity.js';
import { isCloudMode } from './supabaseClient.js';
import { showAuthGate, hideAuthGate, updateSessionUI, clearPostSessionData, closeAllOverlays } from './ui.js';
import { showCloudAuth, signOutCloud } from './cloudAuth.js';

// Déconnexion complète. En mode cloud, la session Supabase est fermée (chaque personne
// se connecte avec son propre compte) ; en mode local, on revient à l'écran d'accès.
export async function performLogout() {
  closeAllOverlays();
  if (isCloudMode()) {
    await signOutCloud();
    return;
  }
  clearPostSessionData();
  el.cloudAuthModal.classList.add('hidden');
  showAuthGate();
}

export function initAuth() {
  el.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = normalizeUsername(el.loginUser.value);
    const password = el.loginPassword.value.trim();

    const lockRemainingMs = getLockRemainingMs(username);
    if (lockRemainingMs > 0) {
      alert(`Trop de tentatives échouées. Réessayez dans ${Math.ceil(lockRemainingMs / 1000)} secondes.`);
      return;
    }

    const account = state.userAccounts.find((user) => normalizeUsername(user.username) === username);
    const passwordValid = account && await verifyPassword(password, account.salt, account.passwordHash);

    if (!passwordValid) {
      registerFailedAttempt(username);
      alert('Identifiants invalides.');
      return;
    }

    clearFailedAttempts(username);
    state.currentUser = account;
    hideAuthGate();
    updateSessionUI();
    el.loginModal.classList.add('hidden');
  });

  el.logoutBtn.addEventListener('click', performLogout);

  el.loginAgainBtn.addEventListener('click', () => {
    if (state.currentUser) return;

    if (isCloudMode()) {
      showCloudAuth();
      return;
    }

    el.loginModal.classList.remove('hidden');
  });

  el.authGateLoginBtn.addEventListener('click', () => {
    if (isCloudMode()) {
      showCloudAuth();
      return;
    }

    el.authGate.classList.add('hidden');
    el.loginModal.classList.remove('hidden');
  });

  el.authGateSignupBtn.addEventListener('click', () => {
    if (!isCloudMode()) {
      el.authGateLoginBtn.click();
      return;
    }

    showCloudAuth();
    el.cloudSignupBtn.click();
  });
}
