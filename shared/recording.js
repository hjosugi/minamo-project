import { NUM_CHANNELS, NUM_POSE_POINTS } from './blendshapes.js';

export const RECORDING_METADATA_SCHEMA = 'minamo.kgm1.recording-metadata.v1';
export const RECORDING_FRAME_SCHEMA = 'minamo.kgm1.motion-jsonl.v1';
const RAW_MEDIA_FIELD_RE = /^(?:raw(?:camera|video|audio|media|frame)|camera(?:frame|image|pixels|blob|data)|video(?:frame|data|blob|url)?|audio(?:data|blob|buffer|url)?|image(?:data|blob|url)?|media(?:stream|blob|data|url)?|canvas|pixelData|thumbnail)$/i;
const QUALITY_STATES = new Set(['good', 'degraded', 'poor']);

export function createRecordingMetadata({
  version = '0.1.0',
  modelSource = 'unknown',
  settings = {},
  calibration = null,
  startedAt = new Date().toISOString(),
} = {}) {
  return {
    schema: RECORDING_METADATA_SCHEMA,
    version,
    startedAt,
    modelSource,
    settings: summarizeSettings(settings),
    calibration: calibration ? summarizeCalibration(calibration) : null,
  };
}

export function createMotionRecord(frame, { quality = null, warnings = [] } = {}) {
  return {
    schema: RECORDING_FRAME_SCHEMA,
    t: frame.t,
    seq: frame.seq,
    quality,
    warnings,
    face: frame.face ? {
      quat: Array.from(frame.face.quat),
      pos: Array.from(frame.face.pos),
      weights: Array.from(frame.face.weights),
    } : null,
    pose: frame.pose ? { points: Array.from(frame.pose.points) } : null,
    hands: frame.hands ?? null,
  };
}

export function validateRecordingRecord(record, line = 1) {
  const errors = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return { ok: false, line, errors: ['record is not an object'] };
  }
  errors.push(...rawMediaFieldErrors(record));
  const schema = record?.schema;
  if (schema === RECORDING_METADATA_SCHEMA) {
    if (typeof record.startedAt !== 'string') errors.push('metadata.startedAt must be a string');
    if (typeof record.modelSource !== 'string') errors.push('metadata.modelSource must be a string');
  } else if (schema === RECORDING_FRAME_SCHEMA) {
    if (!Number.isFinite(record.t)) errors.push('frame.t must be finite');
    if (!Number.isInteger(record.seq)) errors.push('frame.seq must be an integer');
    validateStringArray(record.warnings, 'frame.warnings', errors);
    validateQuality(record.quality, errors);
    if (record.face) {
      validateNumberArray(record.face.quat, 4, 'face.quat', errors);
      validateNumberArray(record.face.pos, 3, 'face.pos', errors);
      validateNumberArray(record.face.weights, NUM_CHANNELS, 'face.weights', errors);
    }
    if (record.pose?.points) validateNumberArray(record.pose.points, NUM_POSE_POINTS * 3, 'pose.points', errors);
  } else {
    errors.push(`unknown schema: ${schema || 'missing'}`);
  }
  return { ok: errors.length === 0, line, errors };
}

export function parseRecordingJsonl(text) {
  const records = [];
  const errors = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const lineNo = index + 1;
    if (!line.trim()) return;
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      errors.push({ line: lineNo, errors: [`invalid JSON: ${error.message}`] });
      return;
    }
    const result = validateRecordingRecord(record, lineNo);
    if (!result.ok) {
      errors.push({ line: lineNo, errors: result.errors });
      return;
    }
    records.push(record);
  });
  return { records, frames: records.filter((record) => record.schema === RECORDING_FRAME_SCHEMA && record.face), errors };
}

function summarizeSettings(settings) {
  return {
    mode: settings.mode,
    mirror: Boolean(settings.mirror),
    pose: Boolean(settings.pose),
    hands: Boolean(settings.hands),
    resolution: settings.resolution,
    fps: settings.fps,
    smoothingGroup: settings.smoothingGroup,
  };
}

function summarizeCalibration(calibration) {
  return {
    schema: calibration.schema,
    name: calibration.name,
    createdAt: calibration.createdAt,
  };
}

function validateNumberArray(value, length, field, errors) {
  if (!Array.isArray(value) || value.length !== length) {
    errors.push(`${field} must have ${length} values`);
    return;
  }
  for (let i = 0; i < value.length; i++) {
    if (!Number.isFinite(value[i])) errors.push(`${field}[${i}] must be finite`);
  }
}

function validateStringArray(value, field, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array`);
    return;
  }
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'string') errors.push(`${field}[${i}] must be a string`);
  }
}

function validateQuality(value, errors) {
  if (value === null || value === undefined) return;
  if (typeof value !== 'object' || Array.isArray(value)) {
    errors.push('frame.quality must be null or an object');
    return;
  }
  if (value.state !== undefined && !QUALITY_STATES.has(value.state)) {
    errors.push('frame.quality.state must be good, degraded, or poor');
  }
  if (value.score !== undefined && (!Number.isFinite(value.score) || value.score < 0 || value.score > 1)) {
    errors.push('frame.quality.score must be between 0 and 1');
  }
  if (value.reasons !== undefined) validateStringArray(value.reasons, 'frame.quality.reasons', errors);
  if (value.warnings !== undefined) validateStringArray(value.warnings, 'frame.quality.warnings', errors);
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
      if (RAW_MEDIA_FIELD_RE.test(key)) found.push(nextPath);
      visit(child, nextPath);
    }
  };
  visit(record, 'record');
  return found.map((path) => `${path} must not contain raw media data`);
}
