// Calibrated two-camera drum fusion prototype (#241, follow-up to research #183).
//
// Research #183 kept multi-camera fusion out of MVP and handed the prototype
// gate to #241 with one explicit warning: a prototype "must measure reprojection
// error and reject stale/missing calibration instead of combining incompatible
// coordinates". Everything here exists to make that rejection mechanical rather
// than a matter of discipline.
//
// #183 also fixed the shape: "Cameras are independent tracker instances
// publishing stick/zone candidates. A fusion stage aligns candidates by the
// shared clock and stage frame, then runs the same hit fusion/cooldown as
// today." That is two layers, and they have different depth rules:
//
//   * Trajectory layer (`fuseCameraObservations`) — per-frame stick tips
//     triangulated from TWO views. One view is rejected, never guessed: a single
//     ray leaves depth free, and a fabricated depth would feed DrumHitDetector a
//     velocity that no camera measured.
//   * Candidate layer (`fuseCameraHitCandidates`) — each camera runs its own
//     detector and publishes hits; fusion aligns, corroborates and de-duplicates
//     them. Here a single view is enough, because a hit means the tip is at the
//     drum head, and the calibrated head plane supplies the missing depth. The
//     constraint is valid at exactly the instant it is used, which is why the
//     same shortcut is refused one layer up.
//
// Canonical conventions — these match src/core/drum.ts so a fused sample can be
// fed straight into DrumHitDetector without a conversion step:
//   * Stage frame: metres, +Y points DOWN, shared by every camera and by the
//     calibrated DrumZone geometry. A downstroke has a POSITIVE velocity.y.
//   * Camera frame: +X right, +Y down, +Z forward (into the scene). A point
//     behind the camera has z <= 0 and is never projected.
//   * Image coordinates: normalized [0,1] over the frame, MediaPipe style, so a
//     tracker can pass landmarks through unchanged.
//
// The single-camera path is untouched. Fusion is additive: when the second
// camera goes away, both entry points report the degradation and keep working
// from whatever remains, so the default pipeline is never held hostage to a
// second device.
import { clamp, cross, distance, dot, finiteVec3, length, normalize, scale, sub } from './math';
import type { DrumZone, StickTipSample } from './drum';
import type { DrumHitEvent, Handedness, Vec2, Vec3 } from './types';

/**
 * Maximum mean reprojection error, in pixels, for a camera's extrinsics to be
 * usable. Three pixels at 1280x720 is well under the angular size of the
 * smallest kit zone at a typical 1.5 m working distance, so an accepted
 * calibration cannot move a hit into a neighbouring zone on its own.
 */
export const MULTICAM_MAX_REPROJECTION_ERROR_PX = 3;
/**
 * Minimum checkpoints required before a calibration can be accepted. A rigid
 * transform has six degrees of freedom; validating it against fewer than four
 * non-degenerate points can pass while the transform is badly wrong.
 */
export const MULTICAM_MIN_CALIBRATION_CHECKPOINTS = 4;
/**
 * Maximum gap, in metres, between the two back-projected rays at their closest
 * approach. Above this the cameras disagree about where the tip is by more than
 * a fraction of a drum zone (the smallest are ~0.07 m radius), so the midpoint
 * is not trustworthy enough to attribute to a zone.
 */
export const MULTICAM_MAX_RAY_GAP_M = 0.03;
/**
 * Maximum residual, in milliseconds, around the fitted clock model. This is what
 * survives correction and lands directly in hit timing error; the drum benchmark
 * matches within 35 ms, so 8 ms — under half a 60 fps frame — keeps sync well
 * inside the tolerance it has to share with detection error.
 */
export const MULTICAM_MAX_SYNC_RESIDUAL_MS = 8;
/**
 * Maximum clock drift, in milliseconds per minute. The fitted model corrects
 * drift, but only over the span it was measured on: at 5 ms/min a three-minute
 * run accumulates 15 ms of extrapolation error, which still fits inside the
 * 35 ms tolerance. Faster than that and a run that starts synced ends unmatched.
 */
export const MULTICAM_MAX_DRIFT_MS_PER_MIN = 5;
/**
 * Oldest observation, in milliseconds, that may still be fused. At 120 ms a
 * stick tip in a roll has travelled most of a stroke, so pairing it with a fresh
 * view from the other camera would place the tip somewhere it never was.
 */
export const MULTICAM_MAX_SAMPLE_AGE_MS = 120;
/**
 * Half a 60 fps frame. Two views taken further apart than this are treated as
 * separate instants rather than as one stereo pair.
 */
export const MULTICAM_PAIR_WINDOW_MS = 8;
/**
 * Window within which two cameras' hit candidates on the same zone are treated
 * as one stroke. It sits under the drum benchmark's 35 ms matching tolerance, so
 * corroboration merges what the scorer would otherwise see as a double trigger,
 * while genuinely distinct strokes stay separate — 32nd notes at 220 bpm are
 * 34 ms apart, so the window must not reach that.
 */
export const MULTICAM_HIT_MERGE_WINDOW_MS = 25;
/** Below this an observation or candidate is too weak to contribute a view. */
export const MULTICAM_MIN_OBSERVATION_CONFIDENCE = 0.35;

export const STAGE_CALIBRATION_SCHEMA = 'minamo.stage-calibration.v1';

/** Pinhole intrinsics in pixels, plus the frame size the pixels refer to. */
export interface CameraIntrinsics {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  width: number;
  height: number;
}

