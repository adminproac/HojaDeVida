/**
 * Canje del código OAuth. No registra el código, el secreto ni el token.
 * Shared by the Cloudflare Worker and the local Express API.
 */

export const ALLOWED_ORIGINS = new Set([
  'https://adminproac.github.io',
  'http://localhost:4200',
]);

export const ALLOWED_REDIRECTS = new Set([
  'https://adminproac.github.io/HojaDeVida/auth/callback',
  'http://localhost:4200/auth/callback',
]);

const CODE = /^[A-Za-z0-9._-]{8,200}$/;
const STATE = /^[A-Za-z0-9_-]{16,128}$/;

export function validateExchangeBody(body) {
  if (!body || typeof body !== 'object') return { ok: false, status: 400, message: 'Solicitud inválida' };
  if (typeof body.code !== 'string' || !CODE.test(body.code)) return { ok: false, status: 400, message: 'Código inválido' };
  if (typeof body.state !== 'string' || !STATE.test(body.state)) return { ok: false, status: 400, message: 'Estado inválido' };
  let redirectUri;
  if (body.redirect_uri != null) {
    if (typeof body.redirect_uri !== 'string' || !ALLOWED_REDIRECTS.has(body.redirect_uri)) {
      return { ok: false, status: 400, message: 'redirect_uri no permitido' };
    }
    redirectUri = body.redirect_uri;
  }
  return { ok: true, code: body.code, state: body.state, redirectUri };
}

export function corsFor(origin) {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export async function exchangeCode(fetchImpl, { clientId, clientSecret, code, redirectUri }) {
  if (!clientId || !clientSecret) {
    const err = new Error('Falta configurar el inicio de sesión con GitHub (ver README)');
    err.status = 503;
    throw err;
  }
  const payload = { client_id: clientId, client_secret: clientSecret, code };
  if (redirectUri) payload.redirect_uri = redirectUri;
  const res = await fetchImpl('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'hojadevida-oauth',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error || typeof data.access_token !== 'string' || !data.access_token) {
    const err = new Error('No se pudo iniciar sesión con GitHub');
    err.status = 401;
    throw err;
  }
  return {
    access_token: data.access_token,
    scope: typeof data.scope === 'string' ? data.scope : '',
    token_type: typeof data.token_type === 'string' ? data.token_type : 'bearer',
  };
}

function json(obj, status, cors) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(cors || {}) };
  return new Response(JSON.stringify(obj), { status, headers });
}

export async function handleOauthRequest(request, env, fetchImpl = fetch) {
  const origin = request.headers.get('Origin') || '';
  const cors = corsFor(origin);
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') {
    if (!cors) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: cors });
  }
  if (url.pathname !== '/api/oauth/exchange' || request.method !== 'POST') {
    return json({ message: 'Not found' }, 404, cors);
  }
  if (!cors) return json({ message: 'Origen no permitido' }, 403, null);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ message: 'Solicitud inválida' }, 400, cors);
  }
  const parsed = validateExchangeBody(body);
  if (!parsed.ok) return json({ message: parsed.message }, parsed.status, cors);
  try {
    const token = await exchangeCode(fetchImpl, {
      clientId: env?.GITHUB_CLIENT_ID,
      clientSecret: env?.GITHUB_CLIENT_SECRET,
      code: parsed.code,
      redirectUri: parsed.redirectUri,
    });
    return json(token, 200, cors);
  } catch (err) {
    const status = Number(err?.status) || 401;
    const message = status === 503
      ? 'Falta configurar el inicio de sesión con GitHub (ver README)'
      : 'No se pudo iniciar sesión con GitHub';
    return json({ message }, status, cors);
  }
}
