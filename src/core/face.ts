import { clamp, lerp } from './math';
import type { EyeState, FaceState, Landmark, MouthState, Quat, Vec2, Vec3 } from './types';

export interface FaceSolveInput {
  blendshapes: Record<string, number>;
  landmarks?: Landmark[];
  headRotation?: Quat;
  previous?: FaceState;
  detected?: boolean;
  confidence?: number;
  audioRms?: number;
  audioMouthBlend?: number;
}

export interface GlassesGlareSignal {
  confidence: number;
  likely: boolean;
  reasons: string[];
}

const LEFT_IRIS_INDICES = [468, 469, 470, 471, 472];
const RIGHT_IRIS_INDICES = [473, 474, 475, 476, 477];

export function stabilizeBlink(rawBlink: number, previousBlink: number, headYawRad: number): number {
  const closeThreshold = 0.62;
  const openThreshold = 0.42;
  const previous = clamp(previousBlink, 0, 1);
  const raw = clamp(rawBlink, 0, 1);
  const wasClosed = previous >= closeThreshold;
  let target = raw;

  if (wasClosed && raw > openThreshold) {
    target = Math.max(raw, closeThreshold);
  } else if (!wasClosed && raw < closeThreshold) {
    target = Math.min(raw, openThreshold);
  }

  const yawPenalty = clamp(Math.abs(headYawRad) / 0.75, 0, 1);
  const enteringBlink = !wasClosed && raw >= closeThreshold;
  const alpha = enteringBlink ? 0.8 : lerp(0.35, 0.12, yawPenalty);
  return clamp(lerp(previous, target, alpha), 0, 1);
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

export function solveFaceStateFromBlendshapes({
  blendshapes,
  landmarks,
  headRotation,
  previous,
  detected = true,
  confidence = landmarks?.length ? 1 : 0,
  audioRms,
  audioMouthBlend = 0.25,
}: FaceSolveInput): FaceState {
  const safeBlendshapes = sanitizeBlendshapes(blendshapes);
  const headYawRad = headRotation ? estimateHeadYawRad(headRotation) : 0;
  const mouth = deriveMouthState(safeBlendshapes, headYawRad);
  if (audioRms !== undefined) {
    mouth.open = audioAssistMouthOpen(mouth.open, audioRms, audioMouthBlend);
    mouth.vowel = inferVowel(mouth.open, mouth.wide, mouth.pucker);
  }
  mouth.confidence = confidence;

  const leftEye = deriveEyeState(
    safeBlendshapes,
    'Left',
    headYawRad,
    previous?.leftEye,
    landmarks,
  );
  leftEye.confidence = confidence;

  const rightEye = deriveEyeState(
    safeBlendshapes,
    'Right',
    headYawRad,
    previous?.rightEye,
    landmarks,
  );
  rightEye.confidence = confidence;

  const warnings: string[] = [];
  if (!Number.isFinite(headYawRad)) warnings.push('FACE_HEAD_YAW_NON_FINITE');
  if (!confidence) warnings.push('FACE_LOW_CONFIDENCE');
  const glare = classifyGlassesGlare({
    confidence,
    eyeSquintLeft: channel(safeBlendshapes, 'eyeSquintLeft'),
    eyeSquintRight: channel(safeBlendshapes, 'eyeSquintRight'),
    eyeBlinkLeft: leftEye.blink,
    eyeBlinkRight: rightEye.blink,
  });
  if (glare.likely) warnings.push('FACE_GLASSES_GLARE_POSSIBLE');

  const face: FaceState = {
    detected,
    confidence,
    leftEye,
    rightEye,
    mouth,
    blendshapes: safeBlendshapes,
    warnings,
  };

  if (headRotation) face.headRotation = headRotation;
  if (landmarks) face.landmarks = landmarks;

  return face;
}

export function deriveMouthState(
  blendshapes: Record<string, number>,
  headYawRad = 0,
): MouthState {
  const mouth = defaultMouth();
  mouth.open = channel(blendshapes, 'jawOpen');
  mouth.wide = clamp(
    (channel(blendshapes, 'mouthStretchLeft') + channel(blendshapes, 'mouthStretchRight')) * 0.6,
    0,
    1,
  );
  mouth.pucker = clamp(
    (channel(blendshapes, 'mouthPucker') + channel(blendshapes, 'mouthFunnel')) * 0.65,
    0,
    1,
  );
  mouth.smileLeft = compensateHeadYawLeak(channel(blendshapes, 'mouthSmileLeft'), headYawRad);
  mouth.smileRight = compensateHeadYawLeak(channel(blendshapes, 'mouthSmileRight'), headYawRad);
  mouth.frownLeft = compensateHeadYawLeak(channel(blendshapes, 'mouthFrownLeft'), headYawRad);
  mouth.frownRight = compensateHeadYawLeak(channel(blendshapes, 'mouthFrownRight'), headYawRad);
  mouth.jawForward = channel(blendshapes, 'jawForward');
  mouth.vowel = inferVowel(mouth.open, mouth.wide, mouth.pucker);
  return mouth;
}

export function deriveEyeState(
  blendshapes: Record<string, number>,
  side: 'Left' | 'Right',
  headYawRad = 0,
  previous?: EyeState,
  landmarks?: Landmark[],
): EyeState {
  const eye = defaultEye();
  const blinkName = side === 'Left' ? 'eyeBlinkLeft' : 'eyeBlinkRight';
  const squintName = side === 'Left' ? 'eyeSquintLeft' : 'eyeSquintRight';
  const rawBlink = channel(blendshapes, blinkName);
  eye.blink = previous
    ? stabilizeBlink(rawBlink, previous.blink, headYawRad)
    : rawBlink;
  eye.openness = clamp(1 - eye.blink, 0, 1);
  eye.squint = channel(blendshapes, squintName);
  eye.gaze = deriveGazeVector(blendshapes, side);
  const irisCenter = deriveIrisCenter(
    landmarks,
    side === 'Left' ? LEFT_IRIS_INDICES : RIGHT_IRIS_INDICES,
  );
  if (irisCenter) eye.irisCenter = irisCenter;
  return eye;
}

export function deriveGazeVector(
  blendshapes: Record<string, number>,
  side: 'Left' | 'Right',
): Vec3 {
  const x = side === 'Left'
    ? channel(blendshapes, 'eyeLookOutLeft') - channel(blendshapes, 'eyeLookInLeft')
    : channel(blendshapes, 'eyeLookInRight') - channel(blendshapes, 'eyeLookOutRight');
  const y = side === 'Left'
    ? channel(blendshapes, 'eyeLookUpLeft') - channel(blendshapes, 'eyeLookDownLeft')
    : channel(blendshapes, 'eyeLookUpRight') - channel(blendshapes, 'eyeLookDownRight');
  return clampGazeVector({ x, y, z: 1 });
}

export function clampGazeVector(gaze: Vec3): Vec3 {
  const x = clamp(gaze.x, -1, 1);
  const y = clamp(gaze.y, -1, 1);
  const z = Math.sqrt(Math.max(0, 1 - Math.min(1, x * x + y * y)));
  return { x, y, z };
}

export function deriveIrisCenter(
  landmarks: Landmark[] | undefined,
  indices: readonly number[],
): Vec2 | undefined {
  if (!landmarks || landmarks.length <= Math.max(...indices)) return undefined;
  let x = 0;
  let y = 0;
  let count = 0;

  for (const index of indices) {
    const point = landmarks[index];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    x += point.x;
    y += point.y;
    count++;
  }

  if (!count) return undefined;
  return { x: x / count, y: y / count };
}

export function audioAssistMouthOpen(visualOpen: number, audioRms: number, amount = 0.25): number {
  const audioOpen = clamp((audioRms - 0.015) / 0.12, 0, 1);
  return clamp(lerp(visualOpen, Math.max(visualOpen, audioOpen), amount), 0, 1);
}

export function classifyGlassesGlare({
  confidence,
  eyeSquintLeft = 0,
  eyeSquintRight = 0,
  eyeBlinkLeft = 0,
  eyeBlinkRight = 0,
  eyeSpecularMean = 0,
}: {
  confidence: number;
  eyeSquintLeft?: number;
  eyeSquintRight?: number;
  eyeBlinkLeft?: number;
  eyeBlinkRight?: number;
  eyeSpecularMean?: number;
}): GlassesGlareSignal {
  const reasons: string[] = [];
  const squint = Math.max(eyeSquintLeft, eyeSquintRight);
  const blinkAsymmetry = Math.abs(eyeBlinkLeft - eyeBlinkRight);
  if (confidence < 0.55 && squint > 0.5) reasons.push('low confidence with high eye squint');
  if (blinkAsymmetry > 0.45 && squint > 0.35) reasons.push('asymmetric blink and squint spike');
  if (eyeSpecularMean > 0.78) reasons.push('high specular highlight near eyes');
  return {
    confidence: clamp(reasons.length / 3, 0, 1),
    likely: reasons.length > 0,
    reasons,
  };
}

export function mouthFlickerScore(openSamples: readonly number[]): number {
  if (openSamples.length < 2) return 0;
  let totalDelta = 0;
  for (let i = 1; i < openSamples.length; i++) {
    totalDelta += Math.abs(clamp(openSamples[i] ?? 0, 0, 1) - clamp(openSamples[i - 1] ?? 0, 0, 1));
  }
  return clamp(totalDelta / (openSamples.length - 1), 0, 1);
}

export function blinkFalsePositiveRate(
  samples: readonly { blink: number; expectedClosed: boolean }[],
  threshold = 0.62,
): number {
  if (!samples.length) return 0;
  const falsePositives = samples.filter((sample) => !sample.expectedClosed && sample.blink >= threshold).length;
  return falsePositives / samples.length;
}

export function estimateHeadYawRad(quat: Quat): number {
  const { x, y, z, w } = quat;
  const sinyCosp = 2 * (w * y + z * x);
  const cosyCosp = 1 - 2 * (y * y + x * x);
  return Math.atan2(sinyCosp, cosyCosp);
}

function sanitizeBlendshapes(blendshapes: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(blendshapes).map(([name, value]) => [name, clamp(Number(value), 0, 1)]),
  );
}

function compensateHeadYawLeak(value: number, headYawRad: number): number {
  const penalty = clamp((Math.abs(headYawRad) - 0.35) / 0.55, 0, 0.55);
  return clamp(value * (1 - penalty), 0, 1);
}

function channel(blendshapes: Record<string, number>, name: string): number {
  return clamp(Number(blendshapes[name] ?? 0), 0, 1);
}
