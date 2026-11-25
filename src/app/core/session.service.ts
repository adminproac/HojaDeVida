import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { setApiSessionToken } from './auth.interceptor';
import { GithubService, clearLegacyToken, readLegacyToken } from './github.service';
import { DataService } from './data.service';
import { I18nService } from './i18n.service';
import { ResumeUser } from './models';
import { decryptToken, encryptToken, hashPassword, verifyPassword } from './password-crypto';
import { SESSION_TIMEOUT_MS, sessionClock } from './session-clock';
import { StoreService } from './store.service';
import { ToastService } from './toast.service';

const SESSION_KEY = 'resume-admin.session';

interface PersistedSession {
  userId: string;
  username: string;
  displayName: string;
  token: string | null;
  apiToken: string | null;
  lastActivity: number;
}

@Injectable({ providedIn: 'root' })
export class SessionService {
  private store = inject(StoreService);
  private data = inject(DataService);
  private github = inject(GithubService);
  private toast = inject(ToastService);
  private i18n = inject(I18nService);
  private router = inject(Router);

  readonly authenticated = signal(false);
  readonly userId = signal<string | null>(null);
  readonly username = signal('');
  readonly displayName = signal('');
  readonly logoutReason = signal<string | null>(null);
  readonly offerLegacyToken = signal(false);
  readonly needsToken = signal(false);
  private password = '';
  private apiToken: string | null = null;
  private warned = false;
  private lastActivity = 0;
  private lastTouch = 0;

  readonly gate = computed(() => {
    if (this.store.loading() && !this.store.doc()) return 'loading' as const;
    if (!this.store.doc()) return 'error' as const;
    if (!(this.store.doc()?.users || []).length) return 'setup' as const;
    if (!this.authenticated()) return 'login' as const;
    return 'app' as const;
  });

