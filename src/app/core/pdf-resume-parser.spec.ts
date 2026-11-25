import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { DataSchema, ResumeDocument } from './models';
import { exchangeEndpoint, oauthConfigured, oauthRedirectUri, oauthStateMatches, tokenIsOnlyInMemory } from './oauth';
import { parseResumeText } from './pdf-resume-parser';
import { asDataDocument } from './resume-schema';
import { SESSION_TIMEOUT_MS, SESSION_WARN_MS, sessionClock } from './session-clock';
import { extractPdfText } from './pdf-text';

const schema = JSON.parse(readFileSync(path.resolve('src/app/core/resume-schema.json'), 'utf8')) as DataSchema;

const SPANISH = `
ANA MARIA LOPEZ
Ingeniera de software
ana.lopez@example.com | +57 300 123 4567 | Bogota, Colombia
https://www.linkedin.com/in/ana-lopez

RESUMEN
Ingeniera de software con ocho anos de experiencia en aplicaciones web.

EXPERIENCIA
Acme Corp — Desarrolladora senior
Bogota
2020-03 - Actualidad
• Lidero un equipo de cinco personas
• Redujo el tiempo de despliegue

Globex — Analista
Medellin
2016-01 - 2020-02
- Soporte a produccion

EDUCACION
Universidad Nacional
Ingenieria de sistemas
2011 - 2016

HABILIDADES
Lenguajes: TypeScript, JavaScript, Python
Herramientas: Docker, Git

IDIOMAS
Espanol — Nativo
Ingles — Avanzado

CERTIFICACIONES
AWS Certified Developer — Amazon — 2022-06

INFORMACION ADICIONAL
Disponibilidad inmediata
`;

describe('resume data file', () => {
  it('stores people only, without field types or sizes', () => {
    const doc = JSON.parse(readFileSync(path.resolve('Data/resume-data.json'), 'utf8'));
    expect(doc.schema).toBeUndefined();
    expect(doc.users).toBeUndefined();
    expect(doc.meta.schemaVersion).toBe('3.0.0');
    expect(doc.meta.defaultLanguage).toBe('es');
    expect(doc.people).toHaveLength(7);
    expect(doc.people.length).toBeGreaterThan(0);
    expect(doc.people[0].profile.fullName).toBeTruthy();
    expect(doc.people[0].id).toBeTruthy();
  });
});

describe('GitHub OAuth session', () => {
  it('rejects a missing or different OAuth state', () => {
    const state = 'a'.repeat(32);
    expect(oauthStateMatches(state, state)).toBe(true);
    expect(oauthStateMatches(state, 'b'.repeat(32))).toBe(false);
    expect(oauthStateMatches(null, state)).toBe(false);
    expect(oauthStateMatches('short', 'short')).toBe(false);
  });

  it('keeps the access token in memory and out of storage', () => {
    const token = 'gho_solo_en_memoria';
    localStorage.setItem('resume-admin.oauthState', 'a'.repeat(32));
    expect(tokenIsOnlyInMemory(token, localStorage, sessionStorage)).toBe(true);
    sessionStorage.setItem('resume-admin.session', JSON.stringify({ token }));
    expect(tokenIsOnlyInMemory(token, localStorage, sessionStorage)).toBe(false);
    sessionStorage.clear();
    localStorage.setItem('resume-admin.githubToken', token);
    expect(tokenIsOnlyInMemory(token, localStorage, sessionStorage)).toBe(false);
    localStorage.clear();
  });

  it('treats a placeholder Worker URL as not configured', () => {
    expect(oauthConfigured('', '', true)).toBe(false);
    expect(oauthConfigured('Iv1.public', 'https://hojadevida-oauth.<subdominio>.workers.dev', true)).toBe(false);
    expect(oauthConfigured('Iv1.public', 'https://hojadevida-oauth.ejemplo.workers.dev', true)).toBe(true);
    expect(oauthConfigured('Iv1.public', '', false)).toBe(true);
    expect(oauthRedirectUri('https://adminproac.github.io/HojaDeVida/')).toBe('https://adminproac.github.io/HojaDeVida/auth/callback');
    expect(oauthRedirectUri('http://localhost:4200/')).toBe('http://localhost:4200/auth/callback');
    expect(exchangeEndpoint('https://hojadevida-oauth.ejemplo.workers.dev')).toBe('https://hojadevida-oauth.ejemplo.workers.dev/api/oauth/exchange');
    expect(exchangeEndpoint('')).toBe('/api/oauth/exchange');
  });

  it('drops a legacy users array without changing people', () => {
    const people = [{ id: 'person-001', profile: { fullName: 'JESUS EDGAR DUARTE CACERES' } }];
    const doc = asDataDocument({
      meta: { schemaVersion: '3.0.0', defaultLanguage: 'es', supportedLanguages: ['en', 'es'], lastUpdated: '2026-01-01T00:00:00.000Z' },
      users: [{ username: 'viejo', passwordHash: 'x' }],
      people,
    } as unknown as ResumeDocument);
    expect(doc.users).toBeUndefined();
    expect(doc.people).toEqual(people);
    const source = readFileSync(path.resolve('src/app/core/session.service.ts'), 'utf8');
    expect(source).not.toContain('localStorage.setItem');
    expect(source).not.toContain("'resume-admin.session'");
    expect(source.match(/sessionStorage\.setItem/g)).toEqual(['sessionStorage.setItem']);
    expect(source).toContain('sessionStorage.setItem(OAUTH_STATE_KEY, state)');
  });

  it('expires a session after 5 idle minutes and warns 30 seconds before', () => {
    const start = 1_000_000;
    expect(sessionClock(start, start + 1000)).toBe('active');
    expect(sessionClock(start, start + SESSION_TIMEOUT_MS - SESSION_WARN_MS)).toBe('warning');
    expect(sessionClock(start, start + SESSION_TIMEOUT_MS - 1)).toBe('warning');
    expect(sessionClock(start, start + SESSION_TIMEOUT_MS)).toBe('expired');
  });
});

