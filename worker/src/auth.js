import { failureUpdate, hashPassword, isLocked, verifyPassword } from './password.js';

export const SESSION_MS = 5 * 60 * 1000;

function nowIso(now) {
  return new Date(now).toISOString();
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    active: row.active === 1 || row.active === true,
  };
}

async function findUser(db, username) {
  return db.prepare('SELECT * FROM app_user WHERE username = ? COLLATE NOCASE').bind(username).first();
}

export async function login(db, username, password, now = Date.now()) {
  const name = String(username || '').trim();
  if (!name || !password) {
    const error = new Error('Usuario o contraseña incorrectos.');
    error.status = 401;
    throw error;
  }
  const user = await findUser(db, name);
  if (!user || user.active === 0) {
    const error = new Error('Usuario o contraseña incorrectos.');
    error.status = 401;
    throw error;
  }
  if (isLocked(user.locked_until, now)) {
    const error = new Error('Demasiados intentos. Espere 15 minutos.');
    error.status = 429;
    throw error;
  }
  const ok = await verifyPassword(password, user.password_hash, user.salt);
  if (!ok) {
    const next = failureUpdate(user.failed_attempts, now);
    await db.prepare('UPDATE app_user SET failed_attempts = ?, locked_until = ? WHERE id = ?')
      .bind(next.failed_attempts, next.locked_until, user.id).run();
    const error = new Error(next.locked_until ? 'Demasiados intentos. Espere 15 minutos.' : 'Usuario o contraseña incorrectos.');
    error.status = next.locked_until ? 429 : 401;
    throw error;
  }
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const seen = nowIso(now);
  const expires = nowIso(now + SESSION_MS);
  await db.prepare('UPDATE app_user SET failed_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?').bind(seen, user.id).run();
  await db.prepare('INSERT INTO session (token_hash, user_id, expires_at, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(tokenHash, user.id, expires, seen, seen).run();
  return { token, user: publicUser(user) };
}

export async function sessionUser(db, token, now = Date.now()) {
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await db.prepare(
    `SELECT s.token_hash, s.expires_at, u.id, u.username, u.display_name, u.role, u.active
     FROM session s JOIN app_user u ON u.id = s.user_id WHERE s.token_hash = ?`,
  ).bind(tokenHash).first();
  if (!row || row.active === 0) return null;
  if (Date.parse(row.expires_at) <= now) {
    await db.prepare('DELETE FROM session WHERE token_hash = ?').bind(tokenHash).run();
    return null;
  }
  const seen = nowIso(now);
  const expires = nowIso(now + SESSION_MS);
  await db.prepare('UPDATE session SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?').bind(seen, expires, tokenHash).run();
  return publicUser(row);
}

export async function logout(db, token) {
  if (!token) return;
  const tokenHash = await sha256Hex(token);
  await db.prepare('DELETE FROM session WHERE token_hash = ?').bind(tokenHash).run();
}

export function bearerToken(request) {
  const header = request.headers.get('Authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

export async function createUser(db, input, now = Date.now()) {
  const username = String(input.username || '').trim();
  const displayName = String(input.displayName || username).trim();
  const role = input.role === 'admin' ? 'admin' : 'editor';
  const password = String(input.password || '');
  if (!/^[A-Za-z0-9._-]{3,80}$/.test(username)) {
    const error = new Error('El usuario debe tener de 3 a 80 letras, números, punto, guion o guion bajo.');
    error.status = 400;
    throw error;
  }
  if (password.length < 8) {
    const error = new Error('La contraseña debe tener al menos 8 caracteres.');
    error.status = 400;
    throw error;
  }
  const existing = await findUser(db, username);
  if (existing) {
    const error = new Error('Ese usuario ya existe.');
    error.status = 409;
    throw error;
  }
  const hashed = await hashPassword(password);
  const id = `user-${crypto.randomUUID().slice(0, 8)}`;
  const created = nowIso(now);
  await db.prepare(
    `INSERT INTO app_user (id, username, password_hash, salt, display_name, role, active, created_at, last_login_at, failed_attempts, locked_until)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, NULL, 0, NULL)`,
  ).bind(id, username, hashed.passwordHash, hashed.salt, displayName, role, created).run();
  return { id, username, displayName, role, active: true };
}

export async function setPassword(db, userId, password) {
  if (String(password || '').length < 8) {
    const error = new Error('La contraseña debe tener al menos 8 caracteres.');
    error.status = 400;
    throw error;
  }
  const hashed = await hashPassword(password);
  const result = await db.prepare('UPDATE app_user SET password_hash = ?, salt = ? WHERE id = ?')
    .bind(hashed.passwordHash, hashed.salt, userId).run();
  if (result?.meta?.changes === 0) {
    const error = new Error('No se encontró el usuario.');
    error.status = 404;
    throw error;
  }
}

export async function setActive(db, userId, active, actorId) {
  if (userId === actorId && !active) {
    const error = new Error('No puede desactivar su propio usuario.');
    error.status = 400;
    throw error;
  }
  await db.prepare('UPDATE app_user SET active = ? WHERE id = ?').bind(active ? 1 : 0, userId).run();
  if (!active) await db.prepare('DELETE FROM session WHERE user_id = ?').bind(userId).run();
}

export async function listUsers(db) {
  const result = await db.prepare(
    'SELECT id, username, display_name, role, active, created_at, last_login_at FROM app_user ORDER BY username',
  ).all();
  return (result.results || []).map(publicUser);
}
