import { Component, inject, signal } from '@angular/core';
import { errorText } from '../core/data-error';
import { GithubService } from '../core/github.service';
import { I18nService } from '../core/i18n.service';
import { TPipe } from './pipes';

/** Token panel for GitHub Pages. The token is stored only in localStorage. */
@Component({
  selector: 'app-github-connect',
  imports: [TPipe],
  template: `
    <div class="card shadow mb-4 github-connect d-print-none">
      <div class="card-header py-3 d-flex flex-wrap justify-content-between align-items-center">
        <h6 class="m-0 font-weight-bold text-primary"><i class="fab fa-github mr-2"></i>{{ 'githubConnect' | t }}</h6>
        <span class="badge" [class.badge-success]="github.connected()" [class.badge-secondary]="!github.connected()">
          <span class="gh-dot" [class.on]="github.connected()" [class.off]="!github.connected()"></span>
          {{ (github.checking() ? 'githubChecking' : github.connected() ? 'githubConnected' : 'githubNotConnected') | t }}
        </span>
      </div>
      <div class="card-body">
        <p class="text-gray-600 small mb-3">{{ 'githubHelp' | t }}</p>
        <label class="d-block" for="github-token">{{ 'githubToken' | t }}</label>
        <input id="github-token" type="password" class="form-control mb-3" autocomplete="off" spellcheck="false"
          [attr.placeholder]="github.hasToken() ? ('githubTokenStored' | t) : 'github_pat_…'"
          [value]="draft()" (input)="draft.set($any($event.target).value)" />
        <div class="d-flex flex-wrap align-items-center">
          <button type="button" class="btn btn-primary mr-2 mb-2" [disabled]="busy()" (click)="save()">{{ 'githubSaveToken' | t }}</button>
          <button type="button" class="btn btn-info mr-2 mb-2" [disabled]="busy()" (click)="test()">{{ 'githubTest' | t }}</button>
          @if (github.hasToken()) {
            <button type="button" class="btn btn-light mb-2" [disabled]="busy()" (click)="disconnect()">{{ 'githubDisconnect' | t }}</button>
          }
          @if (github.lastCommitUrl(); as url) {
            <a class="ml-sm-auto mb-2 small" [href]="url" target="_blank" rel="noopener">
              {{ 'githubLastCommit' | t }}
              @if (github.lastCommitSha(); as sha) { <code class="ml-1">{{ sha.slice(0, 7) }}</code> }
            </a>
          }
        </div>
        @if (github.connectionError(); as err) {
          <div class="alert alert-danger mb-0 mt-2" role="alert">{{ err }}</div>
        } @else if (github.testOk()) {
          <div class="alert alert-success mb-0 mt-2" role="status">
            {{ (github.pushAccess() === true ? 'githubTestOkPush' : 'githubTestOk') | t }}
            @if (github.pushAccess() === false) { <span class="d-block">{{ 'githubTestNoPush' | t }}</span> }
            @if (!github.connected()) { <span class="d-block">{{ 'githubSaveToEdit' | t }}</span> }
          </div>
        }
      </div>
    </div>
  `,
})
export class GithubConnectComponent {
  protected github = inject(GithubService);
  private i18n = inject(I18nService);
  protected readonly draft = signal('');
  protected readonly busy = signal(false);

  constructor() {
    void this.github.refreshLastCommit();
    if (this.github.hasToken()) void this.github.testConnection().catch(() => undefined);
  }

  async save() {
    const value = this.draft().trim();
    if (!value && !this.github.hasToken()) {
      this.github.connectionError.set(this.i18n.t('githubNoToken'));
      this.github.testOk.set(false);
      return;
    }
    if (value) this.github.setToken(value);
    this.draft.set('');
    await this.run(() => this.github.testConnection());
  }

  async test() {
    if (!this.draft().trim() && !this.github.hasToken()) {
      this.github.connectionError.set(this.i18n.t('githubNoToken'));
      this.github.testOk.set(false);
      return;
    }
    await this.run(() => this.github.testConnection(this.draft()));
  }

  disconnect() {
    this.github.clearToken();
    this.draft.set('');
  }

  private async run(action: () => Promise<void>) {
    this.busy.set(true);
    try {
      await action();
    } catch (e) {
      if (!this.github.connectionError()) this.github.connectionError.set(errorText(e));
    } finally {
      this.busy.set(false);
    }
  }
}
