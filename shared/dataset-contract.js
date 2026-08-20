// Validation shared by the tracker capture producer and downstream dataset
// consumers. Keeping this module dependency-free lets specialized exporters
// validate a tracker record without importing `shared/dataset.js` back through
// one of its own re-exports.

export const DATASET_RECORD_SCHEMA = 'minamo.dataset.tracker-sample.v1';

const RAW_MEDIA_FIELD_RE = /^(?:raw(?:camera|video|audio|media|frame)|camera(?:frame|image|pixels|blob|data)|video(?:frame|data|blob|url)?|audio(?:data|blob|buffer|url)?|image(?:data|blob|url)?|media(?:stream|blob|data|url)?|canvas|pixelData|thumbnail)$/i;

/**
 * Validate the identity, privacy boundary, and minimum provenance fields of a
 * tracker capture envelope.
 *
 * @param {unknown} record
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateDatasetRecord(record) {
  const errors = [];
  if (!isRecord(record)) return { ok: false, errors: ['record must be an object'] };

  if (record.schema !== DATASET_RECORD_SCHEMA) errors.push(`unknown schema: ${record.schema || 'missing'}`);
  if (!canonicalIsoTimestamp(record.createdAt)) errors.push('createdAt must be a canonical ISO-8601 timestamp');
  if (!Number.isInteger(record.seq) || record.seq < 0) errors.push('seq must be a non-negative integer');
  if (typeof record.label !== 'string' || !record.label.trim()) errors.push('label must be a non-empty string');
  if (typeof record.license !== 'string' || !record.license.trim()) errors.push('license must be a non-empty string');
  if (record.consent?.localOnly !== true) errors.push('consent.localOnly must be true');
  if (record.consent?.rawMedia !== false) errors.push('consent.rawMedia must be false');
  if (record.consent?.containsRawCamera !== false) errors.push('consent.containsRawCamera must be false');
  if (record.consent?.containsRawAudio !== false) errors.push('consent.containsRawAudio must be false');
  errors.push(...rawMediaFieldErrors(record));
  return { ok: errors.length === 0, errors };
}

export function isRawMediaFieldName(name) {
  return RAW_MEDIA_FIELD_RE.test(name);
}

function rawMediaFieldErrors(record) {
  const found = [];
  const seen = new Set();
  const visit = (value, path) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) visit(value[i], `${path}[${i}]`);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      const nextPath = `${path}.${key}`;
      if (isRawMediaFieldName(key) && !(nextPath === 'record.consent.rawMedia' && child === false)) found.push(nextPath);
      visit(child, nextPath);
    }
  };
  visit(record, 'record');
  return found.map((path) => `${path} must not contain raw media data`);
}

function canonicalIsoTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

/** @param {unknown} value @returns {value is Record<string, any>} */
function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
