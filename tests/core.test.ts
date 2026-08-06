import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DRUM_DETECTED_EVENTS_SCHEMA,
  formatDrumBenchmarkMarkdown,
  runDrumBenchmark,
  validateDrumBenchmarkManifest,
} from '../scripts/drum-benchmark';
import {
  ConfidenceDecay,
  FingerContactHysteresis,
  AccelerationJerkClamp,
  AudioOnsetDetector,
  OcclusionStateMachine,
  TemporalOutlierRejector,
  VelocityClamp,
  audioAssistMouthOpen,
  blinkFalsePositiveRate,
  candidateToDrumHit,
  clampRigParameter,
  classifyHandGesture,
  classifyGlassesGlare,
  classifyHandObjectContact,
  confidenceWeightedBlend,
  computeFingerCurl,
  computePalmBasis,
  createDrumDatasetAnnotation,
  createEmptyFrame,
  createModelExportManifest,
  createPrivacyPreservingDatasetRecord,
  createQuantizedModelExportPlan,
  createPoseBackendRegistry,
  createSyntheticHandLandmarks,
  createYoloStickDetectorBaselinePlan,
  deriveFingerChain,
  detectHandSwap,
  detectVisualDrumHitCandidates,
  DrumHitDetector,
  DRUM_DOWNSTROKE_MIN_SPEED_MPS,
  DRUM_MIN_HIT_SPEED_MPS,
  DRUM_REARM_MIN_LIFT_M,
  fetchAndVerifyModel,
  applyClockAlignment,
  backProjectImagePoint,
  cameraLookAt,
  evaluateCalibration,
  fuseCameraHitCandidates,
  fuseCameraObservations,
  intersectRayWithZonePlane,
  measureCaptureTimestampAlignment,
  projectStagePoint,
  toStickTipSamples,
  triangulateRays,
  MULTICAM_MAX_DRIFT_MS_PER_MIN,
  MULTICAM_MAX_RAY_GAP_M,
  MULTICAM_MAX_REPROJECTION_ERROR_PX,
  MULTICAM_MAX_SYNC_RESIDUAL_MS,
  STAGE_CALIBRATION_SCHEMA,
  clampFingerState,
  defaultEye,
  defaultMouth,
  finiteFrameGuard,
  finiteNumber,
  finiteVec3Guard,
  fuseVisualHitWithAudio,
  estimateHitVelocity,
  estimateStickTipTrajectory,
  classifyLowLight,
  classifyMotionBlur,
  deriveIrisCenter,
  inferHiHatPedalState,
  inferKickPedalHit,
  HAND_LANDMARK_COUNT,
  assignRoomLayoutSlots,
  latestFrameByParticipant,
  mouthFlickerScore,
  privacyPreservingDatasetRecord,
  chooseExecutionProviderFromCapabilities,
  scoreDrumBenchmark,
  scoreDrumBenchmarkEvents,
  runModelBenchmark,
  verifyModelSpecBytes,
  verifyModelHash,
  solveFaceStateFromBlendshapes,
  summarizeModelBenchmark,
  shortestPathQuat,
  slerpQuat,
  solveHandState,
  stabilizeBlink,
  voiceActivityMouthAccent,
  wrapKGM1FrameForRoom,
} from '../src/core';

describe('hand solver', () => {
  it('distinguishes handedness and builds a stable palm basis', () => {
    const right = computePalmBasis(createSyntheticHandLandmarks(0, 'Right'), 'Right');
    const left = computePalmBasis(createSyntheticHandLandmarks(0, 'Left'), 'Left');
    expect(right.handedness).toBe('Right');
    expect(left.handedness).toBe('Left');
    expect(Math.hypot(right.x.x, right.x.y, right.x.z)).toBeGreaterThan(0.99);
    expect(Math.hypot(right.y.x, right.y.y, right.y.z)).toBeGreaterThan(0.99);
  });

  it('derives per-finger chains and curl values', () => {
    const open = createSyntheticHandLandmarks(0, 'Right');
    const curled = createSyntheticHandLandmarks(1, 'Right');
    const palm = computePalmBasis(open, 'Right');
    const openCurl = computeFingerCurl(deriveFingerChain(open, 'index'), palm);
    const curledCurl = computeFingerCurl(deriveFingerChain(curled, 'index'), computePalmBasis(curled, 'Right'));
    expect(openCurl).toBeLessThan(0.2);
    expect(curledCurl).toBeGreaterThan(openCurl);
  });

  it('populates confidence, warnings, contact, pinch, spread, and velocity', () => {
    const previous = solveHandState({ handedness: 'Right', landmarks: createSyntheticHandLandmarks(0.2, 'Right') });
    const next = createSyntheticHandLandmarks(0.2, 'Right');
    next[8].x = next[4].x;
    next[8].y = next[4].y;
    const state = solveHandState({ handedness: 'Right', landmarks: next, previous, dtSec: 1 / 60 });
    expect(state.fingers.index.contact.touching).toBe(true);
    expect(state.fingers.index.pinchToThumb).toBeLessThan(0.001);
    expect(Number.isFinite(state.fingers.middle.spread)).toBe(true);
    expect(Number.isFinite(state.fingers.index.tipVelocity.x)).toBe(true);
    expect(state.confidence).toBeGreaterThan(0.9);
  });

  it('computes tip velocity from timestamp delta', () => {
    const previous = solveHandState({ handedness: 'Right', landmarks: createSyntheticHandLandmarks(0, 'Right') });
    const next = createSyntheticHandLandmarks(0, 'Right');
    next[8] = { ...next[8], y: next[8].y + 0.06 };
    const state = solveHandState({ handedness: 'Right', landmarks: next, previous, dtSec: 0.02 });
    expect(state.fingers.index.tipVelocity.y).toBeCloseTo(3, 5);
  });

  it('rejects malformed and non-finite hand landmarks', () => {
    const short = createSyntheticHandLandmarks(0, 'Right').slice(0, HAND_LANDMARK_COUNT - 1);
    expect(() => solveHandState({ handedness: 'Right', landmarks: short })).toThrow(/Expected 21 hand landmarks/);

    const nonFinite = createSyntheticHandLandmarks(0, 'Right');
    nonFinite[8] = { ...nonFinite[8], x: Number.NaN };
    expect(() => solveHandState({ handedness: 'Right', landmarks: nonFinite })).toThrow(/non-finite/);
  });

  it('reports outside-frame and low-confidence warnings', () => {
    const landmarks = createSyntheticHandLandmarks(0, 'Right');
    landmarks[0].x = 1.4;
    for (const i of [5, 6, 7, 8]) {
      landmarks[i].visibility = 0.1;
      landmarks[i].presence = 0.1;
    }
    const state = solveHandState({ handedness: 'Right', landmarks });
    expect(state.warnings).toContain('HAND_OUTSIDE_FRAME');
    expect(state.fingers.index.occluded).toBe(true);
  });

  it('reports frame-level low confidence and finger occlusion warnings', () => {
    const landmarks = createSyntheticHandLandmarks(0, 'Right');
    for (const point of landmarks) {
      point.visibility = 0.2;
      point.presence = 0.2;
    }
    const state = solveHandState({ handedness: 'Right', landmarks });
    expect(state.warnings).toContain('HAND_LOW_CONFIDENCE');
    expect(state.warnings).toContain('index:OCCLUDED');
    expect(state.fingers.index.confidence).toBeLessThan(0.35);
  });

  it('uses hysteresis for finger contact and confidence decay for occlusion', () => {
    const contact = new FingerContactHysteresis(0.03, 0.05);
    expect(contact.update(0.029, 1)).toBe(true);
    expect(contact.update(0.04, 1)).toBe(true);
    expect(contact.update(0.08, 0.1)).toBe(true);
    expect(contact.update(0.06, 1)).toBe(false);

    const decay = new ConfidenceDecay();
    expect(decay.update(1, 0.016)).toBe(1);
    expect(decay.update(0, 0.18)).toBeGreaterThan(0.45);
  });

  it('detects likely left/right swaps after reacquisition', () => {
    const previous = solveHandState({ handedness: 'Right', landmarks: createSyntheticHandLandmarks(0, 'Right') });
    const next = solveHandState({ handedness: 'Left', landmarks: createSyntheticHandLandmarks(0, 'Right') });
    expect(detectHandSwap(previous, next)).toBe(true);
  });

  it('classifies finger count and drum grip gesture states', () => {
    const open = solveHandState({ handedness: 'Right', landmarks: createSyntheticHandLandmarks(0, 'Right') });
    expect(classifyHandGesture(open).openPalm).toBe(true);

    const grip = solveHandState({ handedness: 'Right', landmarks: createSyntheticHandLandmarks(0, 'Right') });
    grip.fingers.thumb.curl = 0.55;
    grip.fingers.index.curl = 0.55;
    grip.fingers.middle.curl = 0.62;
    grip.fingers.ring.curl = 0.7;
    grip.fingers.pinky.curl = 0.72;
    const gesture = classifyHandGesture(grip);
    expect(gesture.fingerCount).toBeGreaterThanOrEqual(0);
    expect(gesture.drumGrip || gesture.fist).toBe(true);
  });
});

