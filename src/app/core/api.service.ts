import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Person, Profile, ResumeDocument, SectionItem } from './models';

/** Calls the Node/Express API (proxied from /api to http://localhost:3000 in development). */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = '/api';

  getData() { return firstValueFrom(this.http.get<ResumeDocument>(`${this.base}/data`)); }
  health() { return firstValueFrom(this.http.get<{ ok: boolean; dataFile: string }>(`${this.base}/health`)); }

  createPerson(profile: Partial<Profile>) {
    return firstValueFrom(this.http.post<Person>(`${this.base}/people`, { profile }));
  }
  importPerson(body: Record<string, unknown>) {
    return firstValueFrom(this.http.post<Person>(`${this.base}/people/import`, body));
  }
  updateProfile(personId: string, profile: Partial<Profile>) {
    return firstValueFrom(this.http.put<Person>(`${this.base}/people/${personId}/profile`, { profile }));
  }
  deletePerson(personId: string) {
    return firstValueFrom(this.http.delete<void>(`${this.base}/people/${personId}`));
  }

  createItem(personId: string, section: string, item: Partial<SectionItem>) {
    return firstValueFrom(this.http.post<SectionItem>(`${this.base}/people/${personId}/${section}`, item));
  }
  updateItem(personId: string, section: string, itemId: string, item: Partial<SectionItem>) {
    return firstValueFrom(this.http.put<SectionItem>(`${this.base}/people/${personId}/${section}/${itemId}`, item));
  }
  moveItem(personId: string, section: string, itemId: string, direction: 'up' | 'down') {
    return firstValueFrom(this.http.post<SectionItem[]>(`${this.base}/people/${personId}/${section}/${itemId}/move`, { direction }));
  }
  deleteItem(personId: string, section: string, itemId: string) {
    return firstValueFrom(this.http.delete<void>(`${this.base}/people/${personId}/${section}/${itemId}`));
  }

  backup() { return firstValueFrom(this.http.post<{ file: string }>(`${this.base}/backup`, {})); }
}
