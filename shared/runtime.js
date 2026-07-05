// Runtime helpers shared by the tracker, viewer, tests, and closure docs.
// These are intentionally browser-light so the core tracking contracts can be
// tested in CI without a camera or GPU.

import { ARKIT_52, CHANNEL_INDEX, MIRROR_INDEX, NUM_CHANNELS, NUM_POSE_POINTS } from './blendshapes.js';

export const WARNING_TAXONOMY = Object.freeze({
  insecureContext: 'INSECURE_CONTEXT',
  noCameraApi: 'NO_CAMERA_API',
  cameraDenied: 'CAMERA_PERMISSION_DENIED',
  noCamera: 'NO_CAMERA_DEVICE',
  noWebgl2: 'NO_WEBGL2',
  noWebtransport: 'NO_WEBTRANSPORT',
  lowLight: 'LOW_LIGHT',
  motionBlur: 'MOTION_BLUR',
  droppedFrames: 'DROPPED_FRAMES',
  occlusion: 'OCCLUSION',
  outlier: 'TEMPORAL_OUTLIER',
  nonFinite: 'NON_FINITE_SIGNAL',
  clamped: 'SIGNAL_CLAMPED',
});

export const FILTER_PRESETS = Object.freeze({
  responsive: Object.freeze({ minCutoff: 2.4, beta: 0.75, dCutoff: 1.0 }),
  balanced: Object.freeze({ minCutoff: 1.6, beta: 0.4, dCutoff: 1.0 }),
  smooth: Object.freeze({ minCutoff: 0.9, beta: 0.18, dCutoff: 1.0 }),
});

export const SMOOTHING_GROUPS = Object.freeze({
  face: 'Face weights',
  headRotation: 'Head rotation',
  headPosition: 'Head position',
  pose: 'Upper-body pose',
  hands: 'Hands',
});

export const DEFAULT_SMOOTHING_SETTINGS = Object.freeze({
  face: Object.freeze({ filterPreset: 'balanced', minCutoff: FILTER_PRESETS.balanced.minCutoff, beta: FILTER_PRESETS.balanced.beta }),
  headRotation: Object.freeze({ filterPreset: 'balanced', minCutoff: 1.2, beta: 0.8 }),
  headPosition: Object.freeze({ filterPreset: 'smooth', minCutoff: 1.0, beta: 0.3 }),
  pose: Object.freeze({ filterPreset: 'smooth', minCutoff: 0.8, beta: 0.2 }),
  hands: Object.freeze({ filterPreset: 'balanced', minCutoff: 1.8, beta: 0.5 }),
});

export const DEFAULT_TRACKER_SETTINGS = Object.freeze({
  mode: 'local',
  room: 'demo',
  token: '',
  wtUrl: 'https://localhost:4433',
  wtHash: '',
  mirror: true,
  pose: false,
  hands: false,
  cameraId: '',
  resolution: '720p',
  fps: '60',
  filterPreset: 'balanced',
  minCutoff: FILTER_PRESETS.balanced.minCutoff,
  beta: FILTER_PRESETS.balanced.beta,
  smoothingGroup: 'face',
  smoothing: DEFAULT_SMOOTHING_SETTINGS,
  privacyLocalOnly: true,
});

export const DEFAULT_VIEWER_SETTINGS = Object.freeze({
  mode: 'local',
  room: 'demo',
  token: '',
  wtUrl: 'https://localhost:4433',
  wtHash: '',
  transparent: false,
});

export const RESOLUTION_CONSTRAINTS = Object.freeze({
  '480p': Object.freeze({ width: 854, height: 480 }),
  '720p': Object.freeze({ width: 1280, height: 720 }),
  '1080p': Object.freeze({ width: 1920, height: 1080 }),
});

export const TRACKER_STORAGE_KEY = 'minamo.tracker.settings.v2';
export const VIEWER_STORAGE_KEY = 'minamo.viewer.settings.v2';
export const PROFILE_STORAGE_KEY = 'minamo.calibration.profile.v1';
export const MOTION_JSONL_SCHEMA = 'minamo.kgm1.motion-jsonl.v1';
export const MAX_MOTION_JSONL_FRAMES = 36_000;