  constructor() {
    this.restore();
    const bump = () => this.bump();
    for (const name of ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const) {
      window.addEventListener(name, bump, { passive: true });
    }
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => this.bump());
    window.setInterval(() => this.check(), 1000);
  }

  async login(username: string, password: string) {
    const user = this.findUser(username);
    if (!user || !(await verifyPassword(password, user))) throw new Error('bad-login');
    let apiToken: string | null = null;
    if (this.data.mode() === 'api') {
      const result = await this.data.login(user.username, password);
      apiToken = result.token;
    }
    let token: string | null = null;
    if (user.encryptedToken) {
      try { token = await decryptToken(password, user.encryptedToken); } catch { token = null; }
    }
    this.password = password;
    this.apiToken = apiToken;
    this.begin(user, token, apiToken);
    this.offerLegacyToken.set(!!readLegacyToken() && !user.encryptedToken);
    this.needsToken.set(!token);
  }

  async bootstrap(input: { username: string; displayName: string; password: string; token: string | null }) {
    const user = await this.buildUser(input.username, input.displayName, input.password, input.token);
    if (this.data.mode() === 'github') {
      if (!input.token) throw new Error('token-required');
      this.github.useMemoryToken(input.token);
    }
    const result = await this.data.bootstrapUser(user);
    if (result.token) setApiSessionToken(result.token);
    this.password = input.password;
    this.apiToken = result.token || null;
    this.begin(user, input.token, result.token || null);
    this.needsToken.set(!input.token);
    await this.store.load();
  }

  async storeToken(plain: string) {
    const user = this.currentRecord();
    if (!user || !this.password) throw new Error('relogin');
    const encryptedToken = await encryptToken(this.password, plain.trim());
    const next = { ...user, encryptedToken, updatedAt: new Date().toISOString() };
    await this.data.saveUser(next);
    this.github.useMemoryToken(plain.trim());
    clearLegacyToken();
    this.needsToken.set(false);
    this.offerLegacyToken.set(false);
    this.persist();
    await this.store.load();
  }

  async acceptLegacyToken() {
    const legacy = readLegacyToken();
    if (!legacy) { this.offerLegacyToken.set(false); return; }
    await this.storeToken(legacy);
  }

  dismissTokenPrompt() {
    this.needsToken.set(false);
    this.offerLegacyToken.set(false);
  }

  async createUser(username: string, displayName: string, password: string) {
    const user = await this.buildUser(username, displayName, password, null);
    await this.data.saveUser(user);
    await this.store.load();
  }

  async changePassword(userId: string, currentPassword: string, nextPassword: string) {
    const user = (this.store.doc()?.users || []).find((item) => item.id === userId);
    if (!user || !(await verifyPassword(currentPassword, user))) throw new Error('bad-login');
    const hashed = await hashPassword(nextPassword);
    let encryptedToken = user.encryptedToken;
    if (user.encryptedToken) {
      const token = await decryptToken(currentPassword, user.encryptedToken);
      encryptedToken = await encryptToken(nextPassword, token);
    }
    const next = { ...user, ...hashed, encryptedToken, updatedAt: new Date().toISOString() };
    await this.data.saveUser(next);
    if (userId === this.userId()) this.password = nextPassword;
    await this.store.load();
  }

  async removeUser(userId: string) {
    await this.data.deleteUser(userId);
    if (userId === this.userId()) this.logout('removed');
    await this.store.load();
  }

  logout(reason: 'idle' | 'manual' | 'removed' = 'manual') {
    this.password = '';
    this.authenticated.set(false);
    this.userId.set(null);
    this.username.set('');
    this.displayName.set('');
    this.needsToken.set(false);
    this.offerLegacyToken.set(false);
    this.warned = false;
    this.apiToken = null;
    this.github.useMemoryToken(null);
    setApiSessionToken(null);
    sessionStorage.removeItem(SESSION_KEY);
    if (reason === 'idle') this.logoutReason.set(this.i18n.t('sessionIdle'));
  }

  private begin(user: Pick<ResumeUser, 'id' | 'username' | 'displayName'>, token: string | null, apiToken: string | null) {
    this.logoutReason.set(null);
    this.userId.set(user.id);
    this.username.set(user.username);
    this.displayName.set(user.displayName);
    this.authenticated.set(true);
    this.lastActivity = Date.now();
    this.warned = false;
    this.github.useMemoryToken(token);
    setApiSessionToken(apiToken);
    this.persist();
    if (token) void this.github.testConnection().catch(() => undefined);
  }

  private async buildUser(username: string, displayName: string, password: string, token: string | null): Promise<ResumeUser> {
    const hashed = await hashPassword(password);
    const now = new Date().toISOString();
    return {
      id: `user-${crypto.randomUUID().slice(0, 8)}`,
      username: username.trim(),
      displayName: displayName.trim(),
      ...hashed,
      encryptedToken: token ? await encryptToken(password, token) : null,
      createdAt: now,
      updatedAt: now,
    };
  }

  private findUser(username: string): ResumeUser | undefined {
    const name = username.trim().toLowerCase();
    return (this.store.doc()?.users || []).find((user) => user.username.toLowerCase() === name);
  }

  private currentRecord(): ResumeUser | undefined {
    return (this.store.doc()?.users || []).find((user) => user.id === this.userId());
  }

  private restore() {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as PersistedSession;
      if (sessionClock(saved.lastActivity, Date.now()) === 'expired') {
        sessionStorage.removeItem(SESSION_KEY);
        return;
      }
      this.userId.set(saved.userId);
      this.username.set(saved.username);
      this.displayName.set(saved.displayName);
      this.authenticated.set(true);
      this.lastActivity = saved.lastActivity;
      this.apiToken = saved.apiToken;
      this.github.useMemoryToken(saved.token);
      setApiSessionToken(saved.apiToken);
      if (saved.token) void this.github.testConnection().catch(() => undefined);
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }

  private persist() {
    if (!this.authenticated()) return;
    const saved: PersistedSession = {
      userId: this.userId() || '',
      username: this.username(),
      displayName: this.displayName(),
      token: this.github.token(),
      apiToken: this.apiToken,
      lastActivity: this.lastActivity,
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(saved));
  }

  private bump() {
    if (!this.authenticated()) return;
    this.lastActivity = Date.now();
    this.warned = false;
    this.persist();
    if (this.data.mode() === 'api' && Date.now() - this.lastTouch > 20000) {
      this.lastTouch = Date.now();
      void this.data.touchSession().catch(() => undefined);
    }
  }

  private check() {
    if (!this.authenticated()) return;
    const doc = this.store.doc();
    if (doc && this.userId() && !(doc.users || []).some((user) => user.id === this.userId()) && (doc.users || []).length) {
      this.logout('removed');
      return;
    }
    const phase = sessionClock(this.lastActivity, Date.now());
    if (phase === 'expired') this.logout('idle');
    else if (phase === 'warning' && !this.warned) {
      this.warned = true;
      this.toast.show(this.i18n.t('sessionWarning'), 'info', SESSION_TIMEOUT_MS);
    }
  }
}
