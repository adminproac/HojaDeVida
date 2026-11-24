import { Component, computed, inject, input } from '@angular/core';
import { AbstractControl, FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { I18nService } from '../core/i18n.service';
import { FieldSchema } from '../core/models';
import { editableFields, groupFor } from '../core/form-utils';
import { LocPipe, TPipe } from './pipes';

/** Renders one schema field (text, textarea, e-mail, month, checkbox, bilingual pair or nested list). */
@Component({
  selector: 'app-field-input',
  imports: [ReactiveFormsModule, TPipe, LocPipe],
  templateUrl: './field-input.component.html',
})
export class FieldInputComponent {
  readonly field = input.required<FieldSchema>();
  readonly control = input.required<AbstractControl>();
  readonly idPrefix = input('f');
  readonly compact = input(false);

  protected i18n = inject(I18nService);
  protected readonly inputId = computed(() => `${this.idPrefix()}-${this.field().key}`);
  protected readonly inputType = computed(() => {
    const ui = this.field().ui;
    return ({ email: 'email', tel: 'tel', url: 'url', month: 'month', number: 'number' } as Record<string, string>)[ui] ?? 'text';
  });

  ctrl(c: AbstractControl | null) { return c as FormControl; }
  group(c: AbstractControl | null) { return c as FormGroup; }
  array() { return this.control() as FormArray<FormGroup>; }
  childFields() { return editableFields(this.field().itemFields ?? []); }

  addRow() {
    const arr = this.array();
    arr.push(groupFor(this.field().itemFields ?? [], {}));
    arr.markAsDirty();
  }
  removeRow(i: number) {
    this.array().removeAt(i);
    this.array().markAsDirty();
  }
  moveRow(i: number, delta: number) {
    const arr = this.array();
    const j = i + delta;
    if (j < 0 || j >= arr.length) return;
    const row = arr.at(i);
    arr.removeAt(i);
    arr.insert(j, row);
    arr.markAsDirty();
  }

  copy(from: 'en' | 'es', to: 'en' | 'es') {
    const g = this.control() as FormGroup;
    const value = g.get(from)?.value;
    if (value) {
      g.get(to)?.setValue(value);
      g.get(to)?.markAsTouched();
    }
  }

  length(c: AbstractControl | null) { return (c?.value ?? '').toString().length; }

  errorText(c: AbstractControl | null): string | null {
    if (!c || !c.errors || !(c.touched || c.dirty)) return null;
    const e = c.errors;
    const f = this.field();
    if (e['required']) return this.i18n.t('required');
    if (e['maxlength']) return this.i18n.t('maxLength', { max: e['maxlength'].requiredLength });
    if (e['pattern']) return this.i18n.t(f.format ? `fmt_${f.format}` : 'fmt_default') || this.i18n.t('fmt_default');
    if (e['min']) return this.i18n.t('min', { min: e['min'].min });
    if (e['server']) return e['server'];
    return this.i18n.t('fmt_default');
  }
}
