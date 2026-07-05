import { CHANNEL_INDEX } from './blendshapes.js';

export const AUDIO_LIPSYNC_TARGET_LATENCY_MS = 80;

export function createSilentAudioLipsyncFrame(overrides = {}) {
  return {
    type: 'viseme',
    contextTimeMs: 0,
    rms: 0,
    speech: 0,
    openness: 0,
    aa: 0,
    ih: 0,
    ou: 0,
    ee: 0,
    oh: 0,
    funnel: 0,
    pucker: 0,
    wide: 0,
    close: 0,
    ...overrides,
  };
}

export function audioLipsyncLevelFromRms(rms, { noiseFloor = 0.015, speechRms = 0.12 } = {}) {
  return clamp01((Number(rms) - noiseFloor) / Math.max(1e-6, speechRms - noiseFloor));
}

export function estimateAudioLipsyncFrame({ rms = 0, low = 0, mid = 0, high = 0, contextTimeMs = 0 } = {}) {
  const speech = audioLipsyncLevelFromRms(rms);
  const total = Math.max(1e-9, Math.abs(low) + Math.abs(mid) + Math.abs(high));
  const lowRatio = clamp01(Math.abs(low) / total);
  const midRatio = clamp01(Math.abs(mid) / total);
  const highRatio = clamp01(Math.abs(high) / total);
  const round = clamp01((lowRatio * 1.25 + midRatio * 0.25 - highRatio * 0.45) * speech);
  const wide = clamp01((highRatio * 1.15 + midRatio * 0.45 - lowRatio * 0.25) * speech);
  const open = clamp01(speech * (0.58 + midRatio * 0.35 + lowRatio * 0.15));
  const close = clamp01((1 - speech) * 0.18);
  return createSilentAudioLipsyncFrame({
    contextTimeMs,
    rms,
    speech,
    openness: open,
    aa: clamp01(open * (1 - round * 0.55) * (1 - wide * 0.35)),
    ih: clamp01(wide * (0.55 + speech * 0.35)),
    ou: clamp01(round * (0.65 + speech * 0.25)),
    ee: clamp01(wide * (0.75 + highRatio * 0.2)),
    oh: clamp01(round * open),
    funnel: clamp01(round * 0.9),
    pucker: clamp01(round * 0.72),
    wide,
    close,
  });
}

export function smoothAudioLipsyncFrame(previous, next, dtMs, { attackMs = 30, releaseMs = 120 } = {}) {
  const prev = previous || createSilentAudioLipsyncFrame();
  const out = createSilentAudioLipsyncFrame({ ...next });
  for (const key of ['speech', 'openness', 'aa', 'ih', 'ou', 'ee', 'oh', 'funnel', 'pucker', 'wide', 'close']) {
    const target = Number(next?.[key] || 0);
    const current = Number(prev?.[key] || 0);
    const timeConstant = target > current ? attackMs : releaseMs;
    const amount = clamp01(dtMs / Math.max(1, timeConstant));
    out[key] = current + (target - current) * amount;
  }
  return out;
}

export function fuseAudioLipsyncWeights(
  visualWeights,
  audioFrame,
  { enabled = false, visualConfidence = 1, latencyMs = 0, maxLatencyMs = AUDIO_LIPSYNC_TARGET_LATENCY_MS } = {},
) {
  const weights = new Float32Array(visualWeights);
  const audio = audioFrame || createSilentAudioLipsyncFrame();
  const speech = clamp01(Number(audio.speech || 0));
  if (!enabled || speech <= 0 || latencyMs > maxLatencyMs) {
    return { weights, speech: 0, latencyOk: latencyMs <= maxLatencyMs };
  }

  const confidence = clamp01(visualConfidence);
  const jawIndex = CHANNEL_INDEX.jawOpen;
  const visualJaw = clamp01(weights[jawIndex]);
  const audioOpen = clamp01(audio.openness);
  weights[jawIndex] = clamp01(speech * Math.max(audioOpen, visualJaw * confidence) + (1 - speech) * visualJaw * confidence);

  const shapeMix = clamp01((1 - confidence) * 0.75 + speech * 0.35);
  maxBlend(weights, 'mouthFunnel', audio.funnel, shapeMix);
  maxBlend(weights, 'mouthPucker', audio.pucker, shapeMix);
  maxBlend(weights, 'mouthStretchLeft', audio.wide, shapeMix);
  maxBlend(weights, 'mouthStretchRight', audio.wide, shapeMix);
  maxBlend(weights, 'mouthClose', audio.close, shapeMix * 0.45);

  return { weights, speech, latencyOk: true };
}

export function audioLipsyncWithinLatency(latencyMs, targetMs = AUDIO_LIPSYNC_TARGET_LATENCY_MS) {
  return Number.isFinite(latencyMs) && latencyMs >= 0 && latencyMs < targetMs;
}

function maxBlend(weights, channel, value, amount) {
  const index = CHANNEL_INDEX[channel];
  weights[index] = Math.max(clamp01(weights[index]), clamp01(value) * clamp01(amount));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}