export function clamp(value, min = 0, max = 1) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function isSeqNewer(seq, current) {
  if (current === null || current === undefined) return true;
  const diff = ((seq & 0xffff) - (current & 0xffff)) & 0xffff;
  return diff !== 0 && diff < 0x8000;
}

export class FrameOrderGate {
  constructor() {
    this.lastSeq = null;
    this.accepted = 0;
    this.reordered = 0;
    this.lost = 0;
    this.lastAcceptedAt = null;
    this.sourceFps = 0;
  }

  accept(frame, nowMs = performanceNow()) {
    if (!frame || !Number.isInteger(frame.seq)) return { ok: false, reason: 'invalid' };
    const seq = frame.seq & 0xffff;
    if (!isSeqNewer(seq, this.lastSeq)) {
      this.reordered++;
      return { ok: false, reason: 'old' };
    }
    if (this.lastSeq !== null) {
      const gap = (seq - this.lastSeq) & 0xffff;
      if (gap > 1 && gap < 0x8000) this.lost += gap - 1;
    }
    if (this.lastAcceptedAt !== null) {
      const dt = Math.max(1, nowMs - this.lastAcceptedAt);
      const inst = 1000 / dt;
      this.sourceFps = this.sourceFps ? this.sourceFps * 0.85 + inst * 0.15 : inst;
    }
    this.lastAcceptedAt = nowMs;
    this.lastSeq = seq;
    this.accepted++;
    return { ok: true, reason: 'accepted' };
  }

  easingPerSecond() {
    if (!this.sourceFps) return 24;
    return clamp(this.sourceFps, 24, 60);
  }
}

export class DroppedFrameDetector {
  constructor(targetFps = 60, tolerance = 1.65) {
    this.targetFps = targetFps;
    this.tolerance = tolerance;
    this.lastTimeMs = null;
    this.dropped = 0;
    this.longestGapMs = 0;
    this.samples = [];
  }

  sample(timeMs) {
    if (this.lastTimeMs === null) {
      this.lastTimeMs = timeMs;
      return 0;
    }
    const expected = 1000 / this.targetFps;
    const gap = timeMs - this.lastTimeMs;
    this.lastTimeMs = timeMs;
    this.longestGapMs = Math.max(this.longestGapMs, gap);
    let missed = 0;
    if (gap > expected * this.tolerance) {
      missed = Math.max(1, Math.round(gap / expected) - 1);
    }
    this.samples.push({ timeMs, missed });
    this.prune(timeMs);
    if (missed === 0) return 0;
    this.dropped += missed;
    return missed;
  }

  prune(nowMs = this.lastTimeMs ?? 0, windowMs = 2500) {
    const cutoff = nowMs - windowMs;
    while (this.samples.length && this.samples[0].timeMs < cutoff) this.samples.shift();
  }

  rollingDropped(windowMs = 2500, nowMs = this.lastTimeMs ?? 0) {
    this.prune(nowMs, windowMs);
    return this.samples.reduce((sum, sample) => sum + sample.missed, 0);
  }
}

export function computeQualityScore({
  meanLuma = 128,
  confidence = 1,
  inferenceMs = 0,
  fps = 60,
  droppedFrames = 0,
  motionBlur = 0,
} = {}) {
  const lumaScore = clamp((meanLuma - 24) / 72);
  const confidenceScore = clamp(confidence);
  const fpsScore = clamp((fps - 12) / 48);
  const inferenceScore = clamp(1 - Math.max(0, inferenceMs - 12) / 28);
  const dropScore = clamp(1 - droppedFrames / 12);
  const blurScore = clamp(1 - motionBlur);
  const score = clamp(
    lumaScore * 0.22 +
    confidenceScore * 0.28 +
    fpsScore * 0.18 +
    inferenceScore * 0.14 +
    dropScore * 0.10 +
    blurScore * 0.08
  );
  const reasons = [];
  const warnings = [];
  if (lumaScore < 0.45) { reasons.push('low light'); warnings.push(WARNING_TAXONOMY.lowLight); }
  if (fpsScore < 0.45 || droppedFrames > 3) { reasons.push('dropped frames'); warnings.push(WARNING_TAXONOMY.droppedFrames); }
  if (motionBlur > 0.55) { reasons.push('motion blur'); warnings.push(WARNING_TAXONOMY.motionBlur); }
  if (confidenceScore < 0.45) { reasons.push('low confidence'); warnings.push(WARNING_TAXONOMY.occlusion); }
  return {
    score,
    state: score >= 0.72 ? 'good' : score >= 0.45 ? 'degraded' : 'poor',
    reasons,
    warnings,
  };
}

