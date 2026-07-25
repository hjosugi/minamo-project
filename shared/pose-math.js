// Pure head-pose math, extracted from tracker/tracker.js so it can be unit
// tested without a DOM (#263).
//
// Note: src/adapters/mediapipe_tasks_adapter.ts carries its own private copy of
// mat4ToQuat. It is not exported, so the cross-tree duplicate guard does not see
// it, but it is the same drift #255 describes — de-duplicating means teaching
// the typed tree to import from shared/, which it does not do today.

/**
 * Convert a column-major 4x4 transform to a normalized [x, y, z, w] quaternion.
 * Missing entries fall back to the identity matrix, so a short or sparse input
 * yields a usable rotation instead of NaN.
 * @param {ArrayLike<number>} m
 * @returns {number[]}
 */
export function mat4ToQuat(m) {
  const m00 = m[0] ?? 1, m01 = m[4] ?? 0, m02 = m[8] ?? 0;
  const m10 = m[1] ?? 0, m11 = m[5] ?? 1, m12 = m[9] ?? 0;
  const m20 = m[2] ?? 0, m21 = m[6] ?? 0, m22 = m[10] ?? 1;
  const trace = m00 + m11 + m22;
  let x, y, z, w;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1.0) * 2;
    w = 0.25 * s;
    x = (m21 - m12) / s;
    y = (m02 - m20) / s;
    z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1.0 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1.0 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1.0 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }
  const len = Math.hypot(x, y, z, w) || 1;
  return [x / len, y / len, z / len, w / len];
}

/**
 * Rotate a quaternion about its local X axis, used to trim the camera's pitch
 * relative to the user's head. A non-finite or negligible angle is a no-op, so
 * callers can pass an unvalidated setting straight through.
 * @param {number[]} quat [x, y, z, w]
 * @param {number} radians
 * @returns {number[]}
 */
export function applyPitchOffset(quat, radians) {
  if (!Number.isFinite(radians) || Math.abs(radians) < 1e-6) return quat;
  const half = radians * 0.5;
  const sx = Math.sin(half);
  const cw = Math.cos(half);
  const [x, y, z, w] = quat;
  const next = [
    x * cw + w * sx,
    y * cw + z * sx,
    z * cw - y * sx,
    w * cw - x * sx,
  ];
  const len = Math.hypot(next[0], next[1], next[2], next[3]) || 1;
  return [next[0] / len, next[1] / len, next[2] / len, next[3] / len];
}
