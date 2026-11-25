import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { I18nService } from '../core/i18n.service';
import { StoreService } from '../core/store.service';
import { Localized, Person, SectionItem } from '../core/models';
import { LocPipe } from '../shared/pipes';

/** Plain résumé used on screen as a preview and on paper when printing. */
@Component({
  selector: 'app-resume-sheet',
  imports: [NgTemplateOutlet, LocPipe],
  host: { class: 'cv-sheet' },
  template: `
    @if (person(); as p) {
      <header class="cv-header">
        <h1 class="cv-name">{{ p.profile.fullName }}</h1>
        @if (text(p.profile.headline)) { <p class="cv-headline">{{ text(p.profile.headline) }}</p> }
        @if (contact().length) {
          <p class="cv-contact">
            @for (part of contact(); track part; let last = $last) {
              <span>{{ part }}</span>@if (!last) { <span class="cv-dot"> · </span> }
            }
          </p>
        }
      </header>

      @for (s of sections(); track s.key) {
        @if (visible(s.key).length) {
          <section class="cv-section-block">
            <h2 class="cv-section">{{ s.label | loc }}</h2>
            @switch (s.key) {
              @case ('summary') {
                @for (it of visible(s.key); track it.id) {
                  <p class="cv-summary">{{ text(it['text']) }}</p>
                }
              }
              @case ('skills') {
                @for (it of visible(s.key); track it.id) {
                  <p class="cv-skill"><span class="cv-strong">{{ text(it['category']) }}:</span> {{ skillNames(it) }}</p>
                }
              }
              @case ('languages') {
                <p class="cv-inline">
                  @for (it of visible(s.key); track it.id; let last = $last) {
                    <span>{{ text(it['name']) }}@if (text(it['level'])) { <span> ({{ text(it['level']) }})</span> }</span>@if (!last) { <span class="cv-dot"> · </span> }
                  }
                </p>
              }
              @case ('education') {
                @for (it of visible(s.key); track it.id) {
                  <article class="cv-entry">
                    <div class="cv-entry-head">
                      <div>
                        @if (text(it['credential'])) { <div class="cv-role">{{ text(it['credential']) }}</div> }
                        <div class="cv-org">{{ join([text(it['institution']), text(it['location'])]) }}</div>
                      </div>
                      @if (dates(it)) { <div class="cv-dates">{{ dates(it) }}</div> }
                    </div>
                  </article>
                }
              }
              @case ('certifications') {
                @for (it of visible(s.key); track it.id) {
                  <article class="cv-entry">
                    <div class="cv-entry-head">
                      <div>
                        <div class="cv-role">{{ text(it['name']) }}</div>
                        <div class="cv-org">{{ join([it['issuer'], text(it['url'])]) }}</div>
                      </div>
                      @if (month(it['date'])) { <div class="cv-dates">{{ month(it['date']) }}</div> }
                    </div>
                  </article>
                }
              }
              @case ('additionalInfo') {
                <ul class="cv-highlights">
                  @for (it of visible(s.key); track it.id) { <li>{{ text(it['text']) }}</li> }
                </ul>
              }
              @case ('experience') { <ng-container *ngTemplateOutlet="jobs; context: { $implicit: s.key }" /> }
              @case ('otherExperience') { <ng-container *ngTemplateOutlet="jobs; context: { $implicit: s.key }" /> }
              @default {
                @for (it of visible(s.key); track it.id) {
                  <article class="cv-entry">
                    @for (f of plainFields(s); track f.key) {
                      @if (text(it[f.key])) { <p class="cv-line"><span class="cv-strong">{{ f.label | loc }}:</span> {{ text(it[f.key]) }}</p> }
                    }
                  </article>
                }
              }
            }
          </section>
        }
      }

      <ng-template #jobs let-key>
        @for (it of visible(key); track it.id) {
          <article class="cv-entry">
            <div class="cv-entry-head">
              <div>
                <div class="cv-role">{{ join([text(it['title']), it['company']], ' · ') }}</div>
                @if (text(it['location'])) { <div class="cv-org">{{ text(it['location']) }}</div> }
              </div>
              @if (dates(it)) { <div class="cv-dates">{{ dates(it) }}</div> }
            </div>
            @if (bullets(it).length) {
              <ul class="cv-highlights">
                @for (line of bullets(it); track $index) { <li>{{ line }}</li> }
              </ul>
            }
          </article>
        }
      </ng-template>
    }
  `,
})
export class ResumeSheetComponent {
  readonly person = input.required<Person>();
  private i18n = inject(I18nService);
  private store = inject(StoreService);

  protected readonly sections = computed(() => this.store.sectionList());

  protected text(value: Localized | string | null | undefined): string {
    return this.i18n.loc(value).replace(/\s+/g, ' ').trim();
  }

  protected contact(): string[] {
    const profile = this.person().profile;
    return [profile.email, profile.phone, this.text(profile.location), this.text(profile.website)].map((part) => (part || '').trim()).filter(Boolean);
  }

  protected visible(key: string): SectionItem[] {
    return this.store.items(this.person(), key).filter((item) => this.keep(key, item));
  }

  protected dates(item: SectionItem): string {
    if (this.text(item['dateLabel']) && !item['startDate']) return this.text(item['dateLabel']);
    const start = this.month(item['startDate']);
    const end = item['isCurrent'] ? this.i18n.t('present') : this.month(item['endDate']);
    return [start, end].filter(Boolean).join(' – ') || this.text(item['dateLabel']);
  }

  protected month(value: string | null | undefined): string {
    return value ? this.i18n.month(value) : '';
  }

  protected bullets(item: SectionItem): string[] {
    return (item['highlights'] ?? []).map((line: { text?: Localized | string }) => this.text(line?.text)).filter(Boolean);
  }

  protected skillNames(item: SectionItem): string {
    return (item['items'] ?? []).map((skill: { name?: Localized | string }) => this.text(skill?.name)).filter(Boolean).join(', ');
  }

  protected join(parts: Array<string | null | undefined>, sep = ' · '): string {
    return parts.map((part) => (part || '').trim()).filter(Boolean).join(sep);
  }

  protected plainFields(section: { fields: { key: string; system?: boolean; type: string; label: Localized }[] }) {
    return section.fields.filter((field) => !field.system && field.type !== 'list' && field.type !== 'boolean');
  }

  private keep(key: string, item: SectionItem): boolean {
    if (key === 'summary' || key === 'additionalInfo') return !!this.text(item['text']);
    if (key === 'skills') return !!this.skillNames(item);
    if (key === 'languages') return !!this.text(item['name']);
    if (key === 'education') return !!(this.text(item['credential']) || this.text(item['institution']));
    if (key === 'certifications') return !!this.text(item['name']);
    if (key === 'experience' || key === 'otherExperience') {
      return !!(item['company'] || this.text(item['title']) || this.bullets(item).length);
    }
    return true;
  }
}
