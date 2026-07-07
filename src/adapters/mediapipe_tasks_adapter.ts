import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  type FaceLandmarkerResult,
  type HandLandmarkerResult,
} from '@mediapipe/tasks-vision';
import { solveFaceStateFromBlendshapes, solveHandState, type FaceSolveInput, type HandSolveInput } from '../core';
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
  private previousFace?: FaceState;
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
    const face = convertFace(faceResult, this.previousFace);
    if (face) this.previousFace = face;
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

function convertFace(result: FaceLandmarkerResult, previous?: FaceState): FaceState | undefined {
  if (!result.faceBlendshapes.length && !result.faceLandmarks.length) return undefined;
  const blendshapes: Record<string, number> = {};
  for (const category of result.faceBlendshapes[0]?.categories ?? []) {
    if (category.categoryName !== '_neutral') blendshapes[category.categoryName] = category.score;
  }
  const landmarks = result.faceLandmarks[0]?.map(toCoreLandmark);
  const headRotation = result.facialTransformationMatrixes[0]
    ? mat4ToQuat(result.facialTransformationMatrixes[0].data)
    : undefined;
  const input: FaceSolveInput = {
    blendshapes,
    confidence: landmarks?.length ? 1 : 0,
  };
  if (landmarks) input.landmarks = landmarks;
  if (headRotation) input.headRotation = headRotation;
  if (previous) input.previous = previous;
  return solveFaceStateFromBlendshapes(input);
}

function normalizeHandedness(value: string | undefined): Handedness {
  return value === 'Left' ? 'Left' : 'Right';
}

function toCoreLandmark(landmark: { x: number; y: number; z: number; visibility?: number }): Landmark {
  const out: Landmark = { x: landmark.x, y: landmark.y, z: landmark.z };
  if (landmark.visibility !== undefined) out.visibility = landmark.visibility;
  return out;
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
