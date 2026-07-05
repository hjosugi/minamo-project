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

export const HAND_FINGER_NAMES = Object.freeze(['thumb', 'index', 'middle', 'ring', 'pinky']);
export const HAND_INFERENCE_INTERVAL_MS = 1000 / 30;
export const HAND_PROFILE_STORAGE_KEY = 'minamo.hand.profile.v1';
export const HAND_CALIBRATION_STEPS = Object.freeze([
  Object.freeze({ id: 'open', label: 'Open palm', kind: 'open', durationMs: 2500 }),
  Object.freeze({ id: 'fist', label: 'Make a fist', kind: 'fist', durationMs: 2500 }),
  Object.freeze({ id: 'point', label: 'Point index', kind: 'range', durationMs: 2500 }),
  Object.freeze({ id: 'drum-grip', label: 'Drum grip', kind: 'range', durationMs: 2500 }),
]);
export const HAND_CALIBRATION_TOTAL_MS = HAND_CALIBRATION_STEPS.reduce((sum, step) => sum + step.durationMs, 0);

export const DEFAULT_TRACKER_SETTINGS = Object.freeze({
  mode: 'local',
  room: 'demo',
  token: '',
  wtUrl: 'https://localhost:4433',
  wtHash: '',
  mirror: true,
  pose: false,
  hands: false,
  voiceAccents: false,
  faceLock: false,
  cameraId: '',
  resolution: '720p',
  fps: '60',
  headLeanRangeCm: 8,
  bodyMode: 'seated',
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
  armSolver: true,
  scenePreset: 'soft',
  backgroundColor: '#0f1220',
  bloom: false,
  vignette: false,
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
export const CALIBRATION_GUIDE_STEPS = Object.freeze([
  Object.freeze({ id: 'neutral', label: 'Neutral hold', kind: 'neutral', durationMs: 3000 }),
  Object.freeze({ id: 'jaw-open', label: 'Mouth open', kind: 'range', durationMs: 4500 }),
  Object.freeze({ id: 'wide-smile', label: 'Wide smile', kind: 'range', durationMs: 4500 }),
  Object.freeze({ id: 'brow-raise', label: 'Brow raise', kind: 'range', durationMs: 4500 }),
  Object.freeze({ id: 'hard-blink', label: 'Hard blink', kind: 'range', durationMs: 4500 }),
  Object.freeze({ id: 'look-around', label: 'Look around', kind: 'range', durationMs: 4500 }),
  Object.freeze({ id: 'mouth-pucker', label: 'Mouth pucker', kind: 'range', durationMs: 4500 }),
]);
export const CALIBRATION_GUIDE_TOTAL_MS = CALIBRATION_GUIDE_STEPS.reduce((sum, step) => sum + step.durationMs, 0);
export const GAZE_CALIBRATION_STEPS = Object.freeze([
  Object.freeze({ id: 'center', label: 'Look center', target: Object.freeze({ x: 0, y: 0 }), durationMs: 2000 }),
  Object.freeze({ id: 'left', label: 'Look left', target: Object.freeze({ x: -0.8, y: 0 }), durationMs: 2000 }),
  Object.freeze({ id: 'right', label: 'Look right', target: Object.freeze({ x: 0.8, y: 0 }), durationMs: 2000 }),
  Object.freeze({ id: 'up', label: 'Look up', target: Object.freeze({ x: 0, y: 0.8 }), durationMs: 2000 }),
  Object.freeze({ id: 'down', label: 'Look down', target: Object.freeze({ x: 0, y: -0.8 }), durationMs: 2000 }),
]);
export const GAZE_CALIBRATION_TOTAL_MS = GAZE_CALIBRATION_STEPS.reduce((sum, step) => sum + step.durationMs, 0);

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
    this.samples.push({ timeMs, missed, gapMs: gap });
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

  rollingJitterMs(windowMs = 2500, nowMs = this.lastTimeMs ?? 0) {
    this.prune(nowMs, windowMs);
    if (this.samples.length < 2) return 0;
    const gaps = this.samples.map((sample) => sample.gapMs || 0);
    const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    const variance = gaps.reduce((sum, gap) => sum + (gap - mean) ** 2, 0) / gaps.length;
    return Math.sqrt(variance);
  }
}

export function estimateOneEuroLagMs(minCutoff = FILTER_PRESETS.balanced.minCutoff) {
  const cutoff = Math.max(0.001, Number(minCutoff) || FILTER_PRESETS.balanced.minCutoff);
  return 1000 / (2 * Math.PI * cutoff);
}

export class LandmarkConfidenceTracker {
  constructor(windowMs = 2500) {
    this.windowMs = windowMs;
    this.samples = [];
  }

  sample(confidence, nowMs = performanceNow()) {
    this.samples.push({ confidence: clamp(confidence), timeMs: nowMs });
    this.prune(nowMs);
    return this.quality();
  }

  prune(nowMs = performanceNow()) {
    const cutoff = nowMs - this.windowMs;
    while (this.samples.length && this.samples[0].timeMs < cutoff) this.samples.shift();
  }

  quality() {
    if (!this.samples.length) return 0;
    const values = this.samples.map((sample) => sample.confidence);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    const stability = 1 - clamp(Math.sqrt(variance) / 0.75);
    return clamp(mean * (0.65 + stability * 0.35));
  }
}

export class HeadPositionStabilizer {
  constructor({ recenterHalfLifeMs = 20_000, maxPlanarDriftM = 0.12 } = {}) {
    this.recenterHalfLifeMs = recenterHalfLifeMs;
    this.maxPlanarDriftM = maxPlanarDriftM;
    this.center = null;
    this.lastTimeMs = null;
  }

  reset() {
    this.center = null;
    this.lastTimeMs = null;
  }

  stabilize(pos = [0, 0, 0.4], nowMs = performanceNow(), { leanRangeCm = DEFAULT_TRACKER_SETTINGS.headLeanRangeCm } = {}) {
    const raw = [
      Number(pos[0] || 0),
      Number(pos[1] || 0),
      Number(pos[2] ?? 0.4),
    ];
    if (!this.center) {
      this.center = raw.slice();
      this.lastTimeMs = nowMs;
    }
    const dt = Math.max(0, nowMs - (this.lastTimeMs ?? nowMs));
    this.lastTimeMs = nowMs;
    const alpha = 1 - Math.exp(-dt / (this.recenterHalfLifeMs / Math.LN2));
    for (let i = 0; i < 3; i++) this.center[i] += (raw[i] - this.center[i]) * alpha;

    const leanRangeM = normalizeHeadLeanRangeCm(leanRangeCm) / 100;
    return [
      clamp(raw[0] - this.center[0], -this.maxPlanarDriftM, this.maxPlanarDriftM),
      clamp(raw[1] - this.center[1], -this.maxPlanarDriftM, this.maxPlanarDriftM),
      0.4 + clamp(raw[2] - this.center[2], -leanRangeM, leanRangeM),
    ];
  }
}

export class BlinkWinkStabilizer {
  constructor({ openThreshold = 0.38, closeThreshold = 0.62, winkMargin = 0.22, winkFrames = 3 } = {}) {
    this.openThreshold = openThreshold;
    this.closeThreshold = closeThreshold;
    this.winkMargin = winkMargin;
    this.winkFrames = winkFrames;
    this.leftClosed = false;
    this.rightClosed = false;
    this.winkSide = null;
    this.winkCount = 0;
  }

  reset() {
    this.leftClosed = false;
    this.rightClosed = false;
    this.winkSide = null;
    this.winkCount = 0;
  }

  filter(weights) {
    const out = new Float32Array(weights);
    const left = clamp(out[CHANNEL_INDEX.eyeBlinkLeft]);
    const right = clamp(out[CHANNEL_INDEX.eyeBlinkRight]);
    this.leftClosed = hysteresisClosed(left, this.leftClosed, this.openThreshold, this.closeThreshold);
    this.rightClosed = hysteresisClosed(right, this.rightClosed, this.openThreshold, this.closeThreshold);

    const candidate = left - right > this.winkMargin && left >= this.closeThreshold && right < this.closeThreshold
      ? 'left'
      : right - left > this.winkMargin && right >= this.closeThreshold && left < this.closeThreshold
        ? 'right'
        : null;
    if (candidate && candidate === this.winkSide) this.winkCount++;
    else {
      this.winkSide = candidate;
      this.winkCount = candidate ? 1 : 0;
    }

    if (this.winkSide === 'left' && this.winkCount >= this.winkFrames) {
      out[CHANNEL_INDEX.eyeBlinkLeft] = 1;
      out[CHANNEL_INDEX.eyeBlinkRight] = 0;
      return out;
    }
    if (this.winkSide === 'right' && this.winkCount >= this.winkFrames) {
      out[CHANNEL_INDEX.eyeBlinkLeft] = 0;
      out[CHANNEL_INDEX.eyeBlinkRight] = 1;
      return out;
    }

    if (this.leftClosed && this.rightClosed) {
      const symmetric = Math.max(left, right, this.closeThreshold);
      out[CHANNEL_INDEX.eyeBlinkLeft] = symmetric;
      out[CHANNEL_INDEX.eyeBlinkRight] = symmetric;
      return out;
    }

    out[CHANNEL_INDEX.eyeBlinkLeft] = this.leftClosed ? Math.max(left, this.closeThreshold) : Math.min(left, this.openThreshold);
    out[CHANNEL_INDEX.eyeBlinkRight] = this.rightClosed ? Math.max(right, this.closeThreshold) : Math.min(right, this.openThreshold);
    return out;
  }
}

export class TrackingLossSmoother {
  constructor({ fadeMs = 400, reacquireMs = 250, channels = NUM_CHANNELS } = {}) {
    this.fadeMs = fadeMs;
    this.reacquireMs = reacquireMs;
    this.channels = channels;
    this.lastWeights = new Float32Array(channels);
    this.lossFrom = new Float32Array(channels);
    this.lostAt = null;
    this.reacquireAt = null;
  }

  reset() {
    this.lastWeights.fill(0);
    this.lossFrom.fill(0);
    this.lostAt = null;
    this.reacquireAt = null;
  }

  update(hasFace, weights = this.lastWeights, nowMs = performanceNow()) {
    const input = new Float32Array(weights);
    const out = new Float32Array(this.channels);
    let reacquired = false;
    if (hasFace) {
      if (this.lostAt !== null) {
        this.reacquireAt = nowMs;
        this.lostAt = null;
        reacquired = true;
      }
      const t = this.reacquireAt === null ? 1 : clamp((nowMs - this.reacquireAt) / this.reacquireMs);
      for (let i = 0; i < this.channels; i++) out[i] = this.lastWeights[i] * (1 - t) + input[i] * t;
      if (t >= 1) this.reacquireAt = null;
      this.lastWeights.set(out);
      return { weights: out, active: true, reacquired, phase: reacquired ? 'reacquire' : 'tracking' };
    }

    if (this.lostAt === null) {
      this.lostAt = nowMs;
      this.lossFrom.set(this.lastWeights);
    }
    const t = clamp((nowMs - this.lostAt) / this.fadeMs);
    for (let i = 0; i < this.channels; i++) out[i] = this.lossFrom[i] * (1 - t);
    this.lastWeights.set(out);
    return { weights: out, active: t < 1, reacquired: false, phase: 'lost' };
  }
}

export class HandTargetStabilizer {
  constructor({ holdMs = 250, maxCurlDelta = 0.24, maxSpreadDelta = 0.36 } = {}) {
    this.holdMs = holdMs;
    this.maxCurlDelta = maxCurlDelta;
    this.maxSpreadDelta = maxSpreadDelta;
    this.previous = new Map();
    this.lastSeenMs = null;
  }

  reset() {
    this.previous.clear();
    this.lastSeenMs = null;
  }

  update(targets = [], nowMs = performanceNow()) {
    const warnings = [];
    if (targets.length) {
      this.lastSeenMs = nowMs;
      const next = targets.slice(0, 2).map((target) => {
        const previous = this.previous.get(target.handedness);
        const stabilized = stabilizeHandTarget(target, previous, this.maxCurlDelta, this.maxSpreadDelta, warnings);
        this.previous.set(stabilized.handedness, stabilized);
        return stabilized;
      });
      for (const key of Array.from(this.previous.keys())) {
        if (!next.some((target) => target.handedness === key)) this.previous.delete(key);
      }
      return { targets: next, active: true, warnings };
    }

    if (this.lastSeenMs !== null && nowMs - this.lastSeenMs <= this.holdMs && this.previous.size) {
      const age = nowMs - this.lastSeenMs;
      const confidenceScale = clamp(1 - age / this.holdMs);
      warnings.push('HAND_RECOVERY_HOLD');
      return {
        targets: Array.from(this.previous.values()).map((target) => ({
          ...target,
          confidence: clamp((target.confidence ?? 1) * confidenceScale),
          flags: (target.flags || 0) | 0x02,
        })),
        active: true,
        warnings,
      };
    }

    this.previous.clear();
    return { targets: [], active: false, warnings };
  }
}

export function createHandCalibrationProfile(name = 'default') {
  return {
    schema: 'minamo.hand-calibration.v1',
    name,
    createdAt: new Date().toISOString(),
    openCurls: Array(HAND_FINGER_NAMES.length).fill(0),
    fistCurls: Array(HAND_FINGER_NAMES.length).fill(1),
    spreadOffsets: Array(HAND_FINGER_NAMES.length).fill(0),
  };
}

export function normalizeHandCalibrationProfile(profile) {
  const base = createHandCalibrationProfile(profile?.name || 'default');
  if (!profile || typeof profile !== 'object' || (profile.schema && profile.schema !== base.schema)) return base;
  base.createdAt = typeof profile.createdAt === 'string' ? profile.createdAt : base.createdAt;
  base.openCurls = normalizeHandArray(profile.openCurls, 0, 0, 1);
  base.fistCurls = normalizeHandArray(profile.fistCurls, 1, 0, 1);
  base.spreadOffsets = normalizeHandArray(profile.spreadOffsets, 0, -1.5, 1.5);
  for (let i = 0; i < HAND_FINGER_NAMES.length; i++) {
    if (base.fistCurls[i] - base.openCurls[i] < 0.12) {
      base.openCurls[i] = 0;
      base.fistCurls[i] = 1;
    }
  }
  return base;
}

export function createHandCalibrationSession(name = 'hand-guided', startedAtMs = performanceNow()) {
  return {
    schema: 'minamo.hand-calibration.session.v1',
    name,
    startedAtMs,
    openSamples: [],
    fistSamples: [],
    rangeSamples: [],
  };
}

export function handCalibrationProgress(startedAtMs, nowMs = performanceNow()) {
  return calibrationGuideProgress(startedAtMs, nowMs, HAND_CALIBRATION_STEPS);
}

export function collectHandCalibrationSample(session, handTargets = [], nowMs = performanceNow()) {
  const progress = handCalibrationProgress(session.startedAtMs, nowMs);
  if (progress.done) return progress;
  const sample = handTargets[0] ? handTargetSample(handTargets[0]) : null;
  if (!sample) return progress;
  if (progress.step.kind === 'open') session.openSamples.push(sample);
  else if (progress.step.kind === 'fist') session.fistSamples.push(sample);
  else session.rangeSamples.push(sample);
  return progress;
}

export function buildHandCalibrationProfile({
  openSamples = [],
  fistSamples = [],
  rangeSamples = [],
  name = 'hand-guided',
  createdAt = new Date().toISOString(),
} = {}) {
  const profile = createHandCalibrationProfile(name);
  profile.createdAt = createdAt;
  for (let i = 0; i < HAND_FINGER_NAMES.length; i++) {
    const openValues = openSamples.map((sample) => sample.curls[i]).filter(Number.isFinite);
    const fistValues = fistSamples.map((sample) => sample.curls[i]).filter(Number.isFinite);
    const spreadValues = [...openSamples, ...rangeSamples].map((sample) => sample.spreads[i]).filter(Number.isFinite);
    profile.openCurls[i] = openValues.length ? percentile(openValues, 0.25) : 0;
    profile.fistCurls[i] = fistValues.length ? percentile(fistValues, 0.75) : 1;
    profile.spreadOffsets[i] = spreadValues.length ? average(spreadValues) : 0;
    if (profile.fistCurls[i] - profile.openCurls[i] < 0.12) {
      profile.openCurls[i] = 0;
      profile.fistCurls[i] = 1;
    }
  }
  return normalizeHandCalibrationProfile(profile);
}

export function applyHandCalibrationProfile(targets = [], profile = createHandCalibrationProfile()) {
  const p = normalizeHandCalibrationProfile(profile);
  return targets.map((target) => {
    const curls = HAND_FINGER_NAMES.map((_, i) => {
      const raw = Number(target.curls?.[i] || 0);
      return clamp((raw - p.openCurls[i]) / Math.max(0.12, p.fistCurls[i] - p.openCurls[i]));
    });
    const spreads = HAND_FINGER_NAMES.map((_, i) => clamp(Number(target.spreads?.[i] || 0) - p.spreadOffsets[i], -1.5, 1.5));
    const next = { ...target, curls, spreads, flags: (target.flags || 0) | 0x01 };
    next.gesture = classifyHandGesture(next);
    return next;
  });
}

export function classifyHandGesture(target = {}) {
  const curls = HAND_FINGER_NAMES.map((_, i) => clamp(Number(target.curls?.[i] || 0)));
  const extended = curls.map((curl) => curl < 0.35);
  const curled = curls.map((curl) => curl > 0.65);
  const fingerCount = extended.filter(Boolean).length;
  const point = extended[1] && curled[2] && curled[3] && curled[4];
  const peace = extended[1] && extended[2] && curled[3] && curled[4];
  const openPalm = fingerCount >= 4;
  const fist = curled.filter(Boolean).length >= 4;
  const drumGrip = curls[1] > 0.35 && curls[1] < 0.82
    && curls[2] > 0.42 && curls[2] < 0.92
    && curls[3] > 0.42 && curls[3] < 0.95
    && curls[0] < 0.75;
  return {
    fingerCount,
    openPalm,
    fist,
    point,
    peace,
    drumGrip,
    label: point ? 'point' : peace ? 'peace' : drumGrip ? 'drum grip' : openPalm ? 'open' : fist ? 'fist' : `${fingerCount}`,
  };
}

export function handTargetDebugRows(targets = []) {
  return targets.flatMap((target) => {
    const gesture = target.gesture || classifyHandGesture(target);
    return HAND_FINGER_NAMES.map((name, i) => ({
      handedness: target.handedness,
      finger: name,
      curl: clamp(Number(target.curls?.[i] || 0)),
      spread: clamp(Number(target.spreads?.[i] || 0), -1.5, 1.5),
      confidence: clamp(Number(target.confidence ?? 1)),
      gesture: gesture.label,
      recovered: Boolean((target.flags || 0) & 0x02),
    }));
  });
}

export function normalizeHeadLeanRangeCm(value) {
  return Math.round(clamp(Number(value ?? DEFAULT_TRACKER_SETTINGS.headLeanRangeCm), 0, 20) * 10) / 10;
}

export function selectTrackedFace(landmarkSets = [], { previousBox = null, lock = null } = {}) {
  const candidates = landmarkSets
    .map((landmarks, index) => ({ index, box: landmarkBounds(landmarks) }))
    .filter((candidate) => candidate.box.area > 0);
  if (!candidates.length) return { index: -1, box: null };
  const activeLock = lock?.enabled ? lock : null;
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const overlap = previousBox ? intersectionOverUnion(previousBox, candidate.box) : 0;
    const lockScore = activeLock ? (boxCenterInside(candidate.box, activeLock) ? 2 : -2) : 0;
    const score = overlap * 3 + lockScore + candidate.box.area;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

export function defaultFaceLockRegion(enabled = false) {
  return { enabled: Boolean(enabled), x: 0.25, y: 0.12, w: 0.5, h: 0.76 };
}

export function estimateLandmarkConfidence(landmarks = []) {
  if (!Array.isArray(landmarks) || landmarks.length === 0) return 0;
  let finite = 0;
  let inside = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const landmark of landmarks) {
    const x = Number(landmark?.x);
    const y = Number(landmark?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    finite++;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    if (x >= -0.05 && x <= 1.05 && y >= -0.05 && y <= 1.05) inside++;
  }
  if (finite < Math.max(8, landmarks.length * 0.5)) return 0;
  const finiteRatio = finite / landmarks.length;
  const insideRatio = inside / finite;
  const area = Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
  const areaScore = clamp((area - 0.01) / 0.08);
  return clamp(finiteRatio * insideRatio * areaScore);
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

export function createGazeCalibrationProfile() {
  return {
    schema: 'minamo.gaze-calibration.v1',
    center: [0, 0],
    scale: [1, 1],
  };
}

export function blendshapeGaze(weights) {
  const w = (name) => Number(weights?.[CHANNEL_INDEX[name]] || 0);
  return {
    x: clamp((w('eyeLookOutLeft') + w('eyeLookInRight') - w('eyeLookInLeft') - w('eyeLookOutRight')) * 0.5, -1, 1),
    y: clamp((w('eyeLookUpLeft') + w('eyeLookUpRight') - w('eyeLookDownLeft') - w('eyeLookDownRight')) * 0.5, -1, 1),
    source: 'blendshape',
  };
}

export function estimateIrisGaze(landmarks = [], { mirror = false, calibration = null } = {}) {
  const left = estimateEyeIrisGaze(landmarks, {
    iris: [468, 469, 470, 471, 472],
    outer: 33,
    inner: 133,
    top: 159,
    bottom: 145,
  });
  const right = estimateEyeIrisGaze(landmarks, {
    iris: [473, 474, 475, 476, 477],
    outer: 362,
    inner: 263,
    top: 386,
    bottom: 374,
  });
  const eyes = [left, right].filter(Boolean);
  if (!eyes.length) return null;
  let x = eyes.reduce((sum, eye) => sum + eye.x, 0) / eyes.length;
  let y = eyes.reduce((sum, eye) => sum + eye.y, 0) / eyes.length;
  if (mirror) x *= -1;
  const gazeCalibration = validateGazeCalibration(calibration).profile;
  x = (x - gazeCalibration.center[0]) * gazeCalibration.scale[0];
  y = (y - gazeCalibration.center[1]) * gazeCalibration.scale[1];
  return { x: clamp(x, -1, 1), y: clamp(y, -1, 1), source: 'iris', confidence: eyes.length / 2 };
}

export function applyGazeToWeights(weights, gaze) {
  const out = new Float32Array(weights);
  if (!gaze || gaze.source !== 'iris') return out;
  const x = clamp(Number(gaze.x || 0), -1, 1);
  const y = clamp(Number(gaze.y || 0), -1, 1);
  for (const name of ['eyeLookDownLeft', 'eyeLookDownRight', 'eyeLookInLeft', 'eyeLookInRight', 'eyeLookOutLeft', 'eyeLookOutRight', 'eyeLookUpLeft', 'eyeLookUpRight']) {
    out[CHANNEL_INDEX[name]] = 0;
  }
  if (x >= 0) {
    out[CHANNEL_INDEX.eyeLookOutLeft] = x;
    out[CHANNEL_INDEX.eyeLookInRight] = x;
  } else {
    out[CHANNEL_INDEX.eyeLookInLeft] = -x;
    out[CHANNEL_INDEX.eyeLookOutRight] = -x;
  }
  if (y >= 0) {
    out[CHANNEL_INDEX.eyeLookUpLeft] = y;
    out[CHANNEL_INDEX.eyeLookUpRight] = y;
  } else {
    out[CHANNEL_INDEX.eyeLookDownLeft] = -y;
    out[CHANNEL_INDEX.eyeLookDownRight] = -y;
  }
  return out;
}

export function resolveGaze(weights, landmarks, { mirror = false, calibration = null } = {}) {
  return estimateIrisGaze(landmarks, { mirror, calibration }) || blendshapeGaze(weights);
}

export function createGazeCalibrationSession(name = 'gaze', startedAtMs = performanceNow()) {
  return {
    schema: 'minamo.gaze-calibration.session.v1',
    name,
    startedAtMs,
    samples: [],
  };
}

export function collectGazeCalibrationSample(session, landmarks, nowMs = performanceNow(), { mirror = false } = {}) {
  const progress = calibrationGuideProgress(session.startedAtMs, nowMs, GAZE_CALIBRATION_STEPS);
  if (progress.done) return progress;
  const gaze = estimateIrisGaze(landmarks, { mirror, calibration: createGazeCalibrationProfile() });
  if (gaze) {
    session.samples.push({
      stepId: progress.step.id,
      target: progress.step.target,
      raw: { x: gaze.x, y: gaze.y },
    });
  }
  return progress;
}

export function buildGazeCalibrationProfile(samples = []) {
  const profile = createGazeCalibrationProfile();
  const centerSamples = samples.filter((sample) => sample.stepId === 'center');
  if (centerSamples.length) {
    profile.center = [average(centerSamples.map((sample) => sample.raw.x)), average(centerSamples.map((sample) => sample.raw.y))];
  }
  const horizontal = samples.filter((sample) => Math.abs(sample.target?.x || 0) > 0);
  const vertical = samples.filter((sample) => Math.abs(sample.target?.y || 0) > 0);
  const scaleX = calibrationScale(horizontal, profile.center[0], 'x');
  const scaleY = calibrationScale(vertical, profile.center[1], 'y');
  profile.scale = [scaleX || 1, scaleY || 1];
  return validateGazeCalibration(profile).profile;
}

export function gazeAngularErrorDegrees(actual, target, maxDegrees = 20) {
  return Math.hypot(Number(actual.x || 0) - Number(target.x || 0), Number(actual.y || 0) - Number(target.y || 0)) * maxDegrees;
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
    gaze: createGazeCalibrationProfile(),
  };
}

/**
 * @param {number} startedAtMs
 * @param {number} [nowMs]
 * @param {ReadonlyArray<{ id: string, label: string, durationMs: number, kind?: string, target?: { x: number, y: number } }>} [steps]
 */
export function calibrationGuideProgress(startedAtMs, nowMs = performanceNow(), steps = CALIBRATION_GUIDE_STEPS) {
  const totalMs = steps.reduce((sum, step) => sum + step.durationMs, 0);
  const elapsedMs = Math.max(0, nowMs - startedAtMs);
  let cursor = 0;
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    const stepEnd = cursor + step.durationMs;
    if (elapsedMs < stepEnd) {
      return {
        done: false,
        elapsedMs,
        totalMs,
        step,
        stepIndex: index,
        stepElapsedMs: elapsedMs - cursor,
        stepRemainingMs: stepEnd - elapsedMs,
        progress: totalMs ? elapsedMs / totalMs : 1,
      };
    }
    cursor = stepEnd;
  }
  return {
    done: true,
    elapsedMs: totalMs,
    totalMs,
    step: steps[steps.length - 1],
    stepIndex: steps.length - 1,
    stepElapsedMs: steps[steps.length - 1]?.durationMs || 0,
    stepRemainingMs: 0,
    progress: 1,
  };
}

export function createGuidedCalibrationSession(name = 'guided', startedAtMs = performanceNow()) {
  return {
    schema: 'minamo.calibration.session.v1',
    name,
    startedAtMs,
    neutralSamples: [],
    rangeSamples: [],
  };
}

export function collectGuidedCalibrationSample(session, weights, nowMs = performanceNow(), steps = CALIBRATION_GUIDE_STEPS) {
  const progress = calibrationGuideProgress(session.startedAtMs, nowMs, steps);
  if (progress.done) return progress;
  const sample = Array.from(weights, (value) => clamp(Number(value)));
  if (progress.step.kind === 'neutral') session.neutralSamples.push(sample);
  else session.rangeSamples.push(sample);
  return progress;
}

export function buildCalibrationProfileFromSamples({
  neutralSamples = [],
  rangeSamples = [],
  name = 'guided',
  baseProfile = null,
  createdAt = new Date().toISOString(),
} = {}) {
  const base = normalizeProfile(baseProfile || createCalibrationProfile(name));
  const profile = createCalibrationProfile(name || base.name);
  profile.createdAt = createdAt;
  profile.muted = base.muted.slice();

  for (let channel = 0; channel < NUM_CHANNELS; channel++) {
    const neutralValues = channelValues(neutralSamples, channel);
    const rangeValues = channelValues(rangeSamples, channel);
    const offset = neutralValues.length ? percentile(neutralValues, 0.95) : base.offsets[channel];
    const adjustedRange = rangeValues.map((value) => Math.max(0, value - offset));
    const peak = adjustedRange.length ? percentile(adjustedRange, 0.95) : 0;
    const gain = peak > 0.05 ? clamp(1 / peak, 0.5, 2) : base.gains[channel];
    const neutralResidual = neutralValues.map((value) => Math.max(0, value - offset) * gain);
    const neutralMax = neutralResidual.length ? Math.max(...neutralResidual) : 0;

    profile.offsets[channel] = clamp(offset);
    profile.gains[channel] = clamp(gain, 0, 2);
    profile.deadzones[channel] = clamp(Math.max(base.deadzones[channel], neutralMax + 0.001), 0, 0.2);
  }

  return normalizeProfile(profile);
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
  base.gaze = validateGazeCalibration(profile.gaze, warnings).profile;
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
    if (value?.schema === 'minamo.kgm1.recording-metadata.v1') continue;
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
    spreads: Array.isArray(hand?.spreads) ? hand.spreads.slice(0, 5).map((v) => clampOptionalNumber(v, 0, -1.5, 1.5)) : [],
    wrist: Array.isArray(hand?.wrist) ? hand.wrist.slice(0, 3).map((v) => clampOptionalNumber(v, 0, -1, 1)) : [0, 0, 0],
    flags: Number.isInteger(hand?.flags) ? hand.flags & 0xff : 0,
  };
}

