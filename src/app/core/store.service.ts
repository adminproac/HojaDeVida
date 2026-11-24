import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { Person, ResumeDocument, SectionSchema } from './models';

/** In-memory copy of the JSON document; every change goes through the API and then reloads. */
@Injectable({ providedIn: 'root' })
export class StoreService {
  private api = inject(ApiService);

  readonly doc = signal<ResumeDocument | null>(null);
  readonly loading = signal(false);
  readonly apiError = signal(false);

  readonly schema = computed(() => this.doc()?.schema ?? null);
  readonly people = computed<Person[]>(() => this.doc()?.people ?? []);
  readonly sectionList = computed<SectionSchema[]>(() => {
    const s = this.schema();
    if (!s) return [];
    return (s.person.sections || Object.keys(s.sections)).map((k) => s.sections[k]).filter(Boolean);
  });

  async load() {
    this.loading.set(true);
    try {
      this.doc.set(await this.api.getData());
      this.apiError.set(false);
    } catch {
      this.apiError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** Waits for the first load (used by pages opened directly by URL). */
  async ready() {
    if (!this.doc() && !this.loading()) await this.load();
    while (this.loading()) await new Promise((r) => setTimeout(r, 30));
    return this.doc();
  }

  person(id: string | null | undefined) {
    return this.people().find((p) => p.id === id) ?? null;
  }

  items(person: Person | null, section: string) {
    return [...((person?.[section] as any[]) ?? [])].sort((a, b) => a.order - b.order);
  }
}
