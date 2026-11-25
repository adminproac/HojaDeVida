import { Component, inject, signal } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ConfirmService } from '../core/confirm.service';
import { DataService } from '../core/data.service';
import { apiFieldErrors, errorText } from '../core/data-error';
import { I18nService } from '../core/i18n.service';
import { ParseWarning, ParsedResume, parseResumeText } from '../core/pdf-resume-parser';
import { extractPdfText } from '../core/pdf-text';
import { StoreService } from '../core/store.service';
import { ToastService } from '../core/toast.service';
import { DataSchema, SectionSchema } from '../core/models';
import { groupFor, touchAll } from '../core/form-utils';
import { DynamicFormComponent } from '../shared/dynamic-form.component';
import { PageHeaderComponent } from '../shared/page-header.component';
import { LocPipe, TPipe } from '../shared/pipes';
import { applyServerErrors } from './server-errors';

interface SectionDraft {
  schema: SectionSchema;
  forms: FormGroup[];
}

@Component({
  selector: 'app-pdf-import',
  imports: [ReactiveFormsModule, RouterLink, DynamicFormComponent, PageHeaderComponent, TPipe, LocPipe],
  template: `
    <app-page-header [title]="'pdfImport' | t" [crumbs]="[{ label: 'home' | t, link: '/dashboard' }, { label: 'people' | t, link: '/people' }, { label: 'pdfImport' | t }]" />

    <div class="card shadow mb-4">
      <div class="card-header py-3"><h6 class="m-0 font-weight-bold text-primary"><i class="fas fa-file-pdf mr-2"></i>{{ 'pdfImport' | t }}</h6></div>
      <div class="card-body">
        <p class="text-gray-700">{{ 'pdfImportHelp' | t }}</p>
        <p class="text-gray-600 small mb-3">{{ 'pdfImportLimits' | t }}</p>
        @if (store.readOnly()) {
          <div class="alert alert-warning" role="status">{{ 'githubReadOnly' | t }}</div>
        }
        <label class="btn btn-primary mb-0" [class.disabled]="parsing()">
          <i class="fas fa-upload mr-1"></i>{{ 'pdfChoose' | t }}
          <input type="file" accept="application/pdf,.pdf" class="d-none" (change)="onFile($event)" [disabled]="parsing()" />
        </label>
        @if (parsing()) { <span class="ml-3 text-primary"><span class="spinner-border spinner-border-sm"></span> {{ 'pdfParsing' | t }}</span> }
        @if (fileName()) { <span class="ml-3 text-gray-600 small">{{ fileName() }}</span> }
        @if (error()) { <div class="alert alert-danger mt-3 mb-0" role="alert">{{ error() }}</div> }
      </div>
    </div>

    @if (profileForm(); as profile) {
      <div class="card shadow mb-4">
        <div class="card-header py-3 d-flex justify-content-between align-items-center">
          <h6 class="m-0 font-weight-bold text-primary">{{ 'pdfPreview' | t }}</h6>
          <span class="badge badge-info">{{ language() === 'es' ? 'ES' : 'EN' }}</span>
        </div>
        <div class="card-body">
          @if (warnings().length) {
            <div class="alert alert-warning" role="status">
              <strong>{{ 'pdfReview' | t }}</strong>
              <ul class="mb-0 mt-2">
                @for (w of warnings(); track $index) { <li>{{ warningText(w) }}</li> }
              </ul>
            </div>
          }
          <h6 class="font-weight-bold text-primary">{{ schema()?.profile?.label | loc }}</h6>
          <form [formGroup]="profile" novalidate>
            <app-dynamic-form [schemaFields]="schema()!.profile.fields" [form]="profile" />
          </form>

          @for (section of sections(); track section.schema.key) {
            <hr />
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h6 class="font-weight-bold text-primary mb-0"><i class="bi {{ section.schema.icon }} mr-2"></i>{{ section.schema.label | loc }}</h6>
              <button type="button" class="btn btn-sm btn-light" (click)="addItem(section)">{{ 'add' | t }}</button>
            </div>
            @for (form of section.forms; track $index) {
              <div class="border rounded p-3 mb-3 bg-light">
                <div class="text-right mb-2">
                  <button type="button" class="btn btn-sm btn-outline-danger" (click)="removeItem(section, $index)">{{ 'remove' | t }}</button>
                </div>
                <form [formGroup]="form" novalidate>
                  <app-dynamic-form [schemaFields]="section.schema.fields" [form]="form" />
                </form>
              </div>
            } @empty {
              <p class="text-gray-600">{{ 'noItems' | t }}</p>
            }
          }

          <div class="form-group mt-3">
            <label for="pdf-target">{{ 'pdfTarget' | t }}</label>
            <select id="pdf-target" class="form-control" [value]="replaceId() ?? ''" (change)="replaceId.set($any($event.target).value || null)">
              <option value="">{{ 'pdfAsNew' | t }}</option>
              @for (p of store.people(); track p.id) {
                <option [value]="p.id">{{ p.profile.fullName }}</option>
              }
            </select>
            <small class="form-text text-gray-600">{{ 'pdfTargetHelp' | t }}</small>
          </div>
          @if (saveError()) { <div class="alert alert-danger" role="alert">{{ saveError() }}</div> }
        </div>
        <div class="card-footer text-right">
          <a class="btn btn-light mr-2" routerLink="/people">{{ 'cancel' | t }}</a>
          <button type="button" class="btn btn-primary" [disabled]="saving() || store.readOnly()" (click)="save()">
            <i class="bi bi-save mr-1"></i>{{ (saving() ? 'saving' : 'pdfSave') | t }}
          </button>
        </div>
      </div>
    }
  `,
})
export class PdfImportComponent {
  protected store = inject(StoreService);
  private data = inject(DataService);
  private i18n = inject(I18nService);
  private confirm = inject(ConfirmService);
  private toast = inject(ToastService);
  private router = inject(Router);

