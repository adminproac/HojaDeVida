import { Injectable, computed, inject, signal } from '@angular/core';
import { DataService } from './data.service';
import { errorText } from './data-error';
import { GithubService } from './github.service';
import { Person, ResumeDocument, SectionSchema } from './models';
import { RESUME_SCHEMA } from './resume-schema';

/** In-memory copy of the JSON document. Saves go to the local API or to a GitHub commit. */
@Injectable({ providedIn: 'root' })
export class StoreService {
  private data = inject(DataService);
  private github = inject(GithubService);

  readonly doc = signal<ResumeDocument | null>(null);
  readonly loading = signal(false);
  readonly apiError = signal(false);
  readonly loadError = signal<string | null>(null);
  /** Mutation errors stay here until dismissed or the next successful reload. */
  readonly actionError = signal<string | null>(null);
  readonly mode = this.data.mode;
  readonly readOnly = computed(() => this.mode() === 'github' && !this.github.hasToken());

  readonly schema = computed(() => RESUME_SCHEMA);
  readonly people = computed<Person[]>(() => this.doc()?.people ?? []);
  readonly sectionList = computed<SectionSchema[]>(() => {
    const s = this.schema();
    if (!s) return [];
    return (s.person.sections || Object.keys(s.sections)).map((k) => s.sections[k]).filter(Boolean);
  });

  async load() {
    this.loading.set(true);
    try {
      await this.data.ensureMode();
      this.doc.set(await this.data.getData());
      this.apiError.set(false);
      this.loadError.set(null);
      this.actionError.set(null);
    } catch (e) {
      this.apiError.set(true);
      this.loadError.set(errorText(e));
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
