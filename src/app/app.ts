import { Component, HostListener, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { I18nService } from './core/i18n.service';
import { StoreService } from './core/store.service';
import { ApiService } from './core/api.service';
import { ToastService } from './core/toast.service';
import { ConfirmDialogComponent } from './shared/confirm-dialog.component';
import { ToastsComponent } from './shared/toasts.component';
import { TPipe } from './shared/pipes';
import { Lang } from './core/models';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ConfirmDialogComponent, ToastsComponent, TPipe],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected i18n = inject(I18nService);
  protected store = inject(StoreService);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private router = inject(Router);

  /** Same behaviour as SB Admin 2's jQuery script, written with signals. */
  protected readonly toggled = signal(window.innerWidth < 480);
  protected readonly openMenu = signal<string | null>(window.innerWidth >= 768 ? 'people' : null);
  protected readonly showScrollTop = signal(false);
  protected readonly isPeopleRoute = signal(false);

  constructor() {
    this.store.load();
    this.syncBodyClass();
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => {
      this.isPeopleRoute.set((e as NavigationEnd).urlAfterRedirects.startsWith('/people'));
      // On small screens close the floating submenu after navigating.
      if (window.innerWidth < 768 || this.toggled()) this.openMenu.set(null);
    });
  }

  toggleSidebar() {
    this.toggled.update((v) => !v);
    if (this.toggled()) this.openMenu.set(null);
    this.syncBodyClass();
  }

  toggleMenu(key: string) {
    this.openMenu.update((cur) => (cur === key ? null : key));
  }

  private syncBodyClass() {
    document.body.classList.toggle('sidebar-toggled', this.toggled());
  }

  @HostListener('window:resize') onResize() {
    if (window.innerWidth < 768) this.openMenu.set(null);
    if (window.innerWidth < 480 && !this.toggled()) {
      this.toggled.set(true);
      this.syncBodyClass();
    }
  }

  @HostListener('window:scroll') onScroll() {
    this.showScrollTop.set(window.scrollY > 100);
  }

  scrollTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

  setLang(lang: Lang) { this.i18n.setLang(lang); }

  async reload() {
    await this.store.load();
    if (!this.store.apiError()) this.toast.show(this.i18n.t('reloaded'), 'info');
  }

  async backup() {
    try {
      const res = await this.api.backup();
      this.toast.show(`${this.i18n.t('backupDone')} ${res.file}`, 'success', 6000);
    } catch {
      this.toast.show(this.i18n.t('apiDown'), 'danger');
    }
  }
}