describe('ML support helpers', () => {
  it('classifies low light and motion blur', () => {
    expect(classifyLowLight(12).state).toBe('poor');
    expect(classifyLowLight(120).state).toBe('good');
    expect(classifyMotionBlur(10).state).toBe('poor');
    expect(classifyMotionBlur(180).state).toBe('good');
  });

  it('verifies model hashes and serializes privacy-preserving landmark records', async () => {
    const data = new TextEncoder().encode('minamo');
    expect(await verifyModelHash(data, '87e6748e5dbb1148dbbd729f61f7ccb0bb1bd35ce46d7f334c67f750b5f1e71a')).toBe(true);
    const record = JSON.parse(privacyPreservingDatasetRecord([{ x: 0.123456, y: 0.2, z: -0.3, visibility: 0.98765 }], 'open-hand'));
    expect(record.landmarks[0].x).toBe(0.1235);
    expect(record.label).toBe('open-hand');
    expect(record.consent.rawMedia).toBe(false);

    const spec = {
      name: 'stick-yolo-n',
      url: 'models/stick.onnx',
      inputShape: [1, 3, 320, 320],
      outputNames: ['boxes', 'scores'],
      sha256: '87:e6:74:8e:5d:bb:11:48:db:bd:72:9f:61:f7:cc:b0:bb:1b:d3:5c:e4:6d:7f:33:4c:67:f7:50:b5:f1:e7:1a',
    };
    expect((await verifyModelSpecBytes(spec, data)).ok).toBe(true);
    const fetched = await fetchAndVerifyModel(spec, async () => ({
      ok: true,
      arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    }));
    expect(fetched.verification.required).toBe(true);
    expect(fetched.bytes.byteLength).toBe(data.byteLength);
  });

  it('selects fallback providers, benchmarks models, and builds export plans', async () => {
    expect(chooseExecutionProviderFromCapabilities(['webgpu', 'wasm'], {
      webgpu: false,
      webgl: false,
      wasm: true,
      wasmThreads: false,
      wasmSimd: true,
      cpu: true,
      crossOriginIsolated: false,
      notes: [],
    })).toBe('wasm');

    const benchmark = summarizeModelBenchmark('stick-yolo-n', 'webgpu', [
      { latencyMs: 10, memoryMb: 96 },
      { latencyMs: 20, memoryMb: 104 },
      { latencyMs: 30, memoryMb: 101 },
    ]);
    expect(benchmark.averageLatencyMs).toBe(20);
    expect(benchmark.p95LatencyMs).toBe(30);
    expect(benchmark.memoryMb).toBe(104);
    expect(classifyHandObjectContact(0.01, 0.9).state).toBe('good');
    const spec = {
      name: 'stick-yolo-n',
      url: 'models/stick.onnx',
      inputShape: [1, 3, 320, 320],
      outputNames: ['boxes', 'scores'],
      sha256: 'abc',
      license: '0BSD',
    };
    expect(createModelExportManifest(spec, 'int8')).toMatchObject({
      schema: 'minamo.model-export.v1',
      modelName: 'stick-yolo-n',
      quantization: 'int8',
      sha256: 'abc',
      license: '0BSD',
    });
    const harness = await runModelBenchmark('stick-yolo-n', 'wasm', [1, 2, 3], () => null, {
      warmupRuns: 0,
      now: (() => {
        let t = 0;
        return () => {
          const current = t;
          t += 5;
          return current;
        };
      })(),
      memoryMb: () => 64,
    });
    expect(harness.averageLatencyMs).toBe(5);
    expect(harness.fps).toBe(200);
    const plan = createQuantizedModelExportPlan(spec, ['fp16', 'int8']);
    expect(plan.browserFallback).toBe('wasm');
    expect(plan.variants.map((variant) => variant.quantization)).toEqual(['fp16', 'int8']);
    expect(createYoloStickDetectorBaselinePlan().privacy.rawMediaDefault).toBe(false);
    const datasetRecord = createPrivacyPreservingDatasetRecord({
      label: 'stick-tip',
      landmarks: [{ x: 0.111111, y: 0.222222, z: 0.333333 }],
      quality: classifyLowLight(100),
    });
    expect(datasetRecord.landmarks[0].x).toBe(0.1111);
    expect(datasetRecord.quality?.state).toBe('good');
  });
});

describe('room envelope helpers', () => {
  it('keeps newest motion frame per participant without changing KGM1 frames', () => {
    const first = wrapKGM1FrameForRoom('stage', 'alice', createEmptyFrame(1, 100), 100);
    const second = wrapKGM1FrameForRoom('stage', 'alice', createEmptyFrame(2, 120), 120);
    const bob = wrapKGM1FrameForRoom('stage', 'bob', createEmptyFrame(3, 110), 110);
    const latest = latestFrameByParticipant([first, second, bob]);
    expect(latest.get('alice')?.frame.frameId).toBe(2);
    expect(latest.get('bob')?.frame.frameId).toBe(3);
  });
});

