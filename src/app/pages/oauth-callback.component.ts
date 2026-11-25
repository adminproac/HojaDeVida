import { Component, inject, OnInit, signal } from '@angular/core';
import { SessionService } from '../core/session.service';
import { TPipe } from '../shared/pipes';

/** Canjea el código una sola vez. La URL ya no lleva ?code&state. */
@Component({
  selector: 'app-oauth-callback',
  imports: [TPipe],
  template: `
    <div class="login-page">
      <div class="card login-card shadow-lg">
        <div class="card-body text-center">
          @if (error()) {
            <div class="alert alert-danger text-left" role="alert">{{ error() }}</div>
            <button type="button" class="btn btn-primary" (click)="session.retryLogin()">{{ 'oauthRetry' | t }}</button>
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
  protected session = inject(SessionService);
  protected readonly error = signal<string | null>(null);

  ngOnInit() {
    void this.session.finishRedirect().then((message) => {
      if (message) this.error.set(message);
    });
  }
}
