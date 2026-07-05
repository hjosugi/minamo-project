import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  type FaceLandmarkerResult,
  type HandLandmarkerResult,
} from '@mediapipe/tasks-vision';
import { defaultEye, defaultMouth, inferVowel, solveHandState, type HandSolveInput } from '../core';
import type { FaceState, HandState, Handedness, Landmark, Quat } from '../core/types';

export interface MediaPipeAdapterOptions {
  wasmBaseUrl: string;
  handModelUrl: string;
  faceModelUrl: string;
  numHands: number;
  numFaces: number;
}

export interface MediaPipeAdapterResult {
  face?: FaceState;
  hands: HandState[];
}

export class MediaPipeTasksAdapter {
  private initialized = false;
  private faceLandmarker?: FaceLandmarker;
  private handLandmarker?: HandLandmarker;
  private previousHands = new Map<Handedness, HandState>();
  private previousTimeMs?: number;

  constructor(private readonly options: MediaPipeAdapterOptions) {}

  async init(): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks(this.options.wasmBaseUrl);
    this.faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: this.options.faceModelUrl, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: this.options.numFaces,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    });
    this.handLandmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: this.options.handModelUrl, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: this.options.numHands,
    });
    this.initialized = true;
  }

  async detect(video: HTMLVideoElement, timeMs: number): Promise<MediaPipeAdapterResult> {
    if (!this.initialized) throw new Error('MediaPipeTasksAdapter is not initialized');
    if (!this.faceLandmarker || !this.handLandmarker) throw new Error('MediaPipeTasksAdapter tasks are missing');
    const faceResult = this.faceLandmarker.detectForVideo(video, timeMs);
    const handResult = this.handLandmarker.detectForVideo(video, timeMs);
    const dtSec = this.previousTimeMs === undefined ? undefined : Math.max(0, (timeMs - this.previousTimeMs) / 1000);
    this.previousTimeMs = timeMs;
    const hands = convertHands(handResult, this.previousHands, dtSec);
    this.previousHands = new Map(hands.map((hand) => [hand.handedness, hand]));
    const face = convertFace(faceResult);
    return face ? { face, hands } : { hands };
  }
}

function convertHands(
  result: HandLandmarkerResult,
  previousHands: Map<Handedness, HandState>,
  dtSec: number | undefined,
): HandState[] {
  return result.landmarks.map((landmarks, index) => {
    const handedness = normalizeHandedness(result.handedness[index]?.[0]?.categoryName);
    const input: HandSolveInput = {
      handedness,
      landmarks: landmarks.map(toCoreLandmark),
    };
    const worldLandmarks = result.worldLandmarks[index]?.map(toCoreLandmark);
    const previous = previousHands.get(handedness);
    if (worldLandmarks) input.worldLandmarks = worldLandmarks;
    if (previous) input.previous = previous;
    if (dtSec !== undefined) input.dtSec = dtSec;
    return solveHandState(input);
  });
}

function convertFace(result: FaceLandmarkerResult): FaceState | undefined {
  if (!result.faceBlendshapes.length && !result.faceLandmarks.length) return undefined;
  const blendshapes: Record<string, number> = {};
  for (const category of result.faceBlendshapes[0]?.categories ?? []) {
    if (category.categoryName !== '_neutral') blendshapes[category.categoryName] = category.score;
  }
  const mouth = defaultMouth();
  mouth.open = clamp01(blendshapes.jawOpen ?? 0);
  mouth.wide = clamp01(((blendshapes.mouthStretchLeft ?? 0) + (blendshapes.mouthStretchRight ?? 0)) * 0.6);
  mouth.pucker = clamp01(((blendshapes.mouthPucker ?? 0) + (blendshapes.mouthFunnel ?? 0)) * 0.65);
  mouth.smileLeft = clamp01(blendshapes.mouthSmileLeft ?? 0);
  mouth.smileRight = clamp01(blendshapes.mouthSmileRight ?? 0);
  mouth.frownLeft = clamp01(blendshapes.mouthFrownLeft ?? 0);
  mouth.frownRight = clamp01(blendshapes.mouthFrownRight ?? 0);
  mouth.jawForward = clamp01(blendshapes.jawForward ?? 0);
  mouth.vowel = inferVowel(mouth.open, mouth.wide, mouth.pucker);
  mouth.confidence = result.faceLandmarks.length ? 1 : 0;

  const leftEye = defaultEye();
  leftEye.blink = clamp01(blendshapes.eyeBlinkLeft ?? 0);
  leftEye.openness = clamp01(1 - leftEye.blink);
  leftEye.squint = clamp01(blendshapes.eyeSquintLeft ?? 0);
  leftEye.gaze = {
    x: clampSigned((blendshapes.eyeLookOutLeft ?? 0) - (blendshapes.eyeLookInLeft ?? 0)),
    y: clampSigned((blendshapes.eyeLookUpLeft ?? 0) - (blendshapes.eyeLookDownLeft ?? 0)),
    z: 1,
  };
  leftEye.confidence = mouth.confidence;

  const rightEye = defaultEye();
  rightEye.blink = clamp01(blendshapes.eyeBlinkRight ?? 0);
  rightEye.openness = clamp01(1 - rightEye.blink);
  rightEye.squint = clamp01(blendshapes.eyeSquintRight ?? 0);
  rightEye.gaze = {
    x: clampSigned((blendshapes.eyeLookInRight ?? 0) - (blendshapes.eyeLookOutRight ?? 0)),
    y: clampSigned((blendshapes.eyeLookUpRight ?? 0) - (blendshapes.eyeLookDownRight ?? 0)),
    z: 1,
  };
  rightEye.confidence = mouth.confidence;

  const face: FaceState = {
    detected: true,
    confidence: mouth.confidence,
    leftEye,
    rightEye,
    mouth,
    blendshapes,
    warnings: [],
  };
  if (result.facialTransformationMatrixes[0]) {
    face.headRotation = mat4ToQuat(result.facialTransformationMatrixes[0].data);
  }
  if (result.faceLandmarks[0]) {
    face.landmarks = result.faceLandmarks[0].map(toCoreLandmark);
  }
  return face;
}

function normalizeHandedness(value: string | undefined): Handedness {
  return value === 'Left' ? 'Left' : 'Right';
}

function toCoreLandmark(landmark: { x: number; y: number; z: number; visibility?: number }): Landmark {
  const out: Landmark = { x: landmark.x, y: landmark.y, z: landmark.z };
  if (landmark.visibility !== undefined) out.visibility = landmark.visibility;
  return out;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampSigned(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

function mat4ToQuat(m: readonly number[]): Quat {
  const m00 = m[0] ?? 1, m01 = m[4] ?? 0, m02 = m[8] ?? 0;
  const m10 = m[1] ?? 0, m11 = m[5] ?? 1, m12 = m[9] ?? 0;
  const m20 = m[2] ?? 0, m21 = m[6] ?? 0, m22 = m[10] ?? 1;
  const tr = m00 + m11 + m22;
  let x: number;
  let y: number;
  let z: number;
  let w: number;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1.0) * 2;
    w = 0.25 * s;
    x = (m21 - m12) / s;
    y = (m02 - m20) / s;
    z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1.0 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1.0 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1.0 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }
  const len = Math.hypot(x, y, z, w) || 1;
  return { x: x / len, y: y / len, z: z / len, w: w / len };
}
