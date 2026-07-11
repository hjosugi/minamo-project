// Reproducible, local-only drum benchmark runner for issue #234.
//
// The manifest names private media, expected annotations, and a detector
// command. The command is executed without a shell and must write Minamo
// DrumHitEvent JSON. This runner verifies media identity/metadata, invokes the
// detector, applies the production scoreDrumBenchmarkEvents implementation,
// and emits only redacted JSON/Markdown reports.

import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreDrumBenchmarkEvents } from '../src/core/drum.ts';
import type { DrumBenchmarkExpectedHit } from '../src/core/drum.ts';
import type { DrumHitEvent } from '../src/core/types.ts';

export const DRUM_BENCHMARK_MANIFEST_SCHEMA = 'minamo.drum-benchmark-manifest.v1';
export const DRUM_DETECTED_EVENTS_SCHEMA = 'minamo.drum-detected-events.v1';
export const DRUM_BENCHMARK_REPORT_SCHEMA = 'minamo.drum-benchmark-report.v1';

type JsonRecord = Record<string, unknown>;

export interface DrumBenchmarkManifest {
  schema: typeof DRUM_BENCHMARK_MANIFEST_SCHEMA;
  outputDir?: string;
  toleranceMs?: number;
  minimumSeparationMs?: number;
  clips: DrumBenchmarkClip[];
}

export interface DrumBenchmarkClip {
  id: string;
  media: string;
  sha256: string;
  durationMs: number;
  video: { fps: number; width: number; height: number };
  audio: { codec: string; sampleRate: number; channels: number };
  consent: { localOnly: true; license: string; reportMetadataAllowed: boolean };
  annotations: DrumBenchmarkExpectedHit[];
  detectedEvents: string;
  pipeline?: { name: string; version: string; command: string[] };
  pass: Partial<Record<'precision' | 'recall' | 'falseDoubleHits' | 'meanTimingErrorMs' | 'p95TimingErrorMs' | 'zoneAccuracy' | 'handAssignmentAccuracy' | 'detected', number>>;
}

interface MediaProbe {
  durationMs: number;
  video: { codec: string; fps: number; width: number; height: number };
  audio: { codec: string; sampleRate: number; channels: number };
  ffprobeVersion: string;
}

export interface DrumBenchmarkRunOptions {
  reuseDetections?: boolean;
  outputDir?: string;
  probeMedia?: (path: string) => MediaProbe;
  runPipeline?: (command: string[], cwd: string) => void;
  now?: () => Date;
}

export function validateDrumBenchmarkManifest(value: unknown): DrumBenchmarkManifest {
  const manifest = asRecord(value, 'manifest');
  if (manifest.schema !== DRUM_BENCHMARK_MANIFEST_SCHEMA) {
    throw new Error(`Manifest schema must be ${DRUM_BENCHMARK_MANIFEST_SCHEMA}.`);
  }
  if (!Array.isArray(manifest.clips) || manifest.clips.length === 0) {
    throw new Error('Manifest must contain at least one clip.');
  }
  const ids = new Set<string>();
  const clips = manifest.clips.map((entry, index) => validateClip(entry, index));
  for (const clip of clips) {
    if (ids.has(clip.id)) throw new Error(`Duplicate clip id: ${clip.id}.`);
    ids.add(clip.id);
  }
  return {
    schema: DRUM_BENCHMARK_MANIFEST_SCHEMA,
    ...(typeof manifest.outputDir === 'string' ? { outputDir: manifest.outputDir } : {}),
    ...(finitePositive(manifest.toleranceMs) ? { toleranceMs: Number(manifest.toleranceMs) } : {}),
    ...(finitePositive(manifest.minimumSeparationMs) ? { minimumSeparationMs: Number(manifest.minimumSeparationMs) } : {}),
    clips,
  };
}

