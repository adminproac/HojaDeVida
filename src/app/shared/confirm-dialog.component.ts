import { Component, HostListener, inject } from '@angular/core';
import { ConfirmService } from '../core/confirm.service';

@Component({
  selector: 'app-confirm-dialog',
  template: `
    @if (confirm.current(); as req) {
      <div class="modal d-block" tabindex="-1" role="dialog" aria-modal="true" (click)="confirm.close(false)">
        <div class="modal-dialog modal-dialog-centered" role="document" (click)="$event.stopPropagation()">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title"><i class="bi bi-exclamation-triangle text-danger mr-2"></i>{{ req.title }}</h5>
              <button type="button" class="close" aria-label="Close" (click)="confirm.close(false)"><span aria-hidden="true">&times;</span></button>
            </div>
            <div class="modal-body">{{ req.message }}</div>
            <div class="modal-footer">
              <button type="button" class="btn btn-light" (click)="confirm.close(false)">{{ req.cancelText }}</button>
              <button type="button" class="btn btn-danger" id="confirm-ok" (click)="confirm.close(true)">{{ req.okText }}</button>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-backdrop show"></div>
    }
  `,
})
export class ConfirmDialogComponent {
  protected confirm = inject(ConfirmService);
  @HostListener('document:keydown.escape') onEsc() {
    if (this.confirm.current()) this.confirm.close(false);
  }
}
