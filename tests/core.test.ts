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
  footHiHatOpenness,
  scoreFootPedalPress,
  FOOT_PEDAL_MIN_PRESS_SPEED_MPS,
  FOOT_PEDAL_MIN_VISIBILITY,
  BleMidiPacketDecoder,
  BleMidiStickSession,
  BLE_MIDI_CHARACTERISTIC_UUID,
  BLE_MIDI_SERVICE_UUID,
  BLE_MIDI_TIMESTAMP_WRAP_MS,
  describeStickDevice,
  extractStickStrikes,
  fuseStickHitsWithVisual,
  GM_PERCUSSION_ZONE_TYPES,
  selectStickTransport,
  stickStrikeToDrumHit,
  velocityToSpeed,
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
import type { FootPedalSample } from '../src/core';

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

  it('reads the foot as pedal evidence without letting it set timing (#118, #119)', () => {
    expect(FOOT_PEDAL_MIN_VISIBILITY).toBe(0.5);
    expect(FOOT_PEDAL_MIN_PRESS_SPEED_MPS).toBe(0.25);

    // +Y is down, so a press moves the foot toward larger y.
    const foot = (dy: number, visibility: number): FootPedalSample => ({
      side: 'Right',
      timeMs: 100,
      previousTimeMs: 80,
      position: { x: 0, y: 0.30 + dy, z: 0 },
      previousPosition: { x: 0, y: 0.30, z: 0 },
      visibility,
    });

    // 0.02 m in 20 ms is 1 m/s downward: a press.
    const pressing = scoreFootPedalPress(foot(0.02, 0.9));
    expect(pressing.pressing).toBe(true);
    expect(pressing.observed).toBe(true);
    expect(pressing.speedMps).toBeCloseTo(1, 6);

    // Visible and still: evidence AGAINST a press.
    const still = scoreFootPedalPress(foot(0, 0.9));
    expect(still.pressing).toBe(false);
    expect(still.observed).toBe(true);

    // Behind the kit: the model is guessing, so this is evidence of nothing.
    // `observed` false is what keeps a hidden foot from arguing either way.
    const hidden = scoreFootPedalPress(foot(0.02, 0.2));
    expect(hidden.observed).toBe(false);
    expect(hidden.pressing).toBe(false);

    // A lifting foot is not a press.
    expect(scoreFootPedalPress(foot(-0.02, 0.9)).pressing).toBe(false);
  });

  it('keeps audio as the kick timing source and lets the foot only move confidence (#119)', () => {
    const onsets = [{ timeMs: 54, strength: 0.7, frequencyHz: 80 }];
    const base = inferKickPedalHit(onsets, 50);
    expect(base?.zoneType).toBe('kick');
    expect(base?.audioAligned).toBe(true);

    const press: FootPedalSample = {
      side: 'Right', timeMs: 54, previousTimeMs: 34,
      position: { x: 0, y: 0.32, z: 0 }, previousPosition: { x: 0, y: 0.30, z: 0 }, visibility: 0.9,
    };
    const withPress = inferKickPedalHit(onsets, 50, 55, press);
    // The onset still sets the time — a beater behind the kit is not a timing
    // source, and a visually-derived kick time would be worse than the onset.
    expect(withPress?.timeNs).toBe(base?.timeNs);
    expect(withPress!.confidence).toBeGreaterThan(base!.confidence);
    expect(withPress!.speed).toBeGreaterThan(0);

    // Visible, still foot under a low-frequency onset: more likely a floor tom.
    const stillFoot: FootPedalSample = { ...press, position: { x: 0, y: 0.30, z: 0 } };
    const doubted = inferKickPedalHit(onsets, 50, 55, stillFoot);
    expect(doubted!.confidence).toBeLessThan(base!.confidence);
    // Still emitted, though: a beater can move with very little ankle travel.
    expect(doubted?.zoneType).toBe('kick');

    // A hidden foot must not change anything either way.
    const hiddenFoot: FootPedalSample = { ...press, visibility: 0.1 };
    expect(inferKickPedalHit(onsets, 50, 55, hiddenFoot)!.confidence).toBe(base!.confidence);

    // No qualifying onset means no event, foot or not.
    expect(inferKickPedalHit([{ timeMs: 54, strength: 0.9, frequencyHz: 4000 }], 50, 55, press)).toBeNull();
  });

  it('holds hi-hat openness between onsets instead of springing open (#118)', () => {
    const calibration = { openY: 0.20, closedY: 0.34 };
    const at = (y: number, visibility = 0.9): FootPedalSample => ({
      side: 'Left', timeMs: 100, previousTimeMs: 80,
      position: { x: 0, y, z: 0 }, previousPosition: { x: 0, y, z: 0 }, visibility,
    });

    expect(footHiHatOpenness(at(0.20), calibration)).toBeCloseTo(1, 6);
    expect(footHiHatOpenness(at(0.34), calibration)).toBeCloseTo(0, 6);
    expect(footHiHatOpenness(at(0.27), calibration)).toBeCloseTo(0.5, 6);
    // Past the calibrated ends, clamped rather than extrapolated.
    expect(footHiHatOpenness(at(0.40), calibration)).toBe(0);
    expect(footHiHatOpenness(at(0.10), calibration)).toBe(1);
    // Not visible, and a degenerate calibration, both decline to answer.
    expect(footHiHatOpenness(at(0.27, 0.2), calibration)).toBeNull();
    expect(footHiHatOpenness(at(0.27), { openY: 0.3, closedY: 0.3 })).toBeNull();

    // The rule the doc states: with no onset, hold — a hi-hat that stayed
    // closed between chicks did not spring open.
    expect(inferHiHatPedalState([], 500, 80, { previousOpenness: 0.15 })).toBeCloseTo(0.15, 6);
    // Backwards compatible: no options still collapses to 0.
    expect(inferHiHatPedalState([], 500)).toBe(0);

    // Foot alone carries openness between onsets.
    expect(inferHiHatPedalState([], 500, 80, { foot: at(0.34), calibration, previousOpenness: 0.9 }))
      .toBeCloseTo(0, 6);

    // With both, audio dominates but the foot pulls it toward the pedal.
    const onsets = [{ timeMs: 502, strength: 0.8, frequencyHz: 3000 }];
    const audioOnly = inferHiHatPedalState(onsets, 500);
    const blended = inferHiHatPedalState(onsets, 500, 80, { foot: at(0.34), calibration });
    expect(audioOnly).toBeCloseTo(0.8, 6);
    expect(blended).toBeLessThan(audioOnly);
    expect(blended).toBeCloseTo(0.56, 6);
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

describe('BLE-MIDI drum stick (issue #240)', () => {
  // Packet builders matching RP-052: header carries the 6 high timestamp bits,
  // each message is preceded by a byte carrying the 7 low bits.
  const header = (timeMs: number) => 0x80 | ((timeMs >> 7) & 0x3f);
  const stamp = (timeMs: number) => 0x80 | (timeMs & 0x7f);
  const NOTE_ON_CH10 = 0x99;
  const SNARE = 38;
  const CLOSED_HIHAT = 42;

  it('decodes single, multi-message, and running-status packets', () => {
    expect(BLE_MIDI_SERVICE_UUID).toBe('03b80e5a-ede8-4b33-a751-6ce34ec4c700');
    expect(BLE_MIDI_CHARACTERISTIC_UUID).toBe('7772e5db-3868-4112-a1a9-f2669d106bf3');

    const single = new BleMidiPacketDecoder().decode([header(1000), stamp(1000), NOTE_ON_CH10, SNARE, 100]);
    expect(single.messages).toEqual([{ deviceTimeMs: 1000, status: NOTE_ON_CH10, data1: SNARE, data2: 100 }]);

    const multi = new BleMidiPacketDecoder().decode([
      header(1000), stamp(1000), NOTE_ON_CH10, SNARE, 100,
      stamp(1010), NOTE_ON_CH10, CLOSED_HIHAT, 80,
    ]);
    expect(multi.messages.map((message) => message.deviceTimeMs)).toEqual([1000, 1010]);

    // Running status: the second message omits the status byte entirely.
    const running = new BleMidiPacketDecoder().decode([
      header(2000), stamp(2000), NOTE_ON_CH10, SNARE, 100,
      stamp(2010), CLOSED_HIHAT, 90,
    ]);
    expect(running.messages).toHaveLength(2);
    expect(running.messages[1]).toEqual({ deviceTimeMs: 2010, status: NOTE_ON_CH10, data1: CLOSED_HIHAT, data2: 90 });
  });

  it('unwraps the 13-bit timestamp, within a packet and across the rollover', () => {
    expect(BLE_MIDI_TIMESTAMP_WRAP_MS).toBe(8192);

    // The header's high bits are sent once per packet, so a packet whose
    // messages straddle a 128 ms boundary must advance them itself. Without
    // that, the second stroke here decodes 118 ms *earlier* than the first.
    const straddle = new BleMidiPacketDecoder().decode([
      header(1020), stamp(1020), NOTE_ON_CH10, SNARE, 100,
      stamp(1030), NOTE_ON_CH10, CLOSED_HIHAT, 80,
    ]);
    expect(straddle.messages.map((message) => message.deviceTimeMs)).toEqual([1020, 1030]);

    // The device clock repeats every 8.192 s; a stroke after the rollover must
    // not land before the one before it.
    const decoder = new BleMidiPacketDecoder();
    decoder.decode([header(8000), stamp(8000), NOTE_ON_CH10, SNARE, 100]);
    const wrapped = decoder.decode([header(100), stamp(100), NOTE_ON_CH10, SNARE, 100]);
    expect(wrapped.messages[0].deviceTimeMs).toBe(8292);

    // reset() is what a reconnect calls: the device starts counting again.
    decoder.reset();
    const reconnected = decoder.decode([header(50), stamp(50), NOTE_ON_CH10, SNARE, 100]);
    expect(reconnected.messages[0].deviceTimeMs).toBe(50);
  });

  it('degrades rather than throwing on malformed or unsupported packets', () => {
    const decoder = new BleMidiPacketDecoder();
    // Too short, no header bit, and a header with bit6 set are all rejected
    // whole rather than parsed partway.
    expect(decoder.decode([0x80, 0x80]).malformedBytes).toBe(2);
    expect(decoder.decode([0x00, 0x80, NOTE_ON_CH10, SNARE, 100]).malformedBytes).toBe(5);
    expect(decoder.decode([0xc0, 0x80, NOTE_ON_CH10, SNARE, 100]).malformedBytes).toBe(5);

    // Truncated mid-message: emit nothing rather than a note with a missing
    // velocity byte.
    const truncated = decoder.decode([header(10), stamp(10), NOTE_ON_CH10, SNARE]);
    expect(truncated.messages).toHaveLength(0);
    expect(truncated.malformedBytes).toBeGreaterThan(0);

    // A data byte with bit7 set is corruption, not a note.
    expect(decoder.decode([header(10), stamp(10), NOTE_ON_CH10, 0xff, 100]).messages).toHaveLength(0);

    // SysEx is skipped and flagged; a stick has no reason to send one, and
    // reading its payload as notes would fire hits that never happened.
    const sysex = decoder.decode([header(10), stamp(10), 0xf0, 0x7e, 0x00]);
    expect(sysex.skippedSysEx).toBe(true);
    expect(sysex.messages).toHaveLength(0);

    // System Real-Time bytes are legal anywhere and carry no hit.
    const clocked = decoder.decode([header(20), stamp(20), 0xf8, stamp(21), NOTE_ON_CH10, SNARE, 90]);
    expect(clocked.messages).toHaveLength(1);
  });

  it('treats a velocity-0 note-on as a note-off, not a strike', () => {
    const decoder = new BleMidiPacketDecoder();
    const decoded = decoder.decode([
      header(10), stamp(10), NOTE_ON_CH10, SNARE, 0,
      stamp(11), 0x89, SNARE, 64,
      stamp(12), NOTE_ON_CH10, SNARE, 96,
    ]);
    const strikes = extractStickStrikes(decoded.messages);
    expect(strikes).toHaveLength(1);
    expect(strikes[0]).toMatchObject({ note: SNARE, velocity: 96, channel: 9 });
  });

  it('maps GM percussion notes to zones and velocity to a stage speed', () => {
    const strike = { deviceTimeMs: 500, note: SNARE, velocity: 127, channel: 9 };
    const hit = stickStrikeToDrumHit(strike);
    expect(hit?.zoneType).toBe('snare');
    // The stick knows when and how hard, never where. A zero position is how a
    // consumer tells a stick-only hit from a vision hit.
    expect(hit?.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(hit?.speed).toBeCloseTo(6, 6);
    expect(velocityToSpeed(1)).toBeCloseTo(0.5, 3);
    expect(velocityToSpeed(0)).toBe(0.5);
    expect(velocityToSpeed(Number.NaN)).toBe(0);

    expect(GM_PERCUSSION_ZONE_TYPES[36]).toBe('kick');
    expect(GM_PERCUSSION_ZONE_TYPES[51]).toBe('ride');
    // Pedal hi-hat is a foot signal, not a stick strike.
    expect(GM_PERCUSSION_ZONE_TYPES[44]).toBe('pedal');
    // An unmapped note produces nothing rather than an 'unknown' zone hit.
    expect(stickStrikeToDrumHit({ ...strike, note: 3 })).toBeNull();

    // A learn step overrides the GM default, and channels can name the stick.
    const remapped = stickStrikeToDrumHit(strike, {
      mapping: { notes: { [SNARE]: { zoneId: 'rim', zoneType: 'snare' } }, handByChannel: { 9: 'Left' } },
    });
    expect(remapped?.zoneId).toBe('rim');
    expect(remapped?.hand).toBe('Left');

    // Device time is mapped onto the host clock when an alignment is supplied.
    const aligned = stickStrikeToDrumHit(strike, { toHostTimeMs: (deviceMs) => deviceMs + 1000 });
    expect(aligned?.timeNs).toBe(1_500_000_000);
  });

  it('aligns the stick clock to the host clock with the shared fit', () => {
    // The stick's 13-bit clock is unrelated to the host's, and BLE adds a
    // latency offset on top. The fit from #241 is the same problem, so it is
    // reused rather than re-derived.
    const toDevice = (hostMs: number) => hostMs - 4210 + (1.8 / 60_000) * hostMs;
    const alignment = measureCaptureTimestampAlignment([0, 2000, 4000, 6000].map((hostMs) => ({
      primaryMs: hostMs,
      secondaryMs: toDevice(hostMs),
    })));
    expect(alignment.accepted).toBe(true);
    const hit = stickStrikeToDrumHit(
      { deviceTimeMs: toDevice(5000), note: SNARE, velocity: 100, channel: 9 },
      { toHostTimeMs: (deviceMs) => applyClockAlignment(deviceMs, alignment) },
    );
    expect(hit!.timeNs / 1_000_000).toBeCloseTo(5000, 3);
  });

  it('lets the stick time a stroke the camera positioned, and neither source silence the other', () => {
    const visual = (zoneType: 'snare' | 'hihat', timeMs: number, position: { x: number; y: number; z: number }) => ({
      eventId: `v:${zoneType}:${timeMs}`,
      timeNs: timeMs * 1_000_000,
      zoneId: zoneType,
      zoneType,
      position,
      velocity: { x: 0, y: 1, z: 0 },
      speed: 1.4,
      confidence: 0.7,
      audioAligned: false,
    });
    const stickHits = [
      stickStrikeToDrumHit({ deviceTimeMs: 1000, note: SNARE, velocity: 110, channel: 9 })!,
      // A stroke the camera missed — the occlusion case the accessory is for.
      stickStrikeToDrumHit({ deviceTimeMs: 2000, note: CLOSED_HIHAT, velocity: 70, channel: 9 })!,
    ];
    const visualHits = [
      visual('snare', 1018, { x: 0.02, y: 0, z: 0.01 }),
      // A stroke the stick missed — a dropped packet must not delete it.
      visual('hihat', 3000, { x: -0.5, y: -0.1, z: 0.1 }),
    ];

    const fused = fuseStickHitsWithVisual(stickHits, visualHits, 30);
    expect(fused).toHaveLength(3);

    const merged = fused[0];
    expect(merged.positioned).toBe(true);
    expect(merged.stickTimed).toBe(true);
    // The stick wins on timing and velocity, the camera on position.
    expect(merged.event.timeNs).toBe(1_000_000_000);
    expect(merged.event.position).toEqual({ x: 0.02, y: 0, z: 0.01 });
    expect(merged.event.speed).toBeCloseTo(stickHits[0].speed, 6);
    expect(merged.event.confidence).toBeGreaterThan(0.7);

    expect(fused[1]).toMatchObject({ positioned: false, stickTimed: true });
    expect(fused[2]).toMatchObject({ positioned: true, stickTimed: false });
    expect(fused[2].event.eventId).toBe('v:hihat:3000');
  });

  it('does not replay strokes across a reconnect', () => {
    const session = new BleMidiStickSession();
    // Nothing is ingested before connect.
    expect(session.ingest([header(10), stamp(10), NOTE_ON_CH10, SNARE, 100])).toHaveLength(0);

    session.connect();
    const packet = [header(500), stamp(500), NOTE_ON_CH10, SNARE, 100];
    expect(session.ingest(packet)).toHaveLength(1);
    // A retransmitted packet is the same stroke, not a second one.
    expect(session.ingest(packet)).toHaveLength(0);

    session.disconnect();
    session.connect();
    // After a reconnect the device clock restarts, so the buffered packet
    // decodes to the same host time again. Emitting it twice would make the
    // avatar play a stroke the drummer never played.
    expect(session.ingest(packet)).toHaveLength(0);
    const status = session.getStatus();
    expect(status.reconnects).toBe(1);
    expect(status.emitted).toBe(1);
    expect(status.suppressedDuplicates).toBe(2);

    // A genuinely new stroke still gets through after the reconnect.
    expect(session.ingest([header(900), stamp(900), NOTE_ON_CH10, CLOSED_HIHAT, 90])).toHaveLength(1);
  });

  it('maps the whole GM percussion range, not only the drum kit', () => {
    // An unmapped note makes stickStrikeToDrumHit return null, so before GM
    // 60-81 was in the table an e-kit or pad controller playing congas or
    // bongos produced strikes that vanished instead of arriving.
    const strike = (note: number) => ({ note, velocity: 100, channel: 9, deviceTimeMs: 1000 });

    // Congas and bongos land on the head/edge zones the conga and bongo kits use.
    expect(stickStrikeToDrumHit(strike(60))?.zoneType).toBe('head'); // Hi Bongo
    expect(stickStrikeToDrumHit(strike(61))?.zoneType).toBe('head'); // Low Bongo
    expect(stickStrikeToDrumHit(strike(63))?.zoneType).toBe('head'); // Open Hi Conga
    expect(stickStrikeToDrumHit(strike(64))?.zoneType).toBe('head'); // Low Conga
    expect(stickStrikeToDrumHit(strike(62))?.zoneType).toBe('edge'); // Mute Hi Conga

    // Shakers, blocks, scrapers and bells share the generic zone.
    for (const note of [67, 69, 70, 75, 76, 80]) {
      expect(stickStrikeToDrumHit(strike(note))?.zoneType).toBe('percussion');
    }

    // Nothing in the GM percussion range is silently dropped any more.
    for (let note = 35; note <= 81; note++) {
      expect(stickStrikeToDrumHit(strike(note)), `GM note ${note} produced no hit`).not.toBeNull();
    }
    // Outside the range there is still nothing honest to say, so it stays null
    // rather than being invented as 'unknown'.
    expect(stickStrikeToDrumHit(strike(34))).toBeNull();
    expect(stickStrikeToDrumHit(strike(82))).toBeNull();

    // The drum-kit mappings are untouched.
    expect(stickStrikeToDrumHit(strike(38))?.zoneType).toBe('snare');
    expect(stickStrikeToDrumHit(strike(42))?.zoneType).toBe('hihat');
    expect(stickStrikeToDrumHit(strike(36))?.zoneType).toBe('kick');
  });

  it('chooses a transport from capabilities, never from the user agent', () => {
    // Web MIDI wins when present: an OS-paired BLE-MIDI stick is an ordinary
    // MIDI port, so the OS owns pairing, reconnect and the BLE-MIDI decode.
    const chrome = selectStickTransport({ hasWebMidi: true, hasWebBluetooth: true, hasNativeBridge: false });
    expect(chrome.preferred).toBe('webMidi');
    expect(chrome.available).toEqual(['webMidi', 'webBluetooth']);

    // Firefox implements Web MIDI but rejects until a site permission add-on is
    // installed, so "unavailable" would be wrong and "later" would be useless.
    const firefox = selectStickTransport({
      hasWebMidi: true, hasWebBluetooth: false, hasNativeBridge: false, webMidiNeedsSitePermissionAddon: true,
    });
    expect(firefox.preferred).toBe('webMidi');
    expect(firefox.diagnostic).toContain('add-on');

    // Safari/WebKit has neither API and none in progress, so the copy names the
    // way out and says the camera path is unaffected.
    const safari = selectStickTransport({ hasWebMidi: false, hasWebBluetooth: false, hasNativeBridge: false });
    expect(safari.preferred).toBeNull();
    expect(safari.diagnostic).toContain('desktop app');
    expect(safari.diagnostic).toContain('unaffected');

    // The desktop app on macOS/Linux: WebKit webview, so the native bridge is
    // the only path and is preferred over nothing.
    expect(selectStickTransport({ hasWebMidi: false, hasWebBluetooth: false, hasNativeBridge: true }).preferred).toBe('native');
  });

  it('survives arbitrary bytes from the air, holding its output invariants', () => {
    // Packets come off a wireless link from a device nobody controls, so the
    // decoder is on the same untrusted path the binary parsers were fuzzed on
    // (#262). Seeded so a failure is reproducible.
    let seed = 0x9e3779b9;
    const nextByte = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) & 0xff;
    };

    const decoder = new BleMidiPacketDecoder();
    for (let iteration = 0; iteration < 20_000; iteration++) {
      const length = nextByte() % 24;
      const packet = Array.from({ length }, nextByte);
      const result = decoder.decode(packet);
      expect(result.malformedBytes).toBeGreaterThanOrEqual(0);
      for (const message of result.messages) {
        // Never emit a data byte that was really a status or timestamp byte,
        // and never emit a time that is not a usable number.
        expect(message.data1).toBeLessThan(0x80);
        expect(message.data2).toBeLessThan(0x80);
        expect(Number.isFinite(message.deviceTimeMs)).toBe(true);
        expect(message.deviceTimeMs).toBeGreaterThanOrEqual(0);
        expect(message.status).toBeGreaterThanOrEqual(0x80);
        expect(message.status).toBeLessThan(0xf0);
      }
      // Anything that survives to a hit must be a hit the schema allows.
      for (const strike of extractStickStrikes(result.messages)) {
        expect(strike.velocity).toBeGreaterThan(0);
        const hit = stickStrikeToDrumHit(strike);
        if (!hit) continue;
        expect(Number.isFinite(hit.speed)).toBe(true);
        expect(hit.speed).toBeGreaterThan(0);
        expect(Number.isFinite(hit.timeNs)).toBe(true);
      }
    }
  });

  it('never puts a device identifier in a log line', () => {
    expect(describeStickDevice({ name: 'Freedrum', id: 'aa:bb:cc:dd:ee:ff' })).toBe('Freedrum (id redacted)');
    expect(describeStickDevice({ id: 'aa:bb:cc:dd:ee:ff' })).not.toContain('aa:bb');
    expect(describeStickDevice({})).toContain('id redacted');
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
