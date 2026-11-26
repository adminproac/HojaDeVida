import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { handleDataRequest } from './src/api.js';
import { documentFromRows, renderSeed, rowsFromDocument } from './src/document.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const original = JSON.parse(readFileSync(path.join(root, 'Data/resume-data.json'), 'utf8'));

test('the seed round-trips every person through SQLite', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(readFileSync(path.join(root, 'worker/migrations/0001_init.sql'), 'utf8'));
  db.exec(renderSeed(original));
  const read = (sql) => db.prepare(sql).all();
  const doc = documentFromRows({
    meta: read('SELECT * FROM document_meta')[0],
    languages: read('SELECT * FROM document_language ORDER BY language_code'),
    people: read('SELECT * FROM person ORDER BY sort_order, id'),
    summaries: read('SELECT * FROM summary_item'),
    jobs: read('SELECT * FROM job'),
    highlights: read('SELECT * FROM job_highlight'),
    education: read('SELECT * FROM education_item'),
    skillGroups: read('SELECT * FROM skill_group'),
    skillItems: read('SELECT * FROM skill_item'),
    spoken: read('SELECT * FROM spoken_language'),
    certifications: read('SELECT * FROM certification'),
    notes: read('SELECT * FROM note_item'),
  });
  assert.equal(doc.people.length, original.people.length);
  assert.deepEqual(doc.people.map((person) => person.id), original.people.map((person) => person.id));
  assert.equal(doc.people[0].profile.fullName, original.people[0].profile.fullName);
  assert.deepEqual(doc.people, original.people);
  assert.equal(doc.meta.schemaVersion, original.meta.schemaVersion);
  assert.deepEqual(doc.meta.supportedLanguages, ['en', 'es']);
});

test('rows keep the person count', () => {
  const rows = rowsFromDocument(original);
  assert.equal(rows.people.length, original.people.length);
  assert.ok(rows.jobs.length > 0);
  assert.ok(rows.highlights.length > 0);
});

test('writes without a token are rejected and a foreign origin is blocked', async () => {
  const denied = await handleDataRequest(new Request('https://hojadevida-oauth.example.workers.dev/api/people', {
    method: 'POST',
    headers: { Origin: 'https://adminproac.github.io', 'Content-Type': 'application/json' },
    body: '{}',
  }), { DB: {} });
  assert.equal(denied.status, 401);
  const text = await denied.text();
  assert.equal(text.includes('access_token'), false);
  const foreign = await handleDataRequest(new Request('https://hojadevida-oauth.example.workers.dev/api/people', {
    method: 'GET',
    headers: { Origin: 'https://evil.example' },
  }), { DB: {} });
  assert.equal(foreign.status, 403);
});
