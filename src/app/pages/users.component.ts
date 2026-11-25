import { Component, inject, signal } from '@angular/core';
import { ConfirmService } from '../core/confirm.service';
import { I18nService } from '../core/i18n.service';
import { SessionService } from '../core/session.service';
import { StoreService } from '../core/store.service';
import { PageHeaderComponent } from '../shared/page-header.component';
import { TPipe } from '../shared/pipes';

@Component({
  selector: 'app-users',
  imports: [PageHeaderComponent, TPipe],
  template: `
    <app-page-header [title]="'users' | t" [crumbs]="[{ label: 'home' | t, link: '/dashboard' }, { label: 'users' | t }]">
      <button type="button" class="btn btn-primary" (click)="creating.set(!creating())">{{ 'userNew' | t }}</button>
    </app-page-header>
    @if (error()) { <div class="alert alert-danger" role="alert">{{ error() }}</div> }
    @if (creating()) {
      <div class="card shadow mb-4">
        <div class="card-header py-3"><h6 class="m-0 font-weight-bold text-primary">{{ 'userNew' | t }}</h6></div>
        <form class="card-body" (submit)="create($event)">
          <div class="form-row">
            <div class="form-group col-md-4"><label>{{ 'loginUser' | t }}</label><input class="form-control" [value]="username()" (input)="username.set(val($event))" /></div>
            <div class="form-group col-md-4"><label>{{ 'loginDisplayName' | t }}</label><input class="form-control" [value]="displayName()" (input)="displayName.set(val($event))" /></div>
            <div class="form-group col-md-4"><label>{{ 'loginPassword' | t }}</label><input type="password" class="form-control" [value]="password()" (input)="password.set(val($event))" /></div>
          </div>
          <button class="btn btn-primary" type="submit" [disabled]="busy()">{{ 'save' | t }}</button>
        </form>
      </div>
    }
    <div class="card shadow mb-4">
      <div class="card-body p-0">
        <table class="table mb-0">
          <thead class="thead-light"><tr><th>{{ 'loginUser' | t }}</th><th>{{ 'loginDisplayName' | t }}</th><th></th></tr></thead>
          <tbody>
            @for (user of store.doc()?.users || []; track user.id) {
              <tr>
                <td>{{ user.username }}</td>
                <td>{{ user.displayName }}</td>
                <td class="text-right">
                  <button type="button" class="btn btn-sm btn-light" (click)="editing.set(editing() === user.id ? null : user.id)">{{ 'userPassword' | t }}</button>
                  <button type="button" class="btn btn-sm btn-danger ml-1" [disabled]="(store.doc()?.users?.length || 0) <= 1" (click)="remove(user.id, user.displayName)">{{ 'delete' | t }}</button>
                </td>
              </tr>
              @if (editing() === user.id) {
                <tr>
                  <td colspan="3">
                    <form class="form-row" (submit)="change(user.id, $event)">
                      <div class="form-group col-md-4"><input type="password" class="form-control" [placeholder]="'loginPassword' | t" [value]="current()" (input)="current.set(val($event))" /></div>
                      <div class="form-group col-md-4"><input type="password" class="form-control" [placeholder]="'loginPassword2' | t" [value]="next()" (input)="next.set(val($event))" /></div>
                      <div class="form-group col-md-4"><button class="btn btn-primary" type="submit" [disabled]="busy()">{{ 'save' | t }}</button></div>
                    </form>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class UsersComponent {
  protected store = inject(StoreService);
  private session = inject(SessionService);
  private confirm = inject(ConfirmService);
  private i18n = inject(I18nService);
  protected readonly creating = signal(false);
  protected readonly editing = signal<string | null>(null);
  protected readonly username = signal('');
  protected readonly displayName = signal('');
  protected readonly password = signal('');
  protected readonly current = signal('');
  protected readonly next = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  val(event: Event) { return (event.target as HTMLInputElement).value; }

  async create(event: Event) {
    event.preventDefault();
    this.error.set(null);
    if (this.password().length < 8) { this.error.set(this.i18n.t('loginShort')); return; }
    this.busy.set(true);
    try {
      await this.session.createUser(this.username(), this.displayName() || this.username(), this.password());
      this.creating.set(false);
      this.username.set('');
      this.displayName.set('');
      this.password.set('');
    } catch {
      this.error.set(this.i18n.t('loginBad'));
    } finally {
      this.busy.set(false);
    }
  }

  async change(userId: string, event: Event) {
    event.preventDefault();
    this.error.set(null);
    if (this.next().length < 8) { this.error.set(this.i18n.t('loginShort')); return; }
    this.busy.set(true);
    try {
      await this.session.changePassword(userId, this.current(), this.next());
      this.editing.set(null);
      this.current.set('');
      this.next.set('');
    } catch {
      this.error.set(this.i18n.t('loginBad'));
    } finally {
      this.busy.set(false);
    }
  }

  async remove(userId: string, name: string) {
    const ok = await this.confirm.ask(this.i18n.t('confirmTitle'), this.i18n.t('userDeleteConfirm', { name }), this.i18n.t('yesDelete'), this.i18n.t('cancel'));
    if (!ok) return;
    this.error.set(null);
    try { await this.session.removeUser(userId); }
    catch { this.error.set(this.i18n.t('loginBad')); }
  }
}
