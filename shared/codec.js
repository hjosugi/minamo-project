// KGM1 wire codec.
// One tracking frame fits in one small binary packet (76 bytes for face only),
// so a frame always fits in a single WebTransport datagram (< 1200 B MTU).
// See docs/PROTOCOL.md for the full spec.

import { NUM_CHANNELS, NUM_POSE_POINTS } from './blendshapes.js';

export const MAGIC = 0x4b47; // "KG" little-endian
export const VERSION = 1;

export const BLOCK_FACE = 1 << 0;
export const BLOCK_POSE = 1 << 1;
export const BLOCK_HANDS = 1 << 2;

export const HEADER_BYTES = 10;
export const FACE_BYTES = 4 * 2 + 3 * 2 + NUM_CHANNELS; // quat + pos + weights = 66
export const POSE_BYTES = 1 + NUM_POSE_POINTS * 3 * 2;  // count + points = 43
export const HAND_FINGER_COUNT = 5;
export const HAND_TARGET_BYTES = 16; // flags + handedness + confidence + curls + spreads + wrist xyz

const QUAT_SCALE = 32767;   // i16 full range for [-1, 1]
const POS_SCALE = 1000;     // meters -> millimeters, i16 (+-32.7 m range)
const HAND_WRIST_SCALE = 127; // normalized compact wrist target, i8

function clampI16(v) {
  return Math.max(-32768, Math.min(32767, Math.round(v)));
}

