import { clamp, distance, length, scale, sub } from './math';
import type { KGM1Frame, Quat, Vec3 } from './types';

export interface StabilityResult<T> {
  value: T;
  warnings: string[];
}

export function finiteNumber(value: number, fallback = 0): StabilityResult<number> {
  if (Number.isFinite(value)) return { value, warnings: [] };
  return { value: fallback, warnings: ['NON_FINITE_SIGNAL'] };
}

export function finiteVec3Guard(value: Vec3, fallback: Vec3): StabilityResult<Vec3> {
  const warnings: string[] = [];
  const guarded = { ...value };
  for (const key of ['x', 'y', 'z'] as const) {
    if (!Number.isFinite(guarded[key])) {
      guarded[key] = fallback[key];
      warnings.push(`NON_FINITE_VEC3_${key.toUpperCase()}`);
    }
  }
  return { value: guarded, warnings };
}

export function finiteFrameGuard(frame: KGM1Frame, previous?: KGM1Frame): StabilityResult<KGM1Frame> {
  const warnings: string[] = [];
  const next = structuredClone(frame);
  const face = next.tracking.face;
  const previousFace = previous?.tracking.face;
  if (face?.headRotation) {
    const guarded = finiteQuatGuard(face.headRotation, previousFace?.headRotation ?? { x: 0, y: 0, z: 0, w: 1 });
    face.headRotation = guarded.value;
    warnings.push(...guarded.warnings);
  }
  if (face) {
    for (const [name, value] of Object.entries(face.blendshapes)) {
      const guarded = finiteNumber(value, previousFace?.blendshapes[name] ?? 0);
      face.blendshapes[name] = clamp(guarded.value, 0, 1);
      warnings.push(...guarded.warnings.map((warning) => `${warning}:${name}`));
    }
  }
  next.quality.warnings = [...new Set([...next.quality.warnings, ...warnings])];
  return { value: next, warnings };
}

export function finiteQuatGuard(value: Quat, fallback: Quat): StabilityResult<Quat> {
  const warnings: string[] = [];
  const guarded = { ...value };
  for (const key of ['x', 'y', 'z', 'w'] as const) {
    if (!Number.isFinite(guarded[key])) {
      guarded[key] = fallback[key];
      warnings.push(`NON_FINITE_QUAT_${key.toUpperCase()}`);
    }
  }
  return { value: normalizeQuat(guarded), warnings };
}

export class TemporalOutlierRejector {
  private previous?: Vec3;

  constructor(private readonly maxDistance: number) {}

  update(value: Vec3): StabilityResult<Vec3> {
    if (!this.previous) {
      this.previous = value;
      return { value, warnings: [] };
    }
    if (distance(value, this.previous) > this.maxDistance) {
      return { value: this.previous, warnings: ['TEMPORAL_OUTLIER'] };
    }
    this.previous = value;
    return { value, warnings: [] };
  }
}

export class VelocityClamp {
  private previous?: Vec3;

  constructor(private readonly maxMetersPerSecond: number) {}

  update(value: Vec3, dtSec: number): StabilityResult<Vec3> {
    if (!this.previous || dtSec <= 0) {
      this.previous = value;
      return { value, warnings: [] };
    }
    const delta = sub(value, this.previous);
    const maxDelta = this.maxMetersPerSecond * dtSec;
    const deltaLen = length(delta);
    const warnings: string[] = [];
    let next = value;
    if (deltaLen > maxDelta) {
      next = {
        x: this.previous.x + delta.x * maxDelta / deltaLen,
        y: this.previous.y + delta.y * maxDelta / deltaLen,
        z: this.previous.z + delta.z * maxDelta / deltaLen,
      };
      warnings.push('VELOCITY_CLAMPED');
    }
    this.previous = next;
    return { value: next, warnings };
  }
}

export class AccelerationJerkClamp {
  private previous?: Vec3;
  private previousVelocity: Vec3 = { x: 0, y: 0, z: 0 };
  private previousAcceleration: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(
    private readonly maxAcceleration: number,
    private readonly maxJerk: number,
  ) {}

