import {
  add,
  angleBetween,
  clamp,
  cross,
  distance,
  dot,
  finiteVec3,
  normalize,
  projectOnPlane,
  scale,
  sub,
} from './math';
import type { FingerName, FingerState, HandState, Handedness, JointState, Landmark, Vec3 } from './types';

export const HAND_LANDMARK_COUNT = 21;

export const FINGER_CHAINS: Record<FingerName, readonly [number, number, number, number]> = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
};

export interface PalmBasis {
  origin: Vec3;
  x: Vec3;
  y: Vec3;
  z: Vec3;
  handedness: Handedness;
}

export interface HandSolveInput {
  handedness: Handedness;
  landmarks: Landmark[];
  worldLandmarks?: Landmark[];
  previous?: HandState;
  dtSec?: number;
}

export function landmarkToVec3(lm: Landmark): Vec3 {
  return { x: lm.x, y: lm.y, z: lm.z };
}

export function computePalmBasis(landmarks: Landmark[], handedness: Handedness): PalmBasis {
  assertHandLandmarks(landmarks);
  const wrist = landmarkToVec3(lm(landmarks, 0));
  const indexMcp = landmarkToVec3(lm(landmarks, 5));
  const middleMcp = landmarkToVec3(lm(landmarks, 9));
  const pinkyMcp = landmarkToVec3(lm(landmarks, 17));
  const across = handedness === 'Right' ? sub(indexMcp, pinkyMcp) : sub(pinkyMcp, indexMcp);
  const up = sub(middleMcp, wrist);
  let z = normalize(cross(across, up));
  if (handedness === 'Left') z = scale(z, -1);
  return {
    origin: wrist,
    x: normalize(across),
    y: normalize(up),
    z,
    handedness,
  };
}

export function deriveFingerChain(landmarks: Landmark[], name: FingerName): readonly [Vec3, Vec3, Vec3, Vec3] {
  assertHandLandmarks(landmarks);
  return FINGER_CHAINS[name].map((i) => landmarkToVec3(lm(landmarks, i))) as [Vec3, Vec3, Vec3, Vec3];
}

export function computeFingerCurl(chain: readonly [Vec3, Vec3, Vec3, Vec3], palm: PalmBasis): number {
  const [mcp, pip, dip, tip] = chain;
  const a = angleBetween(sub(pip, mcp), palm.y);
  const b = Math.PI - angleBetween(sub(mcp, pip), sub(dip, pip));
  const c = Math.PI - angleBetween(sub(pip, dip), sub(tip, dip));
  return clamp((a * 0.45 + b * 0.35 + c * 0.20) / (Math.PI * 0.72), 0, 1);
}

export function computeFingerSpread(
  chain: readonly [Vec3, Vec3, Vec3, Vec3],
  middleChain: readonly [Vec3, Vec3, Vec3, Vec3],
  palm: PalmBasis,
): number {
  const dir = normalize(projectOnPlane(sub(chain[1], chain[0]), palm.z));
  const middle = normalize(projectOnPlane(sub(middleChain[1], middleChain[0]), palm.z));
  const unsigned = angleBetween(dir, middle);
  const sign = Math.sign(dot(cross(middle, dir), palm.z)) || 1;
  return clamp(unsigned * sign, -1.2, 1.2);
}

export function computePinchDistances(landmarks: Landmark[]): Partial<Record<FingerName, number>> {
  assertHandLandmarks(landmarks);
  const thumbTip = landmarkToVec3(lm(landmarks, 4));
  return {
    index: distance(thumbTip, landmarkToVec3(lm(landmarks, 8))),
    middle: distance(thumbTip, landmarkToVec3(lm(landmarks, 12))),
    ring: distance(thumbTip, landmarkToVec3(lm(landmarks, 16))),
    pinky: distance(thumbTip, landmarkToVec3(lm(landmarks, 20))),
  };
}

export function solveHandState(input: HandSolveInput): HandState {
  const landmarks = input.worldLandmarks?.length === HAND_LANDMARK_COUNT ? input.worldLandmarks : input.landmarks;
  assertHandLandmarks(landmarks);
  const palm = computePalmBasis(landmarks, input.handedness);
  const middleChain = deriveFingerChain(landmarks, 'middle');
  const pinch = computePinchDistances(landmarks);
  const warnings: string[] = [];
  const fingers = {} as Record<FingerName, FingerState>;
  const frameConfidence = landmarkConfidence(input.landmarks);
  const outside = input.landmarks.some((lm) => lm.x < -0.05 || lm.x > 1.05 || lm.y < -0.05 || lm.y > 1.05);
  if (outside) warnings.push('HAND_OUTSIDE_FRAME');
  if (frameConfidence < 0.45) warnings.push('HAND_LOW_CONFIDENCE');

  for (const name of Object.keys(FINGER_CHAINS) as FingerName[]) {
    const chain = deriveFingerChain(landmarks, name);
    const previousFinger = input.previous?.fingers[name];
    const tipVelocity = computeTipVelocity(chain[3], previousFinger?.tip.position, input.dtSec);
    const confidence = fingerConfidence(input.landmarks, name);
    const occluded = confidence < 0.35;
    if (occluded) warnings.push(`${name}:OCCLUDED`);
    const contact = {
      touching: name !== 'thumb' && (pinch[name] ?? Infinity) < 0.035,
      confidence,
    };
    if (name !== 'thumb') {
      Object.assign(contact, {
        target: 'thumb',
        distance: pinch[name],
      });
    }
    const finger: FingerState = {
      name,
      mcp: joint(chain[0], confidence),
      pip: joint(chain[1], confidence),
      dip: joint(chain[2], confidence),
      tip: joint(chain[3], confidence),
      curl: computeFingerCurl(chain, palm),
      spread: computeFingerSpread(chain, middleChain, palm),
      contact,
      tipVelocity,
      confidence,
      occluded,
    };
    const distanceToThumb = pinch[name];
    if (name !== 'thumb' && distanceToThumb !== undefined) finger.pinchToThumb = distanceToThumb;
    fingers[name] = finger;
  }

  const hand: HandState = {
    handedness: input.handedness,
    detected: true,
    confidence: frameConfidence,
    fingers,
    landmarks: input.landmarks,
    warnings: [...new Set(warnings)],
  };
  if (input.worldLandmarks) hand.worldLandmarks = input.worldLandmarks;
  return hand;
}

