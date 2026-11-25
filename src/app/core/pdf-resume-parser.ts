import { DataSchema, FieldSchema, Lang } from './models';

/**
 * Turns résumé text into the same shape as one people[] entry, using the
 * schema for maxLength and which fields are bilingual. pdfjs extracts the text;
 * this file only parses it.
 */

export interface ParseWarning {
  code: 'missing-email' | 'missing-name' | 'copied-title' | 'copied-credential' | 'no-text';
  detail?: string;
}

export interface ParsedResume {
  language: Lang;
  profile: Record<string, unknown>;
  sections: Record<string, Record<string, unknown>[]>;
  warnings: ParseWarning[];
}

const HEADINGS: Record<string, string[]> = {
  summary: ['summary', 'professional summary', 'profile', 'about', 'about me', 'objective', 'resumen', 'resumen profesional', 'perfil', 'perfil profesional', 'acerca de', 'objetivo'],
  experience: ['experience', 'professional experience', 'work experience', 'employment', 'work history', 'experiencia', 'experiencia profesional', 'experiencia laboral', 'historial laboral'],
  otherExperience: ['other experience', 'other professional experience', 'otra experiencia', 'otra experiencia profesional'],
  education: ['education', 'academic background', 'education and training', 'formacion', 'formacion academica', 'educacion', 'estudios'],
  skills: ['skills', 'technical skills', 'competencies', 'competences', 'habilidades', 'habilidades tecnicas', 'aptitudes', 'competencias'],
  languages: ['languages', 'idiomas', 'lenguas'],
  certifications: ['certifications', 'certificates', 'licenses', 'certificaciones', 'certificados', 'licencias'],
  additionalInfo: ['additional information', 'additional info', 'other information', 'informacion adicional', 'otros datos', 'datos adicionales'],
};

const MONTHS: Record<string, string> = {
  jan: '01', january: '01', ene: '01', enero: '01',
  feb: '02', february: '02', febrero: '02',
  mar: '03', march: '03', marzo: '03',
  apr: '04', april: '04', abr: '04', abril: '04',
  may: '05', mayo: '05',
  jun: '06', june: '06', junio: '06',
  jul: '07', july: '07', julio: '07',
  aug: '08', august: '08', ago: '08', agosto: '08',
  sep: '09', sept: '09', september: '09', set: '09', septiembre: '09',
  oct: '10', october: '10', octubre: '10',
  nov: '11', november: '11', noviembre: '11',
  dec: '12', december: '12', dic: '12', diciembre: '12',
};

const ROLE = /\b(engineer|developer|manager|director|lead|senior|junior|analyst|consultant|designer|architect|specialist|coordinator|intern|officer|ingenier|desarroll|gerente|analista|consultor|disen|arquitect|especialista|coordinador|practicante|jefe|lider|programador)\b/i;
const PRESENT = /\b(present|current|now|today|actualidad|presente|actual|hoy)\b/i;

export function parseResumeText(text: string, schema: DataSchema): ParsedResume {
  const warnings: ParseWarning[] = [];
  const lines = String(text || '').replace(/\r/g, '').split('\n').map((line) => deSpaceHeading(line.replace(/\t/g, ' ').replace(/[ ]{2,}/g, ' ').trim()));
  if (!lines.some((line) => line.length > 0)) {
    return { language: 'es', profile: emptyProfile(), sections: emptySections(schema), warnings: [{ code: 'no-text' }] };
  }
  const language = detectLanguage(lines);
  const chunks = splitSections(lines);
  const profile = parseHeader(chunks.header, language, schema, warnings);
  const sections = emptySections(schema);
  for (const chunk of chunks.sections) {
    if (!schema.sections[chunk.key]) continue;
    const items = parseSection(chunk.key, chunk.lines, language, schema, warnings);
    sections[chunk.key] = items;
  }
  return { language, profile, sections, warnings };
}

function emptyProfile(): Record<string, unknown> {
  return { fullName: '', headline: null, email: '', phone: null, location: null, website: null, photoUrl: null };
}

function emptySections(schema: DataSchema): Record<string, Record<string, unknown>[]> {
  const out: Record<string, Record<string, unknown>[]> = {};
  for (const key of schema.person?.sections || Object.keys(schema.sections)) out[key] = [];
  return out;
}

