import type { KGM1Frame } from '../core/types';

export interface Live2DParamOutput {
  id: string;
  value: number;
}

export function mapKGM1ToLive2D(frame: KGM1Frame): Live2DParamOutput[] {
  const face = frame.tracking.face;
  if (!face) return [];
  return [
    { id: 'ParamEyeLOpen', value: clamp01(1 - face.leftEye.blink) },
    { id: 'ParamEyeROpen', value: clamp01(1 - face.rightEye.blink) },
    { id: 'ParamEyeBallX', value: clampSigned((face.leftEye.gaze.x + face.rightEye.gaze.x) * 0.5) },
    { id: 'ParamEyeBallY', value: clampSigned((face.leftEye.gaze.y + face.rightEye.gaze.y) * 0.5) },
    { id: 'ParamMouthOpenY', value: clamp01(face.mouth.open) },
    { id: 'ParamMouthForm', value: clampSigned(face.mouth.wide - face.mouth.pucker) },
    { id: 'ParamBrowLY', value: clamp01(face.blendshapes.browInnerUp ?? 0) },
    { id: 'ParamBrowRY', value: clamp01(face.blendshapes.browInnerUp ?? 0) },
  ];
}

export function mapKGM1HandsToLive2D(frame: KGM1Frame): Live2DParamOutput[] {
  const hands = frame.tracking.hands ?? [];
  const params: Live2DParamOutput[] = [];
  for (const hand of hands) {
    const prefix = hand.handedness === 'Left' ? 'ParamHandL' : 'ParamHandR';
    for (const finger of Object.values(hand.fingers)) {
      params.push({ id: `${prefix}${capitalize(finger.name)}Curl`, value: clamp01(finger.curl) });
      params.push({ id: `${prefix}${capitalize(finger.name)}Spread`, value: clampSigned(finger.spread) });
    }
  }
  return params;
}

function capitalize(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampSigned(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}
