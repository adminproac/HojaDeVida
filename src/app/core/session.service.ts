import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { setApiSessionToken } from './auth.interceptor';
import { GithubService, clearLegacyToken } from './github.service';
import { I18nService } from './i18n.service';
import { environment } from '../../environments/environment';
import {
  LEGACY_SESSION_KEY,
  OAUTH_STATE_KEY,
  createOauthState,
  exchangeEndpoint,
  isOauthCallbackPath,
  oauthConfigured,
  oauthRedirectUri,
  oauthStateMatches,
} from './oauth';
import { SESSION_TIMEOUT_MS, sessionClock } from './session-clock';
import { ToastService } from './toast.service';

interface GithubProfile {
  login: string;
  displayName: string;
  avatarUrl: string;
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
  readonly configured = signal(false);
  readonly configReady = signal(false);
  readonly callbackPending = signal(isOauthCallbackPath(window.location.pathname));

  private clientId = '';
  private proxyUrl = '';
  private allowedLogins: string[] = environment.allowedLogins || [];
  private warned = false;
  private lastActivity = 0;
  private finishing: Promise<string | null> | null = null;

  readonly gate = computed(() => {
    if (this.callbackPending() && !this.authenticated()) return 'callback' as const;
    if (!this.authenticated()) return 'login' as const;
    return 'app' as const;
  });

  constructor() {
    clearLegacyToken();
    try { sessionStorage.removeItem(LEGACY_SESSION_KEY); } catch { /* private mode */ }
    const bump = () => this.bump();
    for (const name of ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const) {
      window.addEventListener(name, bump, { passive: true });
    }
    window.setInterval(() => this.check(), 1000);
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

  startLogin() {
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
    this.github.clearToken();
    setApiSessionToken(null);
    try { sessionStorage.removeItem(OAUTH_STATE_KEY); } catch { /* private mode */ }
    try { sessionStorage.removeItem(LEGACY_SESSION_KEY); } catch { /* private mode */ }
    clearLegacyToken();
    this.callbackPending.set(false);
    if (reason === 'idle') this.logoutReason.set(this.i18n.t('sessionIdle'));
    if (!window.location.pathname.endsWith('/auth/callback')) void this.router.navigateByUrl('/');
  }

  private async finishRedirectNow(): Promise<string | null> {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const providerError = params.get('error');
    let stored: string | null = null;
    try { stored = sessionStorage.getItem(OAUTH_STATE_KEY); } catch { stored = null; }
    try { sessionStorage.removeItem(OAUTH_STATE_KEY); } catch { /* private mode */ }
    if (providerError || !code || !oauthStateMatches(stored, state)) {
      this.callbackPending.set(false);
      const key = providerError === 'access_denied' ? 'oauthDenied' : 'oauthState';
      this.logoutReason.set(this.i18n.t(key));
      await this.router.navigateByUrl('/', { replaceUrl: true });
      return this.i18n.t(key);
    }
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
      this.begin(profile, token);
      await this.router.navigateByUrl('/dashboard', { replaceUrl: true });
      return null;
    } catch (err) {
      this.github.clearToken();
      setApiSessionToken(null);
      this.callbackPending.set(false);
      const key = err instanceof Error && err.message === 'denied'
        ? 'oauthDenied'
        : err instanceof Error && err.message === 'missing'
          ? 'oauthMissing'
          : 'oauthFailed';
      this.logoutReason.set(this.i18n.t(key));
      await this.router.navigateByUrl('/', { replaceUrl: true });
      return this.i18n.t(key);
    }
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
    this.username.set(profile.login);
    this.displayName.set(profile.displayName);
    this.avatarUrl.set(profile.avatarUrl);
    this.lastActivity = Date.now();
    this.warned = false;
    this.github.useMemoryToken(token);
    setApiSessionToken(token);
    this.authenticated.set(true);
    this.callbackPending.set(false);
  }

  private bump() {
    if (!this.authenticated()) return;
    this.lastActivity = Date.now();
    this.warned = false;
  }

  private check() {
    if (!this.authenticated()) return;
    const phase = sessionClock(this.lastActivity, Date.now());
    if (phase === 'expired') this.logout('idle');
    else if (phase === 'warning' && !this.warned) {
      this.warned = true;
      this.toast.show(this.i18n.t('sessionWarning'), 'info', SESSION_TIMEOUT_MS);
    }
  }
}