/**
 * Rigid stage -> camera transform. `rotation` is row-major 3x3 and orthonormal;
 * `translation` is in metres, applied after the rotation.
 */
export interface CameraExtrinsics {
  rotation: readonly number[];
  translation: Vec3;
}

export interface CameraCalibration {
  schema: typeof STAGE_CALIBRATION_SCHEMA;
  cameraId: string;
  /** Cameras with different stage frames are never fused with each other. */
  stageFrameId: string;
  capturedAtMs: number;
  intrinsics: CameraIntrinsics;
  extrinsics: CameraExtrinsics;
}

/** A stage point with the image point it is known to land on, in one camera. */
export interface CalibrationCheckpoint {
  stage: Vec3;
  image: Vec2;
}

export interface CalibrationQuality {
  cameraId: string;
  checkpoints: number;
  meanReprojectionErrorPx: number | null;
  maxReprojectionErrorPx: number | null;
  accepted: boolean;
  rejectionReason?: string;
}

export interface CaptureTimestampPair {
  /** Capture time on the reference camera's clock. */
  primaryMs: number;
  /** Capture time of the same physical event on the second camera's clock. */
  secondaryMs: number;
}

export interface TimestampAlignment {
  samples: number;
  /** Constant skew at the start of the calibration span, in milliseconds. */
  offsetMs: number;
  driftMsPerMinute: number;
  maxResidualMs: number;
  /** Reference time the fitted model is anchored to. */
  originMs: number;
  accepted: boolean;
  rejectionReason?: string;
}

export interface CameraObservation {
  cameraId: string;
  /**
   * Identity shared across cameras, not a per-tracker detector id. Two camera
   * instances number their sticks independently, so the caller must key on
   * something both agree on — the handedness assignment is the usual choice.
   */
  stickId: string;
  /** Capture time on the observing camera's own clock. */
  timeMs: number;
  /** Normalized [0,1] image position of the stick tip. */
  image: Vec2;
  confidence: number;
  hand?: Handedness;
}

/**
 * A hit published by one camera's own detector. `velocity`/`speed` are in the
 * stage frame: at the hit instant the tip is at the head plane, so a single
 * calibrated camera can resolve them there. See the module header for why the
 * same assumption is refused for per-frame trajectories.
 */
export interface CameraHitCandidate {
  cameraId: string;
  stickId?: string;
  /** Capture time on the observing camera's own clock. */
  timeMs: number;
  zoneId: string;
  zoneType: DrumHitEvent['zoneType'];
  /** Normalized [0,1] image position of the tip at the hit instant. */
  image: Vec2;
  velocity: Vec3;
  speed: number;
  confidence: number;
  hand?: Handedness;
}

export interface CalibratedCamera {
  calibration: CameraCalibration;
  quality: CalibrationQuality;
  /**
   * Omitted for the clock reference camera. Any other camera must supply an
   * accepted alignment; an unaligned second clock is rejected rather than
   * assumed to be close enough.
   */
  clockAlignment?: TimestampAlignment;
}

export type FusionRejectionReason =
  | 'uncalibrated'
  | 'stageFrameMismatch'
  | 'clockUnaligned'
  | 'nonFinite'
  | 'lowConfidence'
  | 'stale'
  | 'behindCamera'
  | 'singleView'
  | 'parallelRays'
  | 'rayGap'
  | 'duplicate'
  | 'noZoneIntersection';

export interface FusionRejection {
  cameraId: string;
  stickId: string;
  timeMs: number;
  reason: FusionRejectionReason;
}

export interface FusedStickSample {
  stickId: string;
  /** Stage clock, milliseconds — the mean of the contributing capture times. */
  timeMs: number;
  /** Stage frame, metres, +Y down. Ready for DrumHitDetector. */
  position: Vec3;
  confidence: number;
  /** Camera ids that contributed, highest confidence first. */
  sources: string[];
  /** Closest approach of the two rays. */
  rayGapM: number;
  hand?: Handedness;
}

export interface FusionReport {
  fused: FusedStickSample[];
  rejected: FusionRejection[];
  /**
   * True when fewer than two cameras were usable for the whole call. The caller
   * uses this to stay on — or fall back to — the single-camera pipeline.
   */
  degradedToSingleCamera: boolean;
  usableCameras: string[];
}

export interface FusionOptions {
  /** Stage clock time used for the staleness check. Defaults to the newest observation. */
  nowMs?: number;
  maxAgeMs?: number;
  pairWindowMs?: number;
  maxRayGapM?: number;
  minConfidence?: number;
}

export interface FusedDrumHit {
  event: DrumHitEvent;
  /** Camera ids that reported this stroke, highest confidence first. */
  sources: string[];
  /** True when two or more cameras independently reported the stroke. */
  corroborated: boolean;
  /** Ray disagreement when triangulated; null for a single-camera stroke. */
  rayGapM: number | null;
  /** True when the stage position came from the head-plane constraint. */
  planeConstrained: boolean;
}

export interface CandidateFusionReport {
  hits: FusedDrumHit[];
  rejected: FusionRejection[];
  degradedToSingleCamera: boolean;
  usableCameras: string[];
}

export interface CandidateFusionOptions {
  nowMs?: number;
  maxAgeMs?: number;
  mergeWindowMs?: number;
  maxRayGapM?: number;
  minConfidence?: number;
  /**
   * Calibrated kit geometry in the stage frame. Required: it is what resolves
   * depth for a stroke only one camera saw.
   */
  zones: readonly DrumZone[];
}

