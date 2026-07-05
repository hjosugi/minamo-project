// One Euro filter (Casiez, Roussel, Vogel; CHI 2012).
// The standard choice for human motion smoothing: low lag on fast motion,
// strong smoothing on slow motion. Used per channel on blendshape weights,
// head position, and quaternion components.

class LowPass {
  constructor() {
    this.ready = false;
    this.y = 0;
  }
  filter(x, alpha) {
    if (!this.ready) {
      this.y = x;
      this.ready = true;
    } else {
      this.y = alpha * x + (1 - alpha) * this.y;
    }
    return this.y;
  }
  reset() {
    this.ready = false;
  }
}

export class OneEuroFilter {
  /**
   * @param {object} opts
   * @param {number} opts.minCutoff base cutoff Hz. Lower = smoother, more lag.
   * @param {number} opts.beta speed coefficient. Higher = less lag on fast motion.
   * @param {number} opts.dCutoff cutoff for the derivative estimate.
   */
  constructor({ minCutoff = 1.0, beta = 0.05, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.x = new LowPass();
    this.dx = new LowPass();
    this.tPrev = null;
    this.xPrev = null;
  }

  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  reset() {
    this.x.reset();
    this.dx.reset();
    this.tPrev = null;
    this.xPrev = null;
  }

  /**
   * @param {number} value raw sample
   * @param {number} tSec timestamp in seconds
   */
  filter(value, tSec) {
    if (this.tPrev === null) {
      this.tPrev = tSec;
      this.xPrev = value;
      this.x.filter(value, 1);
      this.dx.filter(0, 1);
      return value;
    }
    let dt = tSec - this.tPrev;
    if (dt <= 0) dt = 1 / 60; // guard against clock glitches
    this.tPrev = tSec;

    const rawD = (value - this.xPrev) / dt;
    this.xPrev = value;
    const edx = this.dx.filter(rawD, OneEuroFilter.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.x.filter(value, OneEuroFilter.alpha(cutoff, dt));
  }
}

// Filters a fixed-length Float32Array in place.
export class OneEuroArray {
  constructor(n, opts) {
    this.filters = Array.from({ length: n }, () => new OneEuroFilter(opts));
  }
  filter(arr, tSec) {
    for (let i = 0; i < this.filters.length; i++) {
      arr[i] = this.filters[i].filter(arr[i], tSec);
    }
    return arr;
  }
  reset() {
    for (const f of this.filters) f.reset();
  }
}

// Quaternion smoothing: filter the 4 components, then renormalize.
// A hemisphere check keeps q and -q (same rotation) from fighting the filter.
export class OneEuroQuat {
  constructor(opts = { minCutoff: 1.2, beta: 0.6, dCutoff: 1.0 }) {
    this.filters = Array.from({ length: 4 }, () => new OneEuroFilter(opts));
    this.prev = null;
  }
  reset() {
    for (const f of this.filters) f.reset();
    this.prev = null;
  }
  /**
   * @param {number[]} q [x, y, z, w]
   * @param {number} tSec
   * @returns {number[]} filtered unit quaternion
   */
  filter(q, tSec) {
    let [x, y, z, w] = q;
    if (this.prev) {
      const dot = x * this.prev[0] + y * this.prev[1] + z * this.prev[2] + w * this.prev[3];
      if (dot < 0) {
        x = -x; y = -y; z = -z; w = -w;
      }
    }
    const out = [
      this.filters[0].filter(x, tSec),
      this.filters[1].filter(y, tSec),
      this.filters[2].filter(z, tSec),
      this.filters[3].filter(w, tSec),
    ];
    const len = Math.hypot(out[0], out[1], out[2], out[3]) || 1;
    for (let i = 0; i < 4; i++) out[i] /= len;
    this.prev = out;
    return out;
  }
}
