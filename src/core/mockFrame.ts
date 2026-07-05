import { createEmptyFrame } from './kgm1';
import { defaultEye, defaultMouth, inferVowel } from './face';
import type { KGM1Frame } from './types';

export function createMockFrame(frameId: number, nowMs: number): KGM1Frame {
  const frame = createEmptyFrame(frameId, nowMs);
  const t = nowMs / 1000;
  const mouth = defaultMouth();
  mouth.open = 0.4 + 0.35 * Math.sin(t * 3);
  mouth.wide = 0.5 + 0.2 * Math.sin(t * 2.1);
  mouth.pucker = 0.5 + 0.2 * Math.cos(t * 1.8);
  mouth.vowel = inferVowel(mouth.open, mouth.wide, mouth.pucker);
  mouth.confidence = 0.9;

  frame.tracking.face = {
    detected: true,
    confidence: 0.92,
    leftEye: { ...defaultEye(), blink: Math.abs(Math.sin(t)), openness: Math.abs(Math.cos(t)), confidence: 0.9 },
    rightEye: { ...defaultEye(), blink: Math.abs(Math.sin(t + 0.05)), openness: Math.abs(Math.cos(t + 0.05)), confidence: 0.9 },
    mouth,
    blendshapes: { jawOpen: mouth.open, mouthSmileLeft: mouth.smileLeft, mouthSmileRight: mouth.smileRight },
    warnings: [],
  };
  frame.quality.fps = 60;
  frame.quality.overallConfidence = 0.91;
  return frame;
}
