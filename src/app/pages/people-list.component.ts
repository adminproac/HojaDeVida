import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { ConfirmService } from '../core/confirm.service';
import { I18nService } from '../core/i18n.service';
import { StoreService } from '../core/store.service';
import { ToastService } from '../core/toast.service';
import { Person } from '../core/models';
import { PageHeaderComponent } from '../shared/page-header.component';
import { LocPipe, TPipe } from '../shared/pipes';

@Component({
  selector: 'app-people-list',
  imports: [RouterLink, PageHeaderComponent, TPipe, LocPipe],
  templateUrl: './people-list.component.html',
})
export class PeopleListComponent {
  protected i18n = inject(I18nService);
  protected store = inject(StoreService);
  private api = inject(ApiService);
  private confirm = inject(ConfirmService);
  private toast = inject(ToastService);

  protected readonly query = signal('');
  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const people = this.store.people();
    if (!q) return people;
    return people.filter((p) => JSON.stringify(p.profile).toLowerCase().includes(q));
  });

  initials(name: string) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  }

  async remove(p: Person) {
    const ok = await this.confirm.ask(this.i18n.t('confirmTitle'), this.i18n.t('confirmDeletePerson', { name: p.profile.fullName }),
      this.i18n.t('yesDelete'), this.i18n.t('cancel'));
    if (!ok) return;
    try {
      await this.api.deletePerson(p.id);
      await this.store.load();
      this.toast.show(this.i18n.t('deleted'));
    } catch (e: any) {
      this.toast.show(`${this.i18n.t('serverError')} ${e?.error?.message ?? e?.message}`, 'danger');
    }
  }
}
