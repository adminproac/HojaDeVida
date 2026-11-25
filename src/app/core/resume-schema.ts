import schema from './resume-schema.json';
import { DataSchema, ResumeDocument } from './models';

/** Field rules, labels and validation. Not stored in Data/resume-data.json. */
export const RESUME_SCHEMA = schema as DataSchema;

/**
 * Drops a legacy `schema` block so the next save writes data only.
 * People and the rest of `meta` are left as they were.
 */
export function asDataDocument<T extends ResumeDocument>(doc: T): T {
  if (doc && typeof doc === 'object' && 'schema' in doc) {
    delete doc.schema;
    if (doc.meta && typeof doc.meta.schemaVersion === 'string' && doc.meta.schemaVersion.startsWith('2')) {
      doc.meta.schemaVersion = '3.0.0';
    }
  }
  if (!doc.meta || typeof doc.meta !== 'object') {
    doc.meta = { schemaVersion: '3.0.0', defaultLanguage: 'es', supportedLanguages: ['en', 'es'], lastUpdated: new Date().toISOString() };
  }
  if (!Array.isArray(doc.people)) doc.people = [];
  return doc;
}
