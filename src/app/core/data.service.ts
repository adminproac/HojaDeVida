import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { ApiService } from './api.service';
import { createItem, createPerson, deleteItem, deletePerson, importPerson, moveItem, updateItem, updateProfile } from './document-mutations';
import { DataError } from './data-error';
import { GithubService } from './github.service';
import { Person, Profile, ResumeDocument, SectionItem } from './models';

export type StorageMode = 'detecting' | 'api' | 'd1';

/**
 * Local Express API when /api/health answers.
 * On GitHub Pages, reads and writes go to the Cloudflare Worker (D1).
 */
@Injectable({ providedIn: 'root' })
export class DataService {
  private api = inject(ApiService);
  private github = inject(GithubService);

  readonly mode = signal<StorageMode>('detecting');
  private detecting: Promise<'api' | 'd1'> | null = null;

  ensureMode(): Promise<'api' | 'd1'> {
    const current = this.mode();
    if (current !== 'detecting') return Promise.resolve(current);
    if (!this.detecting) {
      this.detecting = this.probeApi().then((ok) => {
        const mode = ok ? 'api' : 'd1';
        this.mode.set(mode);
        return mode;
      });
    }
    return this.detecting;
  }

  async getData(): Promise<ResumeDocument> {
    return (await this.ensureMode()) === 'api' ? this.api.getData() : this.d1<ResumeDocument>('GET', '/api/data');
  }

  async importPerson(body: Record<string, unknown>) {
    if ((await this.ensureMode()) === 'api') return this.api.importPerson(body);
    const doc = await this.d1<ResumeDocument>('GET', '/api/data');
    const person = importPerson(doc, body);
    const replaceId = typeof body['replaceId'] === 'string' ? body['replaceId'] : '';
    if (replaceId) await this.d1('PUT', `/api/people/${encodeURIComponent(person.id)}`, person);
    else await this.d1('POST', '/api/people', person);
    return person;
  }

  async createPerson(profile: Partial<Profile>) {
    if ((await this.ensureMode()) === 'api') return this.api.createPerson(profile);
    const doc = await this.d1<ResumeDocument>('GET', '/api/data');
    const person = createPerson(doc, profile);
    await this.d1('POST', '/api/people', person);
    return person;
  }

  async updateProfile(personId: string, profile: Partial<Profile>) {
    if ((await this.ensureMode()) === 'api') return this.api.updateProfile(personId, profile);
    const doc = await this.d1<ResumeDocument>('GET', '/api/data');
    const person = updateProfile(doc, personId, profile);
    await this.d1('PUT', `/api/people/${encodeURIComponent(personId)}`, person);
    return person;
  }

  async deletePerson(personId: string) {
    if ((await this.ensureMode()) === 'api') return this.api.deletePerson(personId);
    await this.d1<void>('DELETE', `/api/people/${encodeURIComponent(personId)}`);
  }

  async createItem(personId: string, section: string, item: Partial<SectionItem>) {
    if ((await this.ensureMode()) === 'api') return this.api.createItem(personId, section, item);
    return this.changePerson(personId, (doc) => createItem(doc, personId, section, item));
  }

  async updateItem(personId: string, section: string, itemId: string, item: Partial<SectionItem>) {
    if ((await this.ensureMode()) === 'api') return this.api.updateItem(personId, section, itemId, item);
    return this.changePerson(personId, (doc) => updateItem(doc, personId, section, itemId, item));
  }

  async moveItem(personId: string, section: string, itemId: string, direction: 'up' | 'down') {
    if ((await this.ensureMode()) === 'api') return this.api.moveItem(personId, section, itemId, direction);
    return this.changePerson(personId, (doc) => moveItem(doc, personId, section, itemId, direction));
  }

  async deleteItem(personId: string, section: string, itemId: string) {
    if ((await this.ensureMode()) === 'api') return this.api.deleteItem(personId, section, itemId);
    await this.changePerson(personId, (doc) => deleteItem(doc, personId, section, itemId));
  }

  async backup(): Promise<{ file: string }> {
    if ((await this.ensureMode()) === 'api') return this.api.backup();
    const doc = await this.d1<ResumeDocument>('GET', '/api/export');
    return { file: downloadJson(doc) };
  }

  private async changePerson<T>(personId: string, mutator: (doc: ResumeDocument) => T): Promise<T> {
    const doc = await this.d1<ResumeDocument>('GET', '/api/data');
    const result = mutator(doc);
    const person = (doc.people || []).find((item) => item.id === personId);
    if (!person) throw new DataError(404, '404 — No se encontró la persona');
    await this.d1('PUT', `/api/people/${encodeURIComponent(personId)}`, person);
    return result;
  }

  private d1Base() {
    const base = environment.oauthProxyUrl.trim().replace(/\/$/, '');
    if (!base || base.includes('<') || /subdominio/i.test(base)) {
      throw new DataError(503, '503 — Falta la URL del Worker (OAUTH_PROXY_URL).');
    }
    return base;
  }

  private async d1<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && method !== 'HEAD') {
      const token = this.github.token();
      if (!token) throw new DataError(401, '401 — Sesión requerida');
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${this.d1Base()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    if (res.status === 204) return undefined as T;
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = payload && typeof payload.message === 'string' ? payload.message : `${res.status}`;
      throw new DataError(res.status, message);
    }
    return payload as T;
  }

  private async probeApi(): Promise<boolean> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    try {
      const res = await fetch('/api/health', {
        headers: { Accept: 'application/json' },
        signal: ctrl.signal,
        cache: 'no-store',
      });
      if (!res.ok) return false;
      const type = res.headers.get('content-type') || '';
      if (!type.includes('json')) return false;
      const body = await res.json();
      return body?.ok === true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}

function downloadJson(doc: ResumeDocument): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const name = `resume-data-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.json`;
  const blob = new Blob([JSON.stringify(doc, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
  return name;
}
