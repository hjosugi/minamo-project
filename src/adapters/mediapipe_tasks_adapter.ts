import type { FaceState, HandState } from '../core/types';

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

  constructor(private readonly options: MediaPipeAdapterOptions) {}

  async init(): Promise<void> {
    // TODO: Import @mediapipe/tasks-vision and initialize FilesetResolver,
    // HandLandmarker, and FaceLandmarker in VIDEO or LIVE_STREAM mode.
    // Keep this file as the integration boundary so the rest of KGM1 does not
    // depend directly on MediaPipe-specific result objects.
    void this.options;
    this.initialized = true;
  }

  async detect(_video: HTMLVideoElement, _timeMs: number): Promise<MediaPipeAdapterResult> {
    if (!this.initialized) throw new Error('MediaPipeTasksAdapter is not initialized');
    // TODO: Convert MediaPipe landmarks and blendshapes into KGM1 states.
    return { hands: [] };
  }
}