export function norm(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9+ ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function deSpaceHeading(line: string): string {
  const trimmed = line.trim();
  if (/^(?:[A-Za-zÁÉÍÓÚÑáéíóúñ]\s+){3,}[A-Za-zÁÉÍÓÚÑáéíóúñ]$/.test(trimmed)) return trimmed.replace(/\s+/g, '');
  return trimmed;
}

function headingKey(line: string): string | null {
  const name = norm(line.replace(/:$/, ''));
  if (!name || name.length > 60) return null;
  for (const [key, names] of Object.entries(HEADINGS)) {
    if (names.includes(name)) return key;
  }
  return null;
}

const SPANISH_HEADINGS = new Set(Object.values(HEADINGS).flat().filter((name) => /(?:resumen|perfil|acerca|objetivo|experiencia|historial|formacion|educacion|estudios|habilidades|aptitudes|competencias|idiomas|lenguas|certificaciones|certificados|licencias|informacion|otros datos|datos adicionales)/.test(name)));

function detectLanguage(lines: string[]): Lang {
  let es = 0;
  let en = 0;
  for (const line of lines) {
    if (!headingKey(line)) continue;
    const name = norm(line.replace(/:$/, ''));
    if (SPANISH_HEADINGS.has(name)) es += 1;
    else en += 1;
  }
  if (es > en) return 'es';
  if (en > es) return 'en';
  return /[áéíóúñü¿¡]/i.test(lines.join(' ')) ? 'es' : 'en';
}

function splitSections(lines: string[]): { header: string[]; sections: { key: string; lines: string[] }[] } {
  const first = lines.findIndex((line) => headingKey(line));
  const header = (first === -1 ? lines : lines.slice(0, first)).filter((line, index, all) => line || (index > 0 && all[index - 1]));
  const sections: { key: string; lines: string[] }[] = [];
  let current: { key: string; lines: string[] } | null = null;
  for (const line of first === -1 ? [] : lines.slice(first)) {
    const key = headingKey(line);
    if (key) {
      current = sections.find((section) => section.key === key) ?? null;
      if (!current) {
        current = { key, lines: [] };
        sections.push(current);
      }
      continue;
    }
    current?.lines.push(line);
  }
  return { header, sections };
}

function parseHeader(lines: string[], lang: Lang, schema: DataSchema, warnings: ParseWarning[]): Record<string, unknown> {
  const blob = lines.join('\n');
  const email = blob.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? '';
  if (!email) warnings.push({ code: 'missing-email' });
  let website = blob.match(/https?:\/\/[^\s)]+/i)?.[0] ?? blob.match(/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+/i)?.[0] ?? '';
  website = website.replace(/[.,;]+$/, '');
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
  if (website && !/^https?:\/\/.+/i.test(website)) website = '';
  const phone = findPhone(blob);

  const cleaned = lines.map((line) => line
    .replace(email, '')
    .replace(website, '')
    .replace(website.replace(/^https?:\/\//, ''), '')
    .replace(phone, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/linkedin\.com\/\S+/gi, '')
    .replace(/[|•·]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()).filter((line) => line.length > 1 && !/^[\d\s+().-]+$/.test(line));

  const fullName = clip(cleaned[0] || '', fieldMax(schema, 'profile', 'fullName', 120));
  if (!fullName) warnings.push({ code: 'missing-name' });
  const headlineText = cleaned[1] && !looksLikeLocation(cleaned[1]) ? cleaned[1] : '';
  const locationText = cleaned.find((line, index) => index > 0 && line !== headlineText && looksLikeLocation(line)) || '';
  return {
    fullName,
    headline: bilingual(headlineText, lang, false, fieldMax(schema, 'profile', 'headline', 150)),
    email: clip(email, fieldMax(schema, 'profile', 'email', 254)),
    phone: phone ? clip(phone, fieldMax(schema, 'profile', 'phone', 30)) : null,
    location: bilingual(locationText, lang, false, fieldMax(schema, 'profile', 'location', 150)),
    website: website ? clip(website, fieldMax(schema, 'profile', 'website', 300)) : null,
    photoUrl: null,
  };
}

function findPhone(text: string): string {
  const match = text.match(/(\+\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]\d{3,4}/);
  if (!match) return '';
  const phone = match[0].trim().replace(/[^\d+().\-\s]/g, '');
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return '';
  return /^[0-9+().\-\s]{7,30}$/.test(phone) ? phone : '';
}

function looksLikeLocation(line: string): boolean {
  if (line.length > 80 || isBullet(line) || parseDateLine(line)) return false;
  return /,/.test(line) || /\b(remote|remoto|hybrid|hibrido|onsite|colombia|mexico|spain|usa|bogota|madrid|atlanta|medellin)\b/i.test(norm(line));
}

function parseSection(key: string, lines: string[], lang: Lang, schema: DataSchema, warnings: ParseWarning[]): Record<string, unknown>[] {
  const body = trimOuterBlank(lines);
  if (key === 'summary') return paragraphs(body).map((text) => ({ text: bilingual(text, lang, true, fieldMax(schema, key, 'text', 2000)) })).filter((item) => item.text);
  if (key === 'additionalInfo') {
    return paragraphs(body).map((text) => ({ text: bilingual(text, lang, true, fieldMax(schema, key, 'text', 300)) })).filter((item) => item.text);
  }
  if (key === 'skills') return parseSkills(body, lang, schema);
  if (key === 'languages') return parseLanguages(body, lang, schema);
  if (key === 'certifications') return parseCertifications(body, lang, schema);
  if (key === 'education') return blocks(body).map((block) => educationFromBlock(block, lang, schema, warnings)).filter((item): item is Record<string, unknown> => !!item);
  if (key === 'experience' || key === 'otherExperience') {
    return blocks(body).map((block) => jobFromBlock(block, lang, schema, key, warnings)).filter((item): item is Record<string, unknown> => !!item);
  }
  return [];
}

function paragraphs(lines: string[]): string[] {
  const parts: string[] = [];
  let current: string[] = [];
  const flush = () => {
    const text = current.join(' ').trim();
    if (text) parts.push(text);
    current = [];
  };
  for (const line of lines) {
    if (!line) flush();
    else current.push(line);
  }
  flush();
  return parts.length ? parts : [];
}

function trimOuterBlank(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start]) start += 1;
  while (end > start && !lines[end - 1]) end -= 1;
  return lines.slice(start, end);
}

function blocks(lines: string[]): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length) chunks.push(current);
    current = [];
  };
  for (const line of lines) {
    if (!line) flush();
    else current.push(line);
  }
  flush();
  const meaningful = chunks.filter((chunk) => chunk.some(Boolean));
  if (meaningful.length > 1) return mergeHangingBullets(meaningful);
  return splitWhenNextEntry(lines.filter(Boolean));
}