describe('face solver', () => {
  it('maps blendshapes into semantic face controls', () => {
    const face = solveFaceStateFromBlendshapes({
      blendshapes: {
        jawOpen: 0.74,
        mouthSmileLeft: 0.82,
        mouthSmileRight: 0.2,
        mouthFrownRight: 0.35,
        eyeBlinkLeft: 0.88,
        eyeBlinkRight: 0.12,
        eyeLookOutLeft: 0.75,
        eyeLookInRight: 0.5,
      },
      confidence: 1,
    });

    expect(face.detected).toBe(true);
    expect(face.mouth.open).toBeCloseTo(0.74);
    expect(face.mouth.vowel).toBe('A');
    expect(face.mouth.smileLeft).toBeGreaterThan(face.mouth.smileRight);
    expect(face.mouth.frownRight).toBeGreaterThan(face.mouth.frownLeft);
    expect(face.leftEye.blink).toBeGreaterThan(face.rightEye.blink);
    expect(face.leftEye.gaze.x).toBeGreaterThan(0);
    expect(face.rightEye.gaze.x).toBeGreaterThan(0);
    expect(Math.hypot(face.leftEye.gaze.x, face.leftEye.gaze.y, face.leftEye.gaze.z)).toBeLessThanOrEqual(1.000001);
  });

  it('keeps blink transitions independent and hysteretic', () => {
    const closing = stabilizeBlink(0.9, 0.1, 0);
    const heldClosed = stabilizeBlink(0.5, 0.85, 0);
    const heldOpen = stabilizeBlink(0.5, 0.1, 0);

    expect(closing).toBeGreaterThan(0.7);
    expect(heldClosed).toBeGreaterThan(heldOpen);
    expect(heldOpen).toBeLessThan(0.45);
  });

  it('derives iris centers when Face Landmarker exposes iris points', () => {
    const landmarks = Array.from({ length: 478 }, () => ({ x: 0, y: 0, z: 0 }));
    for (const index of [468, 469, 470, 471, 472]) {
      landmarks[index] = { x: 0.25, y: 0.4, z: 0 };
    }
    for (const index of [473, 474, 475, 476, 477]) {
      landmarks[index] = { x: 0.75, y: 0.41, z: 0 };
    }

    const face = solveFaceStateFromBlendshapes({
      blendshapes: {},
      landmarks,
      confidence: 1,
    });

    expect(face.leftEye.irisCenter).toEqual({ x: 0.25, y: 0.4 });
    expect(face.rightEye.irisCenter).toEqual({ x: 0.75, y: 0.41 });
    expect(deriveIrisCenter(landmarks, [468, 469])).toEqual({ x: 0.25, y: 0.4 });
  });

  it('reduces likely smile leakage under strong head yaw', () => {
    const neutral = solveFaceStateFromBlendshapes({
      blendshapes: {
        mouthSmileLeft: 0.8,
        mouthSmileRight: 0.8,
      },
      confidence: 1,
    });
    const yawRad = 0.85;
    const yawed = solveFaceStateFromBlendshapes({
      blendshapes: {
        mouthSmileLeft: 0.8,
        mouthSmileRight: 0.8,
      },
      headRotation: {
        x: 0,
        y: Math.sin(yawRad / 2),
        z: 0,
        w: Math.cos(yawRad / 2),
      },
      confidence: 1,
    });

    expect(yawed.mouth.smileLeft).toBeLessThan(neutral.mouth.smileLeft);
    expect(yawed.mouth.smileRight).toBeLessThan(neutral.mouth.smileRight);
  });

  it('adds audio mouth support, glare warnings, and benchmark metrics', () => {
    expect(audioAssistMouthOpen(0.1, 0.12)).toBeGreaterThan(0.1);
    expect(classifyGlassesGlare({
      confidence: 0.4,
      eyeSquintLeft: 0.7,
      eyeBlinkLeft: 0.8,
      eyeBlinkRight: 0.1,
    }).likely).toBe(true);
    expect(mouthFlickerScore([0.1, 0.12, 0.11, 0.13])).toBeLessThan(0.05);
    expect(blinkFalsePositiveRate([
      { blink: 0.1, expectedClosed: false },
      { blink: 0.8, expectedClosed: false },
      { blink: 0.7, expectedClosed: true },
    ])).toBeCloseTo(1 / 3);
  });
});