/**
 * Build extrinsics for a camera at `eye` looking at `target`. `up` is the stage
 * up direction, which is -Y because the stage frame is Y-down.
 */
export function cameraLookAt(eye: Vec3, target: Vec3, up: Vec3 = { x: 0, y: -1, z: 0 }): CameraExtrinsics | null {
  if (!finiteVec3(eye) || !finiteVec3(target) || !finiteVec3(up)) return null;
  const forward = normalize(sub(target, eye));
  if (length(forward) < 0.5) return null;
  const down = normalize(scale(up, -1));
  const right = normalize(cross(down, forward));
  // Looking straight along the stage up axis leaves `right` undefined.
  if (length(right) < 0.5) return null;
  const cameraDown = cross(forward, right);
  const rotation = [
    right.x, right.y, right.z,
    cameraDown.x, cameraDown.y, cameraDown.z,
    forward.x, forward.y, forward.z,
  ];
  return { rotation, translation: scale(applyRotation(rotation, eye), -1) };
}

/** Stage point -> camera-frame point. */
export function stageToCamera(calibration: CameraCalibration, stage: Vec3): Vec3 {
  const { rotation, translation } = calibration.extrinsics;
  const rotated = applyRotation(rotation, stage);
  return { x: rotated.x + translation.x, y: rotated.y + translation.y, z: rotated.z + translation.z };
}

/**
 * Project a stage point into normalized image coordinates, or null when the
 * point is behind the camera.
 */
export function projectStagePoint(calibration: CameraCalibration, stage: Vec3): Vec2 | null {
  if (!finiteVec3(stage)) return null;
  const camera = stageToCamera(calibration, stage);
  if (!finiteVec3(camera) || camera.z <= 1e-6) return null;
  const { fx, fy, cx, cy, width, height } = calibration.intrinsics;
  const u = (fx * camera.x) / camera.z + cx;
  const v = (fy * camera.y) / camera.z + cy;
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
  return { x: u / width, y: v / height };
}

export interface CameraRay {
  origin: Vec3;
  direction: Vec3;
}

/** Normalized image point -> a unit ray in the stage frame. */
export function backProjectImagePoint(calibration: CameraCalibration, image: Vec2): CameraRay | null {
  if (!Number.isFinite(image.x) || !Number.isFinite(image.y)) return null;
  const { fx, fy, cx, cy, width, height } = calibration.intrinsics;
  if (!(fx > 0) || !(fy > 0) || !(width > 0) || !(height > 0)) return null;
  const cameraDirection = {
    x: (image.x * width - cx) / fx,
    y: (image.y * height - cy) / fy,
    z: 1,
  };
  const rotation = calibration.extrinsics.rotation;
  const direction = normalize(applyRotationTranspose(rotation, cameraDirection));
  const origin = scale(applyRotationTranspose(rotation, calibration.extrinsics.translation), -1);
  if (!finiteVec3(direction) || !finiteVec3(origin) || length(direction) < 0.5) return null;
  return { origin, direction };
}

/**
 * Score a camera's extrinsics against known stage/image correspondences. This is
 * a validation pass, not a solver: the transform is given, and the question is
 * whether it is good enough to fuse with.
 */
export function evaluateCalibration(
  calibration: CameraCalibration,
  checkpoints: readonly CalibrationCheckpoint[],
  maxErrorPx = MULTICAM_MAX_REPROJECTION_ERROR_PX,
): CalibrationQuality {
  const base = { cameraId: calibration.cameraId, checkpoints: checkpoints.length };
  const reject = (rejectionReason: string): CalibrationQuality => ({
    ...base,
    meanReprojectionErrorPx: null,
    maxReprojectionErrorPx: null,
    accepted: false,
    rejectionReason,
  });
  if (calibration.schema !== STAGE_CALIBRATION_SCHEMA) return reject('unknown calibration schema');
  if (!isOrthonormalRotation(calibration.extrinsics.rotation)) return reject('extrinsic rotation is not orthonormal');
  if (checkpoints.length < MULTICAM_MIN_CALIBRATION_CHECKPOINTS) {
    return reject(`needs at least ${MULTICAM_MIN_CALIBRATION_CHECKPOINTS} checkpoints`);
  }
  const { width, height } = calibration.intrinsics;
  let sum = 0;
  let worst = 0;
  for (const checkpoint of checkpoints) {
    const projected = projectStagePoint(calibration, checkpoint.stage);
    if (!projected) return reject('checkpoint does not project in front of the camera');
    const errorPx = Math.hypot(
      (projected.x - checkpoint.image.x) * width,
      (projected.y - checkpoint.image.y) * height,
    );
    if (!Number.isFinite(errorPx)) return reject('checkpoint reprojection is not finite');
    sum += errorPx;
    worst = Math.max(worst, errorPx);
  }
  const mean = sum / checkpoints.length;
  const accepted = mean <= maxErrorPx;
  const quality: CalibrationQuality = {
    ...base,
    meanReprojectionErrorPx: mean,
    maxReprojectionErrorPx: worst,
    accepted,
  };
  if (!accepted) quality.rejectionReason = `mean reprojection error ${mean.toFixed(2)} px exceeds ${maxErrorPx} px`;
  return quality;
}

/**
 * Fit a linear clock model of the second camera against the reference camera and
 * report the skew and drift #241 asks to be recorded. The fit is least squares
 * over paired capture times of the same physical events (a shared audio onset or
 * a visible flash).
 */