function mergeHangingBullets(chunks: string[][]): string[][] {
  const merged: string[][] = [];
  for (const chunk of chunks) {
    if (merged.length && chunk.every(isBullet)) merged[merged.length - 1].push(...chunk);
    else merged.push([...chunk]);
  }
  return merged;
}

function splitWhenNextEntry(lines: string[]): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    const nextEntry = current.length > 0 && !isBullet(line) && (current.some(isBullet) || (parseDateLine(line) && current.some((item) => !!parseDateLine(item))));
    if (nextEntry) {
      chunks.push(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length) chunks.push(current);
  return chunks.length ? chunks : (lines.length ? [lines] : []);
}

function jobFromBlock(block: string[], lang: Lang, schema: DataSchema, section: string, warnings: ParseWarning[]): Record<string, unknown> | null {
  const headers: string[] = [];
  const bullets: string[] = [];
  let date: ReturnType<typeof parseDateLine> = null;
  for (const line of block) {
    if (isBullet(line)) bullets.push(bulletText(line));
    else if (!date && parseDateLine(line)) date = parseDateLine(line);
    else if (!parseDateLine(line)) headers.push(line);
  }
  if (!headers.length && !bullets.length) return null;
  let company = '';
  let title = '';
  const rest = [...headers];
  const first = rest.shift() ?? '';
  const split = splitRole(first);
  if (split) {
    company = split.company;
    title = split.title;
  } else company = first;
  if (!title && rest[0] && !looksLikeLocation(rest[0])) title = rest.shift() ?? '';
  const location = rest[0] || '';
  const titleRequired = section === 'experience';
  if (titleRequired && !title && company) {
    title = company;
    warnings.push({ code: 'copied-title', detail: clip(company, 80) });
  }
  if (!company && title) company = title;
  if (!company) return null;
  const companyMax = fieldMax(schema, section, 'company', 150);
  const titleMax = fieldMax(schema, section, 'title', 150);
  const highlightMax = nestedMax(schema, section, 'highlights', 'text', 600);
  return {
    company: clip(company, companyMax),
    title: bilingual(title, lang, titleRequired, titleMax),
    location: bilingual(location, lang, false, fieldMax(schema, section, 'location', 150)),
    startDate: date?.start ?? null,
    endDate: date?.current ? null : (date?.end ?? null),
    isCurrent: !!date?.current,
    dateLabel: date?.label ? bilingual(date.label, lang, false, fieldMax(schema, section, 'dateLabel', 60)) : null,
    highlights: bullets.filter(Boolean).slice(0, 50).map((text) => ({ text: bilingual(text, lang, true, highlightMax) })).filter((item) => item.text),
  };
}