describe('parseResumeText', () => {
  it('parses a Spanish résumé into the schema shape', () => {
    const parsed = parseResumeText(SPANISH, schema);
    expect(parsed.language).toBe('es');
    expect(parsed.profile['fullName']).toBe('ANA MARIA LOPEZ');
    expect(parsed.profile['email']).toBe('ana.lopez@example.com');
    expect(parsed.profile['phone']).toBe('+57 300 123 4567');
    expect(parsed.profile['website']).toBe('https://www.linkedin.com/in/ana-lopez');
    expect(parsed.profile['headline']).toEqual({ en: '', es: 'Ingeniera de software' });
    expect(parsed.profile['location']).toEqual({ en: '', es: 'Bogota, Colombia' });

    expect(parsed.sections['summary']).toHaveLength(1);
    expect(parsed.sections['summary'][0]['text']).toEqual({
      en: 'Ingeniera de software con ocho anos de experiencia en aplicaciones web.',
      es: 'Ingeniera de software con ocho anos de experiencia en aplicaciones web.',
    });

    const jobs = parsed.sections['experience'];
    expect(jobs).toHaveLength(2);
    expect(jobs[0]['company']).toBe('Acme Corp');
    expect(jobs[0]['title']).toEqual({ en: 'Desarrolladora senior', es: 'Desarrolladora senior' });
    expect(jobs[0]['startDate']).toBe('2020-03');
    expect(jobs[0]['isCurrent']).toBe(true);
    expect(jobs[0]['endDate']).toBeNull();
    expect(jobs[0]['highlights']).toHaveLength(2);
    expect(jobs[1]['company']).toBe('Globex');
    expect(jobs[1]['startDate']).toBe('2016-01');
    expect(jobs[1]['endDate']).toBe('2020-02');

    expect(parsed.sections['education'][0]['institution']).toEqual({ en: 'Universidad Nacional', es: 'Universidad Nacional' });
    expect(parsed.sections['education'][0]['credential']).toEqual({ en: 'Ingenieria de sistemas', es: 'Ingenieria de sistemas' });
    expect(parsed.sections['education'][0]['dateLabel']).toEqual({ en: '', es: '2011 – 2016' });

    expect(parsed.sections['skills'].map((group) => (group['category'] as { es: string }).es)).toEqual(['Lenguajes', 'Herramientas']);
    expect(parsed.sections['skills'][0]['items']).toHaveLength(3);
    expect(parsed.sections['languages'].map((item) => (item['name'] as { es: string }).es)).toEqual(['Espanol', 'Ingles']);
    expect(parsed.sections['languages'][0]['level']).toEqual({ en: '', es: 'Nativo' });
    expect(parsed.sections['certifications'][0]).toMatchObject({
      issuer: 'Amazon',
      date: '2022-06',
    });
    expect(parsed.sections['additionalInfo']).toHaveLength(1);
    expect(parsed.sections['otherExperience']).toEqual([]);
    for (const key of schema.person.sections) expect(parsed.sections[key]).toBeDefined();
  });

  it('parses an English résumé and keeps the other language blank on optional fields', () => {
    const text = `
JANE DOE
Software engineer
jane.doe@example.com
+1 404 555 0199

SUMMARY
Builds reliable web services.

EXPERIENCE
Senior Engineer at Northwind
Atlanta, USA
Mar 2019 - Present
• Led a migration to TypeScript

EDUCATION
Georgia Tech
B.S. Computer Science
2014 - 2018

SKILLS
Languages: TypeScript, Go

LANGUAGES
English — Native

CERTIFICATIONS
CKA — CNCF — 2021-11
`;
    const parsed = parseResumeText(text, schema);
    expect(parsed.language).toBe('en');
    expect(parsed.profile['fullName']).toBe('JANE DOE');
    expect(parsed.profile['email']).toBe('jane.doe@example.com');
    expect(parsed.profile['headline']).toEqual({ en: 'Software engineer', es: '' });
    expect(parsed.sections['experience'][0]['company']).toBe('Northwind');
    expect(parsed.sections['experience'][0]['title']).toEqual({ en: 'Senior Engineer', es: 'Senior Engineer' });
    expect(parsed.sections['experience'][0]['startDate']).toBe('2019-03');
    expect(parsed.sections['experience'][0]['isCurrent']).toBe(true);
    expect(parsed.sections['education'][0]['credential']).toEqual({ en: 'B.S. Computer Science', es: 'B.S. Computer Science' });
    expect(parsed.sections['certifications'][0]['date']).toBe('2021-11');
  });

  it('truncates to the schema maxLength and copies a missing job title', () => {
    const long = 'X'.repeat(180);
    const parsed = parseResumeText(`
ADA LOVELACE
ada@example.com

EXPERIENCE
${long}
2018-01 - 2019-06
• Kept the machines running
`, schema);
    expect(parsed.sections['experience'][0]['company']).toHaveLength(150);
    expect(parsed.sections['experience'][0]['title']).toEqual({
      en: 'X'.repeat(150),
      es: 'X'.repeat(150),
    });
    expect(parsed.warnings.some((warning) => warning.code === 'copied-title')).toBe(true);
    expect((parsed.sections['experience'][0]['highlights'] as { text: { en: string } }[])[0].text.en.length).toBeLessThanOrEqual(600);
  });

  it('reads a generated PDF and parses the same person', async () => {
    const lines = [
      'ANA MARIA LOPEZ',
      'Ingeniera de software',
      'ana.lopez@example.com',
      '+57 300 123 4567',
      'https://www.linkedin.com/in/ana-lopez',
      'RESUMEN',
      'Ingeniera de software con ocho anos de experiencia.',
      'EXPERIENCIA',
      'Acme Corp - Desarrolladora senior',
      '2020-03 - Present',
      '- Lidero un equipo de cinco personas',
      'EDUCACION',
      'Universidad Nacional',
      'Ingenieria de sistemas',
      'HABILIDADES',
      'Lenguajes: TypeScript, Python',
      'IDIOMAS',
      'Espanol - Nativo',
    ];
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage([612, 792]);
    let y = 750;
    for (const line of lines) {
      page.drawText(line, { x: 48, y, size: 12, font });
      y -= 18;
    }
    const bytes = await pdf.save();
    const worker = pathToFileURL(path.resolve('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs')).href;
    const text = await extractPdfText(bytes, worker);
    expect(text).toContain('ANA MARIA LOPEZ');
    expect(text).toContain('ana.lopez@example.com');
    const parsed = parseResumeText(text, schema);
    expect(parsed.profile['fullName']).toBe('ANA MARIA LOPEZ');
    expect(parsed.profile['email']).toBe('ana.lopez@example.com');
    expect(parsed.sections['experience'][0]['company']).toBe('Acme Corp');
    expect(parsed.sections['skills'][0]['items']).toHaveLength(2);
  });
});