export function measureCaptureTimestampAlignment(
  pairs: readonly CaptureTimestampPair[],
  limits: { maxResidualMs?: number; maxDriftMsPerMinute?: number } = {},
): TimestampAlignment {
  const maxResidualMs = limits.maxResidualMs ?? MULTICAM_MAX_SYNC_RESIDUAL_MS;
  const maxDriftMsPerMinute = limits.maxDriftMsPerMinute ?? MULTICAM_MAX_DRIFT_MS_PER_MIN;
  const usable = pairs.filter((pair) => Number.isFinite(pair.primaryMs) && Number.isFinite(pair.secondaryMs));
  const empty: TimestampAlignment = {
    samples: usable.length,
    offsetMs: 0,
    driftMsPerMinute: 0,
    maxResidualMs: 0,
    originMs: usable[0]?.primaryMs ?? 0,
    accepted: false,
  };
  // Three points is the minimum that can distinguish drift from two noisy
  // samples of a constant offset.
  if (usable.length < 3) return { ...empty, rejectionReason: 'needs at least 3 synchronization events' };

  const originMs = Math.min(...usable.map((pair) => pair.primaryMs));
  const xs = usable.map((pair) => pair.primaryMs - originMs);
  const ys = usable.map((pair) => pair.secondaryMs - pair.primaryMs);
  const n = usable.length;
  const meanX = xs.reduce((sum, value) => sum + value, 0) / n;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / n;
  let covariance = 0;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] ?? 0) - meanX;
    covariance += dx * ((ys[i] ?? 0) - meanY);
    variance += dx * dx;
  }
  // All events at one instant: solvable for offset, not for drift.
  if (variance <= 1e-9) {
    return {
      samples: n,
      offsetMs: meanY,
      driftMsPerMinute: 0,
      maxResidualMs: Math.max(...ys.map((y) => Math.abs(y - meanY))),
      originMs,
      accepted: false,
      rejectionReason: 'synchronization events do not span enough time to estimate drift',
    };
  }
  const slope = covariance / variance;
  const intercept = meanY - slope * meanX;
  let worstResidual = 0;
  for (let i = 0; i < n; i++) {
    worstResidual = Math.max(worstResidual, Math.abs((ys[i] ?? 0) - (intercept + slope * (xs[i] ?? 0))));
  }
  const driftMsPerMinute = slope * 60_000;
  const alignment: TimestampAlignment = {
    samples: n,
    offsetMs: intercept,
    driftMsPerMinute,
    maxResidualMs: worstResidual,
    originMs,
    accepted: worstResidual <= maxResidualMs && Math.abs(driftMsPerMinute) <= maxDriftMsPerMinute,
  };
  if (!alignment.accepted) {
    alignment.rejectionReason = worstResidual > maxResidualMs
      ? `sync residual ${worstResidual.toFixed(2)} ms exceeds ${maxResidualMs} ms`
      : `clock drift ${driftMsPerMinute.toFixed(2)} ms/min exceeds ${maxDriftMsPerMinute} ms/min`;
  }
  return alignment;
}

/** Map a second-camera capture time onto the reference camera's clock. */
export function applyClockAlignment(secondaryMs: number, alignment: TimestampAlignment): number {
  if (!Number.isFinite(secondaryMs)) return Number.NaN;
  const slope = alignment.driftMsPerMinute / 60_000;
  // secondary = primary + offset + slope * (primary - origin), inverted for primary.
  return (secondaryMs - alignment.offsetMs + slope * alignment.originMs) / (1 + slope);
}

export interface TriangulationResult {
  position: Vec3;
  rayGapM: number;
}

/**
 * Midpoint of the common perpendicular between two rays. Two rays in space
 * almost never intersect exactly, so the gap at closest approach is the honest
 * measure of how much the cameras disagree — it is returned rather than hidden.
 */
export function triangulateRays(a: CameraRay, b: CameraRay): TriangulationResult | null {
  const w0 = sub(a.origin, b.origin);
  const cosine = dot(a.direction, b.direction);
  const denominator = 1 - cosine * cosine;
  // Near-parallel rays: the solve is unconditioned and its midpoint can land
  // arbitrarily far from either camera.
  if (!(denominator > 1e-6)) return null;
  const d = dot(a.direction, w0);
  const e = dot(b.direction, w0);
  const s = (cosine * e - d) / denominator;
  const t = (e - cosine * d) / denominator;
  // Both solutions must lie in front of their own camera.
  if (!(s > 0) || !(t > 0)) return null;
  const pointA = { x: a.origin.x + a.direction.x * s, y: a.origin.y + a.direction.y * s, z: a.origin.z + a.direction.z * s };
  const pointB = { x: b.origin.x + b.direction.x * t, y: b.origin.y + b.direction.y * t, z: b.origin.z + b.direction.z * t };
  if (!finiteVec3(pointA) || !finiteVec3(pointB)) return null;
  return {
    position: { x: (pointA.x + pointB.x) / 2, y: (pointA.y + pointB.y) / 2, z: (pointA.z + pointB.z) / 2 },
    rayGapM: distance(pointA, pointB),
  };
}

/**
 * Resolve depth for a single view by intersecting its ray with the horizontal
 * plane of a calibrated drum head, keeping the intersection that lands inside a
 * zone.
 *
 * Only valid at a hit instant, when the tip is known to be at head height — see
 * the module header. `preferZoneId` biases toward the zone the reporting
 * camera's own detector named, so a ray grazing two overlapping zones resolves
 * the way that camera saw it.
 */
