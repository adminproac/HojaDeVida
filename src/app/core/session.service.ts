import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { setApiSessionToken } from './auth.interceptor';
import { GithubService, clearLegacyToken } from './github.service';
import { I18nService } from './i18n.service';
import { environment } from '../../environments/environment';
import {
  LEGACY_SESSION_KEY,
  LOGOUT_REASON_KEY,
  OAUTH_RETRY_KEY,
  OAUTH_STATE_KEY,
  OAUTH_USED_CODE_KEY,
  TAB_SESSION_KEY,
  TabSession,
  canAutoRestart,
  captureOauthParams,
  createOauthState,
  exchangeEndpoint,
  oauthConfigured,
  oauthRedirectUri,
  oauthStateMatches,
  parseTabSession,
  shouldExchangeCode,
} from './oauth';
import { SESSION_TIMEOUT_MS, sessionClock } from './session-clock';
import { ToastService } from './toast.service';

interface GithubProfile {
  login: string;
  displayName: string;
  avatarUrl: string;
}

type OauthFailure = 'oauthDenied' | 'oauthState' | 'oauthFailed' | 'oauthMissing';

/** Se lee al importar el módulo, antes de que el enrutador conserve ?code&state. */
const capturedOauth = stripCallbackQuery();

function stripCallbackQuery() {
  if (typeof window === 'undefined') return null;
  const captured = captureOauthParams(window.location.href);
  if (captured.strippedHref !== window.location.href) {
    history.replaceState(null, '', captured.strippedHref);
  }
  return captured;
}

@Injectable({ providedIn: 'root' })
export class SessionService {
  private github = inject(GithubService);
  private toast = inject(ToastService);
  private i18n = inject(I18nService);
  private router = inject(Router);

  readonly authenticated = signal(false);
  readonly username = signal('');
  readonly displayName = signal('');
  readonly avatarUrl = signal('');
  readonly logoutReason = signal<string | null>(null);
  readonly canRetry = signal(false);
  readonly configured = signal(false);
  readonly configReady = signal(false);
  readonly callbackPending = signal(!!(capturedOauth?.code || capturedOauth?.error));

  private clientId = '';
  private proxyUrl = '';
  private allowedLogins: string[] = environment.allowedLogins || [];
  private warned = false;
  private lastActivity = 0;
  private lastPersist = 0;
  private finishing: Promise<string | null> | null = null;

  readonly gate = computed(() => {
    if (this.callbackPending() && !this.authenticated()) return 'callback' as const;
    if (!this.authenticated()) return 'login' as const;
    return 'app' as const;
  });

  constructor() {
    clearLegacyToken();
    try { sessionStorage.removeItem(LEGACY_SESSION_KEY); } catch { /* private mode */ }
    this.readStashedReason();
    const bump = () => this.bump();
    for (const name of ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const) {
      window.addEventListener(name, bump, { passive: true });
    }
    window.setInterval(() => this.check(), 1000);
    if (!capturedOauth?.code && !capturedOauth?.error) this.restoreTab();
    void this.loadConfig();
  }

  async loadConfig() {
    if (!environment.production) {
      try {
        const res = await fetch('/api/oauth/config', { cache: 'no-store' });
        if (res.ok) {
          const body = await res.json();
          const clientId = typeof body?.clientId === 'string' ? body.clientId.trim() : '';
          if (clientId) {
            this.clientId = clientId;
            this.proxyUrl = '';
            this.allowedLogins = Array.isArray(body?.allowedLogins)
              ? body.allowedLogins.filter((item: unknown) => typeof item === 'string' && item.trim()).map((item: string) => item.trim())
              : [];
            this.configured.set(true);
            this.configReady.set(true);
            return;
          }
        }
      } catch {
        // Sin API local se usa la configuración compilada.
      }
    }
    this.clientId = environment.oauthClientId.trim();
    this.proxyUrl = environment.oauthProxyUrl.trim();
    this.allowedLogins = environment.allowedLogins || [];
    this.configured.set(oauthConfigured(this.clientId, this.proxyUrl, environment.production));
    this.configReady.set(true);
  }

  /** Solo lo llama el botón. No pide consentimiento extra y no corre al cargar la página. */
  startLogin() {
    this.logoutReason.set(null);
    this.canRetry.set(false);
    try { sessionStorage.removeItem(OAUTH_RETRY_KEY); } catch { /* private mode */ }
    this.startAuthorize();
  }

