/** OAuth de GitHub en el navegador. El token no se escribe en ningún almacenamiento. */

export const OAUTH_STATE_KEY = 'resume-admin.oauthState';
export const LEGACY_TOKEN_KEY = 'resume-admin.githubToken';
export const LEGACY_SESSION_KEY = 'resume-admin.session';

const STATE = /^[A-Za-z0-9_-]{16,128}$/;

export function createOauthState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Compara el state guardado con el que devolvió GitHub. Rechaza vacío, corto o distinto. */
export function oauthStateMatches(stored: string | null, received: string | null): boolean {
  if (!stored || !received) return false;
  if (!STATE.test(stored) || !STATE.test(received) || stored.length !== received.length) return false;
  let diff = 0;
  for (let i = 0; i < stored.length; i++) diff |= stored.charCodeAt(i) ^ received.charCodeAt(i);
  return diff === 0;
}

export function oauthRedirectUri(baseUri: string): string {
  return new URL('auth/callback', baseUri).href;
}

export function exchangeEndpoint(proxyUrl: string): string {
  const base = proxyUrl.trim().replace(/\/$/, '');
  if (!base) return '/api/oauth/exchange';
  return `${base}/api/oauth/exchange`;
}

/** En producción hacen falta el Client ID público y una URL https real del Worker. */
export function oauthConfigured(clientId: string, proxyUrl: string, production: boolean): boolean {
  if (!clientId.trim()) return false;
  if (!production) return true;
  const proxy = proxyUrl.trim();
  if (!proxy || proxy.includes('<') || /subdominio/i.test(proxy)) return false;
  try {
    return new URL(proxy).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Verdadero solo si el token no aparece en localStorage ni en sessionStorage. */
export function tokenIsOnlyInMemory(token: string, local: Storage, session: Storage): boolean {
  if (!token) return false;
  for (const store of [local, session]) {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i) || '';
      const value = store.getItem(key) || '';
      if (value.includes(token)) return false;
      if (key === LEGACY_TOKEN_KEY || key === LEGACY_SESSION_KEY) return false;
    }
  }
  return true;
}

export function isOauthCallbackPath(pathname: string): boolean {
  return /\/auth\/callback\/?$/.test(pathname);
}
