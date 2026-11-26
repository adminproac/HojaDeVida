/** Convierte el documento JSON en filas y al revés. Sin secretos. */

const SECTIONS = ['summary', 'experience', 'otherExperience', 'education', 'skills', 'languages', 'certifications', 'additionalInfo'];

function pair(value) {
  if (value == null) return { en: null, es: null };
  if (typeof value === 'string') return { en: value, es: value };
  return { en: value.en ?? null, es: value.es ?? null };
}

function pairOut(en, es) {
  if (en == null && es == null) return null;
  return { en: en ?? '', es: es ?? '' };
}

function bit(value) {
  return value ? 1 : 0;
}

function flag(value) {
  return value === 1 || value === true;
}

export function rowsFromDocument(doc) {
  const meta = doc?.meta || {};
  const people = Array.isArray(doc?.people) ? doc.people : [];
  const rows = {
    meta: {
      id: 1,
      schema_version: meta.schemaVersion || '3.0.0',
      app_name: meta.app ?? null,
      default_language: meta.defaultLanguage || 'es',
      source_note: meta.source ?? null,
      last_updated: meta.lastUpdated || new Date().toISOString(),
    },
    languages: (Array.isArray(meta.supportedLanguages) && meta.supportedLanguages.length ? meta.supportedLanguages : ['en', 'es'])
      .map((code) => ({ meta_id: 1, language_code: code })),
    people: [],
    summaries: [],
    jobs: [],
    highlights: [],
    education: [],
    skillGroups: [],
    skillItems: [],
    spoken: [],
    certifications: [],
    notes: [],
  };

  people.forEach((person, index) => {
    const profile = person.profile || {};
    const headline = pair(profile.headline);
    const location = pair(profile.location);
    rows.people.push({
      id: person.id,
      sort_order: index + 1,
      created_at: person.createdAt ?? null,
      updated_at: person.updatedAt ?? null,
      full_name: profile.fullName ?? '',
      headline_en: headline.en,
      headline_es: headline.es,
      email: profile.email ?? '',
      phone: profile.phone ?? null,
      location_en: location.en,
      location_es: location.es,
      website: profile.website ?? null,
      photo_url: profile.photoUrl ?? null,
    });
    for (const item of person.summary || []) {
      const text = pair(item.text);
      rows.summaries.push({
        id: item.id, person_id: person.id, sort_order: item.order, created_at: item.createdAt ?? null, updated_at: item.updatedAt ?? null,
        text_en: text.en ?? '', text_es: text.es ?? '',
      });
    }
    for (const section of ['experience', 'otherExperience']) {
      for (const item of person[section] || []) {
        const title = pair(item.title);
        const where = pair(item.location);
        const label = pair(item.dateLabel);
        rows.jobs.push({
          id: item.id, person_id: person.id, section_code: section, sort_order: item.order,
          created_at: item.createdAt ?? null, updated_at: item.updatedAt ?? null, company: item.company ?? '',
          title_en: title.en, title_es: title.es, location_en: where.en, location_es: where.es,
          start_date: item.startDate ?? null, end_date: item.endDate ?? null, is_current: bit(item.isCurrent),
          date_label_en: label.en, date_label_es: label.es,
        });
        for (const bullet of item.highlights || []) {
          const text = pair(bullet.text);
          rows.highlights.push({
            id: bullet.id, job_id: item.id, sort_order: bullet.order, text_en: text.en ?? '', text_es: text.es ?? '',
          });
        }
      }
    }
    for (const item of person.education || []) {
      const institution = pair(item.institution);
      const credential = pair(item.credential);
      const where = pair(item.location);
      const label = pair(item.dateLabel);
      rows.education.push({
        id: item.id, person_id: person.id, sort_order: item.order, created_at: item.createdAt ?? null, updated_at: item.updatedAt ?? null,
        institution_en: institution.en, institution_es: institution.es, credential_en: credential.en, credential_es: credential.es,
        location_en: where.en, location_es: where.es, start_date: item.startDate ?? null, end_date: item.endDate ?? null,
        is_current: bit(item.isCurrent), date_label_en: label.en, date_label_es: label.es,
      });
    }
    for (const group of person.skills || []) {
      const category = pair(group.category);
      rows.skillGroups.push({
        id: group.id, person_id: person.id, sort_order: group.order, created_at: group.createdAt ?? null, updated_at: group.updatedAt ?? null,
        category_en: category.en, category_es: category.es,
      });
      for (const item of group.items || []) {
        const name = pair(item.name);
        rows.skillItems.push({ id: item.id, skill_group_id: group.id, sort_order: item.order, name_en: name.en, name_es: name.es });
      }
    }
    for (const item of person.languages || []) {
      const name = pair(item.name);
      const level = pair(item.level);
      rows.spoken.push({
        id: item.id, person_id: person.id, sort_order: item.order, created_at: item.createdAt ?? null, updated_at: item.updatedAt ?? null,
        name_en: name.en, name_es: name.es, level_en: level.en, level_es: level.es,
      });
    }
    for (const item of person.certifications || []) {
      const name = pair(item.name);
      rows.certifications.push({
        id: item.id, person_id: person.id, sort_order: item.order, created_at: item.createdAt ?? null, updated_at: item.updatedAt ?? null,
        name_en: name.en, name_es: name.es, issuer: item.issuer ?? null, earned_on: item.date ?? null, url: item.url ?? null,
      });
    }
    for (const item of person.additionalInfo || []) {
      const text = pair(item.text);
      rows.notes.push({
        id: item.id, person_id: person.id, sort_order: item.order, created_at: item.createdAt ?? null, updated_at: item.updatedAt ?? null,
        text_en: text.en ?? '', text_es: text.es ?? '',
      });
    }
  });
  return rows;
}

