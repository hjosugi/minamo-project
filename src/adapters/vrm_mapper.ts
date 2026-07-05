import type { FingerName, HandState, KGM1Frame } from '../core/types';

export interface VrmExpressionOutput {
  name: string;
  value: number;
}

export interface VrmLookAtOutput {
  yaw: number;
  pitch: number;
}

export interface VrmFingerOutput {
  handedness: 'Left' | 'Right';
  finger: FingerName;
  proximal: number;
  intermediate: number;
  distal: number;
  spread: number;
}

export function mapKGM1ToVrmExpressions(frame: KGM1Frame): VrmExpressionOutput[] {
  const face = frame.tracking.face;
  if (!face) return [];
  return [
    { name: 'aa', value: face.mouth.vowel === 'A' ? face.mouth.open : 0 },
    { name: 'ee', value: face.mouth.vowel === 'E' ? face.mouth.wide : 0 },
    { name: 'ih', value: face.mouth.vowel === 'I' ? face.mouth.wide : 0 },
    { name: 'oh', value: face.mouth.vowel === 'O' ? Math.max(face.mouth.open, face.mouth.pucker) : 0 },
    { name: 'ou', value: face.mouth.vowel === 'U' ? face.mouth.pucker : 0 },
    { name: 'blinkLeft', value: face.leftEye.blink },
    { name: 'blinkRight', value: face.rightEye.blink },
    { name: 'happy', value: Math.max(face.mouth.smileLeft, face.mouth.smileRight) },
    { name: 'angry', value: Math.max(face.mouth.frownLeft, face.mouth.frownRight) * 0.6 },
    { name: 'surprised', value: Math.max(face.mouth.open, 1 - Math.min(face.leftEye.blink, face.rightEye.blink)) * 0.35 },
  ];
}

export function mapKGM1ToVrmLookAt(frame: KGM1Frame): VrmLookAtOutput | null {
  const face = frame.tracking.face;
  if (!face) return null;
  return {
    yaw: clampSigned((face.leftEye.gaze.x + face.rightEye.gaze.x) * 0.5),
    pitch: clampSigned((face.leftEye.gaze.y + face.rightEye.gaze.y) * 0.5),
  };
}

export function mapKGM1HandsToVrmFingers(hands: HandState[] = []): VrmFingerOutput[] {
  const outputs: VrmFingerOutput[] = [];
  for (const hand of hands) {
    for (const finger of Object.values(hand.fingers)) {
      const curl = clamp01(finger.curl);
      outputs.push({
        handedness: hand.handedness,
        finger: finger.name,
        proximal: curl * 0.75,
        intermediate: curl,
        distal: curl * 0.65,
        spread: clampSigned(finger.spread / 1.2),
      });
    }
  }
  return outputs;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampSigned(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}
