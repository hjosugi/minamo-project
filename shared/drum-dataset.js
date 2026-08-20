// Runtime contract for stick/drum training annotations (issue #122).
//
// `minamo.dataset.tracker-sample.v1` is a privacy-preserving capture envelope;
// it is not itself a set of geometric training labels. This module owns the
// stricter `minamo.drum-dataset.v1` annotation contract and the explicit bridge
// between the two formats. The bridge deliberately accepts labels from a
// reviewed labeling step instead of guessing geometry from the tracker's coarse
// `label` string.

import { DATASET_RECORD_SCHEMA, validateDatasetRecord } from './dataset-contract.js';

export const DRUM_DATASET_SCHEMA = 'minamo.drum-dataset.v1';
export const TRACKER_SAMPLE_SCHEMA = DATASET_RECORD_SCHEMA;
export const DRUM_STICK_BOX_PADDING = 0.01;

export const DRUM_DATASET_ZONE_TYPES = Object.freeze([
  'snare',
  'hihat',
  'ride',
  'crash',
  'tom',
  'floorTom',
  'kick',
  'bass',
  'slap',
  'tap',
  'head',
  'edge',
  'percussion',
]);

const ZONE_TYPES = new Set(DRUM_DATASET_ZONE_TYPES);
const HANDS = new Set(['Left', 'Right']);
const ROOT_KEYS = new Set(['schema', 'frameId', 'labels', 'consent']);
const CONSENT_KEYS = new Set(['localOnly', 'license']);
const POINT_KEYS = new Set(['x', 'y', 'z']);
const LABEL_KEYS = Object.freeze({
  stick: new Set(['kind', 'id', 'points', 'hand', 'representation']),
  drumZone: new Set(['kind', 'id', 'points', 'zoneType']),
  hit: new Set(['kind', 'id', 'points', 'zoneType', 'hand', 'timeMs']),
});

/**
 * Validate a parsed `minamo.drum-dataset.v1` annotation.
 *
 * This mirrors `docs/product/drum-dataset.schema.json` without requiring a
 * JSON-Schema package in the browser build. Callers receive every useful error
 * in one pass so a labeling tool can display actionable feedback.
 *
 * @param {unknown} value
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateDrumDatasetAnnotation(value) {
  const errors = [];
  if (!isRecord(value)) return { ok: false, errors: ['annotation must be an object'] };

  rejectUnexpectedKeys(value, ROOT_KEYS, 'annotation', errors);
  if (value.schema !== DRUM_DATASET_SCHEMA) errors.push(`schema must be ${DRUM_DATASET_SCHEMA}`);
  if (!nonEmptyString(value.frameId)) errors.push('frameId must be a non-empty string');
  if (!Array.isArray(value.labels)) {
    errors.push('labels must be an array');
  } else {
    value.labels.forEach((label, index) => validateLabel(label, index, errors));
  }

  if (!isRecord(value.consent)) {
    errors.push('consent must be an object');
  } else {
    rejectUnexpectedKeys(value.consent, CONSENT_KEYS, 'consent', errors);
    if (typeof value.consent.localOnly !== 'boolean') errors.push('consent.localOnly must be a boolean');
    if (!nonEmptyString(value.consent.license)) errors.push('consent.license must be a non-empty string');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Parse and validate one annotation document.
 *
 * @param {string | unknown} input
 * @returns {Record<string, unknown>}
 */
