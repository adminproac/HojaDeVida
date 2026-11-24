import { Component, inject } from '@angular/core';
import { ToastService } from '../core/toast.service';

@Component({
  selector: 'app-toasts',
  template: `
    <div class="toast-stack" aria-live="polite">
      @for (t of toasts.toasts(); track t.id) {
        <div class="alert alert-{{ t.kind }} shadow-sm d-flex align-items-start" role="status">
          <i class="bi mr-2" [class.bi-check-circle]="t.kind === 'success'" [class.bi-x-octagon]="t.kind === 'danger'" [class.bi-info-circle]="t.kind === 'info'"></i>
          <span class="flex-grow-1">{{ t.text }}</span>
          <button type="button" class="close ml-2" (click)="toasts.dismiss(t.id)">&times;</button>
        </div>
      }
    </div>
  `,
})
export class ToastsComponent {
  protected toasts = inject(ToastService);
}
