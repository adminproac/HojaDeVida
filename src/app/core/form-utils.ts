import { AbstractControl, FormArray, FormControl, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { FieldSchema, Localized } from './models';

/** Validators generated from a schema field (required, maxLength, pattern/format, min). */
export function validatorsFor(field: FieldSchema, forLocalized = false): ValidatorFn[] {
  const v: ValidatorFn[] = [];
  if (field.required && field.type !== 'boolean') v.push(Validators.required, notBlank);
  if (field.maxLength) v.push(Validators.maxLength(field.maxLength));
  if (field.pattern && !forLocalized) v.push(Validators.pattern(new RegExp(field.pattern)));
  if (field.type === 'integer' && field.min != null) v.push(Validators.min(field.min));
  return v;
}

const notBlank: ValidatorFn = (c) => (typeof c.value === 'string' && c.value.length && !c.value.trim() ? { required: true } : null);

/** Cross-field rule: endDate >= startDate. */
export const dateRangeValidator: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const s = group.get('startDate')?.value;
  const e = group.get('endDate')?.value;
  const current = group.get('isCurrent')?.value;
  return s && e && !current && s > e ? { dateRange: true } : null;
};

export function controlFor(field: FieldSchema, value: any): AbstractControl {
  if (field.type === 'list') {
    const arr = new FormArray<FormGroup>([]);
    for (const child of (value as any[]) ?? []) arr.push(groupFor(field.itemFields ?? [], child));
    return arr;
  }
  if (field.localized) {
    const loc = (value ?? {}) as Partial<Localized>;
    return new FormGroup({
      en: new FormControl(loc.en ?? '', validatorsFor(field, true)),
      es: new FormControl(loc.es ?? '', validatorsFor(field, true)),
    });
  }
  if (field.type === 'boolean') return new FormControl(value ?? field.default ?? false);
  return new FormControl(value ?? (field.type === 'integer' ? null : ''), validatorsFor(field));
}

/** FormGroup for an object described by `fields`. System fields are skipped except `id` in nested lists. */
export function groupFor(fields: FieldSchema[], value: any = {}): FormGroup {
  const controls: Record<string, AbstractControl> = {};
  for (const f of fields) {
    if (f.system) {
      if (f.key === 'id') controls['id'] = new FormControl(value?.id ?? null);
      continue;
    }
    controls[f.key] = controlFor(f, value?.[f.key]);
  }
  const hasDates = fields.some((f) => f.key === 'startDate') && fields.some((f) => f.key === 'endDate');
  return new FormGroup(controls, hasDates ? [dateRangeValidator] : []);
}

export function editableFields(fields: FieldSchema[]) {
  return fields.filter((f) => !f.system);
}

/** Marks everything as touched so validation messages show up. */
export function touchAll(control: AbstractControl) {
  control.markAllAsTouched();
  control.updateValueAndValidity();
}