export function parseDrumDatasetAnnotation(input) {
  let value = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input);
    } catch (error) {
      throw new Error(`Invalid drum dataset JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const result = validateDrumDatasetAnnotation(value);
  if (!result.ok) throw new Error(`Invalid drum dataset annotation: ${result.errors.join('; ')}`);
  return /** @type {Record<string, unknown>} */ (value);
}

/**
 * Create a validated annotation. Empty `labels` is valid for a reviewed
 * negative frame; individual labels are never accepted partially.
 *
 * Accepts both the runtime options object and the original typed-core positional
 * signature, keeping the existing public API while owning one implementation.
 *
 * @param {{frameId: string, labels?: unknown[], license?: string, localOnly?: boolean} | string} input
 * @param {unknown[]} [positionalLabels]
 * @param {string} [positionalLicense]
 * @returns {{schema: string, frameId: string, labels: unknown[], consent: {localOnly: boolean, license: string}}}
 */
export function createDrumDatasetAnnotation(input, positionalLabels, positionalLicense) {
  const options = typeof input === 'string'
    ? { frameId: input, labels: positionalLabels ?? [], license: positionalLicense ?? '0BSD', localOnly: true }
    : input;
  const {
    frameId,
    labels = [],
    license = '0BSD',
    localOnly = true,
  } = options;
  const annotation = {
    schema: DRUM_DATASET_SCHEMA,
    frameId,
    labels,
    consent: { localOnly, license },
  };
  const result = validateDrumDatasetAnnotation(annotation);
  if (!result.ok) throw new Error(`Drum dataset annotation rejected: ${result.errors.join('; ')}`);
  return annotation;
}

/**
 * Carry provenance from a tracker capture envelope into an explicitly labeled
 * drum annotation. No label is inferred from `sample.label`: a value such as
 * `drum-hit` says why the frame was captured, but does not contain a contact
 * point, zone type, hand, or hit timestamp.
 *
 * @param {unknown} sample
 * @param {unknown[]} labels
 * @param {{frameId?: string}} [options]
 */
export function createDrumDatasetAnnotationFromTrackerSample(sample, labels, options = {}) {
  const sampleValidation = validateDatasetRecord(sample);
  if (!sampleValidation.ok) throw new Error(`Tracker sample rejected: ${sampleValidation.errors.join('; ')}`);
  // `validateDatasetRecord` guarantees this at runtime; repeat the guard so
  // checkJs can narrow the external `unknown` before provenance is copied.
  if (!isRecord(sample)) throw new Error('Tracker sample rejected: record must be an object');
  if (!Array.isArray(labels)) throw new Error('Explicit reviewed drum labels are required.');
  const frameId = options.frameId || trackerSampleFrameId(sample);
  return createDrumDatasetAnnotation({
    frameId,
    labels,
    license: nonEmptyString(sample.license) ? sample.license : '',
    localOnly: true,
  });
}

/**
 * Derive the deterministic YOLO box for a reviewed two-point stick label.
 * One-point sticks are keypoint-only and intentionally return null.
 *
 * The two-point box is the tip/tail extent expanded by 0.01 normalized frame
 * units on every side and clamped to the source frame.
 *
 * @param {unknown} label
 * @returns {{xMin: number, yMin: number, xMax: number, yMax: number} | null}
 */
export function deriveStickLabelBox(label) {
  const errors = [];
  validateLabel(label, 0, errors);
  if (errors.length || !isRecord(label) || label.kind !== 'stick') {
    throw new Error(`Stick label rejected: ${errors.join('; ') || 'label must have kind stick'}`);
  }
  if (label.representation === 'keypoint-only') return null;
  const [tip, tail] = label.points;
  return {
    xMin: clamp01(Math.min(tip.x, tail.x) - DRUM_STICK_BOX_PADDING),
    yMin: clamp01(Math.min(tip.y, tail.y) - DRUM_STICK_BOX_PADDING),
    xMax: clamp01(Math.max(tip.x, tail.x) + DRUM_STICK_BOX_PADDING),
    yMax: clamp01(Math.max(tip.y, tail.y) + DRUM_STICK_BOX_PADDING),
  };
}

function validateLabel(label, index, errors) {
  const path = `labels[${index}]`;
  if (!isRecord(label)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (label.kind !== 'stick' && label.kind !== 'drumZone' && label.kind !== 'hit') {
    errors.push(`${path}.kind must be stick, drumZone, or hit`);
    return;
  }
  rejectUnexpectedKeys(label, LABEL_KEYS[label.kind], path, errors);
  if (!nonEmptyString(label.id)) errors.push(`${path}.id must be a non-empty string`);
  validatePoints(label.points, label.kind, path, errors);

  if (label.kind === 'stick') {
    if (!HANDS.has(label.hand)) errors.push(`${path}.hand must be Left or Right`);
    if (label.representation === 'keypoint-only') {
      if (Array.isArray(label.points) && label.points.length !== 1) errors.push(`${path}.points must contain exactly 1 point for keypoint-only`);
    } else if (label.representation === 'tip-tail-padded') {
      if (Array.isArray(label.points) && label.points.length !== 2) errors.push(`${path}.points must contain exactly 2 points for tip-tail-padded`);
    } else {
      errors.push(`${path}.representation must be keypoint-only or tip-tail-padded`);
    }
    return;
  }
  if (!ZONE_TYPES.has(label.zoneType)) errors.push(`${path}.zoneType is not a trainable drum zone type`);
  if (label.kind === 'hit') {
    if (label.hand !== undefined && !HANDS.has(label.hand)) errors.push(`${path}.hand must be Left or Right when present`);
    if (!Number.isFinite(label.timeMs) || label.timeMs < 0) errors.push(`${path}.timeMs must be a non-negative finite number`);
  }
}

function validatePoints(points, kind, path, errors) {
  const minimum = kind === 'drumZone' ? 3 : 1;
  const maximum = kind === 'stick' ? 2 : kind === 'hit' ? 1 : Infinity;
  if (!Array.isArray(points) || points.length < minimum || points.length > maximum) {
    const upper = Number.isFinite(maximum) ? ` and at most ${maximum}` : '';
    errors.push(`${path}.points must contain at least ${minimum}${upper} point(s)`);
    return;
  }
  points.forEach((point, pointIndex) => {
    const pointPath = `${path}.points[${pointIndex}]`;
    if (!isRecord(point)) {
      errors.push(`${pointPath} must be an object`);
      return;
    }
    rejectUnexpectedKeys(point, POINT_KEYS, pointPath, errors);
    if (!Number.isFinite(point.x) || point.x < 0 || point.x > 1) errors.push(`${pointPath}.x must be between 0 and 1`);
    if (!Number.isFinite(point.y) || point.y < 0 || point.y > 1) errors.push(`${pointPath}.y must be between 0 and 1`);
    if (!Number.isFinite(point.z)) errors.push(`${pointPath}.z must be a finite number`);
  });
}

function trackerSampleFrameId(sample) {
  return `${sample.createdAt}#${sample.seq}`;
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function rejectUnexpectedKeys(value, allowed, path, errors) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${path}.${key} is not allowed`);
  }
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** @param {unknown} value @returns {value is Record<string, any>} */
function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
