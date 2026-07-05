import { clamp } from './math';

export interface OneEuroOptions {
  minCutoff: number;
  beta: number;
  derivativeCutoff: number;
}

class LowPassFilter {
  private initialized = false;
  private value = 0;

  filter(value: number, alpha: number): number {
    if (!this.initialized) {
      this.initialized = true;
      this.value = value;
      return value;
    }
    this.value = alpha * value + (1 - alpha) * this.value;
    return this.value;
  }

  last(): number {
    return this.value;
  }

  hasValue(): boolean {
    return this.initialized;
  }
}

export class OneEuroFilter {
  private readonly valueFilter = new LowPassFilter();
  private readonly derivativeFilter = new LowPassFilter();
  private lastTimeMs: number | undefined;

  constructor(private readonly options: OneEuroOptions) {}

  filter(value: number, timeMs: number): number {
    if (!Number.isFinite(value)) {
      return this.valueFilter.hasValue() ? this.valueFilter.last() : 0;
    }
    if (this.lastTimeMs === undefined) {
      this.lastTimeMs = timeMs;
      return this.valueFilter.filter(value, 1);
    }
    const dt = Math.max(1, timeMs - this.lastTimeMs) / 1000;
    this.lastTimeMs = timeMs;

    const previous = this.valueFilter.last();
    const derivative = this.valueFilter.hasValue() ? (value - previous) / dt : 0;
    const ed = this.derivativeFilter.filter(derivative, this.alpha(dt, this.options.derivativeCutoff));
    const cutoff = this.options.minCutoff + this.options.beta * Math.abs(ed);
    return this.valueFilter.filter(value, this.alpha(dt, cutoff));
  }

  private alpha(dt: number, cutoff: number): number {
    const safeCutoff = clamp(cutoff, 0.0001, 1000);
    const tau = 1 / (2 * Math.PI * safeCutoff);
    return 1 / (1 + tau / dt);
  }
}