describe('audio and drum helpers', () => {
  it('detects audio onsets with cooldown', () => {
    const detector = new AudioOnsetDetector(2, 40);
    expect(detector.process({ timeMs: 0, sampleRate: 48_000, samples: new Float32Array(128).fill(0.002) })).toBeNull();
    const onset = detector.process({ timeMs: 50, sampleRate: 48_000, samples: new Float32Array(128).fill(0.5) });
    expect(onset?.strength).toBeGreaterThan(0);
    expect(detector.process({ timeMs: 60, sampleRate: 48_000, samples: new Float32Array(128).fill(0.8) })).toBeNull();
  });

  it('estimates hit velocity and fuses visual hits with audio onsets', () => {
    const velocity = estimateHitVelocity({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, 0.5);
    expect(velocity.y).toBe(2);
    const hit = {
      eventId: 'h1',
      timeNs: 100_000_000,
      zoneId: 'snare',
      zoneType: 'snare' as const,
      position: { x: 0, y: 0, z: 0 },
      velocity,
      speed: 2,
      confidence: 0.5,
      audioAligned: false,
    };
    const fused = fuseVisualHitWithAudio(hit, [{ timeMs: 112, strength: 0.8 }], 20);
    expect(fused.audioAligned).toBe(true);
    expect(fused.confidence).toBeGreaterThan(hit.confidence);
  });

  it('derives visual drum candidates, assigns pedals, and scores rolls', () => {
    const trajectory = estimateStickTipTrajectory(
      { id: 'stick-r', timeMs: 50, tip: { x: 0, y: 0.02, z: 0 }, confidence: 0.9, hand: 'Right' },
      { id: 'stick-r', timeMs: 0, tip: { x: 0, y: -0.04, z: 0 }, confidence: 0.9, hand: 'Right' },
    );
    const candidates = detectVisualDrumHitCandidates(trajectory, [{
      id: 'snare',
      type: 'snare',
      center: { x: 0, y: 0.02, z: 0 },
      radius: 0.08,
      cooldownMs: 45,
    }]);
    expect(candidates.length).toBe(1);
    const hit = candidateToDrumHit(candidates[0]);
    expect(hit.hand).toBe('Right');
    expect(inferHiHatPedalState([{ timeMs: 52, strength: 0.8, frequencyHz: 3000 }], 50)).toBeGreaterThan(0.7);
    expect(inferKickPedalHit([{ timeMs: 54, strength: 0.7, frequencyHz: 80 }], 50)?.zoneType).toBe('kick');
    const score = scoreDrumBenchmark([50, 100], [hit, { ...hit, eventId: 'h2', timeNs: 100_000_000 }]);
    expect(score.recall).toBe(1);
    const detailed = scoreDrumBenchmarkEvents([
      { timeMs: 50, zoneId: 'snare', hand: 'Right' },
      { timeMs: 100, zoneId: 'snare', hand: 'Left' },
    ], [hit, { ...hit, eventId: 'h2', timeNs: 100_000_000, hand: 'Left' }]);
    expect(detailed.zoneAccuracy).toBe(1);
    expect(detailed.handAssignmentAccuracy).toBe(1);
    expect(detailed.p95TimingErrorMs).toBe(0);
    expect(createDrumDatasetAnnotation('frame-1', [{
      kind: 'stick',
      id: 'stick-r',
      points: [{ x: 0, y: 0, z: 0 }],
      hand: 'Right',
    }]).schema).toBe('minamo.drum-dataset.v1');
  });

  it('detects drum hits in metres/second in the canonical y-down space (#254)', () => {
    const zones = [{ id: 'snare', type: 'snare' as const, center: { x: 0, y: 0.5, z: 0 }, radius: 0.12, cooldownMs: 40 }];

    // A fast downstroke (+Y is down in image space) at ~2 m/s registers a hit.
    const fast = new DrumHitDetector(zones).detect({
      id: 'stick-r', timeMs: 20, previousTimeMs: 0,
      position: { x: 0, y: 0.5, z: 0 }, previousPosition: { x: 0, y: 0.46, z: 0 }, hand: 'Right',
    });
    expect(fast.length).toBe(1);
    expect(fast[0].hand).toBe('Right');
    expect(fast[0].speed).toBeCloseTo(2, 5);

    // The same spatial motion sampled over a longer frame interval yields the
    // same m/s speed — frame-rate independent, unlike a raw per-frame delta.
    const slowerFps = new DrumHitDetector(zones).detect({
      id: 'stick-r', timeMs: 40, previousTimeMs: 0,
      position: { x: 0, y: 0.5, z: 0 }, previousPosition: { x: 0, y: 0.42, z: 0 },
    });
    expect(slowerFps.length).toBe(1);
    expect(slowerFps[0].speed).toBeCloseTo(2, 5);

    // A slow drift with a large per-frame delta but low m/s is NOT a hit (the
    // old raw-delta path would have misfired here).
    const slow = new DrumHitDetector(zones).detect({
      id: 'stick-r', timeMs: 400, previousTimeMs: 0,
      position: { x: 0, y: 0.5, z: 0 }, previousPosition: { x: 0, y: 0.4, z: 0 },
    });
    expect(slow.length).toBe(0);

    // An upstroke (negative velocity.y in this space) never counts as a hit.
    const up = new DrumHitDetector(zones).detect({
      id: 'stick-r', timeMs: 20, previousTimeMs: 0,
      position: { x: 0, y: 0.5, z: 0 }, previousPosition: { x: 0, y: 0.55, z: 0 },
    });
    expect(up.length).toBe(0);
  });

  it('shares one velocity/axis convention between detector paths (#254)', () => {
    expect(DRUM_DOWNSTROKE_MIN_SPEED_MPS).toBe(0.5);
    expect(DRUM_MIN_HIT_SPEED_MPS).toBe(0.45);

    // Below-threshold downstroke: 0.4 m/s < 0.5 → not a downstroke.
    const slow = estimateStickTipTrajectory(
      { id: 's', timeMs: 100, tip: { x: 0, y: 0.5, z: 0 }, confidence: 0.9 },
      { id: 's', timeMs: 0, tip: { x: 0, y: 0.46, z: 0 }, confidence: 0.9 },
    );
    expect(slow.speed).toBeCloseTo(0.4, 5);
    expect(slow.downstroke).toBe(false);
    expect(detectVisualDrumHitCandidates(slow, [
      { id: 'snare', type: 'snare', center: { x: 0, y: 0.5, z: 0 }, radius: 0.12, cooldownMs: 40 },
    ]).length).toBe(0);

    // Above-threshold downstroke: 2 m/s → a candidate is produced.
    const fast = estimateStickTipTrajectory(
      { id: 's', timeMs: 20, tip: { x: 0, y: 0.5, z: 0 }, confidence: 0.9 },
      { id: 's', timeMs: 0, tip: { x: 0, y: 0.46, z: 0 }, confidence: 0.9 },
    );
    expect(fast.downstroke).toBe(true);
    expect(detectVisualDrumHitCandidates(fast, [
      { id: 'snare', type: 'snare', center: { x: 0, y: 0.5, z: 0 }, radius: 0.12, cooldownMs: 40 },
    ]).length).toBe(1);
  });

  it('re-arms a zone on the rebound so fast rolls are not capped by the cooldown (#123)', () => {
    expect(DRUM_REARM_MIN_LIFT_M).toBe(0.012);
    const zones = [{ id: 'snare', type: 'snare' as const, center: { x: 0, y: 0.5, z: 0 }, radius: 0.12, cooldownMs: 45 }];
    // +Y is down. A stroke lands the tip on the head at 0.5; a lift raises it.
    const stroke = (timeMs: number) => ({
      id: 'stick-r', timeMs, previousTimeMs: timeMs - 8,
      position: { x: 0, y: 0.5, z: 0 }, previousPosition: { x: 0, y: 0.47, z: 0 },
      hand: 'Right' as const,
    });
    const lift = (timeMs: number, height: number) => ({
      id: 'stick-r', timeMs, previousTimeMs: timeMs - 8,
      position: { x: 0, y: 0.5 - height, z: 0 }, previousPosition: { x: 0, y: 0.5, z: 0 },
      hand: 'Right' as const,
    });

    // A double-stroke roll at 30 ms per stroke — 33 hits/s on ONE zone, well
    // inside the 45 ms cooldown. Every stroke lifts, so every stroke counts.
    const roller = new DrumHitDetector(zones);
    let rollHits = 0;
    for (let i = 0; i < 8; i++) {
      const t = i * 30;
      rollHits += roller.detect(stroke(t)).length;
      roller.detect(lift(t + 15, 0.03)); // rebound between strokes
    }
    expect(rollHits).toBe(8);

    // Threshold jitter around the head — the stick oscillates by 6 mm, under
    // the rebound threshold, so nothing re-arms and the cooldown still holds.
    // This is the regression backlog 061 added the cooldown for.
    const jitterer = new DrumHitDetector(zones);
    expect(jitterer.detect(stroke(0)).length).toBe(1);
    let jitterHits = 0;
    for (let t = 8; t <= 40; t += 8) {
      jitterHits += jitterer.detect(t % 16 === 0 ? stroke(t) : lift(t, 0.006)).length;
    }
    expect(jitterHits).toBe(0);

    // And the cooldown remains the fallback when no lift is ever observed, so
    // a dropped rebound degrades to the old time-based behaviour rather than
    // silencing the zone.
    expect(jitterer.detect(stroke(60)).length).toBe(1);
  });

  it('matches simultaneous limbs to their own zone before falling back to time (#241)', () => {
    // A backbeat: snare and hi-hat on the same instant, both detected correctly.
    const hit = (zoneId: string, timeMs: number, hand: 'Left' | 'Right') => ({
      eventId: `${zoneId}:${timeMs}`,
      timeNs: timeMs * 1_000_000,
      zoneId,
      zoneType: zoneId === 'snare' ? ('snare' as const) : ('hihat' as const),
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 1, z: 0 },
      speed: 1,
      confidence: 0.9,
      audioAligned: false,
      hand,
    });
    const perfect = scoreDrumBenchmarkEvents(
      [{ timeMs: 600, zoneId: 'hihat', hand: 'Right' }, { timeMs: 600, zoneId: 'snare', hand: 'Left' }],
      [hit('hihat', 601, 'Right'), hit('snare', 599, 'Left')],
    );
    // Time-only matching let the hi-hat's expectation take the snare detection,
    // scoring a flawless run at 0.5 on both zone and hand.
    expect(perfect.matched).toBe(2);
    expect(perfect.zoneAccuracy).toBe(1);
    expect(perfect.handAssignmentAccuracy).toBe(1);

    // A genuine misattribution is still counted: nothing on the snare exists,
    // so the snare's expectation falls back to the hi-hat detection and the
    // zone is scored wrong rather than quietly unmatched.
    const wrong = scoreDrumBenchmarkEvents(
      [{ timeMs: 600, zoneId: 'snare', hand: 'Left' }],
      [hit('hihat', 601, 'Left')],
    );
    expect(wrong.matched).toBe(1);
    expect(wrong.zoneAccuracy).toBe(0);

    // Expected hits without a zone keep the original time-only behaviour.
    expect(scoreDrumBenchmark([600], [hit('hihat', 601, 'Right')]).matched).toBe(1);
  });

  it('adds conservative audio-assisted mouth accent', () => {
    expect(voiceActivityMouthAccent(0.1, 0.2)).toBeGreaterThan(0.1);
    expect(voiceActivityMouthAccent(0.9, 0.02)).toBeGreaterThanOrEqual(0.9);
  });
});

