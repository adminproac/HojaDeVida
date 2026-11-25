import { DataError, ValidationError } from './data-error';
import { ApiFieldError, FieldSchema, Person, Profile, ResumeDocument, ResumeUser, SectionItem } from './models';
import { PBKDF2_ITERATIONS } from './password-crypto';
import { RESUME_SCHEMA } from './resume-schema';

/**
 * Same rules as server/validate.js and the same writes as server/index.js.
 * Used when the page commits Data/resume-data.json itself (GitHub Pages).
 * The Express API keeps doing this on the server in local mode.
 */

const isBlank = (value: unknown) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function checkString(field: FieldSchema, value: unknown, path: string, errors: ApiFieldError[], lang?: 'en' | 'es') {
  const where = lang ? `${path}.${lang}` : path;
  if (typeof value !== 'string') {
    errors.push({ path: where, code: 'type', message: `${where} must be text` });
    return null;
  }
  const trimmed = value.trim();
  if (field.maxLength && trimmed.length > field.maxLength) {
    errors.push({ path: where, code: 'maxLength', max: field.maxLength, message: `${where} exceeds ${field.maxLength} characters` });
  }
  if (field.pattern && !lang && trimmed && !new RegExp(field.pattern).test(trimmed)) {
    errors.push({ path: where, code: 'format', format: field.format ?? undefined, message: `${where} has an invalid format (${field.format || field.pattern})` });
  }
  return trimmed;
}

function normalizeField(field: FieldSchema, value: unknown, path: string, errors: ApiFieldError[]): unknown {
  if (field.type === 'list') {
    if (isBlank(value)) value = [];
    if (!Array.isArray(value)) {
      errors.push({ path, code: 'type', message: `${path} must be a list` });
      return [];
    }
    if (field.maxItems && value.length > field.maxItems) {
      errors.push({ path, code: 'maxItems', max: field.maxItems, message: `${path} allows at most ${field.maxItems} items` });
    }
    return value.map((child, index) => {
      const out = normalizeObject(field.itemFields ?? [], child || {}, `${path}[${index}]`, errors);
      const id = typeof child?.id === 'string' && /^[a-z0-9-]+$/.test(child.id) ? child.id : newId(field.key.slice(0, 4));
      return { id, order: index + 1, ...out };
    });
  }
  if (field.type === 'boolean') return value === true || value === 'true';
  if (field.type === 'integer') {
    if (isBlank(value)) {
      if (field.required) errors.push({ path, code: 'required', message: `${path} is required` });
      return null;
    }
    const n = Number(value);
    if (!Number.isInteger(n)) errors.push({ path, code: 'type', message: `${path} must be a whole number` });
    return n;
  }
  if (field.localized) {
    const record = value as { en?: unknown; es?: unknown } | null;
    if (isBlank(value) || (typeof value === 'object' && value && !Array.isArray(value) && isBlank(record?.en) && isBlank(record?.es))) {
      if (field.required) errors.push({ path, code: 'required', message: `${path} is required (en, es)` });
      return null;
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      errors.push({ path, code: 'type', message: `${path} must be an object {en, es}` });
      return null;
    }
    const out: Record<string, string | null> = {};
    for (const lang of ['en', 'es'] as const) {
      if (isBlank(record?.[lang])) {
        if (field.required) errors.push({ path: `${path}.${lang}`, code: 'required', message: `${path}.${lang} is required` });
        out[lang] = '';
      } else {
        out[lang] = checkString(field, record?.[lang], path, errors, lang);
      }
    }
    return out;
  }
  if (isBlank(value)) {
    if (field.required) errors.push({ path, code: 'required', message: `${path} is required` });
    return null;
  }
  return checkString(field, String(value), path, errors);
}

function normalizeObject(fields: FieldSchema[], input: Record<string, unknown>, path: string, errors: ApiFieldError[]) {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.system) continue;
    out[field.key] = normalizeField(field, input[field.key], path ? `${path}.${field.key}` : field.key, errors);
  }
  if (out['isCurrent'] === true && 'endDate' in out) out['endDate'] = null;
  if (out['startDate'] && out['endDate'] && String(out['startDate']) > String(out['endDate'])) {
    errors.push({ path: path ? `${path}.endDate` : 'endDate', code: 'dateRange', message: 'endDate must be after startDate' });
  }
  return out;
}

