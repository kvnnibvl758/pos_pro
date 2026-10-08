// ===== GESTION DES CAISSIERS ET MOT DE PASSE LOCAL =====
// Rendu à l'intérieur des onglets "Caissiers" et "Mon compte" de la fenêtre Paramètres.
import { state } from './state.js';
import { el } from './elements.js';
import { canManageUsers, getUserRoleLabel, isStrongCashierPassword, normalizeUsername } from './permissions.js';
import { escapeHtml } from './utils.js';
import { saveUsers } from './storage.js';
import { createPasswordRecord, verifyPassword } from './crypto.js';
import { isCloudMode } from './supabaseClient.js';
import * as cloudStore from './cloudStore.js';

function renderMembersList() {
  el.userList.innerHTML = state.members.map((member) => {
    const isCurrentUser = state.currentUser && member.userId === state.currentUser.id;
    const roleLabel = getUserRoleLabel(member.role === 'owner' ? 'admin' : 'cashier');
    const canAct = canManageUsers() && !isCurrentUser && member.role !== 'owner';

    return `
      <div class="user-item">
        <div>
          <strong>${escapeHtml(member.displayName || 'Sans nom')}</strong>
          <small>${escapeHtml(roleLabel)}${member.active ? '' : ' · désactivé'}</small>
        </div>
        <div class="customer-actions">
          ${canAct
            ? `<button class="secondary-btn" data-toggle-user="${escapeHtml(member.userId)}" data-active="${member.active}">${member.active ? 'Désactiver' : 'Réactiver'}</button>
               <button class="danger-btn" data-delete-user="${escapeHtml(member.userId)}">Supprimer</button>`
            : `<span class="role-badge">${isCurrentUser ? 'Vous' : escapeHtml(roleLabel)}</span>`}
        </div>
      </div>
    `;
  }).join('');

  el.userList.querySelectorAll('[data-toggle-user]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await cloudStore.setMemberActive(button.dataset.toggleUser, button.dataset.active !== 'true');
      } catch (error) {
        alert(error.message);
      }
      renderUserManagementList();
    });
  });

  el.userList.querySelectorAll('[data-delete-user]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('Supprimer définitivement ce compte caissier ?')) return;
      try {
        await cloudStore.removeCashier(button.dataset.deleteUser);
      } catch (error) {
        alert(error.message);
      }
      renderUserManagementList();
    });
  });
}

export function renderUserManagementList() {
  if (!el.userList) return;
  if (isCloudMode()) {
    renderMembersList();
    return;
  }

  el.userList.innerHTML = state.userAccounts.map((user) => {
    const isCurrentUser = state.currentUser && state.currentUser.id === user.id;
    const canDelete = canManageUsers() && !isCurrentUser && user.role !== 'admin';

    return `
      <div class="user-item">
        <div>
          <strong>${escapeHtml(user.username)}</strong>
          <small>${escapeHtml(getUserRoleLabel(user.role))}</small>
        </div>
        <div class="customer-actions">
          ${canDelete
            ? `<button class="danger-btn" data-user-id="${user.id}">Supprimer</button>`
            : `<span class="role-badge">${isCurrentUser ? 'Vous' : escapeHtml(getUserRoleLabel(user.role))}</span>`}
        </div>
      </div>
    `;
  }).join('');

  el.userList.querySelectorAll('.danger-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = Number(button.dataset.userId);

      if (!canManageUsers()) {
        alert('Seul l’administrateur peut supprimer un compte.');
        return;
      }

      const targetUser = state.userAccounts.find((user) => user.id === targetId);
      if (!targetUser) return;

      if (targetUser.username === state.currentUser.username) {
        alert('Vous ne pouvez pas supprimer votre propre compte.');
        return;
      }

      state.userAccounts = state.userAccounts.filter((user) => user.id !== targetId);
      saveUsers();
      renderUserManagementList();
    });
  });
}

export function initUsers() {
  el.userForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!canManageUsers()) {
      alert('Seul l’administrateur peut ajouter un compte.');
      return;
    }

    if (isCloudMode()) {
      const displayName = document.getElementById('newUserName').value.trim();
      const email = el.newUserEmail.value.trim();
      const cloudPassword = document.getElementById('newUserPassword').value.trim();

      if (!displayName || !email || !isStrongCashierPassword(cloudPassword)) {
        alert('Nom, email et mot de passe fort requis : 8 caractères minimum, une majuscule, une minuscule et un chiffre.');
        return;
      }

      try {
        await cloudStore.createCashier({ email, password: cloudPassword, displayName });
      } catch (error) {
        alert(error.message);
        return;
      }
      renderUserManagementList();
      el.userForm.reset();
      alert('Caissier créé. Il peut se connecter avec cet email et ce mot de passe.');
      return;
    }

    const username = normalizeUsername(document.getElementById('newUserName').value);
    const password = document.getElementById('newUserPassword').value.trim();

    if (!username || !isStrongCashierPassword(password)) {
      alert('Le nom d’utilisateur et un mot de passe fort sont requis : 8 caractères minimum, une majuscule, une minuscule et un chiffre.');
      return;
    }

    if (state.userAccounts.some((user) => normalizeUsername(user.username) === username)) {
      alert('Ce nom d’utilisateur existe déjà.');
      return;
    }

    const { salt, hash } = await createPasswordRecord(password);
    state.userAccounts.push({ id: Date.now(), username, salt, passwordHash: hash, role: 'cashier', isPrimary: false });
    saveUsers();
    renderUserManagementList();
    el.userForm.reset();
  });

  el.passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!state.currentUser || state.currentUser.cloud) return;

    const currentPasswordValid = await verifyPassword(
      el.currentPasswordInput.value,
      state.currentUser.salt,
      state.currentUser.passwordHash
    );

    if (!currentPasswordValid) {
      alert('Le code actuel est incorrect.');
      return;
    }

    const newUsername = normalizeUsername(el.accountUsernameInput.value);
    if (!newUsername) {
      alert('L’identifiant est obligatoire.');
      return;
    }

    const usernameTaken = state.userAccounts.some((user) => user.id !== state.currentUser.id && normalizeUsername(user.username) === newUsername);
    if (usernameTaken) {
      alert('Cet identifiant est déjà utilisé.');
      return;
    }

    const newPassword = el.newPasswordInput.value.trim();
    if (newPassword && !isStrongCashierPassword(newPassword)) {
      alert('Le nouveau code doit contenir 8 caractères, une majuscule, une minuscule et un chiffre.');
      return;
    }

    if (newPassword && newPassword !== el.confirmPasswordInput.value.trim()) {
      alert('La confirmation du nouveau code ne correspond pas.');
      return;
    }

    state.currentUser.username = newUsername;
    if (newPassword) {
      const { salt, hash } = await createPasswordRecord(newPassword);
      state.currentUser.salt = salt;
      state.currentUser.passwordHash = hash;
    }

    const account = state.userAccounts.find((user) => user.id === state.currentUser.id);
    if (account) {
      account.username = newUsername;
      if (newPassword) {
        account.salt = state.currentUser.salt;
        account.passwordHash = state.currentUser.passwordHash;
      }
    }

    saveUsers();
    el.sessionUser.textContent = state.currentUser.username;
    renderUserManagementList();
    el.currentPasswordInput.value = '';
    el.newPasswordInput.value = '';
    el.confirmPasswordInput.value = '';
    alert('Les paramètres de votre compte ont été modifiés.');
  });
}
