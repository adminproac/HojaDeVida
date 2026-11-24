import { Injectable, signal } from '@angular/core';

export interface Toast { id: number; kind: 'success' | 'danger' | 'info'; text: string; }

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;

  show(text: string, kind: Toast['kind'] = 'success', ms = 3500) {
    const toast = { id: ++this.seq, kind, text };
    this.toasts.update((t) => [...t, toast]);
    setTimeout(() => this.dismiss(toast.id), ms);
  }
  dismiss(id: number) {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }
}