export function createCalibrationProfile(name = 'default') {
  return {
    schema: 'minamo.calibration.v1',
    name,
    createdAt: new Date().toISOString(),
    offsets: Array(NUM_CHANNELS).fill(0),
    gains: Array(NUM_CHANNELS).fill(1),
    deadzones: Array(NUM_CHANNELS).fill(0),
    muted: Array(NUM_CHANNELS).fill(false),
  };
}

export function validateCalibrationProfile(profile) {
  const warnings = [];
  const errors = [];
  const base = createCalibrationProfile(profile?.name || 'default');
  if (!profile || typeof profile !== 'object') {
    errors.push('profile must be a JSON object');
    return { ok: false, profile: base, warnings, errors };
  }
  if (profile.schema !== base.schema) {
    errors.push(`unsupported calibration schema: ${profile.schema || 'missing'}`);
    return { ok: false, profile: base, warnings, errors };
  }

  const keys = ['offsets', 'gains', 'deadzones', 'muted'];
  for (const key of keys) {
    if (!Array.isArray(profile[key])) {
      warnings.push(`${key} missing; defaults inserted`);
      continue;
    }
    if (profile[key].length > NUM_CHANNELS) warnings.push(`${key} has extra values; truncated to ${NUM_CHANNELS}`);
    if (profile[key].length < NUM_CHANNELS) warnings.push(`${key} has ${profile[key].length} values; padded to ${NUM_CHANNELS}`);
    base[key] = profile[key].slice(0, NUM_CHANNELS);
    while (base[key].length < NUM_CHANNELS) base[key].push(defaultProfileValue(key));
  }

  base.gains = base.gains.map((value, index) => clampProfileNumber(value, 0, 2, `gains[${index}]`, warnings));
  base.offsets = base.offsets.map((value, index) => clampProfileNumber(value, 0, 1, `offsets[${index}]`, warnings));
  base.deadzones = base.deadzones.map((value, index) => clampProfileNumber(value, 0, 0.2, `deadzones[${index}]`, warnings));
  base.muted = base.muted.map(Boolean);
  return { ok: true, profile: base, warnings: [...new Set(warnings)], errors };
}

export function normalizeProfile(profile) {
  return validateCalibrationProfile(profile).profile;
}

export function applyCalibrationProfile(weights, profile) {
  const p = normalizeProfile(profile);
  const out = new Float32Array(NUM_CHANNELS);
  for (let i = 0; i < NUM_CHANNELS; i++) {
    if (p.muted[i]) {
      out[i] = 0;
      continue;
    }
    const adjusted = Math.max(0, Number(weights[i] || 0) - p.offsets[i]);
    const withGain = adjusted * p.gains[i];
    out[i] = withGain < p.deadzones[i] ? 0 : clamp(withGain);
  }
  return out;
}

export function mirrorWeights(weights) {
  const out = new Float32Array(NUM_CHANNELS);
  for (let i = 0; i < NUM_CHANNELS; i++) out[MIRROR_INDEX[i]] = Number(weights[i] || 0);
  return out;
}

export function mirrorFacePayload({ quat = [0, 0, 0, 1], pos = [0, 0, 0.4], weights = new Float32Array(NUM_CHANNELS) } = {}) {
  return {
    quat: [quat[0], -quat[1], -quat[2], quat[3]],
    pos: [-pos[0], pos[1], pos[2]],
    weights: mirrorWeights(weights),
  };
}

export function setMirrorPreviewClass(element, mirror) {
  element?.classList?.toggle?.('mirrored', Boolean(mirror));
  return Boolean(mirror);
}

export function isEditableTarget(target) {
  const element = typeof Element !== 'undefined' && target instanceof Element ? target : null;
  if (!element) return false;
  const tag = element.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(/** @type {any} */ (element).isContentEditable);
}

