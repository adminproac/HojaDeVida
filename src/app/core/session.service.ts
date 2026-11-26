import { Injectable, computed, inject, signal } from '@angular/core';
import { setApiSessionToken } from './auth.interceptor';
import { clearLegacyToken } from './github.service';
import { I18nService } from './i18n.service';
import { environment } from '../../environments/environment';
import { TAB_SESSION_KEY, TabSession, parseTabSession } from './tab-session';
import { SESSION_TIMEOUT_MS, sessionClock } from './session-clock';
import { ToastService } from './toast.service';

const LOGOUT_REASON_KEY = 'resume-admin.logoutReason';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private toast = inject(ToastService);
  private i18n = inject(I18nService);

  readonly authenticated = signal(false);
  readonly username = signal('');
  readonly displayName = signal('');
  readonly role = signal<'admin' | 'editor'>('editor');
  readonly avatarUrl = signal('');
  readonly logoutReason = signal<string | null>(null);
  readonly configured = signal(false);
  readonly configReady = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  private warned = false;
  private lastActivity = 0;
  private lastPersist = 0;
  private lastTouch = 0;
  private sessionToken = '';

  readonly gate = computed(() => (this.authenticated() ? 'app' as const : 'login' as const));

  constructor() {
    clearLegacyToken();
    try { sessionStorage.removeItem('resume-admin.session'); } catch { /* private mode */ }
    this.readStashedReason();
    const bump = () => this.bump();
    for (const name of ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const) {
      window.addEventListener(name, bump, { passive: true });
    }
    window.setInterval(() => this.check(), 1000);
    this.loadConfig();
    this.restore();
  }

  loadConfig() {
    const base = environment.oauthProxyUrl.trim();
    const ok = !!base && !base.includes('<') && !/subdominio/i.test(base);
    this.configured.set(ok);
    this.configReady.set(true);
  }

  async login(username: string, password: string) {
    this.error.set(null);
    this.busy.set(true);
    try {
      const result = await this.auth<{ token: string; user: { username: string; displayName: string; role: 'admin' | 'editor' } }>(
        'POST', '/api/auth/login', { username, password },
      );
      this.begin({
        token: result.token,
        username: result.user.username,
        displayName: result.user.displayName,
        role: result.user.role === 'admin' ? 'admin' : 'editor',
        lastActivity: Date.now(),
      });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : this.i18n.t('loginBad'));
    } finally {
      this.busy.set(false);
    }
  }

  async logout(reason: 'idle' | 'manual' = 'manual') {
    const token = this.token();
    this.clearLocal();
    if (token) {
      try { await this.auth('POST', '/api/auth/logout'); } catch { /* the local session is already gone */ }
    }
    if (reason === 'idle') {
      try { sessionStorage.setItem(LOGOUT_REASON_KEY, 'idle'); } catch { /* private mode */ }
      this.logoutReason.set(this.i18n.t('sessionIdle'));
    }
    window.location.replace(new URL(document.baseURI).href);
  }

  private token() {
    return this.sessionToken;
  }

  private restore() {
    let raw: string | null = null;
    try { raw = sessionStorage.getItem(TAB_SESSION_KEY); } catch { raw = null; }
    const saved = parseTabSession(raw, Date.now());
    if (!saved) {
      try { sessionStorage.removeItem(TAB_SESSION_KEY); } catch { /* private mode */ }
      return;
    }
    this.begin(saved);
    void this.touch();
  }

  private begin(saved: TabSession) {
    this.sessionToken = saved.token;
    this.username.set(saved.username);
    this.displayName.set(saved.displayName);
    this.role.set(saved.role);
    this.lastActivity = saved.lastActivity;
    this.warned = false;
    this.logoutReason.set(null);
    setApiSessionToken(saved.token);
    this.persist();
    this.authenticated.set(true);
  }

  private persist() {
    if (!this.sessionToken) return;
    const value: TabSession = {
      token: this.sessionToken,
      username: this.username(),
      displayName: this.displayName(),
      role: this.role(),
      lastActivity: this.lastActivity,
    };
    try { sessionStorage.setItem(TAB_SESSION_KEY, JSON.stringify(value)); } catch { /* private mode */ }
    this.lastPersist = Date.now();
  }

  private clearLocal() {
    this.sessionToken = '';
    this.authenticated.set(false);
    this.username.set('');
    this.displayName.set('');
    this.role.set('editor');
    this.warned = false;
    setApiSessionToken(null);
    try { sessionStorage.removeItem(TAB_SESSION_KEY); } catch { /* private mode */ }
    clearLegacyToken();
  }

  private async touch() {
    if (!this.authenticated() || !this.configured()) return;
    try {
      const result = await this.auth<{ user: { username: string; displayName: string; role: 'admin' | 'editor' } }>('GET', '/api/auth/me');
      this.username.set(result.user.username);
      this.displayName.set(result.user.displayName);
      this.role.set(result.user.role === 'admin' ? 'admin' : 'editor');
      this.persist();
    } catch {
      this.clearLocal();
      this.logoutReason.set(this.i18n.t('sessionIdle'));
    }
  }

  private workerBase() {
    const base = environment.oauthProxyUrl.trim().replace(/\/$/, '');
    if (!base || base.includes('<') || /subdominio/i.test(base)) {
      throw new Error(this.i18n.t('workerMissing'));
    }
    return base;
  }

  private async auth<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = this.token();
    if (token && path !== '/api/auth/login') headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${this.workerBase()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    if (res.status === 204) return undefined as T;
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof payload?.message === 'string' ? payload.message : this.i18n.t('loginBad'));
    return payload as T;
  }

  private readStashedReason() {
    let key: string | null = null;
    try { key = sessionStorage.getItem(LOGOUT_REASON_KEY); } catch { key = null; }
    if (key !== 'idle') return;
    try { sessionStorage.removeItem(LOGOUT_REASON_KEY); } catch { /* private mode */ }
    this.logoutReason.set(this.i18n.t('sessionIdle'));
  }

  private bump() {
    if (!this.authenticated()) return;
    this.lastActivity = Date.now();
    this.warned = false;
    if (Date.now() - this.lastPersist > 5000) this.persist();
    if (Date.now() - this.lastTouch > 30000) {
      this.lastTouch = Date.now();
      void this.touch();
    }
  }

  private check() {
    if (!this.authenticated()) return;
    const phase = sessionClock(this.lastActivity, Date.now());
    if (phase === 'expired') void this.logout('idle');
    else if (phase === 'warning' && !this.warned) {
      this.warned = true;
      this.persist();
      this.toast.show(this.i18n.t('sessionWarning'), 'info', SESSION_TIMEOUT_MS);
    }
  }
}
