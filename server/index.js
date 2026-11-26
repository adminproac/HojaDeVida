'use strict';
/**
 * API REST para administrar Data/resume-data.json.
 * REST API that manages Data/resume-data.json.
 *
 *   npm run api            -> http://localhost:3000/api
 */
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const store = require('./store');
const { validate, newId, ValidationError } = require('./validate');
const { loadEnv } = require('./env');
const SCHEMA = require('../src/app/core/resume-schema.json');

loadEnv();

const PORT = Number(process.env.PORT) || 3000;
const app = express();
app.use(express.json({ limit: '5mb' }));

const now = () => new Date().toISOString();
const sortByOrder = (arr) => arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const renumber = (arr) => sortByOrder(arr).forEach((it, i) => (it.order = i + 1));

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function findPerson(doc, id) {
  const person = (doc.people || []).find((p) => p.id === id);
  if (!person) throw httpError(404, `Person '${id}' not found`);
  return person;
}

function sectionSchema(_doc, key) {
  const s = SCHEMA.sections?.[key];
  if (!s) throw httpError(404, `Section '${key}' does not exist`);
  return s;
}

function emptySections(_doc) {
  const out = {};
  for (const key of Object.keys(SCHEMA.sections)) out[key] = [];
  return out;
}

const PREFIX = {
  summary: 'sum', experience: 'exp', otherExperience: 'oexp', education: 'edu', skills: 'skill-group',
  languages: 'lang', certifications: 'cert', additionalInfo: 'info',
};

// Envuelve handlers async para enviar errores al middleware.
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

const api = express.Router();

api.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return res.status(401).json({ message: '401 — Sesión requerida' });
  next();
});

api.get('/health', (req, res) => res.json({ ok: true, dataFile: store.DATA_FILE, exists: store.exists() }));

api.get('/data', h(async (req, res) => res.json(await store.read())));

api.get('/schema', (req, res) => res.json(SCHEMA));

// ---------- People ----------
api.get('/people', h(async (req, res) => {
  const doc = await store.read();
  const q = String(req.query.q || '').trim().toLowerCase();
  let people = doc.people || [];
  if (q) people = people.filter((p) => JSON.stringify(p.profile).toLowerCase().includes(q));
  res.json(people);
}));

api.get('/people/:id', h(async (req, res) => res.json(findPerson(await store.read(), req.params.id))));

api.post('/people', h(async (req, res) => {
  const created = await store.update((doc) => {
    const profile = validate(SCHEMA.profile.fields, req.body?.profile ?? req.body, 'profile');
    const person = { id: newId('person'), createdAt: now(), updatedAt: now(), profile, ...emptySections(doc) };
    doc.people = doc.people || [];
    doc.people.push(person);
    return person;
  });
  res.status(201).json(created);
}));

api.put('/people/:id/profile', h(async (req, res) => {
  const person = await store.update((doc) => {
    const p = findPerson(doc, req.params.id);
    p.profile = validate(SCHEMA.profile.fields, req.body?.profile ?? req.body, 'profile');
    p.updatedAt = now();
    return p;
  });
  res.json(person);
}));

api.delete('/people/:id', h(async (req, res) => {
  await store.update((doc) => {
    findPerson(doc, req.params.id);
    doc.people = doc.people.filter((p) => p.id !== req.params.id);
  });
  res.status(204).end();
}));

api.post('/people/import', h(async (req, res) => {
  const replacing = typeof req.body?.replaceId === 'string' && req.body.replaceId;
  const person = await store.update((doc) => {
    const profile = validate(SCHEMA.profile.fields, req.body?.profile ?? {}, 'profile');
    const sections = {};
    for (const key of Object.keys(SCHEMA.sections)) {
      const raw = Array.isArray(req.body?.[key]) ? req.body[key] : [];
      const schema = sectionSchema(doc, key);
      sections[key] = raw.map((item, index) => {
        const value = validate(schema.fields, { ...item, order: index + 1 }, schema.key);
        return { id: newId(PREFIX[schema.key] || schema.key.toLowerCase()), order: index + 1, createdAt: now(), updatedAt: now(), ...value };
      });
      renumber(sections[key]);
    }
    if (replacing) {
      const current = findPerson(doc, req.body.replaceId);
      for (const key of Object.keys(current)) {
        if (key !== 'id' && key !== 'createdAt') delete current[key];
      }
      Object.assign(current, { profile, updatedAt: now(), ...sections });
      return current;
    }
    const created = { id: newId('person'), createdAt: now(), updatedAt: now(), profile, ...sections };
    doc.people = doc.people || [];
    doc.people.push(created);
    return created;
  });
  res.status(replacing ? 200 : 201).json(person);
}));