export function sanitizeWeights(weights) {
  const out = new Float32Array(NUM_CHANNELS);
  const warnings = [];
  for (let i = 0; i < NUM_CHANNELS; i++) {
    const before = Number(weights[i]);
    const after = clamp(before);
    out[i] = after;
    if (!Number.isFinite(before)) warnings.push(`${WARNING_TAXONOMY.nonFinite}:${ARKIT_52[i]}`);
    else if (before !== after) warnings.push(`${WARNING_TAXONOMY.clamped}:${ARKIT_52[i]}`);
  }
  return { weights: out, warnings };
}

export function semanticFaceControls(weights) {
  const w = (name) => Number(weights[CHANNEL_INDEX[name]] || 0);
  const mouthOpen = clamp(w('jawOpen') * 1.35);
  const mouthWide = clamp((w('mouthStretchLeft') + w('mouthStretchRight')) * 0.6);
  const pucker = clamp((w('mouthPucker') + w('mouthFunnel')) * 0.65);
  return {
    blinkLeft: w('eyeBlinkLeft'),
    blinkRight: w('eyeBlinkRight'),
    gazeX: clamp((w('eyeLookOutLeft') + w('eyeLookInRight') - w('eyeLookInLeft') - w('eyeLookOutRight')) * 0.5, -1, 1),
    gazeY: clamp((w('eyeLookUpLeft') + w('eyeLookUpRight') - w('eyeLookDownLeft') - w('eyeLookDownRight')) * 0.5, -1, 1),
    mouthOpen,
    mouthWide,
    mouthPucker: pucker,
    vowel: inferVowel(mouthOpen, mouthWide, pucker),
    smileLeft: w('mouthSmileLeft'),
    smileRight: w('mouthSmileRight'),
    frownLeft: w('mouthFrownLeft'),
    frownRight: w('mouthFrownRight'),
  };
}

export function inferVowel(open, wide, pucker) {
  if (open > 0.68 && wide < 0.45) return 'A';
  if (wide > 0.68 && open < 0.45) return 'I';
  if (pucker > 0.62 && open < 0.55) return 'U';
  if (open > 0.45 && wide > 0.50) return 'E';
  if (open > 0.42 && pucker > 0.45) return 'O';
  return 'neutral';
}

export function syntheticBlendshapeFrame(seed = 1) {
  const weights = new Float32Array(NUM_CHANNELS);
  let x = seed >>> 0;
  for (let i = 0; i < NUM_CHANNELS; i++) {
    x = (1664525 * x + 1013904223) >>> 0;
    weights[i] = (x & 0xff) / 255;
  }
  return {
    t: seed,
    seq: seed & 0xffff,
    face: {
      quat: [0, 0, 0, 1],
      pos: [0, 0, 0.4],
      weights,
    },
    pose: null,
  };
}

export function syntheticFaceFixture(name = 'neutral') {
  const frame = syntheticBlendshapeFrame(fixtureSeed(name));
  frame.face.weights.fill(0);
  if (name === 'wink-left') frame.face.weights[CHANNEL_INDEX.eyeBlinkLeft] = 0.92;
  else if (name === 'wink-right') frame.face.weights[CHANNEL_INDEX.eyeBlinkRight] = 0.92;
  else if (name === 'asymmetric-smile') {
    frame.face.weights[CHANNEL_INDEX.mouthSmileLeft] = 0.85;
    frame.face.weights[CHANNEL_INDEX.mouthSmileRight] = 0.12;
  } else if (name === 'mouth-a') {
    frame.face.weights[CHANNEL_INDEX.jawOpen] = 0.82;
  } else if (name === 'low-confidence') {
    frame.face.weights[CHANNEL_INDEX.eyeBlinkLeft] = Number.NaN;
    frame.face.weights[CHANNEL_INDEX.mouthSmileRight] = 2;
  }
  return frame;
}

