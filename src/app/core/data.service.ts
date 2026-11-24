import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { createItem, createPerson, deleteItem, deletePerson, moveItem, updateItem, updateProfile } from './document-mutations';
import { GithubService } from './github.service';
import { Profile, ResumeDocument, SectionItem } from './models';

export type StorageMode = 'detecting' | 'api' | 'github';

/**
 * Local Express API when /api/health answers (localhost, Codespaces, npm start).
 * Otherwise GitHub mode: read the public JSON and commit edits with the user's token.
 */
@Injectable({ providedIn: 'root' })
export class DataService {
  private api = inject(ApiService);
  private github = inject(GithubService);

  readonly mode = signal<StorageMode>('detecting');
  private detecting: Promise<'api' | 'github'> | null = null;

  ensureMode(): Promise<'api' | 'github'> {
    const current = this.mode();
    if (current !== 'detecting') return Promise.resolve(current);
    if (!this.detecting) {
      this.detecting = this.probeApi().then((ok) => {
        const mode = ok ? 'api' : 'github';
        this.mode.set(mode);
        return mode;
      });
    }
    return this.detecting;
  }

  async getData(): Promise<ResumeDocument> {
    return (await this.ensureMode()) === 'api' ? this.api.getData() : this.github.getData();
  }

  async createPerson(profile: Partial<Profile>) {
    if ((await this.ensureMode()) === 'api') return this.api.createPerson(profile);
    return this.github.update((doc) => createPerson(doc, profile), 'Agregar persona en Data/resume-data.json');
  }

  async updateProfile(personId: string, profile: Partial<Profile>) {
    if ((await this.ensureMode()) === 'api') return this.api.updateProfile(personId, profile);
    return this.github.update((doc) => updateProfile(doc, personId, profile), 'Actualizar perfil en Data/resume-data.json');
  }

  async deletePerson(personId: string) {
    if ((await this.ensureMode()) === 'api') return this.api.deletePerson(personId);
    return this.github.update((doc) => deletePerson(doc, personId), 'Eliminar persona en Data/resume-data.json');
  }

  async createItem(personId: string, section: string, item: Partial<SectionItem>) {
    if ((await this.ensureMode()) === 'api') return this.api.createItem(personId, section, item);
    return this.github.update((doc) => createItem(doc, personId, section, item), 'Agregar registro en Data/resume-data.json');
  }

  async updateItem(personId: string, section: string, itemId: string, item: Partial<SectionItem>) {
    if ((await this.ensureMode()) === 'api') return this.api.updateItem(personId, section, itemId, item);
    return this.github.update((doc) => updateItem(doc, personId, section, itemId, item), 'Actualizar registro en Data/resume-data.json');
  }

  async moveItem(personId: string, section: string, itemId: string, direction: 'up' | 'down') {
    if ((await this.ensureMode()) === 'api') return this.api.moveItem(personId, section, itemId, direction);
    return this.github.update((doc) => moveItem(doc, personId, section, itemId, direction), 'Reordenar registro en Data/resume-data.json');
  }

  async deleteItem(personId: string, section: string, itemId: string) {
    if ((await this.ensureMode()) === 'api') return this.api.deleteItem(personId, section, itemId);
    return this.github.update((doc) => deleteItem(doc, personId, section, itemId), 'Eliminar registro en Data/resume-data.json');
  }

  async backup(): Promise<{ file: string }> {
    if ((await this.ensureMode()) === 'api') return this.api.backup();
    const doc = await this.github.getData();
    return { file: downloadJson(doc) };
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
