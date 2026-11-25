import { Component, inject } from '@angular/core';
import { SessionService } from '../core/session.service';
import { TPipe } from '../shared/pipes';

/** Una sola acción: Iniciar sesión con GitHub. No hay campo para pegar un token. */
@Component({
  selector: 'app-login',
  imports: [TPipe],
  template: `
    <div class="login-page">
      <div class="card login-card shadow-lg">
        <div class="card-body text-center">
          <div class="login-brand"><i class="fab fa-github"></i></div>
          <h1 class="h4 text-gray-900 mb-1">{{ 'appName' | t }}</h1>
          <p class="text-gray-600 small mb-4">{{ 'loginTitle' | t }}</p>
          @if (session.logoutReason(); as reason) {
            <div class="alert alert-warning text-left" role="status">{{ reason }}</div>
          }
          @if (!session.configReady()) {
            <div class="spinner-border text-primary"></div>
          } @else if (!session.configured()) {
            <div class="alert alert-warning text-left" role="status">{{ 'oauthMissing' | t }}</div>
          } @else if (session.canRetry()) {
            <button type="button" class="btn btn-primary btn-block" (click)="session.retryLogin()">{{ 'oauthRetry' | t }}</button>
          } @else {
            <button type="button" class="btn btn-primary btn-block" (click)="session.startLogin()">
              <i class="fab fa-github mr-2"></i>{{ 'loginWithGithub' | t }}
            </button>
          }
          <p class="text-gray-600 small mt-3 mb-0 text-left">{{ 'loginPublicNote' | t }}</p>
        </div>
      </div>
    </div>
  `,
})
export class LoginComponent {
  protected session = inject(SessionService);
}