export function validateDetectedEvents(value: unknown): DrumHitEvent[] {
  const document = asRecord(value, 'detected event document');
  if (document.schema !== DRUM_DETECTED_EVENTS_SCHEMA || !Array.isArray(document.events)) {
    throw new Error(`Detected event file must use ${DRUM_DETECTED_EVENTS_SCHEMA} with an events array.`);
  }
  return document.events.map((entry, index) => {
    const hit = asRecord(entry, `detected event ${index}`);
    for (const field of ['eventId', 'zoneId', 'zoneType']) {
      if (typeof hit[field] !== 'string' || !hit[field]) throw new Error(`Detected event ${index} has invalid ${field}.`);
    }
    for (const field of ['timeNs', 'speed', 'confidence']) {
      if (!Number.isFinite(Number(hit[field]))) throw new Error(`Detected event ${index} has invalid ${field}.`);
    }
    const position = validateVec3(hit.position, `detected event ${index} position`);
    const velocity = validateVec3(hit.velocity, `detected event ${index} velocity`);
    const zoneType = String(hit.zoneType);
    if (!['snare', 'hihat', 'ride', 'crash', 'tom', 'floorTom', 'kick', 'pedal', 'unknown'].includes(zoneType)) {
      throw new Error(`Detected event ${index} has invalid zoneType.`);
    }
    return {
      eventId: String(hit.eventId),
      timeNs: Number(hit.timeNs),
      ...(hit.hand === 'Left' || hit.hand === 'Right' ? { hand: hit.hand } : {}),
      ...(typeof hit.stickId === 'string' ? { stickId: hit.stickId } : {}),
      zoneId: String(hit.zoneId),
      zoneType: zoneType as DrumHitEvent['zoneType'],
      position,
      velocity,
      speed: Number(hit.speed),
      confidence: Number(hit.confidence),
      audioAligned: Boolean(hit.audioAligned),
    };
  });
}

export function expandPipelineCommand(command: readonly string[], values: Record<string, string>): string[] {
  if (!Array.isArray(command) || command.length === 0) throw new Error('Pipeline command must not be empty.');
  return command.map((part) => String(part).replace(/\{(media|detected|manifest|clipId)\}/g, (_match, key) => values[key] ?? ''));
}

export function evaluateDrumPassGates(score: Record<string, unknown>, gates: DrumBenchmarkClip['pass']) {
  const results = Object.entries(gates).map(([metric, threshold]) => {
    const actual = Number(score[metric]);
    const maximumMetric = metric === 'falseDoubleHits' || metric.endsWith('TimingErrorMs') || metric === 'detected';
    return {
      metric,
      expected: `${maximumMetric ? '<=' : '>='} ${threshold}`,
      actual,
      pass: Number.isFinite(actual) && (maximumMetric ? actual <= Number(threshold) : actual >= Number(threshold)),
    };
  });
  return { pass: results.every((result) => result.pass), results };
}

