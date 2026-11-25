import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionService } from '../core/session.service';
import { TPipe } from '../shared/pipes';

/** Recibe ?code=&state= y canjea el código. No muestra el token. */
@Component({
  selector: 'app-oauth-callback',
  imports: [TPipe, RouterLink],
  template: `
    <div class="login-page">
      <div class="card login-card shadow-lg">
        <div class="card-body text-center">
          @if (error()) {
            <div class="alert alert-danger text-left" role="alert">{{ error() }}</div>
            <a class="btn btn-primary" routerLink="/">{{ 'loginWithGithub' | t }}</a>
          } @else {
            <div class="spinner-border text-primary"></div>
            <p class="text-gray-600 small mt-3 mb-0">{{ 'oauthWorking' | t }}</p>
          }
        </div>
      </div>
    </div>
  `,
})
export class OauthCallbackComponent implements OnInit {
  private session = inject(SessionService);
  protected readonly error = signal<string | null>(null);

  ngOnInit() {
    void this.session.finishRedirect().then((message) => {
      if (message) this.error.set(message);
    });
  }
}
