import { FormGroup } from '@angular/forms';
import { ApiFieldError } from '../core/models';

/** Puts API validation errors (e.g. "experience.highlights[0].text.es") on the matching form controls. */
export function applyServerErrors(form: FormGroup, errors: ApiFieldError[] | undefined, prefix: string): string[] {
  const unmatched: string[] = [];
  for (const err of errors ?? []) {
    const path = err.path.replace(new RegExp(`^${prefix}\\.?`), '').replace(/\[(\d+)\]/g, '.$1');
    const ctrl = path ? form.get(path) : null;
    if (ctrl) {
      ctrl.setErrors({ ...(ctrl.errors ?? {}), server: err.message });
      ctrl.markAsTouched();
    } else {
      unmatched.push(err.message);
    }
  }
  return unmatched;
}
