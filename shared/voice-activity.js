import { CHANNEL_INDEX } from './blendshapes.js';

export function voiceActivityLevelFromRms(rms, { noiseFloor = 0.015, speechRms = 0.12 } = {}) {
  const value = (Number(rms) - noiseFloor) / Math.max(1e-6, speechRms - noiseFloor);
  return Math.max(0, Math.min(1, value));
}

export function applyVoiceActivityAccents(weights, { enabled = false, rms = 0, browAmount = 0.12, headNodAmount = 0.008 } = {}) {
  const level = enabled ? voiceActivityLevelFromRms(rms) : 0;
  const next = new Float32Array(weights);
  if (level <= 0) return { weights: next, level: 0, headNod: 0 };
  const browIndex = CHANNEL_INDEX.browInnerUp;
  next[browIndex] = Math.max(next[browIndex], Math.min(1, next[browIndex] + level * browAmount));
  return { weights: next, level, headNod: level * headNodAmount };
}