// ---------- Sections ----------
api.get('/people/:id/:section', h(async (req, res) => {
  const doc = await store.read();
  sectionSchema(doc, req.params.section);
  res.json(sortByOrder([...(findPerson(doc, req.params.id)[req.params.section] || [])]));
}));

api.get('/people/:id/:section/:itemId', h(async (req, res) => {
  const doc = await store.read();
  sectionSchema(doc, req.params.section);
  const item = (findPerson(doc, req.params.id)[req.params.section] || []).find((i) => i.id === req.params.itemId);
  if (!item) throw httpError(404, `Item '${req.params.itemId}' not found`);
  res.json(item);
}));

api.post('/people/:id/:section', h(async (req, res) => {
  const item = await store.update((doc) => {
    const s = sectionSchema(doc, req.params.section);
    const p = findPerson(doc, req.params.id);
    const list = (p[s.key] = p[s.key] || []);
    const value = validate(s.fields, req.body, s.key);
    const order = Number.isInteger(req.body?.order) ? req.body.order - 0.5 : list.length + 1;
    const created = { id: newId(PREFIX[s.key] || s.key.toLowerCase()), order, createdAt: now(), updatedAt: now(), ...value };
    list.push(created);
    renumber(list);
    p.updatedAt = now();
    return created;
  });
  res.status(201).json(item);
}));

api.put('/people/:id/:section/:itemId', h(async (req, res) => {
  const item = await store.update((doc) => {
    const s = sectionSchema(doc, req.params.section);
    const p = findPerson(doc, req.params.id);
    const list = p[s.key] || [];
    const idx = list.findIndex((i) => i.id === req.params.itemId);
    if (idx < 0) throw httpError(404, `Item '${req.params.itemId}' not found`);
    const value = validate(s.fields, req.body, s.key);
    const current = list[idx];
    let order = current.order;
    if (Number.isInteger(req.body?.order) && req.body.order !== current.order) {
      // Colocarlo antes del elemento que ocupa esa posición.
      order = req.body.order < current.order ? req.body.order - 0.5 : req.body.order + 0.5;
    }
    list[idx] = { id: current.id, order, createdAt: current.createdAt, updatedAt: now(), ...value };
    renumber(list);
    p.updatedAt = now();
    return list.find((i) => i.id === current.id);
  });
  res.json(item);
}));

api.post('/people/:id/:section/:itemId/move', h(async (req, res) => {
  const list = await store.update((doc) => {
    const s = sectionSchema(doc, req.params.section);
    const p = findPerson(doc, req.params.id);
    const items = sortByOrder(p[s.key] || []);
    const idx = items.findIndex((i) => i.id === req.params.itemId);
    if (idx < 0) throw httpError(404, `Item '${req.params.itemId}' not found`);
    const to = req.body?.direction === 'up' ? idx - 1 : idx + 1;
    if (to >= 0 && to < items.length) [items[idx], items[to]] = [items[to], items[idx]];
    items.forEach((it, i) => (it.order = i + 1));
    p.updatedAt = now();
    return items;
  });
  res.json(list);
}));

api.delete('/people/:id/:section/:itemId', h(async (req, res) => {
  await store.update((doc) => {
    const s = sectionSchema(doc, req.params.section);
    const p = findPerson(doc, req.params.id);
    const list = p[s.key] || [];
    if (!list.some((i) => i.id === req.params.itemId)) throw httpError(404, `Item '${req.params.itemId}' not found`);
    p[s.key] = list.filter((i) => i.id !== req.params.itemId);
    renumber(p[s.key]);
    p.updatedAt = now();
  });
  res.status(204).end();
}));

// ---------- Backup ----------
api.post('/backup', h(async (req, res) => {
  const file = await store.backup();
  res.status(201).json({ file });
}));

app.use('/api', api);

// Producción: servir la app compilada (npm run start:prod).
const DIST = path.join(store.PROJECT_ROOT, 'dist', 'resume-admin', 'browser');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof ValidationError) return res.status(400).json({ message: err.message, errors: err.errors });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON body' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ message: err.message });
});

if (!store.exists()) {
  console.error(`[api] No se encontró el archivo de datos / Data file not found: ${store.DATA_FILE}`);
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`[api] http://localhost:${PORT}/api  ->  ${store.DATA_FILE}`);
});
