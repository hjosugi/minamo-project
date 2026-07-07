import { clamp, distance, length, sub } from './math';
import type { DrumHitEvent, HandState, Vec3 } from './types';

export interface DrumZone {
  id: string;
  type: DrumHitEvent['zoneType'];
  center: Vec3;
  radius: number;
  cooldownMs: number;
}

export interface StickTipSample {
  id: string;
  timeMs: number;
  position: Vec3;
  previousPosition: Vec3;
  hand?: 'Left' | 'Right';
}

export interface AudioOnset {
  timeMs: number;
  strength: number;
  frequencyHz?: number;
}

export interface StickDetection {
  id: string;
  timeMs: number;
  tip: Vec3;
  tail?: Vec3;
  confidence: number;
  hand?: 'Left' | 'Right';
}

export interface StickDetectorAdapter {
  name: string;
  detect(input: HTMLVideoElement | ImageBitmap, timeMs: number): Promise<StickDetection[]>;
}

export interface StickTipTrajectory {
  id: string;
  timeMs: number;
  position: Vec3;
  previousPosition: Vec3;
  velocity: Vec3;
  speed: number;
  downstroke: boolean;
  confidence: number;
  hand?: 'Left' | 'Right';
}

export interface VisualDrumHitCandidate {
  stickId: string;
  zoneId: string;
  zoneType: DrumHitEvent['zoneType'];
  timeMs: number;
  position: Vec3;
  velocity: Vec3;
  speed: number;
  confidence: number;
  hand?: 'Left' | 'Right';
}

export interface DrumBenchmarkResult {
  expected: number;
  detected: number;
  matched: number;
  precision: number;
  recall: number;
  falseDoubleHits: number;
}

export interface DrumDatasetAnnotation {
  schema: 'minamo.drum-dataset.v1';
  frameId: string;
  labels: Array<{
    kind: 'stick' | 'drumZone' | 'hit';
    id: string;
    points: Vec3[];
    zoneType?: DrumHitEvent['zoneType'];
    hand?: 'Left' | 'Right';
    timeMs?: number;
  }>;
  consent: {
    localOnly: boolean;
    license: string;
  };
}

export class DrumHitDetector {
  private readonly lastHitMs = new Map<string, number>();

  constructor(private readonly zones: DrumZone[]) {}

  detect(sample: StickTipSample): DrumHitEvent[] {
    const hits: DrumHitEvent[] = [];
    const velocity = sub(sample.position, sample.previousPosition);
    const speed = length(velocity);
    const downstroke = velocity.y > 0.015;

    for (const zone of this.zones) {
      const dist = distance(sample.position, zone.center);
      const last = this.lastHitMs.get(zone.id) ?? -Infinity;
      const cooledDown = sample.timeMs - last >= zone.cooldownMs;
      if (dist <= zone.radius && downstroke && speed > 0.02 && cooledDown) {
        this.lastHitMs.set(zone.id, sample.timeMs);
        const hit: DrumHitEvent = {
          eventId: `${sample.id}:${zone.id}:${Math.round(sample.timeMs)}`,
          timeNs: Math.round(sample.timeMs * 1_000_000),
          stickId: sample.id,
          zoneId: zone.id,
          zoneType: zone.type,
          position: sample.position,
          velocity,
          speed,
          confidence: Math.min(1, 0.5 + speed * 10),
          audioAligned: false,
        };
        if (sample.hand) hit.hand = sample.hand;
        hits.push(hit);
      }
    }
    return hits;
  }
}

export function estimateStickTipTrajectory(
  current: StickDetection,
  previous: StickDetection | undefined,
): StickTipTrajectory {
  const previousPosition = previous?.tip ?? current.tip;
  const dtSec = previous ? Math.max(0, (current.timeMs - previous.timeMs) / 1000) : 0;
  const velocity = estimateHitVelocity(current.tip, previousPosition, dtSec);
  const speed = length(velocity);
  const out: StickTipTrajectory = {
    id: current.id,
    timeMs: current.timeMs,
    position: current.tip,
    previousPosition,
    velocity,
    speed,
    downstroke: velocity.y > 0.5,
    confidence: current.confidence,
  };
  if (current.hand) out.hand = current.hand;
  return out;
}

export function detectVisualDrumHitCandidates(
  trajectory: StickTipTrajectory,
  zones: readonly DrumZone[],
): VisualDrumHitCandidate[] {
  if (!trajectory.downstroke || trajectory.speed < 0.45 || trajectory.confidence < 0.35) return [];
  const candidates: VisualDrumHitCandidate[] = [];
  for (const zone of zones) {
    const dist = distance(trajectory.position, zone.center);
    if (dist > zone.radius) continue;
    const confidence = clamp(trajectory.confidence * 0.55 + (1 - dist / zone.radius) * 0.25 + Math.min(trajectory.speed / 4, 1) * 0.2, 0, 1);
    const candidate: VisualDrumHitCandidate = {
      stickId: trajectory.id,
      zoneId: zone.id,
      zoneType: zone.type,
      timeMs: trajectory.timeMs,
      position: trajectory.position,
      velocity: trajectory.velocity,
      speed: trajectory.speed,
      confidence,
    };
    if (trajectory.hand) candidate.hand = trajectory.hand;
    candidates.push(candidate);
  }
  return candidates.sort((a, b) => b.confidence - a.confidence);
}