  protected readonly parsing = signal(false);
  protected readonly saving = signal(false);
  protected readonly fileName = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);
  protected readonly warnings = signal<ParseWarning[]>([]);
  protected readonly language = signal<'en' | 'es'>('es');
  protected readonly schema = signal<DataSchema | null>(null);
  protected readonly profileForm = signal<FormGroup | null>(null);
  protected readonly sections = signal<SectionDraft[]>([]);
  protected readonly replaceId = signal<string | null>(null);

  async onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.error.set(null);
    this.saveError.set(null);
    if (file.size > 8 * 1024 * 1024) {
      this.error.set(this.i18n.t('pdfTooBig'));
      return;
    }
    this.parsing.set(true);
    this.fileName.set(file.name);
    try {
      const doc = await this.store.ready();
      if (!doc) {
        this.error.set(this.i18n.t('pdfNoSchema'));
        return;
      }
      const text = await extractPdfText(await file.arrayBuffer());
      if (!text.trim()) {
        this.error.set(this.i18n.t('pdfNoText'));
        this.profileForm.set(null);
        return;
      }
      this.showParsed(parseResumeText(text, doc.schema), doc.schema);
    } catch (e) {
      this.profileForm.set(null);
      this.error.set(`${this.i18n.t('pdfReadError')} ${errorText(e)}`);
    } finally {
      this.parsing.set(false);
    }
  }

  warningText(warning: ParseWarning): string {
    return this.i18n.t(`pdfWarn_${warning.code}`, { detail: warning.detail ?? '' });
  }

  addItem(section: SectionDraft) {
    section.forms = [...section.forms, groupFor(section.schema.fields, {})];
    this.sections.set([...this.sections()]);
  }

  removeItem(section: SectionDraft, index: number) {
    section.forms = section.forms.filter((_, itemIndex) => itemIndex !== index);
    this.sections.set([...this.sections()]);
  }

  async save() {
    this.saveError.set(null);
    const profile = this.profileForm();
    const drafts = this.sections();
    if (!profile) return;
    if (this.store.readOnly()) {
      this.saveError.set(this.i18n.t('githubReadOnly'));
      return;
    }
    touchAll(profile);
    for (const section of drafts) for (const form of section.forms) touchAll(form);
    if (profile.invalid || drafts.some((section) => section.forms.some((form) => form.invalid))) {
      this.saveError.set(this.i18n.t('formInvalid'));
      return;
    }
    const replaceId = this.replaceId();
    if (replaceId) {
      const person = this.store.person(replaceId);
      const ok = await this.confirm.ask(
        this.i18n.t('confirmTitle'),
        this.i18n.t('pdfConfirmReplace', { name: person?.profile.fullName || replaceId }),
        this.i18n.t('pdfReplaceYes'),
        this.i18n.t('cancel'),
      );
      if (!ok) return;
    }
    const body: Record<string, unknown> = { profile: profile.getRawValue() };
    if (replaceId) body['replaceId'] = replaceId;
    for (const section of drafts) body[section.schema.key] = section.forms.map((form) => form.getRawValue());
    this.saving.set(true);
    try {
      const saved = await this.data.importPerson(body);
      await this.store.load();
      this.toast.show(this.i18n.t(this.store.mode() === 'github' ? (replaceId ? 'savedGithub' : 'createdGithub') : (replaceId ? 'saved' : 'created')));
      this.router.navigate(['/people', saved.id]);
    } catch (e) {
      const errors = apiFieldErrors(e);
      const rest = [
        ...applyServerErrors(profile, errors, 'profile'),
        ...drafts.flatMap((section) => section.forms.flatMap((form, index) => applyServerErrors(form, errors, `${section.schema.key}\\[${index}\\]`))),
      ];
      const text = `${this.i18n.t('serverError')} ${rest.join(' ') || errorText(e)}`;
      this.saveError.set(text);
      if (this.store.mode() === 'github') this.store.actionError.set(text);
    } finally {
      this.saving.set(false);
    }
  }

  private showParsed(parsed: ParsedResume, schema: DataSchema) {
    this.schema.set(schema);
    this.language.set(parsed.language);
    this.warnings.set(parsed.warnings);
    this.profileForm.set(groupFor(schema.profile.fields, parsed.profile));
    const keys = schema.person?.sections || Object.keys(schema.sections);
    this.sections.set(keys.filter((key) => schema.sections[key]).map((key) => ({
      schema: schema.sections[key],
      forms: (parsed.sections[key] ?? []).map((item) => groupFor(schema.sections[key].fields, item)),
    })));
  }
}