export function parseMotionJsonl(text, { maxFrames = MAX_MOTION_JSONL_FRAMES } = {}) {
  if (typeof text !== 'string') throw new TypeError('Motion JSONL input must be text.');
  const limit = Math.max(1, Number(maxFrames) || MAX_MOTION_JSONL_FRAMES);
  const frames = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    let value;
    try {
      value = JSON.parse(raw);
    } catch (error) {
      throw new Error(`Invalid motion JSONL at line ${i + 1}: ${error.message}`);
    }
    if (value?.schema === 'minamo.kgm1.recording-metadata.v1' || value?.schema === 'kagami.kgm1.recording-metadata.v1') continue;
    frames.push(parseMotionRecord(value, i + 1));
    if (frames.length >= limit) break;
  }
  if (frames.length === 0) throw new Error('No motion frames found in JSONL recording.');
  return frames;
}

function parseMotionRecord(value, lineNo) {
  if (!value || typeof value !== 'object') {
    throw new Error(`Invalid motion JSONL at line ${lineNo}: record must be an object.`);
  }
  if (value.schema && value.schema !== MOTION_JSONL_SCHEMA) {
    throw new Error(`Invalid motion JSONL at line ${lineNo}: unsupported schema "${value.schema}".`);
  }
  const seq = Number(value.seq);
  const t = Number(value.t);
  if (!Number.isInteger(seq)) throw new Error(`Invalid motion JSONL at line ${lineNo}: seq must be an integer.`);
  if (!Number.isFinite(t)) throw new Error(`Invalid motion JSONL at line ${lineNo}: t must be finite.`);
  if (!value.face) throw new Error(`Invalid motion JSONL at line ${lineNo}: face is required.`);

  const face = {
    quat: readNumberArray(value.face.quat, 4, 'face.quat', lineNo),
    pos: readNumberArray(value.face.pos, 3, 'face.pos', lineNo),
    weights: readFloat32Array(value.face.weights, NUM_CHANNELS, 'face.weights', lineNo),
  };
  const pose = value.pose
    ? { points: readFloat32Array(value.pose.points, NUM_POSE_POINTS * 3, 'pose.points', lineNo) }
    : null;
  return {
    t,
    seq,
    quality: value.quality || null,
    warnings: Array.isArray(value.warnings) ? value.warnings.slice() : [],
    face,
    pose,
    hands: Array.isArray(value.hands) ? value.hands.map(normalizeHand) : null,
  };
}

function readNumberArray(value, length, field, lineNo) {
  if (!Array.isArray(value) || value.length < length) {
    throw new Error(`Invalid motion JSONL at line ${lineNo}: ${field} must contain ${length} numbers.`);
  }
  const out = [];
  for (let i = 0; i < length; i++) {
    const n = Number(value[i]);
    if (!Number.isFinite(n)) {
      throw new Error(`Invalid motion JSONL at line ${lineNo}: ${field}[${i}] must be finite.`);
    }
    out.push(n);
  }
  return out;
}

function readFloat32Array(value, length, field, lineNo) {
  const numbers = readNumberArray(value, length, field, lineNo);
  return new Float32Array(numbers);
}

function normalizeHand(hand) {
  return {
    handedness: hand?.handedness === 'Right' ? 'Right' : 'Left',
    confidence: clampOptionalNumber(hand?.confidence, 1),
    curls: Array.isArray(hand?.curls) ? hand.curls.slice(0, 5).map((v) => clampOptionalNumber(v, 0)) : [],
    spreads: Array.isArray(hand?.spreads) ? hand.spreads.slice(0, 5).map((v) => clampOptionalNumber(v, 0, -1, 1)) : [],
  };
}

function clampOptionalNumber(value, fallback, min = 0, max = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? clamp(n, min, max) : fallback;
}

export function loadJson(storage, key, fallback) {
  try {
    return { ...fallback, ...JSON.parse(storage.getItem(key) || '{}') };
  } catch {
    return { ...fallback };
  }
}

export function saveJson(storage, key, value) {
  storage.setItem(key, JSON.stringify(value));
}

function performanceNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function defaultProfileValue(key) {
  if (key === 'gains') return 1;
  if (key === 'muted') return false;
  return 0;
}

function clampProfileNumber(value, min, max, name, warnings) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    warnings.push(`${name} was not finite; reset to ${min}`);
    return min;
  }
  const clamped = clamp(numeric, min, max);
  if (numeric !== clamped) warnings.push(`${name} clamped to ${clamped}`);
  return clamped;
}

function fixtureSeed(name) {
  let seed = 2166136261;
  for (const char of String(name)) {
    seed ^= char.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}