describe('calibrated two-camera drum fusion (issue #241)', () => {
  const intrinsics = { fx: 900, fy: 900, cx: 640, cy: 360, width: 1280, height: 720 };
  const zones = [
    { id: 'snare', type: 'snare' as const, center: { x: 0, y: 0, z: 0 }, radius: 0.16, cooldownMs: 45 },
    { id: 'hihat', type: 'hihat' as const, center: { x: -0.52, y: -0.1, z: 0.1 }, radius: 0.14, cooldownMs: 40 },
  ];

  function calibrate(cameraId: string, eye: { x: number; y: number; z: number }, stageFrameId = 'kit') {
    const extrinsics = cameraLookAt(eye, { x: 0, y: -0.1, z: 0.05 });
    expect(extrinsics).not.toBeNull();
    return {
      schema: STAGE_CALIBRATION_SCHEMA,
      cameraId,
      stageFrameId,
      capturedAtMs: 0,
      intrinsics,
      extrinsics: extrinsics!,
    } as const;
  }

  const front = calibrate('front', { x: 0, y: -0.95, z: -1.75 });
  const side = calibrate('side', { x: 1.62, y: -0.62, z: -0.3 });
  const checkpoints = (calibration: typeof front) => [
    { x: 0, y: 0, z: 0 },
    { x: -0.52, y: -0.1, z: 0.1 },
    { x: 0.3, y: -0.3, z: 0.2 },
    { x: -0.2, y: -0.05, z: -0.1 },
  ].map((stage) => ({ stage, image: projectStagePoint(calibration, stage)! }));

  const acceptedFront = { calibration: front, quality: evaluateCalibration(front, checkpoints(front)) };
  const acceptedSide = { calibration: side, quality: evaluateCalibration(side, checkpoints(side)) };

  it('round-trips projection and triangulates the stage point both cameras see', () => {
    const truth = { x: 0.12, y: -0.05, z: 0.08 };
    const frontImage = projectStagePoint(front, truth)!;
    const sideImage = projectStagePoint(side, truth)!;
    const triangulated = triangulateRays(backProjectImagePoint(front, frontImage)!, backProjectImagePoint(side, sideImage)!)!;
    expect(triangulated.position.x).toBeCloseTo(truth.x, 6);
    expect(triangulated.position.y).toBeCloseTo(truth.y, 6);
    expect(triangulated.position.z).toBeCloseTo(truth.z, 6);
    expect(triangulated.rayGapM).toBeLessThan(1e-9);

    // A point behind the camera never projects, and two rays from the same
    // camera are degenerate rather than silently "triangulated".
    expect(projectStagePoint(front, { x: 0, y: 0, z: -3 })).toBeNull();
    const ray = backProjectImagePoint(front, frontImage)!;
    expect(triangulateRays(ray, ray)).toBeNull();
  });

  it('accepts a good calibration and rejects a nudged one on reprojection error', () => {
    expect(MULTICAM_MAX_REPROJECTION_ERROR_PX).toBe(3);
    expect(acceptedFront.quality.accepted).toBe(true);
    expect(acceptedFront.quality.meanReprojectionErrorPx).toBeLessThan(1e-6);

    // Three checkpoints cannot pin a six-degree-of-freedom transform.
    expect(evaluateCalibration(front, checkpoints(front).slice(0, 3)).accepted).toBe(false);

    // A camera bumped 4 cm sideways after calibration: same orientation, so
    // nothing re-aims to hide the shift, which is what a knocked tripod does.
    const bumped = {
      ...front,
      extrinsics: { ...front.extrinsics, translation: { ...front.extrinsics.translation, x: front.extrinsics.translation.x + 0.04 } },
    };
    const drifted = evaluateCalibration(bumped, checkpoints(front));
    expect(drifted.accepted).toBe(false);
    expect(drifted.rejectionReason).toContain('reprojection error');

    // A non-orthonormal rotation is refused before any point is projected.
    const skewed = { ...front, extrinsics: { rotation: [1, 0, 0, 0, 1, 0, 0, 0, 2], translation: { x: 0, y: 0, z: 1 } } };
    expect(evaluateCalibration(skewed, checkpoints(front)).rejectionReason).toContain('orthonormal');
  });

  it('measures capture skew and drift, and corrects both', () => {
    const skew = (stageMs: number) => stageMs + 137.4 + (2.4 / 60_000) * stageMs;
    const alignment = measureCaptureTimestampAlignment([0, 2000, 4000, 6000, 8000].map((stageMs) => ({
      primaryMs: stageMs,
      secondaryMs: skew(stageMs),
    })));
    expect(alignment.accepted).toBe(true);
    expect(alignment.offsetMs).toBeCloseTo(137.4, 3);
    expect(alignment.driftMsPerMinute).toBeCloseTo(2.4, 3);
    expect(alignment.maxResidualMs).toBeLessThan(MULTICAM_MAX_SYNC_RESIDUAL_MS);
    expect(applyClockAlignment(skew(5000), alignment)).toBeCloseTo(5000, 6);

    // Too few events, no time span, and runaway drift are each refused.
    expect(measureCaptureTimestampAlignment([{ primaryMs: 0, secondaryMs: 10 }]).accepted).toBe(false);
    expect(measureCaptureTimestampAlignment([0, 0, 0].map((t) => ({ primaryMs: t, secondaryMs: t + 5 }))).rejectionReason)
      .toContain('span enough time');
    const fast = measureCaptureTimestampAlignment([0, 2000, 4000].map((stageMs) => ({
      primaryMs: stageMs,
      secondaryMs: stageMs + 20 + (MULTICAM_MAX_DRIFT_MS_PER_MIN * 4 / 60_000) * stageMs,
    })));
    expect(fast.accepted).toBe(false);
    expect(fast.rejectionReason).toContain('drift');
  });

  it('refuses to fuse uncalibrated, unaligned, or foreign-stage sources', () => {
    const truth = { x: 0.02, y: -0.02, z: 0.03 };
    const observe = (cameraId: string, calibration: typeof front, timeMs: number) => ({
      cameraId,
      stickId: 'Right',
      timeMs,
      image: projectStagePoint(calibration, truth)!,
      confidence: 0.8,
    });
    const observations = [observe('front', front, 100), observe('side', side, 100)];

    const rejectedCalibration = fuseCameraObservations(observations, [
      acceptedFront,
      { calibration: side, quality: { ...acceptedSide.quality, accepted: false, rejectionReason: 'moved' } },
    ]);
    expect(rejectedCalibration.fused).toHaveLength(0);
    expect(rejectedCalibration.degradedToSingleCamera).toBe(true);
    expect(rejectedCalibration.rejected.map((entry) => entry.reason)).toContain('uncalibrated');

    const unaligned = fuseCameraObservations(observations, [
      acceptedFront,
      { ...acceptedSide, clockAlignment: measureCaptureTimestampAlignment([{ primaryMs: 0, secondaryMs: 5 }]) },
    ]);
    expect(unaligned.fused).toHaveLength(0);
    expect(unaligned.rejected.map((entry) => entry.reason)).toContain('clockUnaligned');

    // Two cameras calibrated against different stage frames disqualify each
    // other rather than being combined into meaningless coordinates.
    const foreign = calibrate('side', { x: 1.62, y: -0.62, z: -0.3 }, 'other-kit');
    const mismatched = fuseCameraObservations(observations, [
      acceptedFront,
      { calibration: foreign, quality: evaluateCalibration(foreign, checkpoints(foreign)) },
    ]);
    expect(mismatched.fused).toHaveLength(0);
    expect(mismatched.usableCameras).toHaveLength(0);
    expect(mismatched.rejected.map((entry) => entry.reason)).toContain('stageFrameMismatch');

    // Stale and non-finite input never reach the geometry.
    const stale = fuseCameraObservations(observations, [acceptedFront, acceptedSide], { nowMs: 5000, maxAgeMs: 120 });
    expect(stale.rejected.every((entry) => entry.reason === 'stale')).toBe(true);
    const garbage = fuseCameraObservations(
      [{ ...observe('front', front, 100), image: { x: Number.NaN, y: 0.5 } }],
      [acceptedFront, acceptedSide],
    );
    expect(garbage.rejected.map((entry) => entry.reason)).toEqual(['nonFinite']);
  });

  it('triangulates a trajectory into the existing detector and never guesses depth from one view', () => {
    // A descending stroke onto the snare, sampled by both cameras.
    const path = [
      { timeMs: 0, position: { x: 0, y: -0.09, z: 0 } },
      { timeMs: 16, position: { x: 0, y: -0.05, z: 0 } },
      { timeMs: 32, position: { x: 0, y: 0, z: 0 } },
    ];
    const observations = path.flatMap((step) => [front, side].map((calibration) => ({
      cameraId: calibration.cameraId,
      stickId: 'Right',
      timeMs: step.timeMs,
      image: projectStagePoint(calibration, step.position)!,
      confidence: 0.8,
      hand: 'Right' as const,
    })));
    const report = fuseCameraObservations(observations, [acceptedFront, acceptedSide]);
    expect(report.fused).toHaveLength(3);
    expect(report.degradedToSingleCamera).toBe(false);
    expect(report.fused[2].position.y).toBeCloseTo(0, 6);
    expect(report.fused[0].rayGapM).toBeLessThan(1e-6);

    const samples = toStickTipSamples(report.fused);
    expect(samples).toHaveLength(2);
    const hits = new DrumHitDetector(zones).detect(samples[1]);
    expect(hits).toHaveLength(1);
    expect(hits[0].zoneId).toBe('snare');
    expect(hits[0].hand).toBe('Right');

    // One camera alone yields no stage samples: a single ray leaves depth free,
    // so the caller stays on the single-camera pipeline instead.
    const singleView = fuseCameraObservations(
      observations.filter((entry) => entry.cameraId === 'front'),
      [acceptedFront, acceptedSide],
    );
    expect(singleView.fused).toHaveLength(0);
    expect(singleView.rejected.every((entry) => entry.reason === 'singleView')).toBe(true);
  });

  it('corroborates a stroke both cameras saw and settles the zone from 3D, not from either view', () => {
    const truth = { x: -0.5, y: -0.1, z: 0.12 };
    const candidate = (calibration: typeof front, timeMs: number, zoneId: string, confidence: number) => ({
      cameraId: calibration.cameraId,
      stickId: 'Right',
      timeMs,
      zoneId,
      zoneType: 'hihat' as const,
      image: projectStagePoint(calibration, truth)!,
      velocity: { x: 0, y: 1.2, z: 0 },
      speed: 1.2,
      confidence,
      hand: 'Right' as const,
    });
    // The front camera mislabels the stroke as a snare hit; the side camera
    // calls it a hi-hat. Triangulation decides, and it decides for the hi-hat.
    const report = fuseCameraHitCandidates(
      [candidate(front, 500, 'snare', 0.7), candidate(side, 506, 'hihat', 0.65)],
      [acceptedFront, acceptedSide],
      { zones },
    );
    expect(report.hits).toHaveLength(1);
    expect(report.hits[0].corroborated).toBe(true);
    expect(report.hits[0].planeConstrained).toBe(false);
    expect(report.hits[0].event.zoneId).toBe('hihat');
    expect(report.hits[0].event.timeNs / 1_000_000).toBeCloseTo(503, 6);
    // Corroboration is evidence, so the fused stroke outranks either input.
    expect(report.hits[0].event.confidence).toBeGreaterThan(0.7);
    expect(report.hits[0].sources).toHaveLength(2);
  });

  it('keeps a stroke only one camera saw, and does not double-count a disagreeing pair', () => {
    const truth = { x: -0.5, y: -0.1, z: 0.12 };
    const single = fuseCameraHitCandidates(
      [{
        cameraId: 'front',
        stickId: 'Right',
        timeMs: 500,
        zoneId: 'hihat',
        zoneType: 'hihat' as const,
        image: projectStagePoint(front, truth)!,
        velocity: { x: 0, y: 1.2, z: 0 },
        speed: 1.2,
        confidence: 0.8,
        hand: 'Right' as const,
      }],
      [acceptedFront, acceptedSide],
      { zones },
    );
    // The occlusion case: one view, resolved against the calibrated head plane
    // and marked so nothing downstream mistakes it for a stereo fix.
    expect(single.hits).toHaveLength(1);
    expect(single.hits[0].corroborated).toBe(false);
    expect(single.hits[0].planeConstrained).toBe(true);
    expect(single.hits[0].event.zoneId).toBe('hihat');
    expect(single.hits[0].event.confidence).toBeLessThan(0.8);

    // Same stroke, but the side camera's ray misses by more than the gap
    // threshold — a drifted calibration. Both still resolve onto the hi-hat, so
    // without the de-duplication this stroke would be counted twice.
    const offset = { x: truth.x, y: truth.y, z: truth.z + 0.1 };
    const disagreeing = fuseCameraHitCandidates(
      [
        { cameraId: 'front', stickId: 'Right', timeMs: 500, zoneId: 'hihat', zoneType: 'hihat' as const, image: projectStagePoint(front, truth)!, velocity: { x: 0, y: 1.2, z: 0 }, speed: 1.2, confidence: 0.8 },
        { cameraId: 'side', stickId: 'Right', timeMs: 504, zoneId: 'hihat', zoneType: 'hihat' as const, image: projectStagePoint(side, offset)!, velocity: { x: 0, y: 1.2, z: 0 }, speed: 1.2, confidence: 0.6 },
      ],
      [acceptedFront, acceptedSide],
      { zones },
    );
    expect(disagreeing.hits).toHaveLength(1);
    expect(disagreeing.hits[0].corroborated).toBe(false);
    expect(disagreeing.rejected.map((entry) => entry.reason)).toContain('rayGap');
    expect(MULTICAM_MAX_RAY_GAP_M).toBe(0.03);
  });

  it('keeps two simultaneous strokes on different zones apart', () => {
    // A backbeat: snare and hi-hat struck on the same instant. Matching by time
    // alone would merge them; matching by ray agreement does not.
    const strokes = [
      { zoneId: 'snare', zoneType: 'snare' as const, position: { x: 0.01, y: 0, z: 0.01 }, hand: 'Left' as const },
      { zoneId: 'hihat', zoneType: 'hihat' as const, position: { x: -0.5, y: -0.1, z: 0.11 }, hand: 'Right' as const },
    ];
    const candidates = strokes.flatMap((stroke) => [front, side].map((calibration) => ({
      cameraId: calibration.cameraId,
      stickId: stroke.hand,
      timeMs: 900,
      zoneId: stroke.zoneId,
      zoneType: stroke.zoneType,
      image: projectStagePoint(calibration, stroke.position)!,
      velocity: { x: 0, y: 1.1, z: 0 },
      speed: 1.1,
      confidence: 0.8,
      hand: stroke.hand,
    })));
    const report = fuseCameraHitCandidates(candidates, [acceptedFront, acceptedSide], { zones });
    expect(report.hits).toHaveLength(2);
    expect(report.hits.every((hit) => hit.corroborated)).toBe(true);
    expect(new Set(report.hits.map((hit) => hit.event.zoneId))).toEqual(new Set(['snare', 'hihat']));
    expect(report.hits.find((hit) => hit.event.zoneId === 'snare')?.event.hand).toBe('Left');
  });

  it('resolves single-view depth only onto a calibrated head, never into open air', () => {
    const onHead = backProjectImagePoint(front, projectStagePoint(front, { x: -0.5, y: -0.1, z: 0.1 })!)!;
    expect(intersectRayWithZonePlane(onHead, zones)?.zoneId).toBe('hihat');
    // A stick waved well clear of the kit intersects no zone at all.
    const offKit = backProjectImagePoint(front, projectStagePoint(front, { x: 1.4, y: -0.1, z: 0.1 })!)!;
    expect(intersectRayWithZonePlane(offKit, zones)).toBeNull();
  });
});

