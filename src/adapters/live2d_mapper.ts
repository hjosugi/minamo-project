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
    { id: 'ParamMouthOpenY', value: face.mouth.open },
    { id: 'ParamMouthForm', value: face.mouth.wide - face.mouth.pucker },
  ];
}
