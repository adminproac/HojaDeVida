/**
 * Lee Data/resume-data.json y escribe worker/seed.sql.
 * Uso: node scripts/build-d1-seed.js
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { renderSeed } = await import(pathToFileURL(path.join(root, 'worker/src/document.js')).href);
const doc = JSON.parse(readFileSync(path.join(root, 'Data/resume-data.json'), 'utf8'));
const sql = renderSeed(doc);
writeFileSync(path.join(root, 'worker/seed.sql'), sql);
console.log(`worker/seed.sql listo. Personas: ${(doc.people || []).length}`);
