import { NUM_CHANNELS, NUM_POSE_POINTS } from './blendshapes.js';

export const RECORDING_METADATA_SCHEMA = 'minamo.kgm1.recording-metadata.v1';
export const RECORDING_FRAME_SCHEMA = 'minamo.kgm1.motion-jsonl.v1';
export const LEGACY_RECORDING_METADATA_SCHEMA = 'kagami.kgm1.recording-metadata.v1';
export const LEGACY_RECORDING_FRAME_SCHEMA = 'kagami.kgm1.motion-jsonl.v1';

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
  if (!record || typeof record !== 'object') errors.push('record is not an object');
  const schema = record?.schema;
  if (schema === RECORDING_METADATA_SCHEMA || schema === LEGACY_RECORDING_METADATA_SCHEMA) {
    if (typeof record.startedAt !== 'string') errors.push('metadata.startedAt must be a string');
    if (typeof record.modelSource !== 'string') errors.push('metadata.modelSource must be a string');
  } else if (schema === RECORDING_FRAME_SCHEMA || schema === LEGACY_RECORDING_FRAME_SCHEMA) {
    if (!Number.isFinite(record.t)) errors.push('frame.t must be finite');
    if (!Number.isInteger(record.seq)) errors.push('frame.seq must be an integer');
    if (record.face) {
      if (!Array.isArray(record.face.quat) || record.face.quat.length !== 4) errors.push('face.quat must have 4 values');
      if (!Array.isArray(record.face.pos) || record.face.pos.length !== 3) errors.push('face.pos must have 3 values');
      if (!Array.isArray(record.face.weights) || record.face.weights.length !== NUM_CHANNELS) errors.push(`face.weights must have ${NUM_CHANNELS} values`);
    }
    if (record.pose?.points && (!Array.isArray(record.pose.points) || record.pose.points.length !== NUM_POSE_POINTS * 3)) {
      errors.push(`pose.points must have ${NUM_POSE_POINTS * 3} values`);
    }
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
  return { records, frames: records.filter((record) => (record.schema === RECORDING_FRAME_SCHEMA || record.schema === LEGACY_RECORDING_FRAME_SCHEMA) && record.face), errors };
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