function byOrder(list) {
  return [...list].sort((a, b) => a.sort_order - b.sort_order || String(a.id).localeCompare(String(b.id)));
}

function stamp(row) {
  const out = {};
  if (row.created_at != null) out.createdAt = row.created_at;
  if (row.updated_at != null) out.updatedAt = row.updated_at;
  return out;
}

export function documentFromRows(rows) {
  const meta = rows.meta || { schema_version: '3.0.0', default_language: 'es', last_updated: new Date().toISOString() };
  const highlights = new Map();
  for (const bullet of rows.highlights || []) {
    const list = highlights.get(bullet.job_id) || [];
    list.push(bullet);
    highlights.set(bullet.job_id, list);
  }
  const skillItems = new Map();
  for (const item of rows.skillItems || []) {
    const list = skillItems.get(item.skill_group_id) || [];
    list.push(item);
    skillItems.set(item.skill_group_id, list);
  }
  const grouped = {
    summaries: new Map(), jobs: new Map(), education: new Map(), skillGroups: new Map(),
    spoken: new Map(), certifications: new Map(), notes: new Map(),
  };
  const put = (mapName, row) => {
    const list = grouped[mapName].get(row.person_id) || [];
    list.push(row);
    grouped[mapName].set(row.person_id, list);
  };
  for (const row of rows.summaries || []) put('summaries', row);
  for (const row of rows.jobs || []) put('jobs', row);
  for (const row of rows.education || []) put('education', row);
  for (const row of rows.skillGroups || []) put('skillGroups', row);
  for (const row of rows.spoken || []) put('spoken', row);
  for (const row of rows.certifications || []) put('certifications', row);
  for (const row of rows.notes || []) put('notes', row);

  const people = byOrder(rows.people || []).map((person) => {
    const jobs = byOrder(grouped.jobs.get(person.id) || []);
    const jobOf = (section) => jobs.filter((job) => job.section_code === section).map((job) => ({
      id: job.id,
      order: job.sort_order,
      ...stamp(job),
      company: job.company,
      title: pairOut(job.title_en, job.title_es),
      location: pairOut(job.location_en, job.location_es),
      startDate: job.start_date,
      endDate: job.end_date,
      isCurrent: flag(job.is_current),
      dateLabel: pairOut(job.date_label_en, job.date_label_es),
      highlights: byOrder(highlights.get(job.id) || []).map((bullet) => ({
        id: bullet.id,
        order: bullet.sort_order,
        text: pairOut(bullet.text_en, bullet.text_es) || { en: '', es: '' },
      })),
    }));
    return {
      id: person.id,
      profile: {
        fullName: person.full_name,
        headline: pairOut(person.headline_en, person.headline_es),
        email: person.email,
        phone: person.phone,
        location: pairOut(person.location_en, person.location_es),
        website: person.website,
        photoUrl: person.photo_url,
      },
      summary: byOrder(grouped.summaries.get(person.id) || []).map((item) => ({
        id: item.id, order: item.sort_order, ...stamp(item), text: pairOut(item.text_en, item.text_es) || { en: '', es: '' },
      })),
      experience: jobOf('experience'),
      otherExperience: jobOf('otherExperience'),
      education: byOrder(grouped.education.get(person.id) || []).map((item) => ({
        id: item.id,
        order: item.sort_order,
        ...stamp(item),
        institution: pairOut(item.institution_en, item.institution_es),
        credential: pairOut(item.credential_en, item.credential_es),
        location: pairOut(item.location_en, item.location_es),
        startDate: item.start_date,
        endDate: item.end_date,
        isCurrent: flag(item.is_current),
        dateLabel: pairOut(item.date_label_en, item.date_label_es),
      })),
      skills: byOrder(grouped.skillGroups.get(person.id) || []).map((group) => ({
        id: group.id,
        order: group.sort_order,
        ...stamp(group),
        category: pairOut(group.category_en, group.category_es),
        items: byOrder(skillItems.get(group.id) || []).map((item) => ({
          id: item.id, order: item.sort_order, name: pairOut(item.name_en, item.name_es),
        })),
      })),
      languages: byOrder(grouped.spoken.get(person.id) || []).map((item) => ({
        id: item.id, order: item.sort_order, ...stamp(item), name: pairOut(item.name_en, item.name_es), level: pairOut(item.level_en, item.level_es),
      })),
      certifications: byOrder(grouped.certifications.get(person.id) || []).map((item) => ({
        id: item.id, order: item.sort_order, ...stamp(item), name: pairOut(item.name_en, item.name_es), issuer: item.issuer, date: item.earned_on, url: item.url,
      })),
      additionalInfo: byOrder(grouped.notes.get(person.id) || []).map((item) => ({
        id: item.id, order: item.sort_order, ...stamp(item), text: pairOut(item.text_en, item.text_es) || { en: '', es: '' },
      })),
      ...(person.created_at != null ? { createdAt: person.created_at } : {}),
      ...(person.updated_at != null ? { updatedAt: person.updated_at } : {}),
    };
  });

  return {
    meta: {
      schemaVersion: meta.schema_version,
      ...(meta.app_name != null ? { app: meta.app_name } : {}),
      defaultLanguage: meta.default_language,
      supportedLanguages: (rows.languages || []).map((row) => row.language_code),
      ...(meta.source_note != null ? { source: meta.source_note } : {}),
      lastUpdated: meta.last_updated,
    },
    people,
  };
}

