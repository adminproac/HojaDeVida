import { Pipe, PipeTransform, inject } from '@angular/core';
import { I18nService } from '../core/i18n.service';
import { Localized } from '../core/models';

/** {{ 'save' | t }} – UI label in the current language. */
@Pipe({ name: 't', pure: false })
export class TPipe implements PipeTransform {
  private i18n = inject(I18nService);
  transform(key: string, params?: Record<string, unknown>): string {
    return this.i18n.t(key, params);
  }
}

/** {{ item.title | loc }} – localized data value in the current language. */
@Pipe({ name: 'loc', pure: false })
export class LocPipe implements PipeTransform {
  private i18n = inject(I18nService);
  transform(value: Localized | string | null | undefined): string {
    return this.i18n.loc(value);
  }
}
