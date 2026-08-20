import {
  DATASET_RECORD_SCHEMA,
  isRawMediaFieldName,
  validateDatasetRecord,
} from './dataset-contract.js';

export { DATASET_RECORD_SCHEMA, validateDatasetRecord } from './dataset-contract.js';

// The tracker record is a capture envelope. Geometric drum labels are a
// deliberate second-stage export, re-exported here so dataset tooling has one
// entry point without teaching the tracker to invent annotation geometry.
export { createDrumDatasetAnnotationFromTrackerSample } from './drum-dataset.js';

export function createDatasetRecord({
  seq = 0,
  label = 'unlabeled',
  license = '0BSD',
  frame = null,
  quality = null,
  warnings = [],
  settings = {},
  handTargets = null,
  drumKit = null,
  drumOverlay = null,
  source = 'tracker',
  capturedBy = 'manual',
  createdAt = new Date().toISOString(),
} = {}) {
  const face = frame?.face ? {
    quat: roundNumberArray(frame.face.quat, 6),
    pos: roundNumberArray(frame.face.pos, 6),
    weights: roundNumberArray(frame.face.weights, 4),
  } : null;
  const pose = frame?.pose?.points ? {
    points: roundNumberArray(frame.pose.points, 4),
  } : null;
  const record = {
    schema: DATASET_RECORD_SCHEMA,
    createdAt,
    seq,
    label: String(label || 'unlabeled'),
    license: String(license || '0BSD'),
    source: String(source || 'tracker'),
    capturedBy: String(capturedBy || 'manual'),
    consent: {
      localOnly: true,
      rawMedia: false,
      containsRawCamera: false,
      containsRawAudio: false,
    },
    privacy: {
      roundedDecimals: 4,
      defaultExport: 'landmarks-and-labels',
    },
    runtime: summarizeRuntimeSettings(settings),
    quality: quality ? sanitizeDatasetValue(quality) : null,
    warnings: Array.isArray(warnings) ? warnings.map(String).slice(0, 16) : [],
    frame: {
      t: Number.isFinite(frame?.t) ? Math.round(frame.t) : null,
      seq: Number.isInteger(frame?.seq) ? frame.seq : null,
    },
    face,
    pose,
    hands: sanitizeDatasetValue(handTargets ?? frame?.hands ?? []),
    drum: summarizeDrumState(drumKit, drumOverlay),
  };
  const errors = validateDatasetRecord(record).errors;
  if (errors.length) throw new Error(`Dataset record rejected: ${errors.join('; ')}`);
  return record;
}

export function serializeDatasetRecords(records = []) {
  return records.map((record) => JSON.stringify(record)).join('\n') + (records.length ? '\n' : '');
}

function summarizeRuntimeSettings(settings = {}) {
  return {
    mirror: Boolean(settings.mirror),
    pose: Boolean(settings.pose),
    hands: Boolean(settings.hands),
    drummerMode: Boolean(settings.drummerMode),
    resolution: settings.resolution || null,
    fps: settings.fps || null,
  };
}

function summarizeDrumState(drumKit, drumOverlay) {
  const zones = Array.isArray(drumKit?.zones) ? drumKit.zones : [];
  return {
    zones: zones
      .filter((zone) => zone?.calibrated)
      .map((zone) => ({
        id: String(zone.id || ''),
        type: String(zone.type || zone.id || ''),
        x: round4(Number(zone.x || 0)),
        y: round4(Number(zone.y || 0)),
        radius: round4(Number(zone.radius || 0)),
      })),
    activeZoneIds: Array.isArray(drumOverlay?.activeZoneIds) ? drumOverlay.activeZoneIds.map(String) : [],
    summary: drumOverlay?.summary ? sanitizeDatasetValue(drumOverlay.summary) : null,
  };
}

function sanitizeDatasetValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? round4(value) : null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (ArrayBuffer.isView(value)) return roundNumberArray(value, 4);
  if (Array.isArray(value)) return value.map((item) => sanitizeDatasetValue(item));
  if (typeof value !== 'object') return null;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (isRawMediaFieldName(key)) continue;
    out[key] = sanitizeDatasetValue(child);
  }
  return out;
}

function roundNumberArray(value, decimals) {
  return Array.from(value || [], (item) => Number.isFinite(Number(item)) ? round(Number(item), decimals) : 0);
}

function round4(value) {
  return round(value, 4);
}

function round(value, decimals) {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}