function clampOptionalNumber(value, fallback, min = 0, max = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? clamp(n, min, max) : fallback;
}

function normalizeHandArray(values, fallback, min, max) {
  const out = Array(HAND_FINGER_NAMES.length).fill(fallback);
  if (!Array.isArray(values)) return out;
  for (let i = 0; i < out.length; i++) out[i] = clampOptionalNumber(values[i], fallback, min, max);
  return out;
}

function handTargetSample(target) {
  if (!target || !Array.isArray(target.curls) || !Array.isArray(target.spreads)) return null;
  return {
    curls: HAND_FINGER_NAMES.map((_, i) => clamp(Number(target.curls[i] || 0))),
    spreads: HAND_FINGER_NAMES.map((_, i) => clamp(Number(target.spreads[i] || 0), -1.5, 1.5)),
  };
}

function stabilizeHandTarget(target, previous, maxCurlDelta, maxSpreadDelta, warnings) {
  const next = {
    ...target,
    curls: HAND_FINGER_NAMES.map((_, i) => clamp(Number(target.curls?.[i] || 0))),
    spreads: HAND_FINGER_NAMES.map((_, i) => clamp(Number(target.spreads?.[i] || 0), -1.5, 1.5)),
    wrist: Array.isArray(target.wrist) ? target.wrist.slice(0, 3).map((v) => clampOptionalNumber(v, 0, -1, 1)) : [0, 0, 0],
  };
  if (previous) {
    for (let i = 0; i < HAND_FINGER_NAMES.length; i++) {
      const curl = limitDelta(next.curls[i], previous.curls?.[i] ?? next.curls[i], maxCurlDelta);
      const spread = limitDelta(next.spreads[i], previous.spreads?.[i] ?? next.spreads[i], maxSpreadDelta);
      if (curl !== next.curls[i]) warnings.push(`HAND_CURL_CLAMPED:${next.handedness}:${HAND_FINGER_NAMES[i]}`);
      if (spread !== next.spreads[i]) warnings.push(`HAND_SPREAD_CLAMPED:${next.handedness}:${HAND_FINGER_NAMES[i]}`);
      next.curls[i] = curl;
      next.spreads[i] = spread;
    }
  }
  next.gesture = classifyHandGesture(next);
  return next;
}

