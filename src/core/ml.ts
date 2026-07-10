import { clamp } from './math';
import type { Landmark } from './types';

type NavigatorWithGpu = Navigator & {
  gpu?: {
    requestAdapter?: () => Promise<unknown>;
  };
};

export interface PoseBackend<Keypoint = Landmark> {
  name: string;
  detect(input: HTMLVideoElement | ImageBitmap, timeMs: number): Promise<Keypoint[]>;
}

export type MlExecutionProvider = 'webgpu' | 'wasm' | 'webgl' | 'cpu';
export type MlTaskKind = 'pose' | 'hand' | 'stick' | 'drum' | 'quality' | 'contact';

export interface OnnxModelSpec {
  name: string;
  url: string;
  inputShape: readonly number[];
  inputNames?: readonly string[];
  outputNames: readonly string[];
  sha256?: string;
  quantized?: boolean;
  task?: MlTaskKind;
  version?: string;
  license?: string;
  preferredProviders?: readonly MlExecutionProvider[];
}

export interface OnnxRuntimeAdapter<Keypoint = Landmark> extends PoseBackend<Keypoint> {
  model: OnnxModelSpec;
  provider: MlExecutionProvider;
  init(): Promise<void>;
  warmup?(input?: unknown): Promise<void>;
  dispose(): void;
}

