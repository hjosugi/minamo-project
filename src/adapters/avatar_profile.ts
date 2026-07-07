import type { KGM1Frame } from '../core/types';
import { mapKGM1ToInochi2D } from './inochi2d_mapper';
import { mapKGM1HandsToLive2D, mapKGM1ToLive2D } from './live2d_mapper';
import { mapKGM1HandsToVrmFingers, mapKGM1ToVrmExpressions, mapKGM1ToVrmLookAt } from './vrm_mapper';

export type AvatarFormat = 'vrm' | 'live2d' | 'inochi2d';

export interface RigLimit {
  min: number;
  max: number;
}

export interface AvatarPresetProfile {
  schema: 'minamo.avatar-preset.v1';
  name: string;
  format: AvatarFormat;
  rigLimits: Record<string, RigLimit>;
  mappings: Array<{ source: string; target: string; weight: number; curve: 'linear' | 'ease' }>;
}

export interface AvatarTargetParameter {
  target: string;
  value: number;
}

export function createAvatarPresetProfile(format: AvatarFormat = 'vrm', name = `${format} preset`): AvatarPresetProfile {
  return {
    schema: 'minamo.avatar-preset.v1',
    name,
    format,
    rigLimits: defaultRigLimits(format),
    mappings: [],
  };
}

export function mapFrameWithAvatarPreset(frame: KGM1Frame, profile: AvatarPresetProfile): AvatarTargetParameter[] {
  const targets = mapFrameByFormat(frame, profile.format);
  const sourceValues = new Map(targets.map((target) => [target.target, target.value]));
  const output = new Map<string, number>();
  for (const target of targets) {
    output.set(target.target, applyRigLimit(target.target, target.value, profile.rigLimits[target.target]));
  }
  for (const mapping of profile.mappings) {
    const sourceValue = sourceValues.get(mapping.source);
    if (sourceValue === undefined) continue;
    const mappedValue = applyMappingCurve(sourceValue, mapping.curve) * mapping.weight;
    output.set(mapping.target, applyRigLimit(mapping.target, mappedValue, profile.rigLimits[mapping.target]));
  }
  return Array.from(output, ([target, value]) => ({ target, value }));
}

export function serializeAvatarPreset(profile: AvatarPresetProfile): string {
  return `${JSON.stringify(profile, null, 2)}\n`;
}

export function parseAvatarPreset(json: string): AvatarPresetProfile {
  const value = JSON.parse(json);
  if (value?.schema !== 'minamo.avatar-preset.v1') throw new Error('Unsupported avatar preset schema');
  if (!['vrm', 'live2d', 'inochi2d'].includes(value.format)) throw new Error('Unsupported avatar preset format');
  const format = value.format as AvatarFormat;
  return {
    schema: 'minamo.avatar-preset.v1',
    name: String(value.name || `${format} preset`),
    format,
    rigLimits: { ...defaultRigLimits(format), ...normalizeRigLimits(value.rigLimits) },
    mappings: Array.isArray(value.mappings) ? value.mappings.map(normalizeMapping) : [],
  };
}

export function applyRigLimit(_target: string, value: number, limit: RigLimit = { min: -1, max: 1 }): number {
  if (!Number.isFinite(value)) return 0;
  const min = Number.isFinite(limit.min) ? limit.min : -1;
  const max = Number.isFinite(limit.max) ? limit.max : 1;
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return Math.max(low, Math.min(high, value));
}

function mapFrameByFormat(frame: KGM1Frame, format: AvatarFormat): AvatarTargetParameter[] {
  if (format === 'vrm') {
    const expressions = mapKGM1ToVrmExpressions(frame).map((entry) => ({ target: `expression:${entry.name}`, value: entry.value }));
    const lookAt = mapKGM1ToVrmLookAt(frame);
    const fingers = mapKGM1HandsToVrmFingers(frame.tracking.hands).flatMap((finger) => [
      { target: `finger:${finger.handedness}:${finger.finger}:proximal`, value: finger.proximal },
      { target: `finger:${finger.handedness}:${finger.finger}:intermediate`, value: finger.intermediate },
      { target: `finger:${finger.handedness}:${finger.finger}:distal`, value: finger.distal },
      { target: `finger:${finger.handedness}:${finger.finger}:spread`, value: finger.spread },
    ]);
    return [
      ...expressions,
      ...(lookAt ? [{ target: 'lookAt:yaw', value: lookAt.yaw }, { target: 'lookAt:pitch', value: lookAt.pitch }] : []),
      ...fingers,
    ];
  }
  if (format === 'live2d') {
    return [...mapKGM1ToLive2D(frame), ...mapKGM1HandsToLive2D(frame)].map((entry) => ({ target: entry.id, value: entry.value }));
  }
  return mapKGM1ToInochi2D(frame).map((entry) => ({ target: entry.name, value: entry.value }));
}

function defaultRigLimits(format: AvatarFormat): Record<string, RigLimit> {
  if (format === 'vrm') {
    return {
      'lookAt:yaw': { min: -1, max: 1 },
      'lookAt:pitch': { min: -1, max: 1 },
    };
  }
  return {};
}

function normalizeRigLimits(value: unknown): Record<string, RigLimit> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, RigLimit> = {};
  for (const [key, limit] of Object.entries(value)) {
    const min = Number((limit as RigLimit)?.min);
    const max = Number((limit as RigLimit)?.max);
    if (Number.isFinite(min) && Number.isFinite(max) && max >= min) out[key] = { min, max };
  }
  return out;
}

function normalizeMapping(value: unknown): AvatarPresetProfile['mappings'][number] {
  const mapping = value as AvatarPresetProfile['mappings'][number];
  return {
    source: String(mapping?.source || ''),
    target: String(mapping?.target || ''),
    weight: Number.isFinite(Number(mapping?.weight)) ? Number(mapping.weight) : 1,
    curve: mapping?.curve === 'ease' ? 'ease' : 'linear',
  };
}

function applyMappingCurve(value: number, curve: 'linear' | 'ease'): number {
  if (curve === 'linear') return value;
  const sign = value < 0 ? -1 : 1;
  const magnitude = Math.min(1, Math.abs(value));
  return sign * magnitude * magnitude * (3 - 2 * magnitude);
}