export function intersectRayWithZonePlane(
  ray: CameraRay,
  zones: readonly DrumZone[],
  preferZoneId?: string,
): { position: Vec3; zoneId: string } | null {
  let best: { position: Vec3; zoneId: string; offset: number; preferred: boolean } | null = null;
  // Drum heads are horizontal, so each plane is y = center.y with normal +Y.
  if (Math.abs(ray.direction.y) < 1e-6) return null;
  for (const zone of zones) {
    const t = (zone.center.y - ray.origin.y) / ray.direction.y;
    if (!(t > 0)) continue;
    const position = {
      x: ray.origin.x + ray.direction.x * t,
      y: ray.origin.y + ray.direction.y * t,
      z: ray.origin.z + ray.direction.z * t,
    };
    if (!finiteVec3(position)) continue;
    const offset = distance(position, zone.center);
    if (offset > zone.radius) continue;
    const preferred = zone.id === preferZoneId;
    if (!best || (preferred && !best.preferred) || (preferred === best.preferred && offset < best.offset)) {
      best = { position, zoneId: zone.id, offset, preferred };
    }
  }
  if (!best) return null;
  return { position: best.position, zoneId: best.zoneId };
}

/**
 * Fuse per-camera stick-tip observations into stage-frame trajectory samples.
 *
 * Nothing is fused optimistically: a camera whose calibration was not accepted,
 * whose stage frame differs, or whose clock was never aligned contributes no
 * samples at all, and every dropped observation appears in `rejected` with a
 * reason. That is what keeps a miscalibrated second camera from silently
 * degrading a working single-camera session.
 */
export function fuseCameraObservations(
  observations: readonly CameraObservation[],
  cameras: readonly CalibratedCamera[],
  options: FusionOptions = {},
): FusionReport {
  const pairWindowMs = options.pairWindowMs ?? MULTICAM_PAIR_WINDOW_MS;
  const maxRayGapM = options.maxRayGapM ?? MULTICAM_MAX_RAY_GAP_M;
  const rejected: FusionRejection[] = [];
  const gate = admitCameras(cameras);
  const staged = stageObservations(
    observations.map((observation) => ({
      cameraId: observation.cameraId,
      key: observation.stickId,
      timeMs: observation.timeMs,
      image: observation.image,
      confidence: observation.confidence,
      ...(observation.hand ? { hand: observation.hand } : {}),
    })),
    gate,
    { minConfidence: options.minConfidence ?? MULTICAM_MIN_OBSERVATION_CONFIDENCE, maxAgeMs: options.maxAgeMs ?? MULTICAM_MAX_SAMPLE_AGE_MS, ...(options.nowMs === undefined ? {} : { nowMs: options.nowMs }) },
    rejected,
  );

  const fused: FusedStickSample[] = [];
  for (const [stickId, group] of groupByKeyAndInstant(staged, pairWindowMs)) {
    const ranked = [...group].sort((a, b) => b.confidence - a.confidence);
    const [a, b] = ranked;
    if (!a) continue;
    if (!b) {
      // One ray leaves depth free. Depth is not invented here; the caller keeps
      // using the single-camera pipeline for this stick instead.
      rejected.push({ cameraId: a.cameraId, stickId, timeMs: a.stageTimeMs, reason: 'singleView' });
      continue;
    }
    const triangulated = triangulateRays(a.ray, b.ray);
    if (!triangulated) {
      for (const entry of [a, b]) rejected.push({ cameraId: entry.cameraId, stickId, timeMs: entry.stageTimeMs, reason: 'parallelRays' });
      continue;
    }
    if (triangulated.rayGapM > maxRayGapM) {
      for (const entry of [a, b]) rejected.push({ cameraId: entry.cameraId, stickId, timeMs: entry.stageTimeMs, reason: 'rayGap' });
      continue;
    }
    // Agreement between two views is evidence, so the fused confidence starts at
    // the better of the two and is discounted by how far apart the rays passed.
    const agreement = 1 - triangulated.rayGapM / maxRayGapM;
    const sample: FusedStickSample = {
      stickId,
      timeMs: (a.stageTimeMs + b.stageTimeMs) / 2,
      position: triangulated.position,
      confidence: clamp(Math.max(a.confidence, b.confidence) * (0.75 + 0.25 * agreement), 0, 1),
      sources: [a.cameraId, b.cameraId],
      rayGapM: triangulated.rayGapM,
    };
    const hand = a.hand ?? b.hand;
    if (hand) sample.hand = hand;
    fused.push(sample);
  }
  fused.sort((a, b) => a.timeMs - b.timeMs);

  return { fused, rejected, degradedToSingleCamera: gate.usable.size < 2, usableCameras: [...gate.usable.keys()] };
}

/**
 * Align and merge hit candidates published by independent camera trackers.
 *
 * A stroke both cameras saw is corroborated: the tip is triangulated, the times
 * are averaged, confidence rises, and — the part a single camera cannot do — the
 * zone is decided from the 3D point rather than from either camera's flat view.
 * A stroke only one camera saw still passes through, resolved against the
 * calibrated head plane at reduced confidence. That path is the reason a second
 * camera helps at all: the strokes a front camera loses to occlusion are exactly
 * the ones it cannot corroborate.
 *
 * Candidates are matched across cameras by *ray agreement*, not by the zone
 * label each camera reported. Two cameras that disagree about the zone are still
 * describing one stroke, and the whole point of the second view is to settle
 * that disagreement geometrically.
 */
