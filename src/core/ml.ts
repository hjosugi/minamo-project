import { clamp } from './math';
import type { Landmark } from './types';

export interface PoseBackend<Keypoint = Landmark> {
  name: string;
  detect(input: HTMLVideoElement | ImageBitmap, timeMs: number): Promise<Keypoint[]>;
}

export interface ModelBenchmarkResult {
  modelName: string;
  backend: 'webgpu' | 'wasm' | 'webgl' | 'cpu';
  fps: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  memoryMb?: number;
}

export interface QualityClassification {
  score: number;
  state: 'good' | 'degraded' | 'poor';
  reasons: string[];
}

export async function detectWebGpuSupport(): Promise<boolean> {
  return typeof navigator !== 'undefined' && 'gpu' in navigator && Boolean(await navigator.gpu?.requestAdapter?.());
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) throw new Error('Web Crypto is required for model hash verification');
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyModelHash(data: ArrayBuffer | Uint8Array, expectedSha256: string): Promise<boolean> {
  return (await sha256Hex(data)).toLowerCase() === expectedSha256.toLowerCase();
}

export function classifyLowLight(meanLuma: number): QualityClassification {
  const score = clamp((meanLuma - 20) / 80, 0, 1);
  return {
    score,
    state: score >= 0.7 ? 'good' : score >= 0.4 ? 'degraded' : 'poor',
    reasons: score >= 0.7 ? [] : ['low light'],
  };
}

export function classifyMotionBlur(laplacianVariance: number): QualityClassification {
  const score = clamp((laplacianVariance - 20) / 120, 0, 1);
  return {
    score,
    state: score >= 0.7 ? 'good' : score >= 0.4 ? 'degraded' : 'poor',
    reasons: score >= 0.7 ? [] : ['motion blur'],
  };
}

export function privacyPreservingDatasetRecord(landmarks: Landmark[], label: string): string {
  return JSON.stringify({
    schema: 'kagami.dataset.landmarks.v1',
    label,
    landmarks: landmarks.map((lm) => ({
      x: round4(lm.x),
      y: round4(lm.y),
      z: round4(lm.z),
      visibility: lm.visibility === undefined ? undefined : round4(lm.visibility),
    })),
  });
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
