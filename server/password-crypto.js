'use strict';
/**
 * Same PBKDF2-SHA256 and AES-GCM steps as src/app/core/password-crypto.ts.
 * Node 22 exposes Web Crypto on globalThis.crypto.
 */
const crypto = globalThis.crypto;
const ITERATIONS = 210000;

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2Bits(password, salt, iterations) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, material, 256);
  return new Uint8Array(bits);
}

async function aesKey(password, salt, iterations) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function hashPassword(password, saltB64) {
  const salt = saltB64 ? base64ToBytes(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2Bits(password, salt, ITERATIONS);
  return { passwordHash: bytesToBase64(bits), salt: bytesToBase64(salt), iterations: ITERATIONS };
}

async function verifyPassword(password, record) {
  if (!record?.salt || !record.passwordHash || record.iterations < ITERATIONS) return false;
  const bits = await pbkdf2Bits(password, base64ToBytes(record.salt), record.iterations);
  return safeEqual(bytesToBase64(bits), record.passwordHash);
}

async function encryptToken(password, token) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await aesKey(password, salt, ITERATIONS);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token));
  return { salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(cipher)) };
}

async function decryptToken(password, payload) {
  const key = await aesKey(password, base64ToBytes(payload.salt), ITERATIONS);
  const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(payload.iv) }, key, base64ToBytes(payload.ciphertext));
  return new TextDecoder().decode(clear);
}

module.exports = { ITERATIONS, hashPassword, verifyPassword, encryptToken, decryptToken };
