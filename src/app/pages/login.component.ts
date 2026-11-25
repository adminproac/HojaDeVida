import { Component, inject, input, signal } from '@angular/core';
import { I18nService } from '../core/i18n.service';
import { SessionService } from '../core/session.service';
import { DataService } from '../core/data.service';
import { TPipe } from '../shared/pipes';

/** SB Admin 2 style gate: first user, or username and password. */
@Component({
  selector: 'app-login',
  imports: [TPipe],
  template: `
    <div class="login-page">
      <div class="card login-card shadow-lg">
        <div class="card-body">
          <div class="text-center mb-4">
            <div class="login-brand"><i class="fas fa-id-card"></i></div>
            <h1 class="h4 text-gray-900 mb-1">{{ 'appName' | t }}</h1>
            <p class="text-gray-600 small mb-0">{{ (mode() === 'setup' ? 'loginSetupTitle' : 'loginTitle') | t }}</p>
          </div>
          @if (session.logoutReason(); as reason) {
            <div class="alert alert-warning" role="status">{{ reason }}</div>
          }
          @if (error()) { <div class="alert alert-danger" role="alert">{{ error() }}</div> }
          <form (submit)="submit($event)">
            @if (mode() === 'setup') {
              <label class="login-label" for="display-name">{{ 'loginDisplayName' | t }}</label>
              <input id="display-name" class="form-control mb-3" autocomplete="name" [value]="displayName()" (input)="displayName.set(valueOf($event))" />
            }
            <label class="login-label" for="username">{{ 'loginUser' | t }}</label>
            <input id="username" class="form-control mb-3" autocomplete="username" [value]="username()" (input)="username.set(valueOf($event))" />
            <label class="login-label" for="password">{{ 'loginPassword' | t }}</label>
            <input id="password" type="password" class="form-control mb-3" autocomplete="current-password" [value]="password()" (input)="password.set(valueOf($event))" />
            @if (mode() === 'setup') {
              <label class="login-label" for="password2">{{ 'loginPassword2' | t }}</label>
              <input id="password2" type="password" class="form-control mb-3" autocomplete="new-password" [value]="password2()" (input)="password2.set(valueOf($event))" />
              <label class="login-label" for="pat">{{ 'githubToken' | t }}</label>
              <input id="pat" type="password" class="form-control mb-2" autocomplete="off" spellcheck="false" [value]="token()" (input)="token.set(valueOf($event))" />
              <p class="text-gray-600 small">{{ (data.mode() === 'github' ? 'loginPatRequired' : 'loginPatOptional') | t }}</p>
            }
            <button type="submit" class="btn btn-primary btn-block" [disabled]="busy()">
              {{ (busy() ? 'saving' : mode() === 'setup' ? 'loginCreate' : 'loginEnter') | t }}
            </button>
          </form>
          <p class="text-gray-600 small mt-3 mb-0">{{ 'loginPublicNote' | t }}</p>
        </div>
      </div>
    </div>
  `,
})
export class LoginComponent {
  readonly mode = input<'login' | 'setup'>('login');
  protected session = inject(SessionService);
  protected data = inject(DataService);
  private i18n = inject(I18nService);
  protected readonly username = signal('');
  protected readonly displayName = signal('');
  protected readonly password = signal('');
  protected readonly password2 = signal('');
  protected readonly token = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  valueOf(event: Event) { return (event.target as HTMLInputElement).value; }

  async submit(event: Event) {
    event.preventDefault();
    this.error.set(null);
    this.busy.set(true);
    try {
      if (this.mode() === 'setup') {
        if (this.password().length < 8) throw new Error('short');
        if (this.password() !== this.password2()) throw new Error('mismatch');
        if (this.data.mode() === 'github' && !this.token().trim()) throw new Error('token-required');
        await this.session.bootstrap({
          username: this.username(),
          displayName: this.displayName() || this.username(),
          password: this.password(),
          token: this.token().trim() || null,
        });
      } else {
        await this.session.login(this.username(), this.password());
      }
      this.password.set('');
      this.password2.set('');
      this.token.set('');
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      if (code === 'bad-login') this.error.set(this.i18n.t('loginBad'));
      else if (code === 'mismatch') this.error.set(this.i18n.t('loginMismatch'));
      else if (code === 'short') this.error.set(this.i18n.t('loginShort'));
      else if (code === 'token-required') this.error.set(this.i18n.t('loginPatRequired'));
      else this.error.set(this.i18n.t('loginBad'));
    } finally {
      this.busy.set(false);
    }
  }
}
