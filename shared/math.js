// Numeric helpers shared across the runtime modules.
//
// This is the foundation layer: it imports nothing, so every other shared
// module can depend on it without creating a cycle back through runtime.js.
// `clamp` alone had 31 call sites inside runtime.js before that file was split.
//
// Deliberately small. Anything that knows what a landmark, a blendshape or a
// frame *is* belongs in the module that owns that concept, not here.

/**
 * Clamp to a range, treating a non-finite input as the floor rather than
 * propagating NaN — the whole tracking path is built on the invariant that no
 * NaN reaches the renderer.
 */
export function clamp(value, min = 0, max = 1) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/** Monotonic clock where available; `Date.now` in a worker or a bare Node run. */
export function performanceNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

/** Linear-interpolated percentile; `q` is 0..1. */
export function percentile(values, q) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower];
  const weight = pos - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function averagePoint(points) {
  return {
    x: average(points.map((point) => point.x)),
    y: average(points.map((point) => point.y)),
  };
}

export function finitePoint(point) {
  return Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y));
}

export function distance2d(a, b) {
  return Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
}

/**
 * Two-threshold latch. A single threshold makes a signal that hovers on it
 * chatter every frame, which is what a blink or a finger contact does; the
 * previous state carries through the band between the thresholds.
 */
export function hysteresisClosed(value, previous, openThreshold, closeThreshold) {
  if (value >= closeThreshold) return true;
  if (value <= openThreshold) return false;
  return previous;
}

/** clamp with a fallback for a missing or non-numeric input. */
export function clampOptionalNumber(value, fallback, min = 0, max = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? clamp(n, min, max) : fallback;
}