export async function runDrumBenchmark(manifestPath: string, options: DrumBenchmarkRunOptions = {}) {
  const absoluteManifest = resolve(manifestPath);
  const manifestDir = dirname(absoluteManifest);
  const manifest = validateDrumBenchmarkManifest(readJson(absoluteManifest));
  const outputDir = resolve(manifestDir, options.outputDir || manifest.outputDir || 'drum-benchmark-report');
  const probe = options.probeMedia || probeMediaWithFfprobe;
  const execute = options.runPipeline || runPipelineCommand;
  const toleranceMs = manifest.toleranceMs ?? 35;
  const minimumSeparationMs = manifest.minimumSeparationMs ?? 35;
  const clips = [];
  let ffprobeVersion = 'unknown';

  for (const clip of manifest.clips) {
    const mediaPath = resolveManifestPath(manifestDir, clip.media);
    const detectedPath = resolveManifestPath(manifestDir, clip.detectedEvents);
    const hash = sha256File(mediaPath);
    if (hash !== clip.sha256.toLowerCase()) throw new Error(`${clip.id}: media SHA-256 does not match the manifest.`);
    const media = probe(mediaPath);
    if (ffprobeVersion === 'unknown') ffprobeVersion = media.ffprobeVersion;
    verifyMediaMetadata(clip, media);

    if (!options.reuseDetections) {
      if (!clip.pipeline) throw new Error(`${clip.id}: pipeline.command is required unless --reuse-detections is used.`);
      mkdirSync(dirname(detectedPath), { recursive: true });
      const command = expandPipelineCommand(clip.pipeline.command, {
        media: mediaPath,
        detected: detectedPath,
        manifest: absoluteManifest,
        clipId: clip.id,
      });
      execute(command, manifestDir);
    }

    const hits = validateDetectedEvents(readJson(detectedPath));
    const score = scoreDrumBenchmarkEvents(clip.annotations, hits, toleranceMs, minimumSeparationMs);
    const gates = evaluateDrumPassGates(score as unknown as Record<string, unknown>, clip.pass);
    clips.push({
      id: clip.id,
      media: basename(clip.media),
      sha256: hash,
      durationMs: media.durationMs,
      video: media.video,
      audio: media.audio,
      consent: { localOnly: true, license: clip.consent.license, reportMetadataAllowed: true },
      pipeline: clip.pipeline ? { name: clip.pipeline.name, version: clip.pipeline.version } : { name: 'reused detections', version: 'recorded' },
      expectedEvents: clip.annotations.length,
      detectedEvents: hits,
      score,
      gates,
    });
  }

  const report = {
    schema: DRUM_BENCHMARK_REPORT_SCHEMA,
    generatedAt: (options.now?.() || new Date()).toISOString(),
    tool: { node: process.version, runner: 'scripts/drum-benchmark.ts', ffprobe: ffprobeVersion },
    manifest: basename(absoluteManifest),
    toleranceMs,
    minimumSeparationMs,
    pass: clips.every((clip) => clip.gates.pass),
    clips,
  };
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(resolve(outputDir, 'drum-benchmark.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(resolve(outputDir, 'drum-benchmark.md'), formatDrumBenchmarkMarkdown(report));
  return { report, outputDir };
}

export function formatDrumBenchmarkMarkdown(report: any) {
  const lines = [
    '# Drum benchmark report',
    '',
    `- Status: **${report.pass ? 'PASS' : 'FAIL'}**`,
    `- Generated: \`${report.generatedAt}\``,
    `- Manifest: \`${report.manifest}\``,
    `- Node: \`${report.tool.node}\``,
    `- ffprobe: \`${report.tool.ffprobe}\``,
    '',
    '| Clip | Precision | Recall | False doubles | Mean timing | p95 timing | Zone | Hand | Result |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const clip of report.clips) {
    const score = clip.score;
    lines.push(`| ${clip.id} | ${formatRatio(score.precision)} | ${formatRatio(score.recall)} | ${score.falseDoubleHits} | ${formatMs(score.meanTimingErrorMs)} | ${formatMs(score.p95TimingErrorMs)} | ${formatRatio(score.zoneAccuracy)} | ${formatRatio(score.handAssignmentAccuracy)} | ${clip.gates.pass ? 'PASS' : 'FAIL'} |`);
  }
  lines.push('', '## Privacy and provenance', '');
  for (const clip of report.clips) {
    lines.push(`- \`${clip.id}\`: media \`${clip.media}\`, SHA-256 \`${clip.sha256}\`, local-only, license \`${clip.consent.license}\`, pipeline \`${clip.pipeline.name} ${clip.pipeline.version}\`.`);
  }
  lines.push('', 'Raw video/audio is not embedded in this report.', '');
  return lines.join('\n');
}

function validateClip(value: unknown, index: number): DrumBenchmarkClip {
  const clip = asRecord(value, `clip ${index}`);
  const id = String(clip.id || '');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(id)) throw new Error(`Clip ${index} has an invalid id.`);
  for (const field of ['media', 'sha256', 'detectedEvents']) {
    if (typeof clip[field] !== 'string' || !clip[field]) throw new Error(`${id}: ${field} is required.`);
  }
  if (!/^[0-9a-fA-F]{64}$/.test(String(clip.sha256))) throw new Error(`${id}: sha256 must contain 64 hexadecimal characters.`);
  const video = asRecord(clip.video, `${id} video`);
  const audio = asRecord(clip.audio, `${id} audio`);
  const consent = asRecord(clip.consent, `${id} consent`);
  if (consent.localOnly !== true || consent.reportMetadataAllowed !== true || typeof consent.license !== 'string' || !consent.license) {
    throw new Error(`${id}: explicit local-only consent, metadata reporting permission, and license are required.`);
  }
  if (!Array.isArray(clip.annotations)) throw new Error(`${id}: annotations must be an array.`);
  const annotations = clip.annotations.map((entry, annotationIndex) => {
    const annotation = asRecord(entry, `${id} annotation ${annotationIndex}`);
    if (!Number.isFinite(Number(annotation.timeMs)) || typeof annotation.zoneId !== 'string') {
      throw new Error(`${id}: annotation ${annotationIndex} needs timeMs and zoneId.`);
    }
    return {
      timeMs: Number(annotation.timeMs),
      zoneId: annotation.zoneId,
      ...(annotation.hand === 'Left' || annotation.hand === 'Right' ? { hand: annotation.hand } : {}),
    };
  });
  const pass = asRecord(clip.pass, `${id} pass gates`) as DrumBenchmarkClip['pass'];
  if (!Object.keys(pass).length) throw new Error(`${id}: at least one pass gate is required.`);
  if (Object.values(pass).some((value) => !Number.isFinite(Number(value)))) throw new Error(`${id}: pass gates must be finite numbers.`);
  let pipeline: DrumBenchmarkClip['pipeline'];
  if (clip.pipeline !== undefined) {
    const raw = asRecord(clip.pipeline, `${id} pipeline`);
    if (typeof raw.name !== 'string' || typeof raw.version !== 'string' || !Array.isArray(raw.command) || raw.command.some((part) => typeof part !== 'string')) {
      throw new Error(`${id}: pipeline needs name, version, and a string command array.`);
    }
    pipeline = { name: raw.name, version: raw.version, command: raw.command as string[] };
  }
  return {
    id,
    media: String(clip.media),
    sha256: String(clip.sha256).toLowerCase(),
    durationMs: requirePositive(clip.durationMs, `${id} durationMs`),
    video: {
      fps: requirePositive(video.fps, `${id} video.fps`),
      width: requirePositive(video.width, `${id} video.width`),
      height: requirePositive(video.height, `${id} video.height`),
    },
    audio: {
      codec: requireString(audio.codec, `${id} audio.codec`),
      sampleRate: requirePositive(audio.sampleRate, `${id} audio.sampleRate`),
      channels: requirePositive(audio.channels, `${id} audio.channels`),
    },
    consent: { localOnly: true, license: String(consent.license), reportMetadataAllowed: true },
    annotations,
    detectedEvents: String(clip.detectedEvents),
    ...(pipeline ? { pipeline } : {}),
    pass,
  };
}

function probeMediaWithFfprobe(path: string): MediaProbe {
  const raw = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate,sample_rate,channels', '-of', 'json', path], { encoding: 'utf8' });
  const document = JSON.parse(raw);
  const video = document.streams?.find((stream: any) => stream.codec_type === 'video');
  const audio = document.streams?.find((stream: any) => stream.codec_type === 'audio');
  if (!video || !audio) throw new Error(`${basename(path)} must contain both video and audio streams.`);
  const version = execFileSync('ffprobe', ['-version'], { encoding: 'utf8' }).split('\n')[0]?.trim() || 'ffprobe unknown';
  return {
    durationMs: Number(document.format?.duration) * 1000,
    video: { codec: String(video.codec_name), fps: parseRate(video.avg_frame_rate), width: Number(video.width), height: Number(video.height) },
    audio: { codec: String(audio.codec_name), sampleRate: Number(audio.sample_rate), channels: Number(audio.channels) },
    ffprobeVersion: version,
  };
}

function verifyMediaMetadata(clip: DrumBenchmarkClip, actual: MediaProbe) {
  const durationTolerance = Math.max(250, 1000 / clip.video.fps + 25);
  if (Math.abs(actual.durationMs - clip.durationMs) > durationTolerance) throw new Error(`${clip.id}: media duration differs from the manifest.`);
  if (actual.video.width !== clip.video.width || actual.video.height !== clip.video.height || Math.abs(actual.video.fps - clip.video.fps) > 0.1) {
    throw new Error(`${clip.id}: video fps/resolution differs from the manifest.`);
  }
  if (actual.audio.codec !== clip.audio.codec || actual.audio.sampleRate !== clip.audio.sampleRate || actual.audio.channels !== clip.audio.channels) {
    throw new Error(`${clip.id}: audio format differs from the manifest.`);
  }
}

function runPipelineCommand(command: string[], cwd: string) {
  const [executable, ...args] = command;
  if (!executable) throw new Error('Pipeline command is empty.');
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error(`Pipeline failed (${result.status}): ${String(result.stderr || result.stdout).trim()}`);
}

function sha256File(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function resolveManifestPath(root: string, value: string) {
  return isAbsolute(value) ? value : resolve(root, value);
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function parseRate(value: string) {
  const [numerator, denominator] = String(value || '0/1').split('/').map(Number);
  return denominator ? Number(numerator) / denominator : Number(numerator) || 0;
}

function validateVec3(value: unknown, label: string) {
  const vector = asRecord(value, label);
  const out = { x: Number(vector.x), y: Number(vector.y), z: Number(vector.z) };
  if (!Object.values(out).every(Number.isFinite)) throw new Error(`${label} must contain finite x/y/z values.`);
  return out;
}

function asRecord(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as JsonRecord;
}

function finitePositive(value: unknown) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function requirePositive(value: unknown, label: string) {
  if (!finitePositive(value)) throw new Error(`${label} must be a positive number.`);
  return Number(value);
}

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function formatRatio(value: number | null) {
  return value === null ? 'n/a' : Number(value).toFixed(3);
}

function formatMs(value: number | null) {
  return value === null ? 'n/a' : `${Number(value).toFixed(1)} ms`;
}

async function main(argv: string[]) {
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  const manifest = positional[0];
  if (!manifest) throw new Error('Usage: pnpm benchmark:drum -- <manifest.json> [--reuse-detections] [--out=<directory>]');
  const out = argv.find((arg) => arg.startsWith('--out='))?.slice('--out='.length);
  const result = await runDrumBenchmark(manifest, { reuseDetections: argv.includes('--reuse-detections'), ...(out ? { outputDir: out } : {}) });
  process.stdout.write(`${result.report.pass ? 'PASS' : 'FAIL'} ${relative(process.cwd(), result.outputDir)}\n`);
  if (!result.report.pass) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
