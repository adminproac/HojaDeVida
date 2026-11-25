'use strict';
/**
 * Lectura/escritura del archivo JSON con escrituras atómicas.
 * Reads/writes the JSON file using atomic writes (temp file + rename).
 */
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const PROJECT_ROOT = path.join(__dirname, '..');
const DATA_FILE = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : path.join(PROJECT_ROOT, 'Data', 'resume-data.json');
const DATA_DIR = path.dirname(DATA_FILE);
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

let queue = Promise.resolve();

function asData(doc) {
  if (doc && typeof doc === 'object' && doc.schema) {
    delete doc.schema;
    if (doc.meta && typeof doc.meta.schemaVersion === 'string' && doc.meta.schemaVersion.startsWith('2')) {
      doc.meta.schemaVersion = '3.0.0';
    }
  }
  if (!doc.meta || typeof doc.meta !== 'object') doc.meta = {};
  if (!Array.isArray(doc.people)) doc.people = [];
  if ('users' in doc) delete doc.users;
  return doc;
}

async function read() {
  const raw = await fsp.readFile(DATA_FILE, 'utf8');
  // Quitar BOM si el archivo fue guardado con uno (Notepad en Windows).
  // Un archivo antiguo puede traer `schema`; se descarta para no volver a guardarlo.
  return asData(JSON.parse(raw.replace(/^\uFEFF/, '')));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function renameWithRetry(from, to) {
  // En Windows, el antivirus o un editor abierto pueden bloquear el archivo un instante.
  for (let attempt = 0; ; attempt++) {
    try {
      await fsp.rename(from, to);
      return;
    } catch (err) {
      if (attempt >= 10 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err;
      await sleep(50 * (attempt + 1));
    }
  }
}

async function writeAtomic(doc) {
  asData(doc);
  const tmp = path.join(DATA_DIR, `.${path.basename(DATA_FILE)}.${process.pid}.${Date.now()}.tmp`);
  const json = JSON.stringify(doc, null, 2) + '\n';
  const handle = await fsp.open(tmp, 'w');
  try {
    await handle.writeFile(json, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await renameWithRetry(tmp, DATA_FILE);
  } catch (err) {
    await fsp.rm(tmp, { force: true });
    throw err;
  }
}

/**
 * Ejecuta una modificación en serie: lee, aplica `mutator(doc)` y guarda.
 * Runs a mutation serially so concurrent requests never overwrite each other.
 */
function update(mutator) {
  const run = queue.then(async () => {
    const doc = await read();
    const result = await mutator(doc);
    doc.meta = doc.meta || {};
    doc.meta.lastUpdated = new Date().toISOString();
    await writeAtomic(doc);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

async function backup() {
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const name = `resume-data-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.json`;
  const target = path.join(BACKUP_DIR, name);
  await fsp.copyFile(DATA_FILE, target);
  return target;
}

function exists() {
  return fs.existsSync(DATA_FILE);
}

module.exports = { read, update, backup, exists, DATA_FILE, BACKUP_DIR, PROJECT_ROOT };