function educationFromBlock(block: string[], lang: Lang, schema: DataSchema, warnings: ParseWarning[]): Record<string, unknown> | null {
  const headers: string[] = [];
  let date: ReturnType<typeof parseDateLine> = null;
  for (const line of block) {
    if (isBullet(line)) continue;
    if (!date && parseDateLine(line)) date = parseDateLine(line);
    else if (!parseDateLine(line)) headers.push(line);
  }
  if (!headers.length) return null;
  const institution = headers[0];
  let credential = headers[1] && !looksLikeLocation(headers[1]) ? headers[1] : '';
  const location = headers.find((line, index) => index > 0 && line !== credential && looksLikeLocation(line)) || (credential ? headers[2] : headers[1]) || '';
  if (!credential) {
    credential = institution;
    warnings.push({ code: 'copied-credential', detail: clip(institution, 80) });
  }
  const loc = looksLikeLocation(location) || location !== credential ? location : '';
  return {
    institution: bilingual(institution, lang, true, fieldMax(schema, 'education', 'institution', 150)),
    credential: bilingual(credential, lang, true, fieldMax(schema, 'education', 'credential', 200)),
    location: bilingual(loc === credential ? '' : loc, lang, false, fieldMax(schema, 'education', 'location', 150)),
    startDate: date?.start ?? null,
    endDate: date?.current ? null : (date?.end ?? null),
    isCurrent: !!date?.current,
    dateLabel: date?.label ? bilingual(date.label, lang, false, fieldMax(schema, 'education', 'dateLabel', 60)) : null,
  };
}

function parseSkills(lines: string[], lang: Lang, schema: DataSchema): Record<string, unknown>[] {
  const groups: { category: string; items: string[] }[] = [];
  let category = '';
  let items: string[] = [];
  const flush = () => {
    if (!items.length) return;
    groups.push({ category: category || (lang === 'es' ? 'Habilidades' : 'Skills'), items: [...items] });
    items = [];
    category = '';
  };
  for (const raw of lines) {
    if (!raw) continue;
    const line = isBullet(raw) ? bulletText(raw) : raw;
    const labeled = line.match(/^(.{2,80}?)\s*[:–—]\s+(.+)$/);
    if (labeled && !isBullet(line)) {
      flush();
      category = labeled[1];
      items = splitList(labeled[2]);
      flush();
      continue;
    }
    if (line.endsWith(':')) {
      flush();
      category = line.slice(0, -1).trim();
      continue;
    }
    const parts = splitList(line);
    if (parts.length > 1) items.push(...parts);
    else if (parts.length === 1 && (category || line.includes(',') || line.length <= 40)) items.push(parts[0]);
    else {
      flush();
      category = line;
    }
  }
  flush();
  const categoryMax = fieldMax(schema, 'skills', 'category', 80);
  const nameMax = nestedMax(schema, 'skills', 'items', 'name', 80);
  return groups.slice(0, 30).map((group) => ({
    category: bilingual(group.category, lang, true, categoryMax),
    items: group.items.slice(0, 50).map((name) => ({ name: bilingual(name, lang, true, nameMax) })).filter((item) => item.name),
  })).filter((group) => group.category && group.items.length);
}

function parseLanguages(lines: string[], lang: Lang, schema: DataSchema): Record<string, unknown>[] {
  const nameMax = fieldMax(schema, 'languages', 'name', 60);
  const levelMax = fieldMax(schema, 'languages', 'level', 60);
  const items: Record<string, unknown>[] = [];
  for (const raw of lines) {
    if (!raw) continue;
    const line = isBullet(raw) ? bulletText(raw) : raw;
    const parts = line.split(/\s*(?:[:–—|]| - )\s*|\s+\(\s*/);
    const name = (parts[0] || '').replace(/\)$/, '').trim();
    const level = (parts[1] || '').replace(/\)$/, '').trim();
    const localizedName = bilingual(name, lang, true, nameMax);
    if (!localizedName) continue;
    items.push({ name: localizedName, level: bilingual(level, lang, false, levelMax) });
  }
  return items;
}

function parseCertifications(lines: string[], lang: Lang, schema: DataSchema): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];
  for (const raw of lines) {
    if (!raw) continue;
    if (/^https?:\/\//i.test(raw) && items.length) {
      items[items.length - 1]['url'] = clip(raw, fieldMax(schema, 'certifications', 'url', 300));
      continue;
    }
    const line = isBullet(raw) ? bulletText(raw) : raw;
    const parts = line.split(/\s*(?:[|–—]| - )\s*/).map((part) => part.trim()).filter(Boolean);
    const name = parts[0] || line;
    const datePart = parts.find((part) => !!parseDateLine(part) || /\b(?:19|20)\d{2}(?:[-/.](?:0?[1-9]|1[0-2]))?\b/.test(part));
    const issuer = parts.find((part) => part !== name && part !== datePart);
    const date = datePart ? parseDateLine(datePart) || yearMonth(datePart) : null;
    const localizedName = bilingual(name, lang, true, fieldMax(schema, 'certifications', 'name', 150));
    if (!localizedName) continue;
    items.push({
      name: localizedName,
      issuer: issuer ? clip(issuer, fieldMax(schema, 'certifications', 'issuer', 150)) : null,
      date: date?.start ?? null,
      url: null,
    });
  }
  return items;
}

