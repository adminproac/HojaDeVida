import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface Crumb { label: string; link?: string | any[]; }

/** SB Admin 2 page heading (h1.h3 + action buttons) with a small breadcrumb underneath. */
@Component({
  selector: 'app-page-header',
  imports: [RouterLink],
  template: `
    <div class="d-sm-flex align-items-center justify-content-between mb-4">
      <div>
        <h1 class="h3 mb-1 text-gray-800">{{ title() }}</h1>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb sb-breadcrumb">
            @for (c of crumbs(); track $index; let last = $last) {
              <li class="breadcrumb-item" [class.active]="last">
                @if (c.link && !last) { <a [routerLink]="c.link">{{ c.label }}</a> } @else { {{ c.label }} }
              </li>
            }
          </ol>
        </nav>
      </div>
      <div class="page-actions mt-2 mt-sm-0"><ng-content /></div>
    </div>
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly crumbs = input<Crumb[]>([]);
}
