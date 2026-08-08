// Per-signal stabilizers.
//
// Each class holds the small amount of state needed to keep one signal from
// breaking: landmark confidence, head position drift, blink/wink cross-talk,
// tracking loss, and hand target jumps. They are grouped because they share a
// shape -- construct once, update() per frame, allocate nothing in the loop --
// and because stability is the project's stated top priority, so keeping the
// whole anti-jitter surface in one file makes it readable at once.
//
// Depends only on ./math.js and ./settings.js, so it stays below runtime.js.

import { CHANNEL_INDEX, NUM_CHANNELS } from './blendshapes.js';
import { clamp, clampOptionalNumber, hysteresisClosed, performanceNow } from './math.js';
import { HAND_FINGER_NAMES, classifyHandGesture } from './hand-gestures.js';
import { DEFAULT_TRACKER_SETTINGS, normalizeHeadLeanRangeCm } from './settings.js';

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
