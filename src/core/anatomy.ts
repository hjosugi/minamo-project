import { clamp } from './math';
import type { FingerName, FingerState } from './types';

export interface FingerJointLimits {
  mcpMin: number;
  mcpMax: number;
  pipMin: number;
  pipMax: number;
  dipMin: number;
  dipMax: number;
  spreadMin: number;
  spreadMax: number;
}

export const DEFAULT_FINGER_LIMITS: Record<FingerName, FingerJointLimits> = {
  thumb: { mcpMin: -0.55, mcpMax: 1.25, pipMin: -0.25, pipMax: 1.15, dipMin: -0.20, dipMax: 1.00, spreadMin: -0.80, spreadMax: 0.85 },
  index: { mcpMin: -0.20, mcpMax: 1.70, pipMin: -0.10, pipMax: 1.85, dipMin: -0.10, dipMax: 1.45, spreadMin: -0.55, spreadMax: 0.55 },
  middle: { mcpMin: -0.20, mcpMax: 1.75, pipMin: -0.10, pipMax: 1.90, dipMin: -0.10, dipMax: 1.45, spreadMin: -0.40, spreadMax: 0.40 },
  ring: { mcpMin: -0.20, mcpMax: 1.70, pipMin: -0.10, pipMax: 1.85, dipMin: -0.10, dipMax: 1.40, spreadMin: -0.45, spreadMax: 0.45 },
  pinky: { mcpMin: -0.25, mcpMax: 1.65, pipMin: -0.10, pipMax: 1.75, dipMin: -0.10, dipMax: 1.35, spreadMin: -0.65, spreadMax: 0.65 },
};

export interface ClampResult<T> {
  value: T;
  warnings: string[];
}

export function clampFingerState(finger: FingerState, limits = DEFAULT_FINGER_LIMITS[finger.name]): ClampResult<FingerState> {
  const warnings: string[] = [];
  const next: FingerState = structuredClone(finger);

  if (next.mcp.flexion !== undefined) {
    const before = next.mcp.flexion;
    next.mcp.flexion = clamp(before, limits.mcpMin, limits.mcpMax);
    if (before !== next.mcp.flexion) warnings.push(`${finger.name}:MCP_CLAMPED`);
  }
  if (next.pip?.flexion !== undefined) {
    const before = next.pip.flexion;
    next.pip.flexion = clamp(before, limits.pipMin, limits.pipMax);
    if (before !== next.pip.flexion) warnings.push(`${finger.name}:PIP_CLAMPED`);
  }
  if (next.dip?.flexion !== undefined) {
    const before = next.dip.flexion;
    next.dip.flexion = clamp(before, limits.dipMin, limits.dipMax);
    if (before !== next.dip.flexion) warnings.push(`${finger.name}:DIP_CLAMPED`);
  }

  const spreadBefore = next.spread;
  next.spread = clamp(next.spread, limits.spreadMin, limits.spreadMax);
  if (spreadBefore !== next.spread) warnings.push(`${finger.name}:SPREAD_CLAMPED`);

  next.curl = clamp(next.curl, 0, 1);
  next.confidence = clamp(next.confidence, 0, 1);
  next.contact.confidence = clamp(next.contact.confidence, 0, 1);
  return { value: next, warnings };
}

export function velocityGate(current: number, previous: number, maxDelta: number): number {
  const delta = current - previous;
  return previous + clamp(delta, -Math.abs(maxDelta), Math.abs(maxDelta));
}
