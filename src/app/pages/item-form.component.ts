import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { I18nService } from '../core/i18n.service';
import { StoreService } from '../core/store.service';
import { ToastService } from '../core/toast.service';
import { Person, SectionItem, SectionSchema } from '../core/models';
import { groupFor, touchAll } from '../core/form-utils';
import { DynamicFormComponent } from '../shared/dynamic-form.component';
import { PageHeaderComponent } from '../shared/page-header.component';
import { LocPipe, TPipe } from '../shared/pipes';
import { applyServerErrors } from './server-errors';

/** Create (/people/:id/:section/new) or edit (/people/:id/:section/:itemId) one item of a section. */
@Component({
  selector: 'app-item-form',
  imports: [ReactiveFormsModule, RouterLink, DynamicFormComponent, PageHeaderComponent, TPipe, LocPipe],
  template: `
    @if (section(); as s) {
      <app-page-header [title]="(s.label | loc) + ' · ' + ((isNew() ? 'newItem' : 'editItem') | t)"
        [crumbs]="[{ label: 'home' | t, link: '/dashboard' }, { label: 'people' | t, link: '/people' }, { label: person()!.profile.fullName, link: ['/people', person()!.id] }, { label: s.label | loc }, { label: (isNew() ? 'newItem' : 'editItem') | t }]" />
      <form [formGroup]="form()!" (ngSubmit)="save()" novalidate>
        <div class="card shadow mb-4">
          <div class="card-header py-3 d-flex justify-content-between align-items-center">
            <h6 class="m-0 font-weight-bold text-primary"><i class="bi {{ s.icon }} mr-2 text-primary"></i>{{ s.itemLabel | loc }}</h6>
            <div class="form-inline">
              <label class="small text-gray-600 mr-2" for="order">{{ 'position' | t }}</label>
              <input id="order" type="number" min="1" class="form-control form-control-sm" style="width: 80px" [formControl]="order" />
            </div>
          </div>
          <div class="card-body">
            <app-dynamic-form [schemaFields]="s.fields" [form]="form()!" />
            @if (formError()) { <div class="alert alert-danger">{{ formError() }}</div> }
          </div>
          <div class="card-footer text-right">
            <a class="btn btn-light mr-2" [routerLink]="['/people', person()!.id]" [fragment]="s.key">{{ 'cancel' | t }}</a>
            <button type="submit" class="btn btn-primary" [disabled]="saving()"><i class="bi bi-save mr-1"></i>{{ (saving() ? 'saving' : 'save') | t }}</button>
          </div>
        </div>
      </form>
    } @else if (notFound()) {
      <div class="alert alert-warning">{{ 'notFound' | t }}</div>
    }
  `,
})
export class ItemFormComponent implements OnInit {
  readonly id = input.required<string>();
  readonly section$ = input.required<string>({ alias: 'section' });
  readonly itemId = input<string>();

  private store = inject(StoreService);
  private api = inject(ApiService);
  private i18n = inject(I18nService);
  private toast = inject(ToastService);
  private router = inject(Router);

  protected readonly section = signal<SectionSchema | null>(null);
  protected readonly person = signal<Person | null>(null);
  protected readonly form = signal<FormGroup | null>(null);
  protected readonly order = new FormControl<number | null>(null, [Validators.min(1)]);
  protected readonly saving = signal(false);
  protected readonly notFound = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected isNew() { return !this.itemId(); }

  async ngOnInit() {
    const doc = await this.store.ready();
    if (!doc) return;
    const person = this.store.person(this.id());
    const schema = doc.schema.sections[this.section$()];
    const items = this.store.items(person, this.section$());
    const item: SectionItem | undefined = this.itemId() ? items.find((i) => i.id === this.itemId()) : undefined;
    if (!person || !schema || (this.itemId() && !item)) { this.notFound.set(true); return; }
    this.person.set(person);
    this.order.setValue(item ? item.order : items.length + 1);
    this.form.set(groupFor(schema.fields, item ?? {}));
    this.section.set(schema);
  }

  async save() {
    const f = this.form()!;
    const s = this.section()!;
    this.formError.set(null);
    touchAll(f);
    if (f.invalid) { this.formError.set(this.i18n.t('formInvalid')); return; }
    this.saving.set(true);
    try {
      const body = { ...f.getRawValue(), order: this.order.value ? Number(this.order.value) : undefined };
      if (this.isNew()) await this.api.createItem(this.id(), s.key, body);
      else await this.api.updateItem(this.id(), s.key, this.itemId()!, body);
      await this.store.load();
      this.toast.show(this.i18n.t(this.isNew() ? 'created' : 'saved'));
      this.router.navigate(['/people', this.id()], { fragment: s.key });
    } catch (e: any) {
      const rest = applyServerErrors(f, e?.error?.errors, s.key);
      this.formError.set(`${this.i18n.t('serverError')} ${rest.join(' ') || e?.error?.message || e?.message}`);
    } finally {
      this.saving.set(false);
    }
  }
}
