// Drum hit detection.
//
// Canonical conventions (issue #254) — both the single-sample DrumHitDetector
// and the trajectory path obey these; do not mix definitions:
//   * Coordinate space: MediaPipe image / normalized coordinates where +Y points
//     DOWN. A downstroke (a stick descending toward a drum head) therefore has a
//     POSITIVE velocity.y. Callers must feed positions in this space and must NOT
//     pre-flip Y into KGM1 space (where +Y is up).
//   * Velocity: metres per second — a position delta divided by the elapsed time
//     in seconds (see estimateHitVelocity). Raw per-frame deltas are never used
//     for thresholds, so behaviour is frame-rate independent.
// The shared thresholds below are the single source of truth for "is this a
// downstroke" and "is the stick moving fast enough to count as a hit".
import { clamp, distance, length } from './math';
import type { DrumHitEvent, HandState, Vec3 } from './types';

// Minimum downward velocity (m/s, +Y points down) for a motion to count as a
// downstroke.
export const DRUM_DOWNSTROKE_MIN_SPEED_MPS = 0.5;
// Minimum overall stick speed (m/s) required to register a hit.
export const DRUM_MIN_HIT_SPEED_MPS = 0.45;
// Rebound re-arm (#123). A stick physically cannot strike twice without lifting
// between strokes, so a zone re-arms on the lift instead of waiting out
// `cooldownMs`. Metres, +Y down: the tip must rise this far above the y at which
// the previous hit fired. Threshold detail: a resting stick jitters well under a
// centimetre, while a real stroke lifts several, so this separates a double
// stroke from a threshold oscillation without capping the roll rate.
//
// The time-based cooldown remains as a fallback for when no lift is observed
// (a dropped detection, a stick tracked through occlusion), which is what
// backlog 061 added it for. Without the lift path, `cooldownMs` alone caps a
// single zone at 1000/cooldownMs hits per second — 22 at 45 ms — and a
// double-stroke or buzz roll exceeds that.
export const DRUM_REARM_MIN_LIFT_M = 0.012;

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
  // Timestamp of `previousPosition`, so velocity can be computed in m/s rather
  // than as a frame-rate-dependent per-frame delta (#254).
  previousTimeMs: number;
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
  meanTimingErrorMs: number | null;
  p95TimingErrorMs: number | null;
  zoneAccuracy: number | null;
  handAssignmentAccuracy: number | null;
  /**
   * Smallest gap between two detections on the same zone, or null when a zone
   * never fires twice. Informational rather than a gate: it is what shows a
   * roll clip actually reached the rate it claims to stress (#123). A clip
   * whose minimum separation never drops below `minimumSeparationMs` has not
   * exercised the roll path at all.
   */
  minDetectedSeparationMs: number | null;
}

export interface DrumBenchmarkExpectedHit {
  timeMs: number;
  zoneId?: string;
  hand?: 'Left' | 'Right';
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

interface ZoneHitState {
  lastHitMs: number;
  /** Tip y at which the last hit fired; the rebound is measured against it. */
  lastHitY: number;
  /** False until the tip lifts clear of `lastHitY` (or the cooldown expires). */
  armed: boolean;
}

export class DrumHitDetector {
  private readonly zoneState = new Map<string, ZoneHitState>();

  constructor(private readonly zones: DrumZone[]) {}

