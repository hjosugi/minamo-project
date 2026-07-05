import type { KGM1Frame } from '../core/types';

export interface VrmExpressionOutput {
  name: string;
  value: number;
}

export function mapKGM1ToVrmExpressions(frame: KGM1Frame): VrmExpressionOutput[] {
  const face = frame.tracking.face;
  if (!face) return [];
  return [
    { name: 'aa', value: face.mouth.vowel === 'A' ? face.mouth.open : 0 },
    { name: 'ih', value: face.mouth.vowel === 'I' ? face.mouth.wide : 0 },
    { name: 'ou', value: face.mouth.vowel === 'U' ? face.mouth.pucker : 0 },
    { name: 'blinkLeft', value: face.leftEye.blink },
    { name: 'blinkRight', value: face.rightEye.blink },
    { name: 'happy', value: Math.max(face.mouth.smileLeft, face.mouth.smileRight) },
  ];
}
