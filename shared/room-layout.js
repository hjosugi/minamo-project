// Pure multi-avatar room layout math, extracted from viewer/viewer.js so it can
// be unit tested without a WebGL context (#263). The viewer builds a
// THREE.WebGLRenderer at module scope, so nothing in that file is importable
// under Node — this is the half of the room code worth pinning down.

/**
 * Scale and horizontal spacing for a room holding `count` avatars. A solo
 * participant renders at full size; crowds shrink and tighten so everyone stays
 * inside frame.
 * @param {number} count
 * @returns {{scale: number, spacing: number}}
 */
export function roomLayout(count) {
  const participants = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const scale = participants > 1 ? Math.max(0.58, 0.9 - (participants - 2) * 0.06) : 1;
  const spacing = participants > 4 ? 0.58 : 0.78;
  return { scale, spacing };
}

/**
 * Horizontal offset of a slot, centred on the origin: for `count` participants
 * the slots are symmetric about x = 0.
 * @param {number} slot zero-based
 * @param {number} count
 * @param {number} spacing from roomLayout()
 * @returns {number}
 */
export function slotOffsetX(slot, count, spacing) {
  return (slot - (count - 1) / 2) * spacing;
}
