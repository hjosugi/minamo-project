import type { Vec3 } from './types';

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

export function length(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function distance(a: Vec3, b: Vec3): number {
  return length(sub(a, b));
}

export function finiteVec3(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function normalize(v: Vec3): Vec3 {
  const len = length(v);
  if (len <= 1e-8 || !Number.isFinite(len)) return { x: 0, y: 0, z: 0 };
  return scale(v, 1 / len);
}

export function angleBetween(a: Vec3, b: Vec3): number {
  const an = normalize(a);
  const bn = normalize(b);
  return Math.acos(clamp(dot(an, bn), -1, 1));
}

export function projectOnPlane(v: Vec3, normal: Vec3): Vec3 {
  const n = normalize(normal);
  return sub(v, scale(n, dot(v, n)));
}
