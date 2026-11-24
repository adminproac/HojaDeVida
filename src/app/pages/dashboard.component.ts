import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nService } from '../core/i18n.service';
import { StoreService } from '../core/store.service';
import { Person } from '../core/models';
import { PageHeaderComponent } from '../shared/page-header.component';
import { LocPipe, TPipe } from '../shared/pipes';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, PageHeaderComponent, TPipe, LocPipe],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  protected i18n = inject(I18nService);
  protected store = inject(StoreService);

  private count(p: Person, key: string) { return ((p[key] as any[]) ?? []).length; }
  protected skillCount(p: Person) {
    return ((p['skills'] as any[]) ?? []).reduce((n, g) => n + (g.items?.length ?? 0), 0);
  }
  protected jobs(p: Person) { return this.count(p, 'experience') + this.count(p, 'otherExperience'); }
  protected countOf(p: Person, key: string) { return this.count(p, key); }

  protected readonly stats = computed(() => {
    const people = this.store.people();
    const sum = (fn: (p: Person) => number) => people.reduce((n, p) => n + fn(p), 0);
    return [
      { key: 'totalPeople', value: people.length, icon: 'fa-users', color: 'primary', link: '/people' },
      { key: 'totalJobs', value: sum((p) => this.jobs(p)), icon: 'fa-briefcase', color: 'success', link: '/people' },
      { key: 'totalSkills', value: sum((p) => this.skillCount(p)), icon: 'fa-tools', color: 'warning', link: '/people' },
      { key: 'totalStudies', value: sum((p) => this.count(p, 'education')), icon: 'fa-graduation-cap', color: 'info', link: '/people' },
    ];
  });

  protected readonly recent = computed(() => [...this.store.people()].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 5));

  /** Skills per category across all people (for the bar widget). */
  protected readonly skillBars = computed(() => {
    const map = new Map<string, { label: any; value: number }>();
    for (const p of this.store.people()) {
      for (const g of (p['skills'] as any[]) ?? []) {
        const k = (g.category?.en || g.category?.es || '').toLowerCase();
        const cur = map.get(k) ?? { label: g.category, value: 0 };
        cur.value += g.items?.length ?? 0;
        map.set(k, cur);
      }
    }
    const list = [...map.values()].sort((a, b) => b.value - a.value);
    const max = Math.max(1, ...list.map((x) => x.value));
    const colors = ['primary', 'success', 'warning', 'danger', 'info', 'secondary'];
    return list.map((x, i) => ({ ...x, pct: Math.round((x.value / max) * 100), color: colors[i % colors.length] }));
  });
}