function clampU8(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** @typedef {{ flags?: number, handedness: string, confidence?: number, curls?: ArrayLike<number>, spreads?: ArrayLike<number>, wrist?: ArrayLike<number> }} HandTarget */
/** @typedef {{ quat: ArrayLike<number>, pos: ArrayLike<number>, weights: ArrayLike<number> }} FaceBlock */
/** @typedef {{ points: ArrayLike<number> }} PoseBlock */
/** @typedef {{ t: number, seq: number, face?: FaceBlock | null, pose?: PoseBlock | null, hands?: HandTarget[] | null }} KgmFrame */

/** @param {KgmFrame} frame @returns {ArrayBuffer} */
export function encodeFrame(frame) {
  let size = HEADER_BYTES;
  let blocks = 0;
  if (frame.face) { blocks |= BLOCK_FACE; size += FACE_BYTES; }
  if (frame.pose) { blocks |= BLOCK_POSE; size += POSE_BYTES; }
  if (frame.hands && frame.hands.length) {
    blocks |= BLOCK_HANDS;
    size += 1 + Math.min(2, frame.hands.length) * HAND_TARGET_BYTES;
  }

  const buf = new ArrayBuffer(size);
  const dv = new DataView(buf);
  let o = 0;

  dv.setUint16(o, MAGIC, true); o += 2;
  dv.setUint8(o, VERSION); o += 1;
  dv.setUint8(o, blocks); o += 1;
  dv.setUint32(o, frame.t >>> 0, true); o += 4;
  dv.setUint16(o, frame.seq & 0xffff, true); o += 2;

  if (frame.face) {
    const { quat, pos, weights } = frame.face;
    for (let i = 0; i < 4; i++) { dv.setInt16(o, clampI16(quat[i] * QUAT_SCALE), true); o += 2; }
    for (let i = 0; i < 3; i++) { dv.setInt16(o, clampI16(pos[i] * POS_SCALE), true); o += 2; }
    for (let i = 0; i < NUM_CHANNELS; i++) { dv.setUint8(o, clampU8(weights[i] * 255)); o += 1; }
  }

  if (frame.pose) {
    const { points } = frame.pose;
    dv.setUint8(o, NUM_POSE_POINTS); o += 1;
    for (let i = 0; i < NUM_POSE_POINTS * 3; i++) {
      dv.setInt16(o, clampI16(points[i] * POS_SCALE), true); o += 2;
    }
  }

  if (frame.hands && frame.hands.length) {
    const count = Math.min(2, frame.hands.length);
    dv.setUint8(o, count); o += 1;
    for (let h = 0; h < count; h++) {
      const hand = frame.hands[h];
      dv.setUint8(o, (hand.flags || 0) & 0xff); o += 1;
      dv.setUint8(o, hand.handedness === 'Left' ? 0 : 1); o += 1;
      dv.setUint8(o, clampU8((hand.confidence ?? 1) * 255)); o += 1;
      for (let i = 0; i < HAND_FINGER_COUNT; i++) { dv.setUint8(o, clampU8((hand.curls?.[i] ?? 0) * 255)); o += 1; }
      for (let i = 0; i < HAND_FINGER_COUNT; i++) { dv.setInt8(o, Math.max(-128, Math.min(127, Math.round((hand.spreads?.[i] ?? 0) * 64)))); o += 1; }
      for (let i = 0; i < 3; i++) { dv.setInt8(o, Math.max(-128, Math.min(127, Math.round((hand.wrist?.[i] ?? 0) * HAND_WRIST_SCALE)))); o += 1; }
    }
  }

  return buf;
}

/**
 * The decoder is deliberately non-throwing: hostile, truncated, future-version,
 * or malformed packets return null. Callers can pass network datagrams straight
 * into this function without wrapping it in try/catch.
 *
 * @param {ArrayBuffer|ArrayBufferView} data
 * @returns {object|null} decoded frame, or null if the packet is not valid KGM1
 */
export function decodeFrame(data) {
  try {
    const buf = normalizeBuffer(data);
    if (!buf || buf.byteLength < HEADER_BYTES) return null;
    const dv = new DataView(buf);
    let o = 0;

    if (dv.getUint16(o, true) !== MAGIC) return null; o += 2;
    const version = dv.getUint8(o); o += 1;
    if (version !== VERSION) return null;
    const blocks = dv.getUint8(o); o += 1;
    if ((blocks & ~(BLOCK_FACE | BLOCK_POSE | BLOCK_HANDS)) !== 0) return null;
    const t = dv.getUint32(o, true); o += 4;
    const seq = dv.getUint16(o, true); o += 2;

    const frame = { t, seq, face: null, pose: null, hands: null };

    if (blocks & BLOCK_FACE) {
      if (buf.byteLength < o + FACE_BYTES) return null;
      const quat = new Array(4);
      for (let i = 0; i < 4; i++) { quat[i] = dv.getInt16(o, true) / QUAT_SCALE; o += 2; }
      const pos = new Array(3);
      for (let i = 0; i < 3; i++) { pos[i] = dv.getInt16(o, true) / POS_SCALE; o += 2; }
      const weights = new Float32Array(NUM_CHANNELS);
      for (let i = 0; i < NUM_CHANNELS; i++) { weights[i] = dv.getUint8(o) / 255; o += 1; }
      frame.face = { quat, pos, weights };
    }

    if (blocks & BLOCK_POSE) {
      if (buf.byteLength < o + 1) return null;
      const count = dv.getUint8(o); o += 1;
      if (count !== NUM_POSE_POINTS) return null;
      if (buf.byteLength < o + count * 6) return null;
      const points = new Float32Array(count * 3);
      for (let i = 0; i < count * 3; i++) { points[i] = dv.getInt16(o, true) / POS_SCALE; o += 2; }
      frame.pose = { points };
    }

    if (blocks & BLOCK_HANDS) {
      if (buf.byteLength < o + 1) return null;
      const count = dv.getUint8(o); o += 1;
      if (count > 2) return null;
      if (buf.byteLength < o + count * HAND_TARGET_BYTES) return null;
      const hands = [];
      for (let h = 0; h < count; h++) {
        const flags = dv.getUint8(o); o += 1;
        const handedness = dv.getUint8(o) === 0 ? 'Left' : 'Right'; o += 1;
        const confidence = dv.getUint8(o) / 255; o += 1;
        const curls = new Float32Array(HAND_FINGER_COUNT);
        for (let i = 0; i < HAND_FINGER_COUNT; i++) { curls[i] = dv.getUint8(o) / 255; o += 1; }
        const spreads = new Float32Array(HAND_FINGER_COUNT);
        for (let i = 0; i < HAND_FINGER_COUNT; i++) { spreads[i] = dv.getInt8(o) / 64; o += 1; }
        const wrist = new Float32Array(3);
        for (let i = 0; i < 3; i++) { wrist[i] = dv.getInt8(o) / HAND_WRIST_SCALE; o += 1; }
        hands.push({ flags, handedness, confidence, curls, spreads, wrist });
      }
      frame.hands = hands;
    }

    return frame;
  } catch {
    return null;
  }
}

function normalizeBuffer(data) {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }
  return null;
}