function limitDelta(value, previous, maxDelta) {
  return previous + clamp(value - previous, -maxDelta, maxDelta);
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

function channelValues(samples, channel) {
  return samples
    .map((sample) => clamp(Number(sample?.[channel] || 0)))
    .filter((value) => Number.isFinite(value));
}

function percentile(values, q) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower];
  const weight = pos - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function estimateEyeIrisGaze(landmarks, { iris, outer, inner, top, bottom }) {
  const points = [landmarks[outer], landmarks[inner], landmarks[top], landmarks[bottom], ...iris.map((index) => landmarks[index])];
  if (points.some((point) => !finitePoint(point))) return null;
  const irisCenter = averagePoint(iris.map((index) => landmarks[index]));
  const eyeCenter = averagePoint([landmarks[outer], landmarks[inner], landmarks[top], landmarks[bottom]]);
  const width = distance2d(landmarks[outer], landmarks[inner]);
  const height = distance2d(landmarks[top], landmarks[bottom]);
  if (width < 0.015 || height < 0.004) return null;
  return {
    x: clamp((irisCenter.x - eyeCenter.x) / (width * 0.34), -1, 1),
    y: clamp((eyeCenter.y - irisCenter.y) / (height * 0.45), -1, 1),
  };
}

function validateGazeCalibration(value, warnings = []) {
  const profile = createGazeCalibrationProfile();
  if (!value || typeof value !== 'object') return { profile };
  if (value.schema && value.schema !== profile.schema) {
    warnings.push(`unsupported gaze calibration schema: ${value.schema}`);
    return { profile };
  }
  if (Array.isArray(value.center)) {
    profile.center = [
      clampProfileNumber(value.center[0], -1, 1, 'gaze.center[0]', warnings),
      clampProfileNumber(value.center[1], -1, 1, 'gaze.center[1]', warnings),
    ];
  }
  if (Array.isArray(value.scale)) {
    profile.scale = [
      clampProfileNumber(value.scale[0], 0.25, 4, 'gaze.scale[0]', warnings),
      clampProfileNumber(value.scale[1], 0.25, 4, 'gaze.scale[1]', warnings),
    ];
  }
  return { profile };
}

