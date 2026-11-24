import { Component, computed, input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { FieldSchema } from '../core/models';
import { editableFields } from '../core/form-utils';
import { FieldInputComponent } from './field-input.component';
import { TPipe } from './pipes';

/** Lays out every editable field of a schema; scalar fields in a two-column grid, lists full width. */
@Component({
  selector: 'app-dynamic-form',
  imports: [ReactiveFormsModule, FieldInputComponent, TPipe],
  template: `
    <div class="form-row">
      @for (f of fields(); track f.key) {
        <div [class]="colClass(f)">
          <app-field-input [field]="f" [control]="form().get(f.key)!" />
        </div>
      }
    </div>
    @if (form().errors?.['dateRange'] && (form().touched || form().dirty)) {
      <div class="alert alert-danger py-2">{{ 'dateRange' | t }}</div>
    }
  `,
})
export class DynamicFormComponent {
  readonly schemaFields = input.required<FieldSchema[]>();
  readonly form = input.required<FormGroup>();
  protected readonly fields = computed(() => editableFields(this.schemaFields()));

  colClass(f: FieldSchema) {
    if (f.type === 'list' || f.localized || f.type === 'text') return 'col-12';
    if (f.type === 'boolean') return 'col-md-4 col-12 d-flex align-items-center';
    return 'col-md-4 col-sm-6 col-12';
  }
}