  detect(sample: StickTipSample): DrumHitEvent[] {
    const hits: DrumHitEvent[] = [];
    const dtSec = Math.max(0, (sample.timeMs - sample.previousTimeMs) / 1000);
    const velocity = estimateHitVelocity(sample.position, sample.previousPosition, dtSec);
    const speed = length(velocity);
    const downstroke = velocity.y > DRUM_DOWNSTROKE_MIN_SPEED_MPS;

    for (const zone of this.zones) {
      const state = this.zoneState.get(zone.id);
      // +Y is down, so a lifted tip has a SMALLER y than where the hit fired.
      if (state && !state.armed && sample.position.y <= state.lastHitY - DRUM_REARM_MIN_LIFT_M) {
        state.armed = true;
      }
      const dist = distance(sample.position, zone.center);
      const last = state?.lastHitMs ?? -Infinity;
      const cooledDown = sample.timeMs - last >= zone.cooldownMs;
      const ready = state ? state.armed || cooledDown : true;
      if (dist <= zone.radius && downstroke && speed >= DRUM_MIN_HIT_SPEED_MPS && ready) {
        this.zoneState.set(zone.id, { lastHitMs: sample.timeMs, lastHitY: sample.position.y, armed: false });
        const hit: DrumHitEvent = {
          eventId: `${sample.id}:${zone.id}:${Math.round(sample.timeMs)}`,
          timeNs: Math.round(sample.timeMs * 1_000_000),
          stickId: sample.id,
          zoneId: zone.id,
          zoneType: zone.type,
          position: sample.position,
          velocity,
          speed,
          confidence: clamp(0.5 + Math.min(speed / 4, 1) * 0.5, 0, 1),
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
    downstroke: velocity.y > DRUM_DOWNSTROKE_MIN_SPEED_MPS,
    confidence: current.confidence,
  };
  if (current.hand) out.hand = current.hand;
  return out;
}

export function detectVisualDrumHitCandidates(
  trajectory: StickTipTrajectory,
  zones: readonly DrumZone[],
): VisualDrumHitCandidate[] {
  if (!trajectory.downstroke || trajectory.speed < DRUM_MIN_HIT_SPEED_MPS || trajectory.confidence < 0.35) return [];
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
  return scoreDrumBenchmarkEvents(
    expectedHitTimesMs.map((timeMs) => ({ timeMs })),
    detectedHits,
    toleranceMs,
    minimumSeparationMs,
  );
}

export function scoreDrumBenchmarkEvents(
  expectedHits: readonly DrumBenchmarkExpectedHit[],
  detectedHits: readonly DrumHitEvent[],
  toleranceMs = 35,
  minimumSeparationMs = 35,
): DrumBenchmarkResult {
  const unmatched = [...detectedHits].sort((a, b) => a.timeNs - b.timeNs);
  const matches: Array<{ expected: DrumBenchmarkExpectedHit; detected: DrumHitEvent; errorMs: number }> = [];
  for (const expected of expectedHits) {
    let index = -1;
    let closest = Infinity;
    for (let candidateIndex = 0; candidateIndex < unmatched.length; candidateIndex++) {
      const candidate = unmatched[candidateIndex];
      if (!candidate) continue;
      const error = Math.abs(candidate.timeNs / 1_000_000 - expected.timeMs);
      if (error <= toleranceMs && error < closest) {
        closest = error;
        index = candidateIndex;
      }
    }
    if (index >= 0) {
      const [detected] = unmatched.splice(index, 1);
      if (detected) matches.push({ expected, detected, errorMs: closest });
    }
  }
  // A pair of detections closer than `minimumSeparationMs` is only a false
  // double when it is not backed by two distinct expected hits (#123). A real
  // roll legitimately puts strokes closer together than the separation window —
  // 32nd notes at 220 bpm are 34.1 ms apart — and counting those as
  // double-triggers made the fast-roll gate unreachable by construction rather
  // than by detector accuracy.
  const matchedDetections = new Set<DrumHitEvent>(matches.map((match) => match.detected));
  let falseDoubleHits = 0;
  let minDetectedSeparationMs: number | null = null;
  const sorted = [...detectedHits].sort((a, b) => a.timeNs - b.timeNs);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const current = sorted[i];
    if (!prev || !current) continue;
    if (current.zoneId !== prev.zoneId) continue;
    const gapMs = (current.timeNs - prev.timeNs) / 1_000_000;
    if (minDetectedSeparationMs === null || gapMs < minDetectedSeparationMs) minDetectedSeparationMs = gapMs;
    if (gapMs >= minimumSeparationMs) continue;
    if (matchedDetections.has(prev) && matchedDetections.has(current)) continue;
    falseDoubleHits++;
  }
  const timingErrors = matches.map((match) => match.errorMs).sort((a, b) => a - b);
  const zoneMatches = matches.filter((match) => match.expected.zoneId !== undefined);
  const handMatches = matches.filter((match) => match.expected.hand !== undefined);
  const matched = matches.length;
  return {
    expected: expectedHits.length,
    detected: detectedHits.length,
    matched,
    precision: detectedHits.length ? matched / detectedHits.length : 1,
    recall: expectedHits.length ? matched / expectedHits.length : 1,
    falseDoubleHits,
    meanTimingErrorMs: timingErrors.length
      ? timingErrors.reduce((sum, value) => sum + value, 0) / timingErrors.length
      : null,
    p95TimingErrorMs: timingErrors.length
      ? timingErrors[Math.min(timingErrors.length - 1, Math.ceil(timingErrors.length * 0.95) - 1)] ?? null
      : null,
    zoneAccuracy: zoneMatches.length
      ? zoneMatches.filter((match) => match.detected.zoneId === match.expected.zoneId).length / zoneMatches.length
      : null,
    handAssignmentAccuracy: handMatches.length
      ? handMatches.filter((match) => match.detected.hand === match.expected.hand).length / handMatches.length
      : null,
    minDetectedSeparationMs,
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