export function fuseCameraHitCandidates(
  candidates: readonly CameraHitCandidate[],
  cameras: readonly CalibratedCamera[],
  options: CandidateFusionOptions,
): CandidateFusionReport {
  const mergeWindowMs = options.mergeWindowMs ?? MULTICAM_HIT_MERGE_WINDOW_MS;
  const maxRayGapM = options.maxRayGapM ?? MULTICAM_MAX_RAY_GAP_M;
  const rejected: FusionRejection[] = [];
  const gate = admitCameras(cameras);
  const staged = stageObservations(
    candidates.map((candidate) => ({
      cameraId: candidate.cameraId,
      key: candidate.zoneId,
      timeMs: candidate.timeMs,
      image: candidate.image,
      confidence: candidate.confidence,
      ...(candidate.hand ? { hand: candidate.hand } : {}),
      source: candidate,
    })),
    gate,
    { minConfidence: options.minConfidence ?? MULTICAM_MIN_OBSERVATION_CONFIDENCE, maxAgeMs: options.maxAgeMs ?? MULTICAM_MAX_SAMPLE_AGE_MS, ...(options.nowMs === undefined ? {} : { nowMs: options.nowMs }) },
    rejected,
  );
  staged.sort((a, b) => a.stageTimeMs - b.stageTimeMs);

  // Greedy stereo matching: score every cross-camera pair inside the merge
  // window by how closely their rays approach, then take the best-agreeing pairs
  // first. Matching on ray gap rather than on time alone is what keeps two
  // simultaneous strokes — a hi-hat and a snare on the same beat — from being
  // merged into one: their cross pairs miss each other by tens of centimetres.
  const scored: Array<{ a: number; b: number; gap: number; position: Vec3 }> = [];
  for (let i = 0; i < staged.length; i++) {
    for (let j = i + 1; j < staged.length; j++) {
      const first = staged[i];
      const second = staged[j];
      if (!first || !second) continue;
      if (first.cameraId === second.cameraId) continue;
      if (second.stageTimeMs - first.stageTimeMs > mergeWindowMs) break;
      const triangulated = triangulateRays(first.ray, second.ray);
      if (!triangulated || triangulated.rayGapM > maxRayGapM) continue;
      scored.push({ a: i, b: j, gap: triangulated.rayGapM, position: triangulated.position });
    }
  }
  scored.sort((a, b) => a.gap - b.gap);

  const matched = new Set<number>();
  const hits: FusedDrumHit[] = [];
  for (const pair of scored) {
    if (matched.has(pair.a) || matched.has(pair.b)) continue;
    const first = staged[pair.a];
    const second = staged[pair.b];
    if (!first || !second) continue;
    const zone = nearestContainingZone(pair.position, options.zones);
    if (!zone) {
      // Both cameras agree on a point that is not on the kit. That is a
      // corroborated non-hit, not a hit — dropping it is the guard against a
      // stick wave near the kit registering on both views.
      for (const entry of [first, second]) {
        rejected.push({ cameraId: entry.cameraId, stickId: entry.key, timeMs: entry.stageTimeMs, reason: 'noZoneIntersection' });
      }
      matched.add(pair.a);
      matched.add(pair.b);
      continue;
    }
    matched.add(pair.a);
    matched.add(pair.b);
    const ranked = [first, second].sort((a, b) => b.confidence - a.confidence);
    const [best, other] = ranked as [StagedObservation, StagedObservation];
    const primary = best.source as CameraHitCandidate | undefined;
    if (!primary) continue;
    const agreement = 1 - pair.gap / maxRayGapM;
    const hand = best.hand ?? other.hand;
    hits.push({
      event: buildFusedEvent(primary, {
        zoneId: zone.id,
        zoneType: zone.type,
        timeMs: (first.stageTimeMs + second.stageTimeMs) / 2,
        position: pair.position,
        // Two independent views agreeing is evidence a single view cannot
        // provide, so a corroborated stroke ends up above either input.
        confidence: clamp(Math.max(best.confidence, other.confidence) * (0.85 + 0.15 * agreement) + 0.1, 0, 1),
        ...(hand ? { hand } : {}),
      }),
      sources: [best.cameraId, other.cameraId],
      corroborated: true,
      rayGapM: pair.gap,
      planeConstrained: false,
    });
  }

  // Whatever is left was seen by one camera only.
  const singles: FusedDrumHit[] = [];
  for (let i = 0; i < staged.length; i++) {
    if (matched.has(i)) continue;
    const entry = staged[i];
    if (!entry) continue;
    const primary = entry.source as CameraHitCandidate | undefined;
    if (!primary) continue;
    const resolved = intersectRayWithZonePlane(entry.ray, options.zones, entry.key);
    if (!resolved) {
      rejected.push({ cameraId: entry.cameraId, stickId: entry.key, timeMs: entry.stageTimeMs, reason: 'noZoneIntersection' });
      continue;
    }
    const zone = options.zones.find((candidate) => candidate.id === resolved.zoneId);
    if (!zone) {
      rejected.push({ cameraId: entry.cameraId, stickId: entry.key, timeMs: entry.stageTimeMs, reason: 'noZoneIntersection' });
      continue;
    }
    singles.push({
      // A head-plane fix is weaker evidence than a stereo one; the discount
      // keeps downstream confidence gates able to tell them apart.
      event: buildFusedEvent(primary, {
        zoneId: zone.id,
        zoneType: zone.type,
        timeMs: entry.stageTimeMs,
        position: resolved.position,
        confidence: clamp(entry.confidence * 0.8, 0, 1),
        ...(entry.hand ? { hand: entry.hand } : {}),
      }),
      sources: [entry.cameraId],
      corroborated: false,
      rayGapM: null,
      planeConstrained: true,
    });
  }

  // An unmatched stroke that lands on a zone already claimed within the merge
  // window is the same stroke counted twice — either two cameras whose rays
  // missed each other by more than the gap threshold, or a single camera firing
  // twice. Keeping the stronger one is what stops a second camera from turning
  // every stroke into a double trigger when its calibration has drifted.
  for (const single of singles.sort((a, b) => b.event.confidence - a.event.confidence)) {
    const clash = hits.find((existing) => existing.event.zoneId === single.event.zoneId
      && Math.abs(existing.event.timeNs - single.event.timeNs) / 1_000_000 <= mergeWindowMs);
    if (clash) {
      const reason: FusionRejectionReason = clash.sources.includes(single.sources[0] ?? '') ? 'duplicate' : 'rayGap';
      rejected.push({ cameraId: single.sources[0] ?? '', stickId: single.event.zoneId, timeMs: single.event.timeNs / 1_000_000, reason });
      continue;
    }
    hits.push(single);
  }
  hits.sort((a, b) => a.event.timeNs - b.event.timeNs);

  return { hits, rejected, degradedToSingleCamera: gate.usable.size < 2, usableCameras: [...gate.usable.keys()] };
}