describe('local drum benchmark runner (issue #234)', () => {
  it('runs a detector command adapter and emits redacted JSON/Markdown scores', async () => {
    const root = mkdtempSync(join(tmpdir(), 'minamo-drum-'));
    try {
      const media = join(root, 'private-session.mp4');
      const detected = join(root, 'private', 'detected.json');
      const manifestPath = join(root, 'manifest.json');
      const mediaBytes = Buffer.from('local private media fixture');
      writeFileSync(media, mediaBytes);
      const manifest = {
        schema: 'minamo.drum-benchmark-manifest.v1',
        outputDir: 'report',
        toleranceMs: 35,
        minimumSeparationMs: 35,
        clips: [{
          id: 'alternating-hands',
          media: 'private-session.mp4',
          sha256: createHash('sha256').update(mediaBytes).digest('hex'),
          durationMs: 1000,
          video: { fps: 60, width: 1280, height: 720 },
          audio: { codec: 'aac', sampleRate: 48000, channels: 2 },
          consent: { localOnly: true, license: 'private-consented', reportMetadataAllowed: true },
          annotations: [
            { timeMs: 100, zoneId: 'snare', hand: 'Right' },
            { timeMs: 500, zoneId: 'snare', hand: 'Left' },
          ],
          detectedEvents: 'private/detected.json',
          pipeline: { name: 'fixture-detector', version: '1', command: ['fixture-detector', '{detected}'] },
          pass: { precision: 1, recall: 1, falseDoubleHits: 0, p95TimingErrorMs: 5, zoneAccuracy: 1, handAssignmentAccuracy: 1 },
        }],
      };
      writeFileSync(manifestPath, JSON.stringify(manifest));
      expect(validateDrumBenchmarkManifest(manifest).clips).toHaveLength(1);
      const result = await runDrumBenchmark(manifestPath, {
        probeMedia: () => ({
          durationMs: 1000,
          video: { codec: 'h264', fps: 60, width: 1280, height: 720 },
          audio: { codec: 'aac', sampleRate: 48000, channels: 2 },
          ffprobeVersion: 'ffprobe fixture',
        }),
        runPipeline: (command) => {
          expect(command[0]).toBe('fixture-detector');
          writeFileSync(command[1], JSON.stringify({
            schema: DRUM_DETECTED_EVENTS_SCHEMA,
            events: [
              fixtureDrumHit('right', 102, 'Right'),
              fixtureDrumHit('left', 503, 'Left'),
            ],
          }));
        },
      });
      expect(result.report.pass).toBe(true);
      expect(result.report.clips[0].score.meanTimingErrorMs).toBe(2.5);
      const markdown = formatDrumBenchmarkMarkdown(result.report);
      expect(markdown).toContain('alternating-hands');
      expect(markdown).not.toContain(root);
      expect(markdown).toContain('Raw video/audio is not embedded');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function fixtureDrumHit(eventId: string, timeMs: number, hand: 'Left' | 'Right') {
  return {
    eventId,
    timeNs: timeMs * 1_000_000,
    hand,
    stickId: `stick-${hand.toLowerCase()}`,
    zoneId: 'snare',
    zoneType: 'snare',
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 1, z: 0 },
    speed: 1,
    confidence: 0.9,
    audioAligned: true,
  };
}

describe('stability layer', () => {
  it('guards finite values and rig ranges', () => {
    expect(finiteNumber(Number.NaN, 0.25).value).toBe(0.25);
    const guarded = finiteVec3Guard({ x: Number.NaN, y: 1, z: Infinity }, { x: 0, y: 0, z: 0 });
    expect(guarded.value).toEqual({ x: 0, y: 1, z: 0 });
    expect(guarded.warnings).toEqual(['NON_FINITE_VEC3_X', 'NON_FINITE_VEC3_Z']);
    expect(clampRigParameter(2, 0, 1).value).toBe(1);
    expect(clampRigParameter(2, 0, 1).warnings).toContain('RIG_PARAMETER_CLAMPED');
  });

  it('rejects temporal outliers and clamps velocity', () => {
    const rejector = new TemporalOutlierRejector(0.2);
    expect(rejector.update({ x: 0, y: 0, z: 0 }).warnings).toEqual([]);
    const rejected = rejector.update({ x: 5, y: 0, z: 0 });
    expect(rejected.value.x).toBe(0);
    expect(rejected.warnings).toContain('TEMPORAL_OUTLIER');

    const clamp = new VelocityClamp(1);
    clamp.update({ x: 0, y: 0, z: 0 }, 0);
    const clamped = clamp.update({ x: 10, y: 0, z: 0 }, 0.1);
    expect(clamped.value.x).toBeLessThanOrEqual(0.100001);
    expect(clamped.warnings).toContain('VELOCITY_CLAMPED');
  });

  it('limits acceleration/jerk and handles occlusion phases', () => {
    const clamp = new AccelerationJerkClamp(2, 10);
    clamp.update({ x: 0, y: 0, z: 0 }, 0);
    const out = clamp.update({ x: 10, y: 0, z: 0 }, 0.016);
    expect(out.warnings.length).toBeGreaterThan(0);

    const occ = new OcclusionStateMachine();
    expect(occ.update(0.9, 100)).toBe('reacquiring');
    expect(occ.update(0.9, 200)).toBe('tracked');
    expect(occ.update(0.1, 100)).toBe('suspect');
    expect(occ.update(0.1, 400)).toBe('lost');
  });

  it('uses confidence blending and quaternion shortest path', () => {
    expect(confidenceWeightedBlend(0, 1, 0.25)).toBe(0.25);
    const previous = { x: 0, y: 0, z: 0, w: 1 };
    const flipped = shortestPathQuat(previous, { x: 0, y: 0, z: 0, w: -1 });
    expect(flipped.w).toBe(1);
    expect(slerpQuat(previous, { x: 0, y: 0, z: 0, w: -1 }, 0.5).w).toBeGreaterThan(0.99);
  });

  it('guards frames/fingers and leaves the input unmutated (#259)', () => {
    const frame = createEmptyFrame(1, 0);
    frame.tracking.hands = [];
    frame.tracking.face = {
      detected: true,
      confidence: 1,
      headRotation: { x: Number.NaN, y: 0, z: 0, w: 1 },
      leftEye: defaultEye(),
      rightEye: defaultEye(),
      mouth: defaultMouth(),
      blendshapes: { jawOpen: 2, browInnerUp: Number.NaN },
      warnings: [],
    };
    const guarded = finiteFrameGuard(frame);
    // Output is guarded...
    expect(guarded.value.tracking.face?.blendshapes.jawOpen).toBe(1);
    expect(Number.isFinite(guarded.value.tracking.face?.blendshapes.browInnerUp ?? NaN)).toBe(true);
    expect(Number.isFinite(guarded.value.tracking.face?.headRotation?.x ?? NaN)).toBe(true);
    // ...the input frame is not mutated (shallow-copy contract)...
    expect(frame.tracking.face?.blendshapes.jawOpen).toBe(2);
    expect(Number.isNaN(frame.tracking.face?.blendshapes.browInnerUp ?? 0)).toBe(true);
    expect(guarded.value.tracking.face).not.toBe(frame.tracking.face);
    // ...and untouched branches are shared, not needlessly deep-copied.
    expect(guarded.value.tracking.hands).toBe(frame.tracking.hands);

    const finger = solveHandState({ handedness: 'Right', landmarks: createSyntheticHandLandmarks(0.3, 'Right') }).fingers.index;
    finger.curl = 5;
    finger.spread = -9;
    const clamped = clampFingerState(finger);
    expect(clamped.value.curl).toBe(1);
    expect(clamped.value.spread).toBe(-0.55);
    expect(finger.curl).toBe(5); // input untouched
    expect(clamped.value.mcp).not.toBe(finger.mcp); // mutated branch is copied
    expect(clamped.value.tip).toBe(finger.tip); // untouched branch is shared
  });
});

const drumBenchmarkClips = JSON.parse(
  readFileSync(new URL('./fixtures/drum-benchmark-clips.json', import.meta.url), 'utf8'),
);

describe('drum benchmark clips (issues #121, #123)', () => {
  const findClip = (id: string) => drumBenchmarkClips.clips.find((clip: { id: string }) => clip.id === id);
  const toHits = (times: number[], zoneId: string) =>
    times.map((ms, index) => ({
      eventId: `${zoneId}-${index}`,
      timeNs: Math.round(ms * 1_000_000),
      zoneId,
      zoneType: zoneId,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      speed: 0,
      confidence: 1,
      audioAligned: false,
    }));
  const score = (clip: { expectedHitTimesMs: number[]; detectedHitTimesMs: number[]; zoneId: string }) =>
    scoreDrumBenchmark(
      clip.expectedHitTimesMs,
      toHits(clip.detectedHitTimesMs, clip.zoneId),
      drumBenchmarkClips.toleranceMs,
      drumBenchmarkClips.minimumSeparationMs,
    );

  it('scores a clean single-snare clip at full recall and precision', () => {
    const result = score(findClip('single-snare'));
    expect(result.recall).toBe(1);
    expect(result.precision).toBe(1);
    expect(result.falseDoubleHits).toBe(0);
  });

  it('passes the fast-roll stress test with no false double hits', () => {
    const result = score(findClip('fast-roll'));
    expect(result.recall).toBeGreaterThanOrEqual(0.9);
    expect(result.falseDoubleHits).toBe(0);
    // 16ths at 200 bpm never reach the separation window, which is exactly why
    // this clip alone does not stress the roll path.
    expect(result.minDetectedSeparationMs).toBeGreaterThan(drumBenchmarkClips.minimumSeparationMs);
  });

  it('passes a 32nd-note roll whose strokes sit below the separation window (#123)', () => {
    const clip = findClip('fast-roll-32nd');
    const result = score(clip);
    // The clip has to actually stress the detector, or the gate proves nothing.
    expect(result.minDetectedSeparationMs).toBeLessThan(drumBenchmarkClips.minimumSeparationMs);
    expect(result.recall).toBe(1);
    expect(result.precision).toBe(1);
    // Every detection is backed by a distinct expected hit, so none of these
    // sub-window gaps is a double-trigger. Under the previous rule this clip
    // reported one false double per stroke pair and could never pass.
    expect(result.falseDoubleHits).toBe(0);
    expect(clip.expectedHitTimesMs.length).toBe(12);
  });

  it('still counts a spurious re-trigger that matches no expected hit (#123)', () => {
    const result = score(findClip('double-trigger-regression'));
    expect(result.minDetectedSeparationMs).toBeLessThan(drumBenchmarkClips.minimumSeparationMs);
    expect(result.falseDoubleHits).toBe(1);
    expect(result.matched).toBe(2);
    expect(result.detected).toBe(3);
  });

  it('detects no hits for the false-positive hold clip', () => {
    const result = score(findClip('false-positive-hold'));
    expect(result.detected).toBe(0);
  });
});

describe('pose backend registry (issue #23)', () => {
  const makeBackend = (name: string, value: number) => ({
    name,
    detect: async () => [{ x: value, y: value, z: value }],
  });

  it('registers backends, defaults to the marked backend, and toggles at runtime', async () => {
    let mediapipeCreated = 0;
    let onnxCreated = 0;
    const registry = createPoseBackendRegistry([
      { name: 'mediapipe', isDefault: true, create: () => { mediapipeCreated += 1; return makeBackend('mediapipe', 1); } },
      { name: 'onnx-yolo-pose', create: () => { onnxCreated += 1; return makeBackend('onnx-yolo-pose', 2); } },
    ]);

    expect(registry.listBackends()).toEqual(['mediapipe', 'onnx-yolo-pose']);
    expect(registry.activeBackendName()).toBe('mediapipe');
    expect(mediapipeCreated).toBe(1);
    expect(onnxCreated).toBe(0); // lazy: not instantiated until selected

    expect((await registry.detect({} as HTMLVideoElement, 0))[0].x).toBe(1);

    registry.setActiveBackend('onnx-yolo-pose');
    expect(registry.activeBackendName()).toBe('onnx-yolo-pose');
    expect(onnxCreated).toBe(1);
    expect((await registry.detect({} as HTMLVideoElement, 0))[0].x).toBe(2);

    registry.setActiveBackend('mediapipe'); // reuses the existing instance
    expect(mediapipeCreated).toBe(1);
    expect(() => registry.setActiveBackend('missing')).toThrow(/Unknown pose backend/);
  });
});

describe('multi-avatar room layout (issue #43)', () => {
  const frame = () => createEmptyFrame(0, 0);
  const envelope = (participantId: string, sentAtMs: number) => wrapKGM1FrameForRoom('room-a', participantId, frame(), sentAtMs);

  it('assigns deterministic slots by participant id and fades out stale publishers', () => {
    const latest = latestFrameByParticipant([
      envelope('bob', 1000),
      envelope('alice', 990),
      envelope('carol', 100), // stale: should fade out
    ]);
    const slots = assignRoomLayoutSlots(latest, { nowMs: 1000, fadeMs: 800 });
    expect(slots.map((slot) => slot.participantId)).toEqual(['alice', 'bob']); // sorted, carol faded (age 900 > 800)
    expect(slots[0].slot).toBe(0);
    expect(slots[1].slot).toBe(1);
    expect(slots[0].active).toBe(true);

    const withCarol = assignRoomLayoutSlots(latest, { nowMs: 1000, fadeMs: 5000 });
    const carol = withCarol.find((slot) => slot.participantId === 'carol');
    expect(carol).toBeDefined();
    expect(carol!.fade).toBeGreaterThan(0);
    expect(carol!.fade).toBeLessThan(1);
  });

  it('respects the max slot count', () => {
    const latest = latestFrameByParticipant(['a', 'b', 'c', 'd'].map((id) => envelope(id, 1000)));
    expect(assignRoomLayoutSlots(latest, { nowMs: 1000, maxSlots: 2 }).length).toBe(2);
  });
});
