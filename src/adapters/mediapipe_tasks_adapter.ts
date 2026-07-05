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
    // Browser-facing pages use direct MediaPipe Tasks imports today. This class
    // keeps the next-gen TypeScript pipeline independent from vendor result
    // objects until the adapter is wired into that pipeline.
    void this.options;
    this.initialized = true;
  }

  async detect(_video: HTMLVideoElement, _timeMs: number): Promise<MediaPipeAdapterResult> {
    if (!this.initialized) throw new Error('MediaPipeTasksAdapter is not initialized');
    return { hands: [] };
  }
}