export { SECTIONS };

function columns(row) {
  return Object.keys(row);
}

export function insertPlans(rows, options = {}) {
  const plans = [];
  const add = (table, list) => {
    for (const row of list || []) {
      const cols = columns(row);
      plans.push({
        sql: `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        params: cols.map((col) => row[col]),
      });
    }
  };
  if (options.includeMeta !== false) {
    plans.push({
      sql: `INSERT INTO document_meta (id, schema_version, app_name, default_language, source_note, last_updated) VALUES (?, ?, ?, ?, ?, ?)`,
      params: [rows.meta.id, rows.meta.schema_version, rows.meta.app_name, rows.meta.default_language, rows.meta.source_note, rows.meta.last_updated],
    });
    add('document_language', rows.languages);
  }
  add('person', rows.people);
  add('summary_item', rows.summaries);
  add('job', rows.jobs);
  add('job_highlight', rows.highlights);
  add('education_item', rows.education);
  add('skill_group', rows.skillGroups);
  add('skill_item', rows.skillItems);
  add('spoken_language', rows.spoken);
  add('certification', rows.certifications);
  add('note_item', rows.notes);
  return plans;
}

export const CLEAR_SQL = [
  'DELETE FROM skill_item',
  'DELETE FROM skill_group',
  'DELETE FROM job_highlight',
  'DELETE FROM job',
  'DELETE FROM education_item',
  'DELETE FROM summary_item',
  'DELETE FROM spoken_language',
  'DELETE FROM certification',
  'DELETE FROM note_item',
  'DELETE FROM person',
  'DELETE FROM document_language',
  'DELETE FROM document_meta',
];

export function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function renderSeed(doc) {
  const plans = insertPlans(rowsFromDocument(doc));
  const lines = CLEAR_SQL.map((sql) => `${sql};`);
  for (const plan of plans) {
    let index = 0;
    const sql = plan.sql.replaceAll('?', () => sqlLiteral(plan.params[index++]));
    lines.push(`${sql};`);
  }
  return `${lines.join('\n')}\n`;
}

export function personRows(person, sortOrder) {
  const wrapped = rowsFromDocument({ meta: { schemaVersion: '3.0.0', defaultLanguage: 'es', supportedLanguages: ['en', 'es'], lastUpdated: new Date().toISOString() }, people: [person] });
  if (wrapped.people[0]) wrapped.people[0].sort_order = sortOrder;
  return wrapped;
}