function calibrationScale(samples, center, axis) {
  const ratios = samples
    .map((sample) => {
      const rawDelta = Number(sample.raw?.[axis] || 0) - center;
      const target = Number(sample.target?.[axis] || 0);
      if (Math.abs(rawDelta) < 0.05 || Math.abs(target) < 0.05) return null;
      return Math.abs(target / rawDelta);
    })
    .filter((value) => Number.isFinite(value));
  if (!ratios.length) return 1;
  return clamp(percentile(ratios, 0.5), 0.25, 4);
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function averagePoint(points) {
  return {
    x: average(points.map((point) => point.x)),
    y: average(points.map((point) => point.y)),
  };
}

function finitePoint(point) {
  return Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y));
}

function distance2d(a, b) {
  return Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
}

function hysteresisClosed(value, previous, openThreshold, closeThreshold) {
  if (value >= closeThreshold) return true;
  if (value <= openThreshold) return false;
  return previous;
}

function landmarkBounds(landmarks = []) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const landmark of landmarks) {
    const x = Number(landmark?.x);
    const y = Number(landmark?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return { x: 0, y: 0, w: 0, h: 0, area: 0 };
  const w = Math.max(0, maxX - minX);
  const h = Math.max(0, maxY - minY);
  return { x: minX, y: minY, w, h, area: w * h };
}

function intersectionOverUnion(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.area + b.area - intersection;
  return union > 0 ? intersection / union : 0;
}

function boxCenterInside(box, lock) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return cx >= lock.x && cx <= lock.x + lock.w && cy >= lock.y && cy <= lock.y + lock.h;
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
