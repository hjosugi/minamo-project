import type { KGM1Frame } from '../core/types';

export interface InochiParamOutput {
  name: string;
  value: number;
}

export function mapKGM1ToInochi2D(frame: KGM1Frame): InochiParamOutput[] {
  const face = frame.tracking.face;
  if (!face) return [];
  return [
    { name: 'eye_l_open', value: clamp01(1 - face.leftEye.blink) },
    { name: 'eye_r_open', value: clamp01(1 - face.rightEye.blink) },
    { name: 'eye_x', value: clampSigned((face.leftEye.gaze.x + face.rightEye.gaze.x) * 0.5) },
    { name: 'eye_y', value: clampSigned((face.leftEye.gaze.y + face.rightEye.gaze.y) * 0.5) },
    { name: 'mouth_open', value: clamp01(face.mouth.open) },
    { name: 'mouth_wide', value: clamp01(face.mouth.wide) },
    { name: 'mouth_pucker', value: clamp01(face.mouth.pucker) },
    { name: 'smile_l', value: clamp01(face.mouth.smileLeft) },
    { name: 'smile_r', value: clamp01(face.mouth.smileRight) },
  ];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampSigned(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}
