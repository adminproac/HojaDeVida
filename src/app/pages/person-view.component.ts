import { Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { ApiService } from '../core/api.service';
import { ConfirmService } from '../core/confirm.service';
import { I18nService } from '../core/i18n.service';
import { StoreService } from '../core/store.service';
import { ToastService } from '../core/toast.service';
import { FieldSchema, SectionItem, SectionSchema } from '../core/models';
import { PageHeaderComponent } from '../shared/page-header.component';
import { LocPipe, TPipe } from '../shared/pipes';

/** "Consultar": read-only résumé of one person with edit/delete/add/move actions per section. */
@Component({
  selector: 'app-person-view',
  imports: [RouterLink, NgTemplateOutlet, PageHeaderComponent, TPipe, LocPipe],
  templateUrl: './person-view.component.html',
})
export class PersonViewComponent {
  readonly id = input.required<string>();
  protected i18n = inject(I18nService);
  protected store = inject(StoreService);
  private api = inject(ApiService);
  private confirm = inject(ConfirmService);
  private toast = inject(ToastService);
  private router = inject(Router);

  protected readonly person = computed(() => this.store.person(this.id()));
  protected readonly sections = computed(() => this.store.sectionList());

  items(key: string) { return this.store.items(this.person(), key); }

  initials(name: string) {
    return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  }

  dateRange(it: SectionItem) {
    if (it['dateLabel'] && !it['startDate']) return this.i18n.loc(it['dateLabel']);
    const start = this.i18n.month(it['startDate']);
    const end = it['isCurrent'] ? this.i18n.t('present') : this.i18n.month(it['endDate']);
    const range = [start, end].filter(Boolean).join(' – ');
    return range || this.i18n.loc(it['dateLabel']);
  }

  /** Generic display for sections without a dedicated layout. */
  genericFields(s: SectionSchema): FieldSchema[] {
    return s.fields.filter((f) => !f.system && f.type !== 'list' && f.type !== 'boolean');
  }
  listFields(s: SectionSchema): FieldSchema[] {
    return s.fields.filter((f) => f.type === 'list');
  }
  childText(f: FieldSchema, child: any) {
    const first = (f.itemFields ?? []).find((x) => !x.system);
    return first ? this.i18n.loc(child[first.key]) : '';
  }
  display(value: any) { return this.i18n.loc(value); }

  async move(s: SectionSchema, it: SectionItem, direction: 'up' | 'down') {
    try {
      await this.api.moveItem(this.id(), s.key, it.id, direction);
      await this.store.load();
    } catch (e: any) {
      this.toast.show(`${this.i18n.t('serverError')} ${e?.error?.message ?? e?.message}`, 'danger');
    }
  }

  async removeItem(s: SectionSchema, it: SectionItem) {
    const ok = await this.confirm.ask(this.i18n.t('confirmTitle'), this.i18n.t('confirmDeleteItem', { section: this.i18n.loc(s.label) }),
      this.i18n.t('yesDelete'), this.i18n.t('cancel'));
    if (!ok) return;
    try {
      await this.api.deleteItem(this.id(), s.key, it.id);
      await this.store.load();
      this.toast.show(this.i18n.t('deleted'));
    } catch (e: any) {
      this.toast.show(`${this.i18n.t('serverError')} ${e?.error?.message ?? e?.message}`, 'danger');
    }
  }

  async removePerson() {
    const p = this.person();
    if (!p) return;
    const ok = await this.confirm.ask(this.i18n.t('confirmTitle'), this.i18n.t('confirmDeletePerson', { name: p.profile.fullName }),
      this.i18n.t('yesDelete'), this.i18n.t('cancel'));
    if (!ok) return;
    try {
      await this.api.deletePerson(p.id);
      await this.store.load();
      this.toast.show(this.i18n.t('deleted'));
      this.router.navigate(['/people']);
    } catch (e: any) {
      this.toast.show(`${this.i18n.t('serverError')} ${e?.error?.message ?? e?.message}`, 'danger');
    }
  }

  print() { window.print(); }
}
