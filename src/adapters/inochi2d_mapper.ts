import type { KGM1Frame } from '../core/types';

export interface InochiParamOutput {
  name: string;
  value: number;
}

export function mapKGM1ToInochi2D(frame: KGM1Frame): InochiParamOutput[] {
  const face = frame.tracking.face;
  if (!face) return [];
  return [
    { name: 'eye_l_open', value: 1 - face.leftEye.blink },
    { name: 'eye_r_open', value: 1 - face.rightEye.blink },
    { name: 'mouth_open', value: face.mouth.open },
    { name: 'mouth_wide', value: face.mouth.wide },
    { name: 'mouth_pucker', value: face.mouth.pucker },
  ];
}
