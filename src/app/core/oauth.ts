/**
 * OAuth de GitHub en el navegador.
 * El token puede vivir en sessionStorage solo mientras la pestaña sigue abierta.
 * No se escribe en localStorage. Se borra al cerrar sesión y a los 5 minutos sin uso.
 */
import { sessionClock } from './session-clock';

export const OAUTH_STATE_KEY = 'resume-admin.oauthState';
export const OAUTH_USED_CODE_KEY = 'resume-admin.oauthUsedCode';
export const OAUTH_RETRY_KEY = 'resume-admin.oauthRetry';
export const TAB_SESSION_KEY = 'resume-admin.tabSession';
export const LOGOUT_REASON_KEY = 'resume-admin.logoutReason';
export const LEGACY_TOKEN_KEY = 'resume-admin.githubToken';
export const LEGACY_SESSION_KEY = 'resume-admin.session';

export interface OauthCapture {
  code: string | null;
  state: string | null;
  error: string | null;
  strippedHref: string;
}

/** Lee code/state y devuelve la misma URL sin esos parámetros. */
export function captureOauthParams(href: string): OauthCapture {
  const url = new URL(href);
  const onCallback = isOauthCallbackPath(url.pathname);
  const code = onCallback ? url.searchParams.get('code') : null;
  const state = onCallback ? url.searchParams.get('state') : null;
  const error = onCallback ? url.searchParams.get('error') : null;
  if (onCallback) {
    for (const key of ['code', 'state', 'error', 'error_description', 'error_uri']) url.searchParams.delete(key);
  }
  return { code, state, error, strippedHref: url.toString() };
}

/** Un código vacío o ya canjeado no se vuelve a enviar. */
export function shouldExchangeCode(code: string | null, usedCode: string | null): boolean {
  return !!code && code !== usedCode;
}

/** Un solo reintento automático. '1' significa que ese reintento ya se usó. */
export function canAutoRestart(retryFlag: string | null): boolean {
  return retryFlag !== '1';
}

export interface TabSession {
  token: string;
  login: string;
  displayName: string;
  avatarUrl: string;
  lastActivity: number;
}

/** Restaura la pestaña solo si el plazo de inactividad no venció. */
export function parseTabSession(raw: string | null, now: number): TabSession | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<TabSession>;
    if (typeof data.token !== 'string' || !data.token) return null;
    if (typeof data.login !== 'string' || !data.login) return null;
    if (typeof data.lastActivity !== 'number') return null;
    if (sessionClock(data.lastActivity, now) === 'expired') return null;
    return {
      token: data.token,
      login: data.login,
      displayName: typeof data.displayName === 'string' && data.displayName ? data.displayName : data.login,
      avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : '',
      lastActivity: data.lastActivity,
    };
  } catch {
    return null;
  }
}

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

/**
 * El token no puede estar en localStorage ni en la sesión antigua.
 * En sessionStorage solo se acepta bajo TAB_SESSION_KEY.
 */
export function tokenIsOnlyInMemory(token: string, local: Storage, session: Storage): boolean {
  if (!token) return false;
  for (let i = 0; i < local.length; i++) {
    const key = local.key(i) || '';
    const value = local.getItem(key) || '';
    if (key === LEGACY_TOKEN_KEY || value.includes(token)) return false;
  }
  for (let i = 0; i < session.length; i++) {
    const key = session.key(i) || '';
    const value = session.getItem(key) || '';
    if (key === LEGACY_TOKEN_KEY || key === LEGACY_SESSION_KEY) return false;
    if (value.includes(token) && key !== TAB_SESSION_KEY) return false;
  }
  return true;
}

export function isOauthCallbackPath(pathname: string): boolean {
  return /\/auth\/callback\/?$/.test(pathname);
}