function splitRole(line: string): { company: string; title: string } | null {
  const parts = line.split(/\s+[-|–—@]\s+|\s+at\s+|\s+en\s+/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const [left, right] = parts;
  const leftRole = ROLE.test(norm(left));
  const rightRole = ROLE.test(norm(right));
  if (rightRole && !leftRole) return { company: left, title: right };
  if (leftRole && !rightRole) return { company: right, title: left };
  return { company: left, title: right };
}

function isBullet(line: string): boolean {
  return /^([•·●▪◦*-]|\d+[.)])\s+\S/.test(line);
}

function bulletText(line: string): string {
  return line.replace(/^([•·●▪◦*-]|\d+[.)])\s+/, '').trim();
}

function splitList(line: string): string[] {
  return line.split(/\s*[,;•|/]\s*/).map((part) => part.trim()).filter((part) => part.length > 1 && part.length <= 80);
}

interface DateBits { start?: string; end?: string; current: boolean; label?: string }

function parseDateLine(line: string): DateBits | null {
  if (!line || isBullet(line) || line.length > 80) return null;
  const current = PRESENT.test(norm(line));
  const points = datePoints(line);
  const leftover = norm(line)
    .replace(PRESENT, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|ene|abr|ago|dic|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/g, ' ')
    .replace(/[^a-z]+/g, ' ')
    .trim();
  if (!points.length && !current) return null;
  if (leftover.length > 18 && !current) return null;
  const start = points.find((point) => point.ym)?.ym;
  const second = points.filter((point) => point.ym).slice(1)[0]?.ym;
  const years = points.filter((point) => point.label).map((point) => point.label!);
  let label: string | undefined;
  if (!start && years.length) label = years.join(' – ');
  else if (start && !second && !current && years.length) label = years.join(' – ');
  if (!start && !label && !current) return null;
  return { start, end: current ? undefined : second, current, label: label ? clip(label, 60) : undefined };
}

function yearMonth(line: string): DateBits | null {
  return parseDateLine(line);
}

function datePoints(line: string): { ym?: string; label?: string }[] {
  const out: { ym?: string; label?: string }[] = [];
  const re = /\b((?:19|20)\d{2})[-/.](0?[1-9]|1[0-2])\b|\b(0?[1-9]|1[0-2])[-/.]((?:19|20)\d{2})\b|\b([A-Za-zÁÉÍÓÚáéíóúñ]{3,12})\.?\s+((?:19|20)\d{2})\b|\b((?:19|20)\d{2})\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line))) {
    if (match[1] && match[2]) out.push({ ym: `${match[1]}-${match[2].padStart(2, '0')}` });
    else if (match[3] && match[4]) out.push({ ym: `${match[4]}-${match[3].padStart(2, '0')}` });
    else if (match[5] && match[6]) {
      const month = MONTHS[norm(match[5])];
      if (month) out.push({ ym: `${match[6]}-${month}` });
    } else if (match[7]) out.push({ label: match[7] });
  }
  return out;
}

function fieldOf(schema: DataSchema, section: string, key: string): FieldSchema | undefined {
  const fields = section === 'profile' ? schema.profile.fields : schema.sections[section]?.fields;
  return fields?.find((field) => field.key === key);
}

function fieldMax(schema: DataSchema, section: string, key: string, fallback: number): number {
  return fieldOf(schema, section, key)?.maxLength ?? fallback;
}

function nestedMax(schema: DataSchema, section: string, listKey: string, key: string, fallback: number): number {
  const list = fieldOf(schema, section, listKey);
  return list?.itemFields?.find((field) => field.key === key)?.maxLength ?? fallback;
}

function clip(value: string, max: number | null): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (max == null || text.length <= max) return text;
  return text.slice(0, max).trim();
}

function bilingual(text: string, lang: Lang, required: boolean, max: number | null): { en: string; es: string } | null {
  const value = clip(text, max);
  if (!value) return null;
  if (required) return { en: value, es: value };
  return { en: lang === 'en' ? value : '', es: lang === 'es' ? value : '' };
}
