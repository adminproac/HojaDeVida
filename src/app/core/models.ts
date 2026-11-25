export type Lang = 'en' | 'es';
export interface Localized { en: string; es: string; }

export type FieldType = 'string' | 'text' | 'email' | 'phone' | 'url' | 'boolean' | 'integer' | 'list' | 'object';

export interface FieldSchema {
  key: string;
  type: FieldType;
  localized: boolean;
  required: boolean;
  maxLength: number | null;
  format: string | null;
  pattern?: string;
  ui: string;
  label: Localized;
  help?: Localized;
  system?: boolean;
  default?: unknown;
  maxItems?: number;
  min?: number;
  itemFields?: FieldSchema[];
}

export interface SectionSchema {
  key: string;
  isArray: boolean;
  icon: string;
  label: Localized;
  itemLabel?: Localized;
  displayField?: string;
  fields: FieldSchema[];
}

export interface DataSchema {
  conventions: Record<string, unknown>;
  person: { key: string; label: Localized; fields: FieldSchema[]; sections: string[] };
  profile: SectionSchema;
  sections: Record<string, SectionSchema>;
}

export interface SectionItem {
  id: string;
  order: number;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface Profile {
  fullName: string;
  headline: Localized | null;
  email: string;
  phone: string | null;
  location: Localized | null;
  website: string | null;
  photoUrl: string | null;
  [key: string]: any;
}

export interface Person {
  id: string;
  createdAt: string;
  updatedAt: string;
  profile: Profile;
  [section: string]: any;
}

export interface ResumeDocument {
  meta: { schemaVersion: string; defaultLanguage: Lang; supportedLanguages: Lang[]; lastUpdated: string; [k: string]: unknown };
  /** Present only in files saved before version 3. Ignored and removed on the next save. */
  schema?: DataSchema;
  people: Person[];
}

export interface ApiFieldError { path: string; code: string; message: string; max?: number; format?: string; }
