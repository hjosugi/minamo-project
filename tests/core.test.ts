import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
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
  fetchAndVerifyModel,
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
    expect(createDrumDatasetAnnotation('frame-1', [{
      kind: 'stick',
      id: 'stick-r',
      points: [{ x: 0, y: 0, z: 0 }],
      hand: 'Right',
    }]).schema).toBe('minamo.drum-dataset.v1');
  });

  it('adds conservative audio-assisted mouth accent', () => {
    expect(voiceActivityMouthAccent(0.1, 0.2)).toBeGreaterThan(0.1);
    expect(voiceActivityMouthAccent(0.9, 0.02)).toBeGreaterThanOrEqual(0.9);
  });
});

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
