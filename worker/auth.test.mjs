import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { handleDataRequest } from './src/api.js';
import { login, sessionUser } from './src/auth.js';
import { pbkdf2, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { PBKDF2_ITERATIONS, hashPassword } from './src/password.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function wrap(db) {
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      const api = {
        params: [],
        bind(...params) { api.params = params; return api; },
        async first() { return stmt.get(...api.params) ?? null; },
        async all() { return { results: stmt.all(...api.params) }; },
        async run() {
          const info = stmt.run(...api.params);
          return { meta: { changes: info.changes ?? 0 } };
        },
      };
      return api;
    },
  };
}

function fresh() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(path.join(root, 'worker/migrations/0002_auth.sql'), 'utf8'));
  return wrap(db);
}

test('hashes a password with PBKDF2 and does not keep the plaintext', async () => {
  const hashed = await hashPassword('clave-larga');
  assert.equal(hashed.iterations, PBKDF2_ITERATIONS);
  assert.equal(hashed.passwordHash.includes('clave-larga'), false);
  const again = await hashPassword('clave-larga', hashed.salt);
  assert.equal(again.passwordHash, hashed.passwordHash);
  const salt = randomBytes(16);
  const nodeHash = (await promisify(pbkdf2)('clave-larga', salt, PBKDF2_ITERATIONS, 32, 'sha256')).toString('base64');
  const web = await hashPassword('clave-larga', salt.toString('base64'));
  assert.equal(web.passwordHash, nodeHash);
});

test('login creates a session, slides it, and locks after 5 failures', async () => {
  const db = fresh();
  const hashed = await hashPassword('clave-larga');
  await db.prepare(
    `INSERT INTO app_user (id, username, password_hash, salt, display_name, role, active, created_at, failed_attempts)
     VALUES ('user-1', 'edgar', ?, ?, 'Edgar', 'admin', 1, '2026-01-01T00:00:00.000Z', 0)`,
  ).bind(hashed.passwordHash, hashed.salt).run();

  const started = Date.parse('2026-11-26T00:00:00.000Z');
  const result = await login(db, 'edgar', 'clave-larga', started);
  assert.equal(result.user.username, 'edgar');
  assert.equal(result.token.includes('clave-larga'), false);
  const row = await db.prepare('SELECT password_hash FROM app_user WHERE id = ?').bind('user-1').first();
  assert.equal(String(row.password_hash).includes('clave-larga'), false);

  const alive = await sessionUser(db, result.token, started + 60_000);
  assert.equal(alive?.displayName, 'Edgar');
  const expired = await sessionUser(db, result.token, started + 60_000 + 5 * 60 * 1000 + 1);
  assert.equal(expired, null);

  for (let i = 0; i < 4; i++) {
    await assert.rejects(() => login(db, 'edgar', 'mala', started), /incorrectos/);
  }
  await assert.rejects(() => login(db, 'edgar', 'mala', started), /15 minutos/);
  await assert.rejects(() => login(db, 'edgar', 'clave-larga', started + 1000), /15 minutos/);
});

test('the worker rejects a resume write without a session', async () => {
  const denied = await handleDataRequest(new Request('https://hojadevida-oauth.example.workers.dev/api/people', {
    method: 'POST',
    headers: { Origin: 'https://adminproac.github.io', 'Content-Type': 'application/json' },
    body: '{}',
  }), { DB: fresh() });
  assert.equal(denied.status, 401);
  const text = await denied.text();
  assert.equal(text.includes('password'), false);
});
