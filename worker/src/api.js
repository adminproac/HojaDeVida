import { corsFor } from './exchange.js';
import { insertPerson, readDocument, removePerson, replacePerson } from './db.js';

const cache = new Map();

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function githubPush(token, env, fetchImpl = fetch) {
  const key = await sha256(token);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.ok;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'hojadevida-oauth',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const repoRes = await fetchImpl('https://api.github.com/repos/adminproac/HojaDeVida', { headers });
  const repo = await repoRes.json().catch(() => ({}));
  if (!repoRes.ok || repo?.permissions?.push !== true) return false;
  const allow = String(env?.GITHUB_ALLOWED_LOGINS || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (allow.length) {
    const userRes = await fetchImpl('https://api.github.com/user', { headers });
    const user = await userRes.json().catch(() => ({}));
    if (!allow.includes(String(user.login || '').toLowerCase())) return false;
  }
  cache.set(key, { ok: true, expires: Date.now() + 60_000 });
  return true;
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(cors || {}) },
  });
}

export async function handleDataRequest(request, env, fetchImpl) {
  const origin = request.headers.get('Origin') || '';
  const cors = corsFor(origin);
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') {
    if (!cors) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: cors });
  }
  if (origin && !cors) return json({ message: 'Origen no permitido' }, 403, null);

  const writing = request.method !== 'GET' && request.method !== 'HEAD';
  if (writing) {
    const header = request.headers.get('Authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return json({ message: '401 — Sesión requerida' }, 401, cors);
    const allowed = await githubPush(token, env, fetchImpl);
    if (!allowed) return json({ message: '403 — No tienes permiso para editar' }, 403, cors);
  }
  if (!env?.DB) return json({ message: 'Falta la base de datos D1' }, 503, cors);

  try {
    const parts = url.pathname.split('/').filter(Boolean);
    if (request.method === 'GET' && (url.pathname === '/api/data' || url.pathname === '/api/export')) {
      return json(await readDocument(env.DB), 200, cors);
    }
    if (request.method === 'GET' && url.pathname === '/api/people') {
      const doc = await readDocument(env.DB);
      return json(doc.people, 200, cors);
    }
    if (parts[0] === 'api' && parts[1] === 'people' && parts.length === 3) {
      const personId = decodeURIComponent(parts[2]);
      if (request.method === 'GET') {
        const doc = await readDocument(env.DB);
        const person = doc.people.find((item) => item.id === personId);
        if (!person) return json({ message: 'No se encontró la persona' }, 404, cors);
        return json(person, 200, cors);
      }
      if (request.method === 'PUT') {
        const body = await request.json();
        const saved = await replacePerson(env.DB, personId, body);
        return json(saved, 200, cors);
      }
      if (request.method === 'DELETE') {
        await removePerson(env.DB, personId);
        return new Response(null, { status: 204, headers: cors || {} });
      }
    }
    if (request.method === 'POST' && url.pathname === '/api/people') {
      const body = await request.json();
      const saved = await insertPerson(env.DB, body);
      return json(saved, 201, cors);
    }
    return json({ message: 'Not found' }, 404, cors);
  } catch (err) {
    const status = Number(err?.status) || 500;
    const message = status >= 500 ? 'No se pudo guardar' : (err?.message || 'No se pudo guardar');
    return json({ message }, status, cors);
  }
}
