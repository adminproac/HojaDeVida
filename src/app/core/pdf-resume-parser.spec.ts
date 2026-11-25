import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { DataSchema } from './models';
import { decryptToken, encryptToken, hashPassword, verifyPassword } from './password-crypto';
import { parseResumeText } from './pdf-resume-parser';
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
    expect(doc.meta.schemaVersion).toBe('3.0.0');
    expect(doc.meta.defaultLanguage).toBe('es');
    expect(doc.users).toEqual([]);
    expect(doc.people.length).toBeGreaterThan(0);
    expect(doc.people[0].profile.fullName).toBeTruthy();
    expect(doc.people[0].id).toBeTruthy();
  });
});

describe('password and session', () => {
  it('hashes a password and rejects a different one', async () => {
    const record = await hashPassword('correct horse');
    expect(record.iterations).toBeGreaterThanOrEqual(210000);
    expect(record.passwordHash).not.toContain('correct horse');
    expect(await verifyPassword('correct horse', record)).toBe(true);
    expect(await verifyPassword('wrong horse', record)).toBe(false);
  });

  it('encrypts a token and decrypts it only with the same password', async () => {
    const secret = 'token-de-prueba';
    const encrypted = await encryptToken('clave-larga', secret);
    expect(encrypted.ciphertext).not.toContain('token-de-prueba');
    expect(await decryptToken('clave-larga', encrypted)).toBe(secret);
    await expect(decryptToken('otra-clave', encrypted)).rejects.toBeTruthy();
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