function validate(fields: FieldSchema[], input: unknown, path = '') {
  const errors: ApiFieldError[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError([{ path: path || '(body)', code: 'type', message: 'Body must be a JSON object' }]);
  }
  const value = normalizeObject(fields, input as Record<string, unknown>, path, errors);
  if (errors.length) throw new ValidationError(errors);
  return value;
}

const now = () => new Date().toISOString();
const sortByOrder = <T extends { order?: number }>(arr: T[]) => arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const renumber = <T extends { order?: number }>(arr: T[]) => sortByOrder(arr).forEach((item, index) => (item.order = index + 1));

function findPerson(doc: ResumeDocument, id: string): Person {
  const person = (doc.people || []).find((item) => item.id === id);
  if (!person) throw new DataError(404, `404 — Person '${id}' not found`);
  return person;
}

function sectionSchema(_doc: ResumeDocument, key: string) {
  const schema = RESUME_SCHEMA.sections[key];
  if (!schema) throw new DataError(404, `404 — Section '${key}' does not exist`);
  return schema;
}

function emptySections(_doc: ResumeDocument) {
  const out: Record<string, SectionItem[]> = {};
  for (const key of Object.keys(RESUME_SCHEMA.sections)) out[key] = [];
  return out;
}

const PREFIX: Record<string, string> = {
  summary: 'sum', experience: 'exp', otherExperience: 'oexp', education: 'edu', skills: 'skill-group',
  languages: 'lang', certifications: 'cert', additionalInfo: 'info',
};

function listOf(person: Person, key: string): SectionItem[] {
  const current = person[key];
  if (!Array.isArray(current)) {
    person[key] = [];
    return person[key] as SectionItem[];
  }
  return current as SectionItem[];
}

/** Insert a full person, or replace one, validating every section with the schema. */
export function importPerson(doc: ResumeDocument, body: Record<string, unknown>): Person {
  const profile = validate(RESUME_SCHEMA.profile.fields, body['profile'] ?? {}, 'profile') as Person['profile'];
  const sections: Record<string, SectionItem[]> = {};
  for (const key of Object.keys(RESUME_SCHEMA.sections)) {
    const raw = Array.isArray(body[key]) ? body[key] as Record<string, unknown>[] : [];
    const schema = sectionSchema(doc, key);
    sections[key] = raw.map((item, index) => {
      const value = validate(schema.fields, { ...item, order: index + 1 }, schema.key);
      return { id: newId(PREFIX[schema.key] || schema.key.toLowerCase()), order: index + 1, createdAt: now(), updatedAt: now(), ...value };
    });
    renumber(sections[key]);
  }
  const replaceId = typeof body['replaceId'] === 'string' ? body['replaceId'] : '';
  if (replaceId) {
    const person = findPerson(doc, replaceId);
    for (const key of Object.keys(person)) {
      if (key !== 'id' && key !== 'createdAt') delete person[key];
    }
    Object.assign(person, { profile, updatedAt: now(), ...sections });
    return person;
  }
  const person: Person = { id: newId('person'), createdAt: now(), updatedAt: now(), profile, ...sections };
  doc.people = doc.people || [];
  doc.people.push(person);
  return person;
}

export function createPerson(doc: ResumeDocument, profile: Partial<Profile>): Person {
  const normalized = validate(RESUME_SCHEMA.profile.fields, profile ?? {}, 'profile') as Person['profile'];
  const person: Person = { id: newId('person'), createdAt: now(), updatedAt: now(), profile: normalized, ...emptySections(doc) };
  doc.people = doc.people || [];
  doc.people.push(person);
  return person;
}

export function updateProfile(doc: ResumeDocument, personId: string, profile: Partial<Profile>): Person {
  const person = findPerson(doc, personId);
  person.profile = validate(RESUME_SCHEMA.profile.fields, profile ?? {}, 'profile') as Person['profile'];
  person.updatedAt = now();
  return person;
}

function assertUserRecord(user: ResumeUser) {
  const forbidden = user as ResumeUser & { password?: unknown; token?: unknown; pat?: unknown };
  if (forbidden.password != null || forbidden.token != null || forbidden.pat != null) {
    throw new DataError(400, '400 — Refusing a plaintext password or token');
  }
  if (!user.username?.trim() || !user.displayName?.trim() || !user.passwordHash || !user.salt) {
    throw new DataError(400, '400 — User record is incomplete');
  }
  if (user.iterations < PBKDF2_ITERATIONS) throw new DataError(400, '400 — Password hash is too weak');
}