  retryLogin() {
    this.startLogin();
  }

  finishRedirect(): Promise<string | null> {
    if (!this.finishing) this.finishing = this.finishRedirectNow();
    return this.finishing;
  }

  logout(reason: 'idle' | 'manual' = 'manual') {
    this.authenticated.set(false);
    this.username.set('');
    this.displayName.set('');
    this.avatarUrl.set('');
    this.warned = false;
    this.canRetry.set(false);
    this.callbackPending.set(false);
    this.github.clearToken();
    setApiSessionToken(null);
    try { sessionStorage.removeItem(TAB_SESSION_KEY); } catch { /* private mode */ }
    try { sessionStorage.removeItem(LEGACY_SESSION_KEY); } catch { /* private mode */ }
    clearLegacyToken();
    try {
      if (reason === 'idle') sessionStorage.setItem(LOGOUT_REASON_KEY, 'idle');
      else sessionStorage.removeItem(LOGOUT_REASON_KEY);
    } catch { /* private mode */ }
    window.location.replace(new URL(document.baseURI).href);
  }

  private async finishRedirectNow(): Promise<string | null> {
    const code = capturedOauth?.code ?? null;
    const state = capturedOauth?.state ?? null;
    const providerError = capturedOauth?.error ?? null;

    if (providerError === 'access_denied') return this.failLogin('oauthDenied');
    if (!code) {
      this.callbackPending.set(false);
      if (this.authenticated()) await this.router.navigateByUrl('/dashboard', { replaceUrl: true });
      else this.replaceWithLogin();
      return null;
    }

    let stored: string | null = null;
    try { stored = sessionStorage.getItem(OAUTH_STATE_KEY); } catch { stored = null; }
    if (!oauthStateMatches(stored, state)) return this.failLogin('oauthState');

    let used: string | null = null;
    try { used = sessionStorage.getItem(OAUTH_USED_CODE_KEY); } catch { used = null; }
    if (!shouldExchangeCode(code, used)) return this.restartOrFail();
    try { sessionStorage.setItem(OAUTH_USED_CODE_KEY, code); } catch { /* private mode */ }

    try {
      if (!this.configReady()) await this.loadConfig();
      const res = await fetch(exchangeEndpoint(this.proxyUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          code,
          state,
          redirect_uri: oauthRedirectUri(document.baseURI),
        }),
      });
      const body = await res.json().catch(() => ({}));
      const token = typeof body?.access_token === 'string' ? body.access_token : '';
      if (!res.ok || !token) throw new Error(res.status === 503 ? 'missing' : 'failed');
      const profile = await this.githubProfile(token);
      try { sessionStorage.removeItem(OAUTH_RETRY_KEY); } catch { /* private mode */ }
      this.begin(profile, token);
      await this.router.navigateByUrl('/dashboard', { replaceUrl: true });
      return null;
    } catch (err) {
      this.github.clearToken();
      setApiSessionToken(null);
      try { sessionStorage.removeItem(TAB_SESSION_KEY); } catch { /* private mode */ }
      const message = err instanceof Error ? err.message : '';
      if (message === 'denied') return this.failLogin('oauthDenied');
      if (message === 'missing') return this.failLogin('oauthMissing');
      return this.restartOrFail();
    }
  }

  private async restartOrFail(): Promise<string | null> {
    if (!this.configReady()) await this.loadConfig();
    let flag: string | null = null;
    try { flag = sessionStorage.getItem(OAUTH_RETRY_KEY); } catch { flag = null; }
    if (canAutoRestart(flag) && this.configured() && this.clientId) {
      try { sessionStorage.setItem(OAUTH_RETRY_KEY, '1'); } catch { /* private mode */ }
      this.startAuthorize();
      return null;
    }
    return this.failLogin('oauthFailed');
  }

  private failLogin(key: OauthFailure): string {
    this.callbackPending.set(false);
    this.authenticated.set(false);
    const message = this.i18n.t(key);
    this.logoutReason.set(message);
    this.canRetry.set(key === 'oauthFailed' || key === 'oauthState');
    try { sessionStorage.setItem(LOGOUT_REASON_KEY, key); } catch { /* private mode */ }
    this.replaceWithLogin();
    return message;
  }

  private replaceWithLogin() {
    const clean = new URL(document.baseURI).href;
    if (window.location.href !== clean) window.location.replace(clean);
  }

  private startAuthorize() {
    if (!this.configured() || !this.clientId) return;
    const state = createOauthState();
    sessionStorage.setItem(OAUTH_STATE_KEY, state);
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', oauthRedirectUri(document.baseURI));
    url.searchParams.set('scope', environment.oauthScope || 'public_repo');
    url.searchParams.set('state', state);
    window.location.assign(url.toString());
  }

  private async githubProfile(token: string): Promise<GithubProfile> {
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };
    const userRes = await fetch('https://api.github.com/user', { headers, cache: 'no-store' });
    if (!userRes.ok) throw new Error('failed');
    const user = await userRes.json();
    const repoRes = await fetch(`https://api.github.com/repos/${environment.repoOwner}/${environment.repoName}`, { headers, cache: 'no-store' });
    const repo = await repoRes.json().catch(() => ({}));
    const login = String(user?.login || '');
    const allow = this.allowedLogins.map((item) => item.toLowerCase());
    const push = repoRes.ok && repo?.permissions?.push === true;
    if (!login || !push || (allow.length > 0 && !allow.includes(login.toLowerCase()))) throw new Error('denied');
    return {
      login,
      displayName: String(user?.name || login),
      avatarUrl: typeof user?.avatar_url === 'string' ? user.avatar_url : '',
    };
  }

  private begin(profile: GithubProfile, token: string) {
    this.logoutReason.set(null);
    this.canRetry.set(false);
    this.username.set(profile.login);
    this.displayName.set(profile.displayName);
    this.avatarUrl.set(profile.avatarUrl);
    this.lastActivity = Date.now();
    this.warned = false;
    this.github.useMemoryToken(token);
    setApiSessionToken(token);
    this.authenticated.set(true);
    this.callbackPending.set(false);
    this.persistTab();
  }

  private restoreTab() {
    let raw: string | null = null;
    try { raw = sessionStorage.getItem(TAB_SESSION_KEY); } catch { raw = null; }
    const saved = parseTabSession(raw, Date.now());
    if (!saved) {
      try { sessionStorage.removeItem(TAB_SESSION_KEY); } catch { /* private mode */ }
      return;
    }
    this.lastActivity = saved.lastActivity;
    this.username.set(saved.login);
    this.displayName.set(saved.displayName);
    this.avatarUrl.set(saved.avatarUrl);
    this.github.useMemoryToken(saved.token);
    setApiSessionToken(saved.token);
    this.authenticated.set(true);
    this.callbackPending.set(false);
  }

  private persistTab() {
    const token = this.github.token();
    if (!this.authenticated() || !token) return;
    const payload: TabSession = {
      token,
      login: this.username(),
      displayName: this.displayName(),
      avatarUrl: this.avatarUrl(),
      lastActivity: this.lastActivity,
    };
    try { sessionStorage.setItem(TAB_SESSION_KEY, JSON.stringify(payload)); } catch { /* private mode */ }
    this.lastPersist = Date.now();
  }

  private readStashedReason() {
    let key: string | null = null;
    try { key = sessionStorage.getItem(LOGOUT_REASON_KEY); } catch { key = null; }
    if (!key) return;
    try { sessionStorage.removeItem(LOGOUT_REASON_KEY); } catch { /* private mode */ }
    const messageKey = key === 'idle' ? 'sessionIdle'
      : key === 'oauthDenied' || key === 'oauthState' || key === 'oauthFailed' || key === 'oauthMissing' ? key
      : null;
    if (!messageKey) return;
    this.logoutReason.set(this.i18n.t(messageKey));
    this.canRetry.set(key === 'oauthFailed' || key === 'oauthState');
  }

  private bump() {
    if (!this.authenticated()) return;
    this.lastActivity = Date.now();
    this.warned = false;
    if (Date.now() - this.lastPersist > 5000) this.persistTab();
  }

  private check() {
    if (!this.authenticated()) return;
    const phase = sessionClock(this.lastActivity, Date.now());
    if (phase === 'expired') this.logout('idle');
    else if (phase === 'warning' && !this.warned) {
      this.warned = true;
      this.persistTab();
      this.toast.show(this.i18n.t('sessionWarning'), 'info', SESSION_TIMEOUT_MS);
    }
  }
}
