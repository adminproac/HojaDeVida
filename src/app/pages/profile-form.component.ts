import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { I18nService } from '../core/i18n.service';
import { StoreService } from '../core/store.service';
import { ToastService } from '../core/toast.service';
import { FieldSchema, Person } from '../core/models';
import { groupFor, touchAll } from '../core/form-utils';
import { DynamicFormComponent } from '../shared/dynamic-form.component';
import { PageHeaderComponent } from '../shared/page-header.component';
import { LocPipe, TPipe } from '../shared/pipes';
import { applyServerErrors } from './server-errors';

/** Create a new person (/people/new) or edit a person's profile (/people/:id/edit). */
@Component({
  selector: 'app-profile-form',
  imports: [ReactiveFormsModule, RouterLink, DynamicFormComponent, PageHeaderComponent, TPipe, LocPipe],
  template: `
    <app-page-header [title]="(isNew() ? 'newPerson' : 'editProfile') | t"
      [crumbs]="[{ label: 'home' | t, link: '/dashboard' }, { label: 'people' | t, link: '/people' }, { label: person()?.profile?.fullName || ('newPerson' | t), link: person() ? ['/people', person()!.id] : undefined }, { label: (isNew() ? 'newPerson' : 'editProfile') | t }]" />
    @if (form(); as f) {
      <form [formGroup]="f" (ngSubmit)="save()" novalidate>
        <div class="card shadow mb-4">
          <div class="card-header py-3"><h6 class="m-0 font-weight-bold text-primary"><i class="bi bi-person-badge mr-2 text-primary"></i>{{ store.schema()?.profile?.label | loc }}</h6></div>
          <div class="card-body">
            <app-dynamic-form [schemaFields]="fields()" [form]="f" />
            @if (formError()) { <div class="alert alert-danger">{{ formError() }}</div> }
          </div>
          <div class="card-footer text-right">
            <a class="btn btn-light mr-2" [routerLink]="person() ? ['/people', person()!.id] : ['/people']">{{ 'cancel' | t }}</a>
            <button type="submit" class="btn btn-primary" [disabled]="saving()"><i class="bi bi-save mr-1"></i>{{ (saving() ? 'saving' : 'save') | t }}</button>
          </div>
        </div>
      </form>
    } @else if (notFound()) {
      <div class="alert alert-warning">{{ 'notFound' | t }}</div>
    }
  `,
})
export class ProfileFormComponent implements OnInit {
  readonly id = input<string>();
  protected store = inject(StoreService);
  private api = inject(ApiService);
  private i18n = inject(I18nService);
  private toast = inject(ToastService);
  private router = inject(Router);

  protected readonly form = signal<FormGroup | null>(null);
  protected readonly fields = signal<FieldSchema[]>([]);
  protected readonly person = signal<Person | null>(null);
  protected readonly saving = signal(false);
  protected readonly notFound = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected isNew() { return !this.id(); }

  async ngOnInit() {
    const doc = await this.store.ready();
    if (!doc) return;
    const person = this.id() ? this.store.person(this.id()) : null;
    if (this.id() && !person) { this.notFound.set(true); return; }
    this.person.set(person);
    this.fields.set(doc.schema.profile.fields);
    this.form.set(groupFor(doc.schema.profile.fields, person?.profile ?? {}));
  }

  async save() {
    const f = this.form()!;
    this.formError.set(null);
    touchAll(f);
    if (f.invalid) { this.formError.set(this.i18n.t('formInvalid')); return; }
    this.saving.set(true);
    try {
      const value = f.getRawValue();
      const saved = this.isNew() ? await this.api.createPerson(value) : await this.api.updateProfile(this.id()!, value);
      await this.store.load();
      this.toast.show(this.i18n.t(this.isNew() ? 'created' : 'saved'));
      this.router.navigate(['/people', saved.id]);
    } catch (e: any) {
      const rest = applyServerErrors(f, e?.error?.errors, 'profile');
      this.formError.set(`${this.i18n.t('serverError')} ${rest.join(' ') || e?.error?.message || e?.message}`);
    } finally {
      this.saving.set(false);
    }
  }
}
