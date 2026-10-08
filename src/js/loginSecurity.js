// ===== LIMITATION DES TENTATIVES DE CONNEXION (mode local) =====
const ATTEMPTS_KEY = 'pos-login-attempts';
const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 60 * 1000;

function readAttempts() {
  try {
    return JSON.parse(localStorage.getItem(ATTEMPTS_KEY)) || {};
  } catch {
    return {};
  }
}

function writeAttempts(attempts) {
  localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
}

// Retourne le nombre de millisecondes restantes si le compte est verrouillé, sinon 0.
export function getLockRemainingMs(username) {
  const entry = readAttempts()[username];
  if (!entry || !entry.lockUntil) return 0;
  const remaining = entry.lockUntil - Date.now();
  return remaining > 0 ? remaining : 0;
}

export function registerFailedAttempt(username) {
  const attempts = readAttempts();
  const entry = attempts[username] || { count: 0 };
  entry.count += 1;

  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockUntil = Date.now() + LOCK_DURATION_MS;
    entry.count = 0;
  }

  attempts[username] = entry;
  writeAttempts(attempts);
}

export function clearFailedAttempts(username) {
  const attempts = readAttempts();
  delete attempts[username];
  writeAttempts(attempts);
}