function nearestContainingZone(position: Vec3, zones: readonly DrumZone[]): DrumZone | null {
  let best: { zone: DrumZone; offset: number } | null = null;
  for (const zone of zones) {
    const offset = distance(position, zone.center);
    if (offset > zone.radius) continue;
    if (!best || offset < best.offset) best = { zone, offset };
  }
  return best?.zone ?? null;
}

/**
 * Pair consecutive fused samples per stick into the StickTipSample shape that
 * DrumHitDetector consumes, so a fused stage track runs through the existing
 * hit/cooldown path unchanged.
 */
export function toStickTipSamples(fused: readonly FusedStickSample[]): StickTipSample[] {
  const previous = new Map<string, FusedStickSample>();
  const samples: StickTipSample[] = [];
  for (const sample of [...fused].sort((a, b) => a.timeMs - b.timeMs)) {
    const last = previous.get(sample.stickId);
    previous.set(sample.stickId, sample);
    if (!last) continue;
    const entry: StickTipSample = {
      id: sample.stickId,
      timeMs: sample.timeMs,
      previousTimeMs: last.timeMs,
      position: sample.position,
      previousPosition: last.position,
    };
    if (sample.hand) entry.hand = sample.hand;
    samples.push(entry);
  }
  return samples;
}

interface CameraGate {
  usable: Map<string, CalibratedCamera>;
  fault: Map<string, FusionRejectionReason>;
}

function admitCameras(cameras: readonly CalibratedCamera[]): CameraGate {
  const usable = new Map<string, CalibratedCamera>();
  const fault = new Map<string, FusionRejectionReason>();
  const stageFrameIds = new Set<string>();
  for (const camera of cameras) {
    const id = camera.calibration.cameraId;
    if (!camera.quality.accepted || camera.quality.cameraId !== id) {
      fault.set(id, 'uncalibrated');
      continue;
    }
    if (camera.clockAlignment && !camera.clockAlignment.accepted) {
      fault.set(id, 'clockUnaligned');
      continue;
    }
    usable.set(id, camera);
    stageFrameIds.add(camera.calibration.stageFrameId);
  }
  // Mixing stage frames is the exact failure #183 warned about, so a
  // disagreement disqualifies every camera rather than picking a majority.
  if (stageFrameIds.size > 1) {
    for (const id of usable.keys()) fault.set(id, 'stageFrameMismatch');
    usable.clear();
  }
  return { usable, fault };
}

interface RawObservation {
  cameraId: string;
  key: string;
  timeMs: number;
  image: Vec2;
  confidence: number;
  hand?: Handedness;
  source?: unknown;
}

interface StagedObservation {
  cameraId: string;
  key: string;
  stageTimeMs: number;
  ray: CameraRay;
  confidence: number;
  hand?: Handedness;
  source?: unknown;
}

function stageObservations(
  raw: readonly RawObservation[],
  gate: CameraGate,
  limits: { minConfidence: number; maxAgeMs: number; nowMs?: number },
  rejected: FusionRejection[],
): StagedObservation[] {
  const staged: StagedObservation[] = [];
  for (const observation of raw) {
    const camera = gate.usable.get(observation.cameraId);
    if (!camera) {
      rejected.push({
        cameraId: observation.cameraId,
        stickId: observation.key,
        timeMs: observation.timeMs,
        reason: gate.fault.get(observation.cameraId) ?? 'uncalibrated',
      });
      continue;
    }
    if (
      !Number.isFinite(observation.timeMs)
      || !Number.isFinite(observation.image.x)
      || !Number.isFinite(observation.image.y)
      || !Number.isFinite(observation.confidence)
    ) {
      rejected.push({ cameraId: observation.cameraId, stickId: observation.key, timeMs: observation.timeMs, reason: 'nonFinite' });
      continue;
    }
    if (observation.confidence < limits.minConfidence) {
      rejected.push({ cameraId: observation.cameraId, stickId: observation.key, timeMs: observation.timeMs, reason: 'lowConfidence' });
      continue;
    }
    const stageTimeMs = camera.clockAlignment
      ? applyClockAlignment(observation.timeMs, camera.clockAlignment)
      : observation.timeMs;
    if (!Number.isFinite(stageTimeMs)) {
      rejected.push({ cameraId: observation.cameraId, stickId: observation.key, timeMs: observation.timeMs, reason: 'nonFinite' });
      continue;
    }
    const ray = backProjectImagePoint(camera.calibration, observation.image);
    if (!ray) {
      rejected.push({ cameraId: observation.cameraId, stickId: observation.key, timeMs: stageTimeMs, reason: 'behindCamera' });
      continue;
    }
    const entry: StagedObservation = {
      cameraId: observation.cameraId,
      key: observation.key,
      stageTimeMs,
      ray,
      confidence: observation.confidence,
    };
    if (observation.hand) entry.hand = observation.hand;
    if (observation.source !== undefined) entry.source = observation.source;
    staged.push(entry);
  }

  const nowMs = limits.nowMs ?? staged.reduce((newest, entry) => Math.max(newest, entry.stageTimeMs), -Infinity);
  if (!Number.isFinite(nowMs)) return staged;
  return staged.filter((entry) => {
    if (nowMs - entry.stageTimeMs <= limits.maxAgeMs) return true;
    rejected.push({ cameraId: entry.cameraId, stickId: entry.key, timeMs: entry.stageTimeMs, reason: 'stale' });
    return false;
  });
}