export class FingerContactHysteresis {
  private touching = false;

  constructor(
    private readonly enterDistance = 0.032,
    private readonly exitDistance = 0.045,
  ) {}

  update(distanceToThumb: number, confidence = 1): boolean {
    if (confidence < 0.35) return this.touching;
    if (!this.touching && distanceToThumb <= this.enterDistance) this.touching = true;
    else if (this.touching && distanceToThumb >= this.exitDistance) this.touching = false;
    return this.touching;
  }
}

export class ConfidenceDecay {
  private value = 0;

  update(detectedConfidence: number, dtSec: number, halfLifeSec = 0.18): number {
    if (detectedConfidence > this.value) {
      this.value = clamp(detectedConfidence, 0, 1);
      return this.value;
    }
    const decay = Math.pow(0.5, Math.max(0, dtSec) / halfLifeSec);
    this.value = Math.max(detectedConfidence, this.value * decay);
    return this.value;
  }
}

export function detectHandSwap(previous: HandState | undefined, next: HandState): boolean {
  if (!previous || previous.handedness === next.handedness) return false;
  const prevWrist = landmarkToVec3(lm(previous.landmarks, 0));
  const nextWrist = landmarkToVec3(lm(next.landmarks, 0));
  return distance(prevWrist, nextWrist) < 0.08;
}

export function createSyntheticHandLandmarks(curl = 0, handedness: Handedness = 'Right'): Landmark[] {
  const side = handedness === 'Right' ? 1 : -1;
  const landmarks: Landmark[] = Array.from({ length: HAND_LANDMARK_COUNT }, () => ({ x: 0, y: 0, z: 0, visibility: 1, presence: 1 }));
  landmarks[0] = { x: 0, y: 0, z: 0, visibility: 1, presence: 1 };
  const bases: Record<FingerName, Vec3> = {
    thumb: { x: 0.035 * side, y: 0.02, z: 0 },
    index: { x: 0.035 * side, y: 0.085, z: 0 },
    middle: { x: 0, y: 0.095, z: 0 },
    ring: { x: -0.03 * side, y: 0.085, z: 0 },
    pinky: { x: -0.055 * side, y: 0.07, z: 0 },
  };
  for (const [name, indices] of Object.entries(FINGER_CHAINS) as [FingerName, readonly [number, number, number, number]][]) {
    const base = bases[name];
    const lengthScale = name === 'thumb' ? 0.032 : 0.045;
    for (let i = 0; i < indices.length; i++) {
      const index = indices[i];
      if (index === undefined) continue;
      const bend = curl * i * 0.018;
      landmarks[index] = {
        x: base.x,
        y: base.y + lengthScale * (i + 1) * (1 - curl * 0.55),
        z: bend,
        visibility: 1,
        presence: 1,
      };
    }
  }
  return landmarks;
}

function assertHandLandmarks(landmarks: Landmark[]): void {
  if (landmarks.length !== HAND_LANDMARK_COUNT) throw new Error(`Expected ${HAND_LANDMARK_COUNT} hand landmarks`);
  if (!landmarks.every((lm) => finiteVec3(lm))) throw new Error('Hand landmarks contain non-finite values');
}

function lm(landmarks: Landmark[], index: number): Landmark {
  const value = landmarks[index];
  if (!value) throw new Error(`Missing hand landmark ${index}`);
  return value;
}

function joint(position: Vec3, confidence: number): JointState {
  return { position, confidence };
}

function landmarkConfidence(landmarks: Landmark[]): number {
  const values = landmarks.map((lm) => Math.min(lm.visibility ?? 1, lm.presence ?? 1));
  return clamp(values.reduce((sum, value) => sum + value, 0) / values.length, 0, 1);
}

function fingerConfidence(landmarks: Landmark[], name: FingerName): number {
  const values = FINGER_CHAINS[name].map((i) => {
    const point = lm(landmarks, i);
    return Math.min(point.visibility ?? 1, point.presence ?? 1);
  });
  return clamp(values.reduce((sum, value) => sum + value, 0) / values.length, 0, 1);
}

function computeTipVelocity(current: Vec3, previous: Vec3 | undefined, dtSec = 0): Vec3 {
  if (!previous || dtSec <= 0) return { x: 0, y: 0, z: 0 };
  return scale(sub(current, previous), 1 / dtSec);
}
