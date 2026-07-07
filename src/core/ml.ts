import { clamp } from './math';
import type { Landmark } from './types';

export interface PoseBackend<Keypoint = Landmark> {
  name: string;
  detect(input: HTMLVideoElement | ImageBitmap, timeMs: number): Promise<Keypoint[]>;
}

export type MlExecutionProvider = 'webgpu' | 'wasm' | 'webgl' | 'cpu';

export interface OnnxModelSpec {
  name: string;
  url: string;
  inputShape: readonly number[];
  outputNames: readonly string[];
  sha256?: string;
  quantized?: boolean;
  preferredProviders?: readonly MlExecutionProvider[];
}

export interface OnnxRuntimeAdapter<Keypoint = Landmark> extends PoseBackend<Keypoint> {
  model: OnnxModelSpec;
  provider: MlExecutionProvider;
  init(): Promise<void>;
  dispose(): void;
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

export interface ModelBenchmarkSample {
  latencyMs: number;
  memoryMb?: number;
}

export interface ModelExportManifest {
  schema: 'minamo.model-export.v1';
  modelName: string;
  format: 'onnx';
  quantization: 'none' | 'fp16' | 'int8';
  inputShape: readonly number[];
  outputs: readonly string[];
  sha256?: string;
  license?: string;
}

export async function detectWebGpuSupport(): Promise<boolean> {
  return typeof navigator !== 'undefined' && 'gpu' in navigator && Boolean(await navigator.gpu?.requestAdapter?.());
}

export async function chooseExecutionProvider(
  preferred: readonly MlExecutionProvider[] = ['webgpu', 'wasm'],
): Promise<MlExecutionProvider> {
  for (const provider of preferred) {
    if (provider === 'webgpu' && await detectWebGpuSupport()) return 'webgpu';
    if (provider !== 'webgpu') return provider;
  }
  return 'wasm';
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

export function classifyHandObjectContact(distanceMeters: number, modelScore = 0.5): QualityClassification {
  const distanceScore = clamp((0.08 - distanceMeters) / 0.08, 0, 1);
  const score = clamp(distanceScore * 0.65 + modelScore * 0.35, 0, 1);
  return {
    score,
    state: score >= 0.7 ? 'good' : score >= 0.4 ? 'degraded' : 'poor',
    reasons: score >= 0.7 ? [] : ['uncertain hand-object contact'],
  };
}

export function summarizeModelBenchmark(
  modelName: string,
  backend: ModelBenchmarkResult['backend'],
  samples: readonly ModelBenchmarkSample[],
): ModelBenchmarkResult {
  const latencies = samples.map((sample) => sample.latencyMs).filter(Number.isFinite).sort((a, b) => a - b);
  const averageLatencyMs = latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : 0;
  const p95Index = Math.max(0, Math.ceil(latencies.length * 0.95) - 1);
  const result: ModelBenchmarkResult = {
    modelName,
    backend,
    fps: averageLatencyMs > 0 ? 1000 / averageLatencyMs : 0,
    averageLatencyMs,
    p95LatencyMs: latencies[p95Index] ?? 0,
  };
  const memorySamples = samples.map((sample) => sample.memoryMb).filter((value): value is number => Number.isFinite(value));
  if (memorySamples.length) {
    result.memoryMb = Math.max(...memorySamples);
  }
  return result;
}

export function createModelExportManifest(spec: OnnxModelSpec, quantization: ModelExportManifest['quantization']): ModelExportManifest {
  const manifest: ModelExportManifest = {
    schema: 'minamo.model-export.v1',
    modelName: spec.name,
    format: 'onnx',
    quantization,
    inputShape: spec.inputShape,
    outputs: spec.outputNames,
  };
  if (spec.sha256) manifest.sha256 = spec.sha256;
  return manifest;
}

export function privacyPreservingDatasetRecord(landmarks: Landmark[], label: string): string {
  return JSON.stringify({
    schema: 'minamo.dataset.landmarks.v1',
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
