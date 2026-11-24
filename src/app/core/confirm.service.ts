import { Injectable, signal } from '@angular/core';

export interface ConfirmRequest { title: string; message: string; okText: string; cancelText: string; resolve: (ok: boolean) => void; }

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly current = signal<ConfirmRequest | null>(null);

  ask(title: string, message: string, okText: string, cancelText: string): Promise<boolean> {
    return new Promise((resolve) => this.current.set({ title, message, okText, cancelText, resolve }));
  }
  close(ok: boolean) {
    const req = this.current();
    this.current.set(null);
    req?.resolve(ok);
  }
}
