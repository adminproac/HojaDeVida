'use strict';

const crypto = require('node:crypto');

const cache = new Map();
const REPO = 'https://api.github.com/repos/adminproac/HojaDeVida';

function allowlist() {
  return String(process.env.GITHUB_ALLOWED_LOGINS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Comprueba permissions.push con el token de GitHub. No guarda ni registra el token.
 * Devuelve { ok, login }.
 */
async function githubIdentity(token) {
  if (!token) return { ok: false, login: '' };
  const key = crypto.createHash('sha256').update(token).digest('hex');
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return { ok: true, login: hit.login };
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'hojadevida-local',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const repoRes = await fetch(REPO, { headers });
  const repo = await repoRes.json().catch(() => ({}));
  if (!repoRes.ok || repo?.permissions?.push !== true) return { ok: false, login: '' };
  const userRes = await fetch('https://api.github.com/user', { headers });
  const user = await userRes.json().catch(() => ({}));
  const login = String(user.login || '');
  const allow = allowlist();
  if (!login || (allow.length && !allow.includes(login.toLowerCase()))) return { ok: false, login };
  cache.set(key, { login, expires: Date.now() + 60_000 });
  return { ok: true, login };
}

module.exports = { githubIdentity };
