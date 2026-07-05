// KGM1 wire codec.
// One tracking frame fits in one small binary packet (76 bytes for face only),
// so a frame always fits in a single WebTransport datagram (< 1200 B MTU).
// See docs/PROTOCOL.md for the full spec.

import { NUM_CHANNELS, NUM_POSE_POINTS } from './blendshapes.js';

export const MAGIC = 0x4b47; // "KG" little-endian
export const VERSION = 1;

export const BLOCK_FACE = 1 << 0;
export const BLOCK_POSE = 1 << 1;

export const HEADER_BYTES = 10;
export const FACE_BYTES = 4 * 2 + 3 * 2 + NUM_CHANNELS; // quat + pos + weights = 66
export const POSE_BYTES = 1 + NUM_POSE_POINTS * 3 * 2;  // count + points = 43

const QUAT_SCALE = 32767;   // i16 full range for [-1, 1]
const POS_SCALE = 1000;     // meters -> millimeters, i16 (+-32.7 m range)

function clampI16(v) {
  return Math.max(-32768, Math.min(32767, Math.round(v)));
}

function clampU8(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/**
 * @param {object} frame
 * @param {number} frame.t timestamp ms (wraps at 2^32)
 * @param {number} frame.seq sequence number (wraps at 2^16)
 * @param {object} [frame.face] { quat: [x,y,z,w], pos: [x,y,z] meters, weights: Float32Array(52) in [0,1] }
 * @param {object} [frame.pose] { points: Float32Array(21) meters, 7 points hip-centered }
 * @returns {ArrayBuffer}
 */
export function encodeFrame(frame) {
  let size = HEADER_BYTES;
  let blocks = 0;
  if (frame.face) { blocks |= BLOCK_FACE; size += FACE_BYTES; }
  if (frame.pose) { blocks |= BLOCK_POSE; size += POSE_BYTES; }

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
    if ((blocks & ~(BLOCK_FACE | BLOCK_POSE)) !== 0) return null;
    const t = dv.getUint32(o, true); o += 4;
    const seq = dv.getUint16(o, true); o += 2;

    const frame = { t, seq, face: null, pose: null };

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
