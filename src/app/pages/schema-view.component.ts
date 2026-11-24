import { Component, computed, inject } from '@angular/core';
import { I18nService } from '../core/i18n.service';
import { StoreService } from '../core/store.service';
import { FieldSchema, SectionSchema } from '../core/models';
import { PageHeaderComponent } from '../shared/page-header.component';
import { LocPipe, TPipe } from '../shared/pipes';

/** Documents fields, attributes and sizes of every section (read from the schema block of the JSON). */
@Component({
  selector: 'app-schema-view',
  imports: [PageHeaderComponent, TPipe, LocPipe],
  template: `
    <app-page-header [title]="'schema' | t" [crumbs]="[{ label: 'home' | t, link: '/dashboard' }, { label: 'schema' | t }]" />
    <div class="alert alert-info"><i class="bi bi-info-circle mr-2"></i>{{ 'schemaIntro' | t }}</div>
    @for (s of all(); track s.key) {
      <div class="card shadow mb-4">
        <div class="card-header py-3"><h6 class="m-0 font-weight-bold text-primary"><span class="section-icon"><i class="bi {{ s.icon }}"></i></span>{{ s.label | loc }} <code class="ml-2">{{ s.key }}</code></h6></div>
        <div class="card-body p-0">
          <div class="table-responsive">
            <table class="table table-sm table-hover mb-0 schema-table">
              <thead class="thead-light"><tr>
                <th>{{ 'field' | t }}</th><th>{{ 'label' | t }}</th><th>{{ 'type' | t }}</th><th class="text-center">{{ 'localized' | t }}</th>
                <th class="text-center">{{ 'requiredCol' | t }}</th><th class="text-center">{{ 'size' | t }}</th><th>{{ 'format' | t }}</th>
              </tr></thead>
              <tbody>
                @for (row of rows(s); track row.path) {
                  <tr [class.text-gray-600]="row.f.system">
                    <td><code>{{ row.path }}</code></td>
                    <td>{{ row.f.label | loc }}</td>
                    <td>{{ row.f.type }}</td>
                    <td class="text-center">{{ (row.f.localized ? 'yes' : 'no') | t }}</td>
                    <td class="text-center">@if (row.f.required) { <i class="bi bi-check-lg text-success"></i> }</td>
                    <td class="text-center">{{ row.f.maxLength ?? (row.f.maxItems ? '≤ ' + row.f.maxItems : '') }}</td>
                    <td><small>{{ row.f.format }}</small></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    }
  `,
})
export class SchemaViewComponent {
  protected i18n = inject(I18nService);
  private store = inject(StoreService);
  protected readonly all = computed<SectionSchema[]>(() => {
    const s = this.store.schema();
    return s ? [s.profile, ...this.store.sectionList()] : [];
  });
  rows(s: SectionSchema) {
    const out: { path: string; f: FieldSchema }[] = [];
    for (const f of s.fields) {
      out.push({ path: f.key, f });
      for (const c of f.itemFields ?? []) out.push({ path: `${f.key}[].${c.key}`, f: c });
    }
    return out;
  }
}
