import { clamp, lerp } from './math';
import type { EyeState, MouthState } from './types';

export function stabilizeBlink(rawBlink: number, previousBlink: number, headYawRad: number): number {
  const yawPenalty = clamp(Math.abs(headYawRad) / 0.75, 0, 1);
  const alpha = lerp(0.35, 0.12, yawPenalty);
  return clamp(lerp(previousBlink, rawBlink, alpha), 0, 1);
}

export function defaultEye(): EyeState {
  return {
    blink: 0,
    openness: 1,
    squint: 0,
    gaze: { x: 0, y: 0, z: 1 },
    confidence: 0,
  };
}

export function defaultMouth(): MouthState {
  return {
    open: 0,
    wide: 0,
    pucker: 0,
    smileLeft: 0,
    smileRight: 0,
    frownLeft: 0,
    frownRight: 0,
    jawForward: 0,
    vowel: 'neutral',
    confidence: 0,
  };
}

export function inferVowel(open: number, wide: number, pucker: number): NonNullable<MouthState['vowel']> {
  if (open > 0.68 && wide < 0.45) return 'A';
  if (wide > 0.68 && open < 0.45) return 'I';
  if (pucker > 0.62 && open < 0.55) return 'U';
  if (open > 0.45 && wide > 0.50) return 'E';
  if (open > 0.42 && pucker > 0.45) return 'O';
  return 'neutral';
}
