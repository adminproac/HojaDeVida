import { CLEAR_SQL, documentFromRows, insertPlans, personRows, rowsFromDocument } from './document.js';

async function all(db, sql, ...params) {
  const result = params.length ? await db.prepare(sql).bind(...params).all() : await db.prepare(sql).all();
  return result.results || [];
}

export async function readDocument(db) {
  const metaRows = await all(db, 'SELECT id, schema_version, app_name, default_language, source_note, last_updated FROM document_meta WHERE id = 1');
  const meta = metaRows[0] || {
    schema_version: '3.0.0', app_name: 'Resume Admin', default_language: 'es', source_note: null, last_updated: new Date().toISOString(),
  };
  return documentFromRows({
    meta,
    languages: await all(db, 'SELECT meta_id, language_code FROM document_language ORDER BY language_code'),
    people: await all(db, 'SELECT * FROM person ORDER BY sort_order, id'),
    summaries: await all(db, 'SELECT * FROM summary_item'),
    jobs: await all(db, 'SELECT * FROM job'),
    highlights: await all(db, 'SELECT * FROM job_highlight'),
    education: await all(db, 'SELECT * FROM education_item'),
    skillGroups: await all(db, 'SELECT * FROM skill_group'),
    skillItems: await all(db, 'SELECT * FROM skill_item'),
    spoken: await all(db, 'SELECT * FROM spoken_language'),
    certifications: await all(db, 'SELECT * FROM certification'),
    notes: await all(db, 'SELECT * FROM note_item'),
  });
}

async function runBatch(db, statements) {
  const chunk = 80;
  for (let i = 0; i < statements.length; i += chunk) {
    await db.batch(statements.slice(i, i + chunk));
  }
}

export async function replaceDocument(db, doc) {
  const plans = insertPlans(rowsFromDocument(doc));
  const statements = [
    ...CLEAR_SQL.map((sql) => db.prepare(sql)),
    ...plans.map((plan) => db.prepare(plan.sql).bind(...plan.params)),
  ];
  await runBatch(db, statements);
  return readDocument(db);
}

async function deletePersonRows(db, personId) {
  await runBatch(db, [
    db.prepare('DELETE FROM skill_item WHERE skill_group_id IN (SELECT id FROM skill_group WHERE person_id = ?)').bind(personId),
    db.prepare('DELETE FROM skill_group WHERE person_id = ?').bind(personId),
    db.prepare('DELETE FROM job_highlight WHERE job_id IN (SELECT id FROM job WHERE person_id = ?)').bind(personId),
    db.prepare('DELETE FROM job WHERE person_id = ?').bind(personId),
    db.prepare('DELETE FROM education_item WHERE person_id = ?').bind(personId),
    db.prepare('DELETE FROM summary_item WHERE person_id = ?').bind(personId),
    db.prepare('DELETE FROM spoken_language WHERE person_id = ?').bind(personId),
    db.prepare('DELETE FROM certification WHERE person_id = ?').bind(personId),
    db.prepare('DELETE FROM note_item WHERE person_id = ?').bind(personId),
    db.prepare('DELETE FROM person WHERE id = ?').bind(personId),
  ]);
}

async function touchMeta(db) {
  const now = new Date().toISOString();
  const existing = await all(db, 'SELECT id FROM document_meta WHERE id = 1');
  if (!existing.length) {
    await db.prepare('INSERT INTO document_meta (id, schema_version, app_name, default_language, source_note, last_updated) VALUES (1, ?, ?, ?, NULL, ?)')
      .bind('3.0.0', 'Resume Admin', 'es', now).run();
    await db.prepare('INSERT INTO document_language (meta_id, language_code) VALUES (1, ?), (1, ?)').bind('en', 'es').run();
  } else {
    await db.prepare('UPDATE document_meta SET last_updated = ? WHERE id = 1').bind(now).run();
  }
}

export async function insertPerson(db, person) {
  const found = await all(db, 'SELECT id FROM person WHERE id = ?', person.id);
  if (found.length) {
    const error = new Error('Esa persona ya existe');
    error.status = 409;
    throw error;
  }
  const maxRow = await all(db, 'SELECT COALESCE(MAX(sort_order), 0) AS next_order FROM person');
  const sortOrder = Number(maxRow[0]?.next_order || 0) + 1;
  const rows = personRows(person, sortOrder);
  const plans = insertPlans(rows, { includeMeta: false });
  await touchMeta(db);
  await runBatch(db, plans.map((plan) => db.prepare(plan.sql).bind(...plan.params)));
  return person;
}

export async function replacePerson(db, personId, person) {
  if (person.id !== personId) {
    const error = new Error('El id de la persona no coincide');
    error.status = 400;
    throw error;
  }
  const found = await all(db, 'SELECT sort_order FROM person WHERE id = ?', personId);
  if (!found.length) {
    const error = new Error('No se encontró la persona');
    error.status = 404;
    throw error;
  }
  const rows = personRows(person, found[0].sort_order);
  const plans = insertPlans(rows, { includeMeta: false });
  await deletePersonRows(db, personId);
  await touchMeta(db);
  await runBatch(db, plans.map((plan) => db.prepare(plan.sql).bind(...plan.params)));
  return person;
}

export async function removePerson(db, personId) {
  const found = await all(db, 'SELECT id FROM person WHERE id = ?', personId);
  if (!found.length) {
    const error = new Error('No se encontró la persona');
    error.status = 404;
    throw error;
  }
  await deletePersonRows(db, personId);
  await touchMeta(db);
}
