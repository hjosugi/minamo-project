// Pure finger geometry, extracted from tracker/tracker.js so it can be unit
// tested without a DOM (#263). Inputs are MediaPipe-style landmark objects
// ({x, y, z}) and a `chain` of indices running from the knuckle outward.

/**
 * Interior angle at `b` formed by a-b-c, in radians. A zero-length segment would
 * divide by zero, so the denominator falls back to 1; coincident landmarks then
 * read as PI/2 rather than NaN, which keeps a dropped landmark from poisoning
 * downstream smoothing.
 * @param {{x: number, y: number, z: number}} a
 * @param {{x: number, y: number, z: number}} b
 * @param {{x: number, y: number, z: number}} c
 * @returns {number}
 */
export function jointAngle(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const cb = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const denom = Math.hypot(ab.x, ab.y, ab.z) * Math.hypot(cb.x, cb.y, cb.z) || 1;
  const dot = (ab.x * cb.x + ab.y * cb.y + ab.z * cb.z) / denom;
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

/**
 * Vector from the first to the second landmark of a chain.
 * @param {ArrayLike<{x: number, y: number, z: number}>} landmarks
 * @param {ArrayLike<number>} chain
 */
export function fingerVector(landmarks, chain) {
  const a = landmarks[chain[0]];
  const b = landmarks[chain[1]];
  return { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
}

/**
 * How curled a finger is, 0 (straight) to 1 (fully closed), from the two
 * interior joint angles along the chain.
 * @param {ArrayLike<{x: number, y: number, z: number}>} landmarks
 * @param {ArrayLike<number>} chain four landmark indices
 * @returns {number}
 */
export function fingerCurl(landmarks, chain) {
  const a = jointAngle(landmarks[chain[0]], landmarks[chain[1]], landmarks[chain[2]]);
  const b = jointAngle(landmarks[chain[1]], landmarks[chain[2]], landmarks[chain[3]]);
  return Math.max(0, Math.min(1, ((Math.PI - a) + (Math.PI - b)) / (Math.PI * 1.2)));
}

/**
 * Signed fan angle of a finger away from the middle-finger reference vector,
 * clamped to +/-1.5 rad.
 * @param {ArrayLike<{x: number, y: number, z: number}>} landmarks
 * @param {ArrayLike<number>} chain
 * @param {{x: number, y: number}} middle reference vector
 * @returns {number}
 */
export function fingerSpread(landmarks, chain, middle) {
  const v = fingerVector(landmarks, chain);
  const cross = middle.x * v.y - middle.y * v.x;
  const dot = middle.x * v.x + middle.y * v.y;
  return Math.max(-1.5, Math.min(1.5, Math.atan2(cross, dot)));
}
