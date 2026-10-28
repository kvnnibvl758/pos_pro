// Écran d'attente : un rond qui tourne + un message, pour que la personne sache que l'application travaille.
let overlay = null;
let messageNode = null;
let depth = 0;

function ensureOverlay() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.className = 'loading-overlay hidden';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.innerHTML = '<div class="loading-box"><div class="loading-spinner" aria-hidden="true"></div><p class="loading-message"></p></div>';
  messageNode = overlay.querySelector('.loading-message');
  document.body.appendChild(overlay);
}

export function showLoading(message = 'Chargement…') {
  ensureOverlay();
  depth += 1;
  messageNode.textContent = message;
  overlay.classList.remove('hidden');
}

export function hideLoading() {
  if (!overlay) return;
  depth = Math.max(0, depth - 1);
  if (depth === 0) overlay.classList.add('hidden');
}

export async function withLoading(message, task) {
  showLoading(message);
  try {
    return await task();
  } finally {
    hideLoading();
  }
}
