export const KGM2_MAGIC = 0x324b; // "K2" little-endian
export const KGM2_VERSION = 2;
export const KGM2_HEADER_BYTES = 12;
export const KGM2_TYPE_KEYFRAME = 1;
export const KGM2_TYPE_DELTA = 2;
export const KGM2_FACE_CHANNELS = 52;
export const KGM2_FACE_MASK_BYTES = 7;

const QUAT_COMPONENT_SCALE = 511;
const QUAT_COMPONENT_MAX = 1 / Math.sqrt(2);
const POS_SCALE = 1000;

export function packSmallestThreeQuat(quat) {
  const q = normalizeQuat(quat);
  let largest = 0;
  for (let i = 1; i < 4; i++) {
    if (Math.abs(q[i]) > Math.abs(q[largest])) largest = i;
  }
  const sign = q[largest] < 0 ? -1 : 1;
  let packed = largest;
  let shift = 2;
  for (let i = 0; i < 4; i++) {
    if (i === largest) continue;
    const component = clamp((q[i] * sign) / QUAT_COMPONENT_MAX, -1, 1);
    const encoded = clampInt(Math.round(component * QUAT_COMPONENT_SCALE) + 512, 0, 1023);
    packed |= encoded << shift;
    shift += 10;
  }
  return packed >>> 0;
}

export function unpackSmallestThreeQuat(packed) {
  const largest = packed & 0x03;
  const q = [0, 0, 0, 0];
  let shift = 2;
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    if (i === largest) continue;
    const encoded = (packed >>> shift) & 0x03ff;
    const component = ((encoded - 512) / QUAT_COMPONENT_SCALE) * QUAT_COMPONENT_MAX;
    q[i] = component;
    sum += component * component;
    shift += 10;
  }
  q[largest] = Math.sqrt(Math.max(0, 1 - sum));
  return normalizeQuat(q);
}

export class Kgm2FaceEncoder {
  constructor({ keyframeInterval = 30, changeThreshold = 1 / 255 } = {}) {
    this.keyframeInterval = keyframeInterval;
    this.changeThreshold = changeThreshold;
    this.lastKeyframe = null;
  }

  encode(frame) {
    const keyId = Math.floor(frame.seq / this.keyframeInterval) & 0xffff;
    if (!this.lastKeyframe || frame.seq % this.keyframeInterval === 0) {
      return this.encodeKeyframe(frame, keyId);
    }
    const delta = encodeDelta(frame, this.lastKeyframe, keyId, this.changeThreshold);
    if (!delta) return this.encodeKeyframe(frame, keyId);
    return delta;
  }

  encodeKeyframe(frame, keyId = frame.seq & 0xffff) {
    this.lastKeyframe = cloneFaceFrame(frame, keyId);
    return encodeKeyframe(frame, keyId);
  }
}

export class Kgm2FaceDecoder {
  constructor() {
    this.keyframes = new Map();
  }

  decode(data) {
    const buf = normalizeBuffer(data);
    if (!buf || buf.byteLength < KGM2_HEADER_BYTES) return null;
    const dv = new DataView(buf);
    if (dv.getUint16(0, true) !== KGM2_MAGIC || dv.getUint8(2) !== KGM2_VERSION) return null;
    const type = dv.getUint8(3);
    const t = dv.getUint32(4, true);
    const seq = dv.getUint16(8, true);
    const keyId = dv.getUint16(10, true);
    if (type === KGM2_TYPE_KEYFRAME) {
      const frame = decodeKeyframeBody(dv, KGM2_HEADER_BYTES, { t, seq });
      if (!frame) return null;
      this.keyframes.set(keyId, cloneFaceFrame(frame, keyId));
      return frame;
    }
    if (type === KGM2_TYPE_DELTA) {
      const base = this.keyframes.get(keyId);
      if (!base) return null;
      return decodeDeltaBody(dv, KGM2_HEADER_BYTES, { t, seq }, base);
    }
    return null;
  }
}

export function estimateClockOffsetMs({ clientSendMs, relayReceiveMs, relaySendMs, clientReceiveMs }) {
  const uplinkOffset = relayReceiveMs - clientSendMs;
  const downlinkOffset = relaySendMs - clientReceiveMs;
  return (uplinkOffset + downlinkOffset) / 2;
}

export class ClockOffsetEstimator {
  constructor(limit = 12) {
    this.limit = limit;
    this.samples = [];
  }

  sample(probe) {
    const offsetMs = estimateClockOffsetMs(probe);
    const rttMs = Math.max(0, probe.clientReceiveMs - probe.clientSendMs - (probe.relaySendMs - probe.relayReceiveMs));
    this.samples.push({ offsetMs, rttMs });
    this.samples.sort((a, b) => a.rttMs - b.rttMs);
    this.samples = this.samples.slice(0, this.limit);
    return this.offsetMs();
  }

  offsetMs() {
    if (!this.samples.length) return 0;
    const best = this.samples.slice(0, Math.max(1, Math.ceil(this.samples.length / 2)));
    return best.reduce((sum, sample) => sum + sample.offsetMs, 0) / best.length;
  }
}

