import type { KGM1Frame } from '../core/types';

export interface Live2DParamOutput {
  id: string;
  value: number;
}

export function mapKGM1ToLive2D(frame: KGM1Frame): Live2DParamOutput[] {
  const face = frame.tracking.face;
  if (!face) return [];
  return [
    { id: 'ParamEyeLOpen', value: 1 - face.leftEye.blink },
    { id: 'ParamEyeROpen', value: 1 - face.rightEye.blink },
    { id: 'ParamEyeBallX', value: (face.leftEye.gaze.x + face.rightEye.gaze.x) * 0.5 },
    { id: 'ParamEyeBallY', value: (face.leftEye.gaze.y + face.rightEye.gaze.y) * 0.5 },
    { id: 'ParamMouthOpenY', value: face.mouth.open },
    { id: 'ParamMouthForm', value: face.mouth.wide - face.mouth.pucker },
    { id: 'ParamBrowLY', value: face.blendshapes.browInnerUp ?? 0 },
    { id: 'ParamBrowRY', value: face.blendshapes.browInnerUp ?? 0 },
  ];
}

export function mapKGM1HandsToLive2D(frame: KGM1Frame): Live2DParamOutput[] {
  const hands = frame.tracking.hands ?? [];
  const params: Live2DParamOutput[] = [];
  for (const hand of hands) {
    const prefix = hand.handedness === 'Left' ? 'ParamHandL' : 'ParamHandR';
    for (const finger of Object.values(hand.fingers)) {
      params.push({ id: `${prefix}${capitalize(finger.name)}Curl`, value: finger.curl });
      params.push({ id: `${prefix}${capitalize(finger.name)}Spread`, value: finger.spread });
    }
  }
  return params;
}

function capitalize(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}
