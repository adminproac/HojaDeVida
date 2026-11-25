import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StoreService } from '../core/store.service';
import { TPipe } from '../shared/pipes';
import { ResumeSheetComponent } from './resume-sheet.component';

/** On-screen preview of the printable résumé. The Imprimir button opens the browser print dialog. */
@Component({
  selector: 'app-resume-print',
  imports: [RouterLink, TPipe, ResumeSheetComponent],
  template: `
    @if (person(); as p) {
      <div class="cv-stage">
        <div class="cv-toolbar no-print">
          <a class="btn btn-light" [routerLink]="['/people', p.id]"><i class="bi bi-arrow-left mr-1"></i>{{ 'back' | t }}</a>
          <div class="cv-toolbar-note">{{ 'printHint' | t }}</div>
          <button type="button" class="btn btn-primary" (click)="print()"><i class="bi bi-printer mr-1"></i>{{ 'print' | t }}</button>
        </div>
        <app-resume-sheet [person]="p" />
      </div>
    } @else if (missing()) {
      <div class="alert alert-warning">{{ 'notFound' | t }} <a routerLink="/people">{{ 'back' | t }}</a></div>
    }
  `,
})
export class ResumePrintComponent {
  readonly id = input.required<string>();
  private store = inject(StoreService);

  protected readonly person = computed(() => this.store.person(this.id()));
  protected readonly missing = computed(() => !this.store.loading() && !!this.store.doc() && !this.person());

  constructor() {
    void this.store.ready();
  }

  print() { window.print(); }
}