export function candidateToDrumHit(candidate: VisualDrumHitCandidate): DrumHitEvent {
  const hit: DrumHitEvent = {
    eventId: `${candidate.stickId}:${candidate.zoneId}:${Math.round(candidate.timeMs)}`,
    timeNs: Math.round(candidate.timeMs * 1_000_000),
    stickId: candidate.stickId,
    zoneId: candidate.zoneId,
    zoneType: candidate.zoneType,
    position: candidate.position,
    velocity: candidate.velocity,
    speed: candidate.speed,
    confidence: candidate.confidence,
    audioAligned: false,
  };
  if (candidate.hand) hit.hand = candidate.hand;
  return hit;
}

export function estimateHitVelocity(current: Vec3, previous: Vec3, dtSec: number): Vec3 {
  if (dtSec <= 0) return { x: 0, y: 0, z: 0 };
  return {
    x: (current.x - previous.x) / dtSec,
    y: (current.y - previous.y) / dtSec,
    z: (current.z - previous.z) / dtSec,
  };
}

export function assignHitHand(hit: DrumHitEvent, hands: readonly HandState[]): DrumHitEvent {
  if (hit.hand || !hands.length) return hit;
  const nearest = hands
    .map((hand) => ({
      hand,
      distance: distance(hit.position, hand.fingers.index.tip.position),
    }))
    .sort((a, b) => a.distance - b.distance)[0];
  if (!nearest || nearest.distance > 0.25) return hit;
  return { ...hit, hand: nearest.hand.handedness };
}

export function fuseVisualHitWithAudio(hit: DrumHitEvent, onsets: AudioOnset[], windowMs = 35): DrumHitEvent {
  const nearest = onsets
    .filter((onset) => Math.abs(onset.timeMs - hit.timeNs / 1_000_000) <= windowMs)
    .sort((a, b) => Math.abs(a.timeMs - hit.timeNs / 1_000_000) - Math.abs(b.timeMs - hit.timeNs / 1_000_000))[0];
  if (!nearest) return hit;
  return {
    ...hit,
    timeNs: Math.round(nearest.timeMs * 1_000_000),
    confidence: Math.min(1, hit.confidence + nearest.strength * 0.25),
    audioAligned: true,
  };
}

export function inferHiHatPedalState(onsets: readonly AudioOnset[], timeMs: number, windowMs = 80): number {
  const nearby = strongestOnset(onsets, timeMs, windowMs, (onset) => onset.frequencyHz === undefined || onset.frequencyHz > 1800);
  return nearby ? clamp(nearby.strength, 0, 1) : 0;
}

export function inferKickPedalHit(onsets: readonly AudioOnset[], timeMs: number, windowMs = 55): DrumHitEvent | null {
  const onset = strongestOnset(onsets, timeMs, windowMs, (candidate) => candidate.frequencyHz === undefined || candidate.frequencyHz < 160);
  if (!onset) return null;
  return {
    eventId: `pedal:kick:${Math.round(onset.timeMs)}`,
    timeNs: Math.round(onset.timeMs * 1_000_000),
    zoneId: 'kick',
    zoneType: 'kick',
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    speed: 0,
    confidence: clamp(0.55 + onset.strength * 0.4, 0, 1),
    audioAligned: true,
  };
}

export function scoreDrumBenchmark(
  expectedHitTimesMs: readonly number[],
  detectedHits: readonly DrumHitEvent[],
  toleranceMs = 35,
  minimumSeparationMs = 35,
): DrumBenchmarkResult {
  const unmatched = [...detectedHits].sort((a, b) => a.timeNs - b.timeNs);
  let matched = 0;
  for (const expected of expectedHitTimesMs) {
    const index = unmatched.findIndex((hit) => Math.abs(hit.timeNs / 1_000_000 - expected) <= toleranceMs);
    if (index >= 0) {
      matched++;
      unmatched.splice(index, 1);
    }
  }
  let falseDoubleHits = 0;
  const sorted = [...detectedHits].sort((a, b) => a.timeNs - b.timeNs);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const current = sorted[i];
    if (!prev || !current) continue;
    if (current.zoneId === prev.zoneId && (current.timeNs - prev.timeNs) / 1_000_000 < minimumSeparationMs) {
      falseDoubleHits++;
    }
  }
  return {
    expected: expectedHitTimesMs.length,
    detected: detectedHits.length,
    matched,
    precision: detectedHits.length ? matched / detectedHits.length : 1,
    recall: expectedHitTimesMs.length ? matched / expectedHitTimesMs.length : 1,
    falseDoubleHits,
  };
}

export function createDrumDatasetAnnotation(
  frameId: string,
  labels: DrumDatasetAnnotation['labels'],
  license = '0BSD',
): DrumDatasetAnnotation {
  return {
    schema: 'minamo.drum-dataset.v1',
    frameId,
    labels,
    consent: {
      localOnly: true,
      license,
    },
  };
}

function strongestOnset(
  onsets: readonly AudioOnset[],
  timeMs: number,
  windowMs: number,
  predicate: (onset: AudioOnset) => boolean,
): AudioOnset | undefined {
  return onsets
    .filter((onset) => predicate(onset) && Math.abs(onset.timeMs - timeMs) <= windowMs)
    .sort((a, b) => b.strength - a.strength)[0];
}
