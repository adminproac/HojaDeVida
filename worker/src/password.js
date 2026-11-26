/** PBKDF2-SHA256. 100000 iteraciones. El resultado es base64, nunca la contraseña. */

export const PBKDF2_ITERATIONS = 100_000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

export function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function hashPassword(password, saltB64) {
  const salt = saltB64 ? base64ToBytes(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const saltCopy = new Uint8Array(salt.byteLength);
  saltCopy.set(salt);
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const algorithm = { name: 'PBKDF2', hash: 'SHA-256', salt: saltCopy, iterations: PBKDF2_ITERATIONS };
  let bits;
  try {
    bits = await crypto.subtle.deriveBits(algorithm, material, 256);
  } catch {
    bits = await crypto.subtle.deriveBits({ ...algorithm, length: 256 }, material, null);
  }
  return { passwordHash: bytesToBase64(new Uint8Array(bits).slice(0, 32)), salt: bytesToBase64(saltCopy), iterations: PBKDF2_ITERATIONS };
}

export async function verifyPassword(password, passwordHash, salt) {
  if (!passwordHash || !salt) return false;
  const next = await hashPassword(password, salt);
  if (next.passwordHash.length !== passwordHash.length) return false;
  let diff = 0;
  for (let i = 0; i < next.passwordHash.length; i++) diff |= next.passwordHash.charCodeAt(i) ^ passwordHash.charCodeAt(i);
  return diff === 0;
}

export function failureUpdate(failedAttempts, now) {
  const failed = Number(failedAttempts || 0) + 1;
  if (failed >= MAX_FAILURES) {
    return { failed_attempts: MAX_FAILURES, locked_until: new Date(now + LOCK_MS).toISOString() };
  }
  return { failed_attempts: failed, locked_until: null };
}

export function isLocked(lockedUntil, now) {
  if (!lockedUntil) return false;
  const at = Date.parse(lockedUntil);
  return Number.isFinite(at) && at > now;
}
