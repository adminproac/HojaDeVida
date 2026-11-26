import { bearerToken, createUser, listUsers, login, logout, sessionUser, setActive, setPassword } from './auth.js';
import { corsFor } from './cors.js';
import { insertPerson, readDocument, removePerson, replacePerson } from './db.js';

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(cors || {}) },
  });
}

export async function handleDataRequest(request, env) {
  const origin = request.headers.get('Origin') || '';
  const cors = corsFor(origin);
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') {
    if (!cors) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: cors });
  }
  if (origin && !cors) return json({ message: 'Origen no permitido' }, 403, null);
  if (!env?.DB) return json({ message: 'Falta la base de datos D1' }, 503, cors);

  const token = bearerToken(request);
  const isLogin = request.method === 'POST' && url.pathname === '/api/auth/login';
  let user = null;
  if (!isLogin && request.method !== 'GET' && request.method !== 'HEAD') {
    user = await sessionUser(env.DB, token);
    if (!user) return json({ message: '401 — Sesión requerida' }, 401, cors);
  }
  if (request.method === 'GET' && (url.pathname === '/api/auth/me' || url.pathname === '/api/users')) {
    user = await sessionUser(env.DB, token);
    if (!user) return json({ message: '401 — Sesión requerida' }, 401, cors);
  }

  try {
    if (isLogin) {
      const body = await request.json().catch(() => ({}));
      const result = await login(env.DB, body.username, body.password);
      return json(result, 200, cors);
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
      await logout(env.DB, token);
      return new Response(null, { status: 204, headers: cors || {} });
    }
    if (request.method === 'GET' && url.pathname === '/api/auth/me') {
      return json({ user }, 200, cors);
    }
    if (url.pathname === '/api/users' || url.pathname.startsWith('/api/users/')) {
      if (user?.role !== 'admin') return json({ message: '403 — No tienes permiso para editar' }, 403, cors);
      if (request.method === 'GET' && url.pathname === '/api/users') return json(await listUsers(env.DB), 200, cors);
      if (request.method === 'POST' && url.pathname === '/api/users') {
        const body = await request.json();
        return json(await createUser(env.DB, body), 201, cors);
      }
      const parts = url.pathname.split('/').filter(Boolean);
      const userId = decodeURIComponent(parts[2] || '');
      if (request.method === 'PUT' && parts[3] === 'password') {
        const body = await request.json();
        await setPassword(env.DB, userId, body.password);
        return json({ ok: true }, 200, cors);
      }
      if (request.method === 'POST' && parts[3] === 'active') {
        const body = await request.json();
        await setActive(env.DB, userId, body.active !== false && body.active !== 0, user.id);
        return json({ ok: true }, 200, cors);
      }
    }

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
      if (request.method === 'PUT') return json(await replacePerson(env.DB, personId, await request.json()), 200, cors);
      if (request.method === 'DELETE') {
        await removePerson(env.DB, personId);
        return new Response(null, { status: 204, headers: cors || {} });
      }
    }
    if (request.method === 'POST' && url.pathname === '/api/people') {
      return json(await insertPerson(env.DB, await request.json()), 201, cors);
    }
    return json({ message: 'Not found' }, 404, cors);
  } catch (err) {
    const status = Number(err?.status) || 500;
    const message = status >= 500 ? 'No se pudo guardar' : (err?.message || 'No se pudo guardar');
    return json({ message }, status, cors);
  }
}
