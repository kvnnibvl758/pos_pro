// ===== HACHAGE DES MOTS DE PASSE (Web Crypto API) =====
// PBKDF2 + sel aléatoire par compte. Fonctionne uniquement en contexte
// sécurisé (localhost ou HTTPS) — ce que l'app requiert déjà pour les modules ES.
const ITERATIONS = 150000;

function bytesToHex(bytes) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const bytes = hex.match(/.{1,2}/g) || [];
  return Uint8Array.from(bytes.map((byte) => parseInt(byte, 16)));
}

export function generateSalt() {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashPassword(password, saltHex) {
  const encoder = new TextEncoder();
  const salt = hexToBytes(saltHex);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );

  return bytesToHex(new Uint8Array(derivedBits));
}

export async function createPasswordRecord(password) {
  const salt = generateSalt();
  const hash = await hashPassword(password, salt);
  return { salt, hash };
}

export async function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return false;
  const computed = await hashPassword(password, salt);
  return computed === hash;
}