function encodeKeyframe(frame, keyId) {
  const weights = quantizeWeights(frame.face.weights);
  const size = KGM2_HEADER_BYTES + 4 + 6 + KGM2_FACE_CHANNELS;
  const buf = new ArrayBuffer(size);
  const dv = new DataView(buf);
  writeHeader(dv, KGM2_TYPE_KEYFRAME, frame.t, frame.seq, keyId);
  let o = KGM2_HEADER_BYTES;
  dv.setUint32(o, packSmallestThreeQuat(frame.face.quat), true); o += 4;
  for (let i = 0; i < 3; i++) { dv.setInt16(o, clampInt(Math.round(frame.face.pos[i] * POS_SCALE), -32768, 32767), true); o += 2; }
  for (let i = 0; i < KGM2_FACE_CHANNELS; i++) dv.setUint8(o++, weights[i]);
  return buf;
}

function encodeDelta(frame, keyframe, keyId, threshold) {
  const weights = quantizeWeights(frame.face.weights);
  const baseWeights = keyframe.weights;
  const mask = new Uint8Array(KGM2_FACE_MASK_BYTES);
  const deltas = [];
  for (let i = 0; i < KGM2_FACE_CHANNELS; i++) {
    const delta = weights[i] - baseWeights[i];
    if (Math.abs(delta) / 255 >= threshold) {
      if (delta < -128 || delta > 127) return null;
      setMask(mask, i);
      deltas.push(delta);
    }
  }
  const posDelta = frame.face.pos.map((value, i) => clampInt(Math.round((value - keyframe.pos[i]) * POS_SCALE), -128, 127));
  const size = KGM2_HEADER_BYTES + 4 + 3 + KGM2_FACE_MASK_BYTES + deltas.length;
  const buf = new ArrayBuffer(size);
  const dv = new DataView(buf);
  writeHeader(dv, KGM2_TYPE_DELTA, frame.t, frame.seq, keyId);
  let o = KGM2_HEADER_BYTES;
  dv.setUint32(o, packSmallestThreeQuat(frame.face.quat), true); o += 4;
  for (let i = 0; i < 3; i++) dv.setInt8(o++, posDelta[i]);
  for (let i = 0; i < KGM2_FACE_MASK_BYTES; i++) dv.setUint8(o++, mask[i]);
  for (const delta of deltas) dv.setInt8(o++, delta);
  return buf;
}

function decodeKeyframeBody(dv, offset, meta) {
  if (dv.byteLength < offset + 4 + 6 + KGM2_FACE_CHANNELS) return null;
  let o = offset;
  const quat = unpackSmallestThreeQuat(dv.getUint32(o, true)); o += 4;
  const pos = [];
  for (let i = 0; i < 3; i++) { pos.push(dv.getInt16(o, true) / POS_SCALE); o += 2; }
  const weights = new Float32Array(KGM2_FACE_CHANNELS);
  for (let i = 0; i < KGM2_FACE_CHANNELS; i++) weights[i] = dv.getUint8(o++) / 255;
  return { t: meta.t, seq: meta.seq, face: { quat, pos, weights } };
}

function decodeDeltaBody(dv, offset, meta, base) {
  if (dv.byteLength < offset + 4 + 3 + KGM2_FACE_MASK_BYTES) return null;
  let o = offset;
  const quat = unpackSmallestThreeQuat(dv.getUint32(o, true)); o += 4;
  const pos = [];
  for (let i = 0; i < 3; i++) pos.push(base.pos[i] + dv.getInt8(o++) / POS_SCALE);
  const mask = new Uint8Array(KGM2_FACE_MASK_BYTES);
  for (let i = 0; i < KGM2_FACE_MASK_BYTES; i++) mask[i] = dv.getUint8(o++);
  const weights = new Uint8Array(base.weights);
  for (let i = 0; i < KGM2_FACE_CHANNELS; i++) {
    if (!maskHas(mask, i)) continue;
    if (o >= dv.byteLength) return null;
    weights[i] = clampInt(weights[i] + dv.getInt8(o++), 0, 255);
  }
  return { t: meta.t, seq: meta.seq, face: { quat, pos, weights: Float32Array.from(weights, (v) => v / 255) } };
}

function writeHeader(dv, type, t, seq, keyId) {
  dv.setUint16(0, KGM2_MAGIC, true);
  dv.setUint8(2, KGM2_VERSION);
  dv.setUint8(3, type);
  dv.setUint32(4, t >>> 0, true);
  dv.setUint16(8, seq & 0xffff, true);
  dv.setUint16(10, keyId & 0xffff, true);
}

function setMask(mask, index) {
  mask[index >> 3] |= 1 << (index & 7);
}

function maskHas(mask, index) {
  return (mask[index >> 3] & (1 << (index & 7))) !== 0;
}

function quantizeWeights(weights) {
  const out = new Uint8Array(KGM2_FACE_CHANNELS);
  for (let i = 0; i < KGM2_FACE_CHANNELS; i++) out[i] = clampInt(Math.round(Number(weights?.[i] || 0) * 255), 0, 255);
  return out;
}

function cloneFaceFrame(frame, keyId) {
  return {
    keyId,
    t: frame.t,
    seq: frame.seq,
    quat: normalizeQuat(frame.face.quat),
    pos: frame.face.pos.slice(0, 3),
    weights: quantizeWeights(frame.face.weights),
  };
}

function normalizeQuat(quat) {
  const q = [Number(quat?.[0] || 0), Number(quat?.[1] || 0), Number(quat?.[2] || 0), Number(quat?.[3] ?? 1)];
  const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return q.map((v) => v / len);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
}

function normalizeBuffer(data) {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return null;
}
