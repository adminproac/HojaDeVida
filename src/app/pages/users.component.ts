import { Component, inject, signal } from '@angular/core';
import { getApiSessionToken } from '../core/auth.interceptor';
import { environment } from '../../environments/environment';
import { PageHeaderComponent } from '../shared/page-header.component';
import { TPipe } from '../shared/pipes';

interface AppUser { id: string; username: string; displayName: string; role: string; active: boolean; }

@Component({
  selector: 'app-users',
  imports: [PageHeaderComponent, TPipe],
  template: `
    <app-page-header [title]="'users' | t" [crumbs]="[{ label: 'home' | t, link: '/dashboard' }, { label: 'users' | t }]" />
    @if (error()) { <div class="alert alert-danger" role="alert">{{ error() }}</div> }
    <div class="card shadow mb-4">
      <div class="card-header py-3"><h6 class="m-0 font-weight-bold text-primary">{{ 'userNew' | t }}</h6></div>
      <form class="card-body" (submit)="create($event)">
        <div class="form-row">
          <div class="form-group col-md-3"><label>{{ 'loginUser' | t }}</label><input class="form-control" [value]="username()" (input)="username.set(val($event))" /></div>
          <div class="form-group col-md-3"><label>{{ 'loginDisplayName' | t }}</label><input class="form-control" [value]="displayName()" (input)="displayName.set(val($event))" /></div>
          <div class="form-group col-md-3"><label>{{ 'loginPassword' | t }}</label><input type="password" class="form-control" [value]="password()" (input)="password.set(val($event))" /></div>
          <div class="form-group col-md-3"><label>{{ 'userRole' | t }}</label>
            <select class="form-control" [value]="role()" (change)="role.set(val($event))">
              <option value="editor">editor</option>
              <option value="admin">admin</option>
            </select>
          </div>
        </div>
        <button class="btn btn-primary" type="submit" [disabled]="busy()">{{ 'save' | t }}</button>
      </form>
    </div>
    <div class="card shadow">
      <div class="table-responsive">
        <table class="table mb-0">
          <thead><tr><th>{{ 'loginUser' | t }}</th><th>{{ 'loginDisplayName' | t }}</th><th>{{ 'userRole' | t }}</th><th></th></tr></thead>
          <tbody>
            @for (user of users(); track user.id) {
              <tr>
                <td>{{ user.username }}</td>
                <td>{{ user.displayName }}</td>
                <td>{{ user.role }}</td>
                <td class="text-right">
                  <button type="button" class="btn btn-sm btn-light" (click)="editing.set(editing() === user.id ? '' : user.id)">{{ 'userPassword' | t }}</button>
                  <button type="button" class="btn btn-sm btn-danger ml-1" [disabled]="!user.active" (click)="deactivate(user)">{{ 'userDeactivate' | t }}</button>
                </td>
              </tr>
              @if (editing() === user.id) {
                <tr>
                  <td colspan="4">
                    <form class="form-inline" (submit)="changePassword(user.id, $event)">
                      <input type="password" class="form-control mr-2" [value]="nextPassword()" (input)="nextPassword.set(val($event))" />
                      <button class="btn btn-primary" type="submit">{{ 'save' | t }}</button>
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
  protected readonly users = signal<AppUser[]>([]);
  protected readonly username = signal('');
  protected readonly displayName = signal('');
  protected readonly password = signal('');
  protected readonly nextPassword = signal('');
  protected readonly role = signal('editor');
  protected readonly editing = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  constructor() { void this.reload(); }

  val(event: Event) { return (event.target as HTMLInputElement | HTMLSelectElement).value; }

  async create(event: Event) {
    event.preventDefault();
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.send('POST', '/api/users', { username: this.username(), displayName: this.displayName(), password: this.password(), role: this.role() });
      this.username.set(''); this.displayName.set(''); this.password.set('');
      await this.reload();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Error');
    } finally { this.busy.set(false); }
  }

  async changePassword(id: string, event: Event) {
    event.preventDefault();
    this.error.set(null);
    try {
      await this.send('PUT', `/api/users/${encodeURIComponent(id)}/password`, { password: this.nextPassword() });
      this.nextPassword.set('');
      this.editing.set('');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Error');
    }
  }

  async deactivate(user: AppUser) {
    this.error.set(null);
    try {
      await this.send('POST', `/api/users/${encodeURIComponent(user.id)}/active`, { active: false });
      await this.reload();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Error');
    }
  }

  private async reload() {
    this.users.set(await this.send<AppUser[]>('GET', '/api/users'));
  }

  private async send<T>(method: string, path: string, body?: unknown): Promise<T> {
    const base = environment.oauthProxyUrl.trim().replace(/\/$/, '');
    const headers: Record<string, string> = { Accept: 'application/json', Authorization: `Bearer ${getApiSessionToken() || ''}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof payload?.message === 'string' ? payload.message : `${res.status}`);
    return payload as T;
  }
}