/**
 * Group staged observations by key, then split each key's stream into instants:
 * consecutive entries from distinct cameras that fall inside `windowMs`.
 */
function groupByKeyAndInstant(staged: readonly StagedObservation[], windowMs: number): Array<[string, StagedObservation[]]> {
  const byKey = new Map<string, StagedObservation[]>();
  for (const entry of staged) {
    const bucket = byKey.get(entry.key);
    if (bucket) bucket.push(entry);
    else byKey.set(entry.key, [entry]);
  }
  const groups: Array<[string, StagedObservation[]]> = [];
  for (const [key, entries] of byKey) {
    entries.sort((a, b) => a.stageTimeMs - b.stageTimeMs);
    let index = 0;
    while (index < entries.length) {
      const start = entries[index];
      if (!start) break;
      const group: StagedObservation[] = [];
      const seen = new Set<string>();
      while (index < entries.length) {
        const candidate = entries[index];
        if (!candidate) break;
        if (candidate.stageTimeMs - start.stageTimeMs > windowMs) break;
        // One view per camera per instant; a second detection from the same
        // camera starts the next group.
        if (seen.has(candidate.cameraId)) break;
        seen.add(candidate.cameraId);
        group.push(candidate);
        index++;
      }
      groups.push([key, group]);
    }
  }
  return groups;
}

function buildFusedEvent(
  primary: CameraHitCandidate,
  fields: { zoneId: string; zoneType: DrumHitEvent['zoneType']; timeMs: number; position: Vec3; confidence: number; hand?: Handedness },
): DrumHitEvent {
  const event: DrumHitEvent = {
    eventId: `fused:${fields.zoneId}:${Math.round(fields.timeMs)}`,
    timeNs: Math.round(fields.timeMs * 1_000_000),
    zoneId: fields.zoneId,
    zoneType: fields.zoneType,
    position: fields.position,
    velocity: primary.velocity,
    speed: primary.speed,
    confidence: fields.confidence,
    audioAligned: false,
  };
  if (primary.stickId) event.stickId = primary.stickId;
  if (fields.hand) event.hand = fields.hand;
  return event;
}

function applyRotation(rotation: readonly number[], v: Vec3): Vec3 {
  return {
    x: (rotation[0] ?? 0) * v.x + (rotation[1] ?? 0) * v.y + (rotation[2] ?? 0) * v.z,
    y: (rotation[3] ?? 0) * v.x + (rotation[4] ?? 0) * v.y + (rotation[5] ?? 0) * v.z,
    z: (rotation[6] ?? 0) * v.x + (rotation[7] ?? 0) * v.y + (rotation[8] ?? 0) * v.z,
  };
}

function applyRotationTranspose(rotation: readonly number[], v: Vec3): Vec3 {
  return {
    x: (rotation[0] ?? 0) * v.x + (rotation[3] ?? 0) * v.y + (rotation[6] ?? 0) * v.z,
    y: (rotation[1] ?? 0) * v.x + (rotation[4] ?? 0) * v.y + (rotation[7] ?? 0) * v.z,
    z: (rotation[2] ?? 0) * v.x + (rotation[5] ?? 0) * v.y + (rotation[8] ?? 0) * v.z,
  };
}

function isOrthonormalRotation(rotation: readonly number[]): boolean {
  if (rotation.length !== 9 || rotation.some((value) => !Number.isFinite(value))) return false;
  const rows: Vec3[] = [
    { x: rotation[0] ?? 0, y: rotation[1] ?? 0, z: rotation[2] ?? 0 },
    { x: rotation[3] ?? 0, y: rotation[4] ?? 0, z: rotation[5] ?? 0 },
    { x: rotation[6] ?? 0, y: rotation[7] ?? 0, z: rotation[8] ?? 0 },
  ];
  for (let i = 0; i < 3; i++) {
    const rowI = rows[i];
    if (!rowI) return false;
    if (Math.abs(length(rowI) - 1) > 1e-6) return false;
    for (let j = i + 1; j < 3; j++) {
      const rowJ = rows[j];
      if (!rowJ) return false;
      if (Math.abs(dot(rowI, rowJ)) > 1e-6) return false;
    }
  }
  return true;
}
