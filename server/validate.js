'use strict';
/**
 * Validación y normalización basada en el bloque `schema` del JSON.
 * Validation/normalization driven by the `schema` block of the JSON file.
 */
const crypto = require('node:crypto');

class ValidationError extends Error {
  constructor(errors) {
    super('Validation failed');
    this.status = 400;
    this.errors = errors;
  }
}

function newId(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

function checkString(field, value, path, errors, lang) {
  const where = lang ? `${path}.${lang}` : path;
  if (typeof value !== 'string') {
    errors.push({ path: where, code: 'type', message: `${where} must be text` });
    return null;
  }
  const v = value.trim();
  if (field.maxLength && v.length > field.maxLength) {
    errors.push({ path: where, code: 'maxLength', max: field.maxLength, message: `${where} exceeds ${field.maxLength} characters` });
  }
  if (field.pattern && !lang && v && !new RegExp(field.pattern).test(v)) {
    errors.push({ path: where, code: 'format', format: field.format, message: `${where} has an invalid format (${field.format || field.pattern})` });
  }
  return v;
}

function normalizeField(field, value, path, errors) {
  if (field.type === 'list') {
    if (isBlank(value)) value = [];
    if (!Array.isArray(value)) {
      errors.push({ path, code: 'type', message: `${path} must be a list` });
      return [];
    }
    if (field.maxItems && value.length > field.maxItems) {
      errors.push({ path, code: 'maxItems', max: field.maxItems, message: `${path} allows at most ${field.maxItems} items` });
    }
    return value.map((child, i) => {
      const out = normalizeObject(field.itemFields, child || {}, `${path}[${i}]`, errors);
      const id = typeof child?.id === 'string' && /^[a-z0-9-]+$/.test(child.id) ? child.id : newId(field.key.slice(0, 4));
      return { id, order: i + 1, ...out };
    });
  }
  if (field.type === 'boolean') return value === true || value === 'true';
  if (field.type === 'integer') {
    if (isBlank(value)) return field.required ? (errors.push({ path, code: 'required', message: `${path} is required` }), null) : null;
    const n = Number(value);
    if (!Number.isInteger(n)) errors.push({ path, code: 'type', message: `${path} must be a whole number` });
    return n;
  }
  if (field.localized) {
    if (isBlank(value) || (typeof value === 'object' && isBlank(value.en) && isBlank(value.es))) {
      if (field.required) errors.push({ path, code: 'required', message: `${path} is required (en, es)` });
      return null;
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      errors.push({ path, code: 'type', message: `${path} must be an object {en, es}` });
      return null;
    }
    const out = {};
    for (const lang of ['en', 'es']) {
      if (isBlank(value[lang])) {
        if (field.required) errors.push({ path: `${path}.${lang}`, code: 'required', message: `${path}.${lang} is required` });
        out[lang] = '';
      } else {
        out[lang] = checkString(field, value[lang], path, errors, lang);
      }
    }
    return out;
  }
  if (isBlank(value)) {
    if (field.required) errors.push({ path, code: 'required', message: `${path} is required` });
    return null;
  }
  return checkString(field, String(value), path, errors);
}

function normalizeObject(fields, input, path, errors) {
  const out = {};
  for (const field of fields) {
    if (field.system) continue;
    out[field.key] = normalizeField(field, input[field.key], path ? `${path}.${field.key}` : field.key, errors);
  }
  // Reglas entre campos / cross-field rules
  if (out.isCurrent === true && 'endDate' in out) out.endDate = null;
  if (out.startDate && out.endDate && out.startDate > out.endDate) {
    errors.push({ path: path ? `${path}.endDate` : 'endDate', code: 'dateRange', message: 'endDate must be after startDate' });
  }
  return out;
}

function validate(fields, input, path = '') {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError([{ path: path || '(body)', code: 'type', message: 'Body must be a JSON object' }]);
  }
  const value = normalizeObject(fields, input, path, errors);
  if (errors.length) throw new ValidationError(errors);
  return value;
}

module.exports = { validate, newId, ValidationError };
