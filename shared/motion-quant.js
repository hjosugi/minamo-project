// Motion delta quantization reference codec (issue #161).
//
// Streams KGM motion as an initial keyframe followed by quantized deltas:
//   - face/expression weights: 8-bit normalized deltas from the last keyframe
//   - head rotation: shortest-path quaternion delta, 14-bit per component
//   - a keyframe is forced after reconnect, model change, or 2 s of deltas
//   - a delta that references an older keyframe than the decoder's current one
//     is dropped (stale-after-keyframe protection)
//
// The codec is intentionally dependency-free and JSON-serializable so it can
// back both the design doc and the acceptance-gate tests.

export const WEIGHT_DELTA_SCALE = 127; // int8 range for normalized weight deltas
export const QUAT_DELTA_BITS = 14;
export const QUAT_DELTA_SCALE = (1 << (QUAT_DELTA_BITS - 1)) - 1; // 8191
export const KEYFRAME_INTERVAL_MS = 2000;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function quantizeWeightDeltas(keyframeWeights = [], weights = []) {
  const length = Math.max(keyframeWeights.length, weights.length);
  const out = new Array(length);
  for (let i = 0; i < length; i++) {
    const base = Number(keyframeWeights[i] ?? 0);
    const value = Number(weights[i] ?? 0);
    out[i] = clamp(Math.round((value - base) * WEIGHT_DELTA_SCALE), -WEIGHT_DELTA_SCALE, WEIGHT_DELTA_SCALE);
  }
  return out;
}

export function dequantizeWeightDeltas(keyframeWeights = [], deltas = []) {
  const length = Math.max(keyframeWeights.length, deltas.length);
  const out = new Array(length);
  for (let i = 0; i < length; i++) {
    const base = Number(keyframeWeights[i] ?? 0);
    const delta = Number(deltas[i] ?? 0) / WEIGHT_DELTA_SCALE;
    out[i] = clamp(base + delta, 0, 1);
  }
  return out;
}

// Align `next` to the same hemisphere as `reference` so the delta takes the
// shortest path across the +-180 degrees boundary.
export function shortestPathQuat(reference = [0, 0, 0, 1], next = [0, 0, 0, 1]) {
  const dot = reference[0] * next[0] + reference[1] * next[1] + reference[2] * next[2] + reference[3] * next[3];
  return dot < 0 ? next.map((component) => 0 - component) : next.slice();
}

export function quantizeQuatDelta(keyframeQuat = [0, 0, 0, 1], quat = [0, 0, 0, 1]) {
  const aligned = shortestPathQuat(keyframeQuat, quat);
  return aligned.map((component, i) => clamp(Math.round((component - keyframeQuat[i]) * QUAT_DELTA_SCALE), -QUAT_DELTA_SCALE, QUAT_DELTA_SCALE));
}

export function dequantizeQuatDelta(keyframeQuat = [0, 0, 0, 1], deltas = [0, 0, 0, 0]) {
  const raw = keyframeQuat.map((component, i) => component + (Number(deltas[i] ?? 0) / QUAT_DELTA_SCALE));
  const norm = Math.hypot(raw[0], raw[1], raw[2], raw[3]) || 1;
  return raw.map((component) => component / norm);
}

export function createEncoderState() {
  return { keyframe: null, keyframeSeq: -1 };
}

/**
 * @param {{ keyframe: any, keyframeSeq: number }} state
 * @param {{ tMs?: number, modelId?: any, reconnected?: boolean }} [options]
 */
export function shouldForceKeyframe(state, options = {}) {
  const { tMs = 0, modelId, reconnected } = options;
  if (!state.keyframe) return true;
  if (reconnected) return true;
  if (modelId !== undefined && modelId !== state.keyframe.modelId) return true;
  return tMs - state.keyframe.tMs >= KEYFRAME_INTERVAL_MS;
}

// frame = { frameId, tMs, weights: number[], quat: [x,y,z,w], modelId? }
export function encodeMotionFrame(state, frame, { reconnected = false } = {}) {
  const weights = frame.weights ?? [];
  const quat = frame.quat ?? [0, 0, 0, 1];
  const forceKeyframe = shouldForceKeyframe(state, { tMs: frame.tMs, modelId: frame.modelId, reconnected });

  if (forceKeyframe) {
    const keyframeSeq = state.keyframeSeq + 1;
    state.keyframe = { tMs: frame.tMs, weights: weights.slice(), quat: quat.slice(), modelId: frame.modelId };
    state.keyframeSeq = keyframeSeq;
    return {
      type: 'keyframe',
      keyframeSeq,
      frameId: frame.frameId,
      tMs: frame.tMs,
      weights: weights.slice(),
      quat: quat.slice(),
    };
  }

  return {
    type: 'delta',
    keyframeSeq: state.keyframeSeq,
    frameId: frame.frameId,
    tMs: frame.tMs,
    weightDeltas: quantizeWeightDeltas(state.keyframe.weights, weights),
    quatDelta: quantizeQuatDelta(state.keyframe.quat, quat),
  };
}

// Decodes a stream of packets, dropping deltas whose keyframe is no longer
// current (arrived after a newer keyframe, or out of order).
export function decodeMotionStream(packets = []) {
  const frames = [];
  let keyframe = null;
  let keyframeSeq = -1;
  let dropped = 0;

  for (const packet of packets) {
    if (packet.type === 'keyframe') {
      if (packet.keyframeSeq < keyframeSeq) {
        dropped++;
        continue;
      }
      keyframe = { weights: packet.weights.slice(), quat: packet.quat.slice() };
      keyframeSeq = packet.keyframeSeq;
      frames.push({ frameId: packet.frameId, tMs: packet.tMs, weights: keyframe.weights.slice(), quat: keyframe.quat.slice() });
      continue;
    }
    if (!keyframe || packet.keyframeSeq !== keyframeSeq) {
      dropped++;
      continue;
    }
    frames.push({
      frameId: packet.frameId,
      tMs: packet.tMs,
      weights: dequantizeWeightDeltas(keyframe.weights, packet.weightDeltas),
      quat: dequantizeQuatDelta(keyframe.quat, packet.quatDelta),
    });
  }

  return { frames, dropped };
}
