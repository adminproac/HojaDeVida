/** PBKDF2-SHA256 and AES-GCM. The same steps run in the browser and in Node. */

export const PBKDF2_ITERATIONS = 210_000;
const HASH_BITS = 256;

export interface PasswordRecord {
  passwordHash: string;
  salt: string;
  iterations: number;
}

export interface EncryptedToken {
  salt: string;
  iv: string;
  ciphertext: string;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function bufferOf(bytes: Uint8Array): BufferSource {
  return Uint8Array.from(bytes);
}

async function pbkdf2Bits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: bufferOf(salt), iterations, hash: 'SHA-256' }, material, HASH_BITS);
  return new Uint8Array(bits);
}

async function aesKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: bufferOf(salt), iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function hashPassword(password: string, saltB64?: string): Promise<PasswordRecord> {
  const salt = saltB64 ? base64ToBytes(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2Bits(password, salt, PBKDF2_ITERATIONS);
  return { passwordHash: bytesToBase64(bits), salt: bytesToBase64(salt), iterations: PBKDF2_ITERATIONS };
}

export async function verifyPassword(password: string, record: PasswordRecord): Promise<boolean> {
  if (!record?.salt || !record.passwordHash || record.iterations < PBKDF2_ITERATIONS) return false;
  const bits = await pbkdf2Bits(password, base64ToBytes(record.salt), record.iterations);
  return safeEqual(bytesToBase64(bits), record.passwordHash);
}

export async function encryptToken(password: string, token: string): Promise<EncryptedToken> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await aesKey(password, salt, PBKDF2_ITERATIONS);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bufferOf(iv) }, key, new TextEncoder().encode(token));
  return { salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(cipher)) };
}

export async function decryptToken(password: string, payload: EncryptedToken): Promise<string> {
  const key = await aesKey(password, base64ToBytes(payload.salt), PBKDF2_ITERATIONS);
  const clear = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bufferOf(base64ToBytes(payload.iv)) },
    key,
    bufferOf(base64ToBytes(payload.ciphertext)),
  );
  return new TextDecoder().decode(clear);
}