export function upsertUser(doc: ResumeDocument, user: ResumeUser): ResumeUser {
  assertUserRecord(user);
  const username = user.username.trim();
  const users = doc.users || [];
  const duplicate = users.find((item) => item.username.toLowerCase() === username.toLowerCase() && item.id !== user.id);
  if (duplicate) throw new DataError(409, `409 — User '${username}' already exists`);
  const next = { ...user, username, displayName: user.displayName.trim() };
  const index = users.findIndex((item) => item.id === user.id);
  if (index >= 0) users[index] = next;
  else users.push(next);
  doc.users = users;
  return next;
}

export function deleteUser(doc: ResumeDocument, userId: string): void {
  const users = doc.users || [];
  if (users.length <= 1) throw new DataError(400, '400 — At least one user is required');
  if (!users.some((item) => item.id === userId)) throw new DataError(404, `404 — User '${userId}' not found`);
  doc.users = users.filter((item) => item.id !== userId);
}

export function deletePerson(doc: ResumeDocument, personId: string): void {
  findPerson(doc, personId);
  doc.people = doc.people.filter((person) => person.id !== personId);
}

export function createItem(doc: ResumeDocument, personId: string, section: string, body: Record<string, any>): SectionItem {
  const schema = sectionSchema(doc, section);
  const person = findPerson(doc, personId);
  const list = listOf(person, schema.key);
  const value = validate(schema.fields, body, schema.key);
  const order = Number.isInteger(body['order']) ? Number(body['order']) - 0.5 : list.length + 1;
  const created: SectionItem = { id: newId(PREFIX[schema.key] || schema.key.toLowerCase()), order, createdAt: now(), updatedAt: now(), ...value };
  list.push(created);
  renumber(list);
  person.updatedAt = now();
  return created;
}

export function updateItem(doc: ResumeDocument, personId: string, section: string, itemId: string, body: Record<string, any>): SectionItem {
  const schema = sectionSchema(doc, section);
  const person = findPerson(doc, personId);
  const list = listOf(person, schema.key);
  const index = list.findIndex((item) => item.id === itemId);
  if (index < 0) throw new DataError(404, `404 — Item '${itemId}' not found`);
  const value = validate(schema.fields, body, schema.key);
  const current = list[index];
  let order = current.order;
  if (Number.isInteger(body['order']) && Number(body['order']) !== current.order) {
    order = Number(body['order']) < current.order ? Number(body['order']) - 0.5 : Number(body['order']) + 0.5;
  }
  list[index] = { id: current.id, order, createdAt: current.createdAt, updatedAt: now(), ...value };
  renumber(list);
  person.updatedAt = now();
  const saved = list.find((item) => item.id === current.id);
  if (!saved) throw new DataError(404, `404 — Item '${itemId}' not found`);
  return saved;
}

export function moveItem(doc: ResumeDocument, personId: string, section: string, itemId: string, direction: 'up' | 'down'): SectionItem[] {
  const schema = sectionSchema(doc, section);
  const person = findPerson(doc, personId);
  const items = sortByOrder(listOf(person, schema.key));
  const index = items.findIndex((item) => item.id === itemId);
  if (index < 0) throw new DataError(404, `404 — Item '${itemId}' not found`);
  const to = direction === 'up' ? index - 1 : index + 1;
  if (to >= 0 && to < items.length) [items[index], items[to]] = [items[to], items[index]];
  items.forEach((item, itemIndex) => (item.order = itemIndex + 1));
  person.updatedAt = now();
  return items;
}

export function deleteItem(doc: ResumeDocument, personId: string, section: string, itemId: string): void {
  const schema = sectionSchema(doc, section);
  const person = findPerson(doc, personId);
  const list = listOf(person, schema.key);
  if (!list.some((item) => item.id === itemId)) throw new DataError(404, `404 — Item '${itemId}' not found`);
  person[schema.key] = list.filter((item) => item.id !== itemId);
  renumber(person[schema.key] as SectionItem[]);
  person.updatedAt = now();
}
