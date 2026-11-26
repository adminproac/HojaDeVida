import { Component, inject, signal } from '@angular/core';
import { SessionService } from '../core/session.service';
import { TPipe } from '../shared/pipes';

/** Usuario y contraseña. El token de sesión no se escribe en el código. */
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
            <p class="text-gray-600 small mb-0">{{ 'loginTitle' | t }}</p>
          </div>
          @if (session.logoutReason(); as reason) {
            <div class="alert alert-warning" role="status">{{ reason }}</div>
          }
          @if (session.error(); as message) {
            <div class="alert alert-danger" role="alert">{{ message }}</div>
          }
          @if (!session.configReady()) {
            <div class="text-center"><div class="spinner-border text-primary"></div></div>
          } @else if (!session.configured()) {
            <div class="alert alert-warning" role="status">{{ 'workerMissing' | t }}</div>
          } @else {
            <form (submit)="submit($event)">
              <label class="login-label" for="username">{{ 'loginUser' | t }}</label>
              <input id="username" class="form-control mb-3" autocomplete="username" [value]="username()" (input)="username.set(valueOf($event))" />
              <label class="login-label" for="password">{{ 'loginPassword' | t }}</label>
              <input id="password" type="password" class="form-control mb-3" autocomplete="current-password" [value]="password()" (input)="password.set(valueOf($event))" />
              <button type="submit" class="btn btn-primary btn-block" [disabled]="session.busy()">{{ 'loginEnter' | t }}</button>
            </form>
          }
          <p class="text-gray-600 small mt-3 mb-0">{{ 'loginPublicNote' | t }}</p>
        </div>
      </div>
    </div>
  `,
})
export class LoginComponent {
  protected session = inject(SessionService);
  protected readonly username = signal('');
  protected readonly password = signal('');

  valueOf(event: Event) { return (event.target as HTMLInputElement).value; }

  submit(event: Event) {
    event.preventDefault();
    const password = this.password();
    this.password.set('');
    void this.session.login(this.username(), password);
  }
}
