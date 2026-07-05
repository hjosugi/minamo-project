import { describe, expect, it } from 'vitest';
import {
  ConfidenceDecay,
  FingerContactHysteresis,
  AccelerationJerkClamp,
  AudioOnsetDetector,
  OcclusionStateMachine,
  TemporalOutlierRejector,
  VelocityClamp,
  clampRigParameter,
  confidenceWeightedBlend,
  computeFingerCurl,
  computePalmBasis,
  createSyntheticHandLandmarks,
  deriveFingerChain,
  detectHandSwap,
  finiteNumber,
  fuseVisualHitWithAudio,
  estimateHitVelocity,
  classifyLowLight,
  classifyMotionBlur,
  privacyPreservingDatasetRecord,
  verifyModelHash,
  shortestPathQuat,
  slerpQuat,
  solveHandState,
  voiceActivityMouthAccent,
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

  it('uses hysteresis for finger contact and confidence decay for occlusion', () => {
    const contact = new FingerContactHysteresis(0.03, 0.05);
    expect(contact.update(0.029, 1)).toBe(true);
    expect(contact.update(0.04, 1)).toBe(true);
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

  it('adds conservative audio-assisted mouth accent', () => {
    expect(voiceActivityMouthAccent(0.1, 0.2)).toBeGreaterThan(0.1);
    expect(voiceActivityMouthAccent(0.9, 0.02)).toBeGreaterThanOrEqual(0.9);
  });
});

describe('stability layer', () => {
  it('guards finite values and rig ranges', () => {
    expect(finiteNumber(Number.NaN, 0.25).value).toBe(0.25);
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