  update(value: Vec3, dtSec: number): StabilityResult<Vec3> {
    if (!this.previous || dtSec <= 0) {
      this.previous = value;
      return { value, warnings: [] };
    }
    const velocity = scale(sub(value, this.previous), 1 / dtSec);
    const acceleration = scale(sub(velocity, this.previousVelocity), 1 / dtSec);
    const jerk = scale(sub(acceleration, this.previousAcceleration), 1 / dtSec);
    const warnings: string[] = [];
    let safeAcceleration = acceleration;
    if (length(acceleration) > this.maxAcceleration) {
      safeAcceleration = scale(acceleration, this.maxAcceleration / length(acceleration));
      warnings.push('ACCELERATION_CLAMPED');
    }
    if (length(jerk) > this.maxJerk) {
      const jerkLimited = scale(jerk, this.maxJerk / length(jerk));
      safeAcceleration = {
        x: this.previousAcceleration.x + jerkLimited.x * dtSec,
        y: this.previousAcceleration.y + jerkLimited.y * dtSec,
        z: this.previousAcceleration.z + jerkLimited.z * dtSec,
      };
      warnings.push('JERK_CLAMPED');
    }
    const safeVelocity = {
      x: this.previousVelocity.x + safeAcceleration.x * dtSec,
      y: this.previousVelocity.y + safeAcceleration.y * dtSec,
      z: this.previousVelocity.z + safeAcceleration.z * dtSec,
    };
    const next = {
      x: this.previous.x + safeVelocity.x * dtSec,
      y: this.previous.y + safeVelocity.y * dtSec,
      z: this.previous.z + safeVelocity.z * dtSec,
    };
    this.previous = next;
    this.previousVelocity = safeVelocity;
    this.previousAcceleration = safeAcceleration;
    return { value: next, warnings };
  }
}

export type OcclusionPhase = 'tracked' | 'suspect' | 'lost' | 'reacquiring';

export class OcclusionStateMachine {
  phase: OcclusionPhase = 'lost';
  private lowMs = 0;
  private highMs = 0;

  update(confidence: number, dtMs: number): OcclusionPhase {
    if (confidence >= 0.65) {
      this.highMs += dtMs;
      this.lowMs = 0;
      if (this.phase === 'lost' || this.phase === 'suspect') this.phase = 'reacquiring';
      if (this.highMs >= 250) this.phase = 'tracked';
      return this.phase;
    }
    this.highMs = 0;
    this.lowMs += dtMs;
    if (this.lowMs >= 400) this.phase = 'lost';
    else if (this.phase === 'tracked') this.phase = 'suspect';
    return this.phase;
  }
}

export function confidenceWeightedBlend(previous: number, current: number, confidence: number): number {
  return previous + (current - previous) * clamp(confidence, 0, 1);
}

export function clampRigParameter(value: number, min = 0, max = 1): StabilityResult<number> {
  const next = clamp(value, min, max);
  return {
    value: next,
    warnings: next === value ? [] : ['RIG_PARAMETER_CLAMPED'],
  };
}

export function shortestPathQuat(previous: Quat, next: Quat): Quat {
  const dot = previous.x * next.x + previous.y * next.y + previous.z * next.z + previous.w * next.w;
  return dot < 0 ? { x: -next.x, y: -next.y, z: -next.z, w: -next.w } : next;
}

export function slerpQuat(previous: Quat, next: Quat, t: number): Quat {
  let target = shortestPathQuat(previous, next);
  let dot = previous.x * target.x + previous.y * target.y + previous.z * target.z + previous.w * target.w;
  dot = clamp(dot, -1, 1);
  if (dot > 0.9995) {
    return normalizeQuat({
      x: previous.x + (target.x - previous.x) * t,
      y: previous.y + (target.y - previous.y) * t,
      z: previous.z + (target.z - previous.z) * t,
      w: previous.w + (target.w - previous.w) * t,
    });
  }
  const theta0 = Math.acos(dot);
  const theta = theta0 * clamp(t, 0, 1);
  const sinTheta = Math.sin(theta);
  const sinTheta0 = Math.sin(theta0);
  const s0 = Math.cos(theta) - dot * sinTheta / sinTheta0;
  const s1 = sinTheta / sinTheta0;
  return normalizeQuat({
    x: previous.x * s0 + target.x * s1,
    y: previous.y * s0 + target.y * s1,
    z: previous.z * s0 + target.z * s1,
    w: previous.w * s0 + target.w * s1,
  });
}

function normalizeQuat(q: Quat): Quat {
  const len = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
}