export interface MlRuntimeCapabilities {
  webgpu: boolean;
  webgl: boolean;
  wasm: boolean;
  wasmThreads: boolean;
  wasmSimd: boolean;
  cpu: boolean;
  crossOriginIsolated: boolean;
  notes: string[];
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

export interface ModelVerificationResult {
  ok: boolean;
  required: boolean;
  actualSha256: string;
  expectedSha256?: string;
  error?: string;
}

export interface ModelFetchResult {
  bytes: Uint8Array;
  verification: ModelVerificationResult;
}

export interface ModelBenchmarkHarnessOptions {
  warmupRuns?: number;
  now?: () => number;
  memoryMb?: () => number | undefined;
}

export interface QuantizedModelExportPlan {
  schema: 'minamo.model-export-plan.v1';
  source: ModelExportManifest;
  variants: readonly ModelExportManifest[];
  browserFallback: MlExecutionProvider;
  commands: readonly string[];
}

export interface YoloStickDetectorBaselinePlan {
  schema: 'minamo.yolo-stick-baseline.v1';
  decision: 'evaluate';
  candidateModel: string;
  adapter: 'onnx-runtime-web';
  browserFallback: MlExecutionProvider;
  requiredMetrics: readonly string[];
  privacy: {
    rawMediaDefault: false;
    defaultDataset: 'landmarks-and-labels';
  };
}

export interface PrivacyPreservingDatasetRecord {
  schema: 'minamo.dataset.landmarks.v1';
  label: string;
  license: string;
  createdAt: string;
  consent: {
    localOnly: boolean;
    rawMedia: false;
  };
  landmarks: Array<{
    x: number;
    y: number;
    z: number;
    visibility?: number;
  }>;
  source?: string;
  quality?: {
    score: number;
    state: QualityClassification['state'];
    reasons: string[];
  };
}

export interface PrivacyPreservingDatasetRecordInput {
  label: string;
  landmarks?: readonly Landmark[];
  license?: string;
  createdAt?: string;
  source?: string;
  quality?: QualityClassification;
}

type FetchLike = (url: string) => Promise<{
  ok?: boolean;
  status?: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export async function detectWebGpuSupport(): Promise<boolean> {
  const nav = typeof navigator === 'undefined' ? undefined : navigator as NavigatorWithGpu;
  return Boolean(nav?.gpu?.requestAdapter && await nav.gpu.requestAdapter());
}

export async function detectMlRuntimeCapabilities(): Promise<MlRuntimeCapabilities> {
  const wasm = typeof WebAssembly !== 'undefined';
  const crossOriginIsolated = typeof globalThis.crossOriginIsolated === 'boolean'
    ? globalThis.crossOriginIsolated
    : false;
  const capabilities: MlRuntimeCapabilities = {
    webgpu: await detectWebGpuSupport(),
    webgl: detectWebGlSupport(),
    wasm,
    wasmThreads: wasm && crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined',
    wasmSimd: wasm && detectWasmSimdSupport(),
    cpu: true,
    crossOriginIsolated,
    notes: [],
  };
  if (!capabilities.webgpu) capabilities.notes.push('WebGPU unavailable; use WASM or CPU fallback.');
  if (capabilities.wasm && !capabilities.wasmThreads) capabilities.notes.push('WASM threads require cross-origin isolation.');
  return capabilities;
}

export function chooseExecutionProviderFromCapabilities(
  preferred: readonly MlExecutionProvider[] = ['webgpu', 'wasm'],
  capabilities: MlRuntimeCapabilities,
): MlExecutionProvider {
  for (const provider of preferred) {
    if (providerAvailable(provider, capabilities)) return provider;
  }
  if (capabilities.wasm) return 'wasm';
  return 'cpu';
}

export async function chooseExecutionProvider(
  preferred: readonly MlExecutionProvider[] = ['webgpu', 'wasm'],
  capabilities?: MlRuntimeCapabilities,
): Promise<MlExecutionProvider> {
  return chooseExecutionProviderFromCapabilities(preferred, capabilities ?? await detectMlRuntimeCapabilities());
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
  return (await sha256Hex(data)).toLowerCase() === normalizeSha256(expectedSha256);
}

export async function verifyModelSpecBytes(spec: OnnxModelSpec, data: ArrayBuffer | Uint8Array): Promise<ModelVerificationResult> {
  const actualSha256 = await sha256Hex(data);
  if (!spec.sha256) return { ok: true, required: false, actualSha256 };
  const expectedSha256 = normalizeSha256(spec.sha256);
  if (!/^[a-f0-9]{64}$/.test(expectedSha256)) {
    return {
      ok: false,
      required: true,
      actualSha256,
      expectedSha256,
      error: 'expected SHA-256 must be 64 hex characters',
    };
  }
  const ok = actualSha256 === expectedSha256;
  const result: ModelVerificationResult = {
    ok,
    required: true,
    actualSha256,
    expectedSha256,
  };
  if (!ok) result.error = 'model SHA-256 mismatch';
  return result;
}

export async function fetchAndVerifyModel(spec: OnnxModelSpec, fetcher: FetchLike = defaultFetch): Promise<ModelFetchResult> {
  const response = await fetcher(spec.url);
  if (response.ok === false) throw new Error(`Model fetch failed for ${spec.name}: HTTP ${response.status ?? 'error'}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const verification = await verifyModelSpecBytes(spec, bytes);
  if (!verification.ok) throw new Error(verification.error ?? `Model verification failed for ${spec.name}`);
  return { bytes, verification };
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

export async function runModelBenchmark<Input>(
  modelName: string,
  backend: ModelBenchmarkResult['backend'],
  inputs: readonly Input[],
  invoke: (input: Input, index: number) => Promise<unknown> | unknown,
  options: ModelBenchmarkHarnessOptions = {},
): Promise<ModelBenchmarkResult> {
  const now = options.now ?? (() => performance.now());
  const warmupRuns = Math.max(0, Math.floor(options.warmupRuns ?? 1));
  for (let i = 0; i < warmupRuns && inputs.length > 0; i++) {
    await invoke(inputs[i % inputs.length] as Input, -1 - i);
  }
  const samples: ModelBenchmarkSample[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const start = now();
    await invoke(inputs[i] as Input, i);
    const latencyMs = Math.max(0, now() - start);
    const sample: ModelBenchmarkSample = { latencyMs };
    const memoryMb = options.memoryMb?.();
    if (typeof memoryMb === 'number' && Number.isFinite(memoryMb)) sample.memoryMb = memoryMb;
    samples.push(sample);
  }
  return summarizeModelBenchmark(modelName, backend, samples);
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
  if (spec.license) manifest.license = spec.license;
  return manifest;
}

export function createQuantizedModelExportPlan(
  spec: OnnxModelSpec,
  quantizations: readonly ModelExportManifest['quantization'][] = ['fp16', 'int8'],
): QuantizedModelExportPlan {
  return {
    schema: 'minamo.model-export-plan.v1',
    source: createModelExportManifest(spec, 'none'),
    variants: quantizations.map((quantization) => createModelExportManifest({ ...spec, quantized: quantization !== 'none' }, quantization)),
    browserFallback: 'wasm',
    commands: quantizations.map((quantization) => (
      quantization === 'int8'
        ? `python -m onnxruntime.quantization.quantize_dynamic ${spec.name}.onnx ${spec.name}.int8.onnx`
        : `python -m onnxconverter_common.float16 ${spec.name}.onnx ${spec.name}.${quantization}.onnx`
    )),
  };
}

export function createYoloStickDetectorBaselinePlan(candidateModel = 'yolo-stick-nano'): YoloStickDetectorBaselinePlan {
  return {
    schema: 'minamo.yolo-stick-baseline.v1',
    decision: 'evaluate',
    candidateModel,
    adapter: 'onnx-runtime-web',
    browserFallback: 'wasm',
    requiredMetrics: ['stick-tip-p95-error', 'hit-recall', 'false-hit-rate', 'p95-latency-ms'],
    privacy: {
      rawMediaDefault: false,
      defaultDataset: 'landmarks-and-labels',
    },
  };
}

export function createPrivacyPreservingDatasetRecord(input: PrivacyPreservingDatasetRecordInput): PrivacyPreservingDatasetRecord {
  const record: PrivacyPreservingDatasetRecord = {
    schema: 'minamo.dataset.landmarks.v1',
    label: input.label,
    license: input.license?.trim() || '0BSD',
    createdAt: input.createdAt ?? new Date().toISOString(),
    consent: {
      localOnly: true,
      rawMedia: false,
    },
    landmarks: [...(input.landmarks ?? [])].map((lm) => ({
      x: round4(lm.x),
      y: round4(lm.y),
      z: round4(lm.z),
      ...(lm.visibility === undefined ? {} : { visibility: round4(lm.visibility) }),
    })),
  };
  if (input.source) record.source = input.source;
  if (input.quality) {
    record.quality = {
      score: round4(input.quality.score),
      state: input.quality.state,
      reasons: [...input.quality.reasons],
    };
  }
  return record;
}

export function privacyPreservingDatasetRecord(landmarks: Landmark[], label: string): string {
  return JSON.stringify(createPrivacyPreservingDatasetRecord({ label, landmarks }));
}

// Runtime-toggleable pose backend registry (KGM-023). MediaPipe stays the
// default backend; ONNX backends register alongside it and can be swapped at
// runtime behind the same `detect(video, t) -> keypoints` interface. Backends
// are instantiated lazily on first activation so registering a heavy ONNX
// session does not load it until the user selects it.
export type PoseBackendFactory<Keypoint = Landmark> = () => PoseBackend<Keypoint>;

export interface PoseBackendDescriptor<Keypoint = Landmark> {
  name: string;
  create: PoseBackendFactory<Keypoint>;
  spec?: OnnxModelSpec;
  isDefault?: boolean;
}

export interface PoseBackendRegistry<Keypoint = Landmark> {
  listBackends(): string[];
  has(name: string): boolean;
  setActiveBackend(name: string): PoseBackend<Keypoint>;
  activeBackendName(): string | null;
  getActiveBackend(): PoseBackend<Keypoint> | null;
  detect(input: HTMLVideoElement | ImageBitmap, timeMs: number): Promise<Keypoint[]>;
}

export function createPoseBackendRegistry<Keypoint = Landmark>(
  descriptors: readonly PoseBackendDescriptor<Keypoint>[] = [],
): PoseBackendRegistry<Keypoint> {
  const factories = new Map<string, PoseBackendDescriptor<Keypoint>>();
  const instances = new Map<string, PoseBackend<Keypoint>>();
  let activeName: string | null = null;

  const registry: PoseBackendRegistry<Keypoint> = {
    listBackends: () => [...factories.keys()],
    has: (name) => factories.has(name),
    activeBackendName: () => activeName,
    getActiveBackend: () => (activeName ? instances.get(activeName) ?? null : null),
    setActiveBackend(name) {
      const descriptor = factories.get(name);
      if (!descriptor) throw new Error(`Unknown pose backend: ${name}`);
      let instance = instances.get(name);
      if (!instance) {
        instance = descriptor.create();
        instances.set(name, instance);
      }
      activeName = name;
      return instance;
    },
    async detect(input, timeMs) {
      const backend = registry.getActiveBackend();
      if (!backend) throw new Error('No active pose backend; call setActiveBackend first');
      return backend.detect(input, timeMs);
    },
  };

  for (const descriptor of descriptors) {
    if (factories.has(descriptor.name)) throw new Error(`Duplicate pose backend: ${descriptor.name}`);
    factories.set(descriptor.name, descriptor);
  }

  const preferredDefault = descriptors.find((descriptor) => descriptor.isDefault) ?? descriptors[0];
  if (preferredDefault) registry.setActiveBackend(preferredDefault.name);

  return registry;
}

function providerAvailable(provider: MlExecutionProvider, capabilities: MlRuntimeCapabilities): boolean {
  if (provider === 'webgpu') return capabilities.webgpu;
  if (provider === 'webgl') return capabilities.webgl;
  if (provider === 'wasm') return capabilities.wasm;
  return capabilities.cpu;
}

function detectWebGlSupport(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function detectWasmSimdSupport(): boolean {
  if (typeof WebAssembly === 'undefined' || typeof WebAssembly.validate !== 'function') return false;
  return WebAssembly.validate(new Uint8Array([
    0x00, 0x61, 0x73, 0x6d,
    0x01, 0x00, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x60,
    0x00, 0x01, 0x7b,
    0x03, 0x02, 0x01, 0x00,
    0x0a, 0x0a, 0x01, 0x08,
    0x00, 0xfd, 0x0c, 0x00,
    0x00, 0x00, 0x00, 0x0b,
  ]));
}

async function defaultFetch(url: string): Promise<Awaited<ReturnType<FetchLike>>> {
  if (typeof fetch === 'undefined') throw new Error('fetch is required to load ONNX models');
  return fetch(url);
}

function normalizeSha256(value: string): string {
  return value.trim().replace(/[:\s]/g, '').toLowerCase();
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
