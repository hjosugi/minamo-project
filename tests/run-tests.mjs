import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { encodeFrame, decodeFrame } from '../shared/codec.js';
import { OneEuroFilter, OneEuroQuat } from '../shared/filters.js';
import { ARKIT_52, NUM_CHANNELS, NUM_POSE_POINTS, CHANNEL_INDEX } from '../shared/blendshapes.js';
import {
  CALIBRATION_GUIDE_TOTAL_MS,
  BlinkWinkStabilizer,
  FrameOrderGate,
  DroppedFrameDetector,
  HeadPositionStabilizer,
  LandmarkConfidenceTracker,
  MOTION_JSONL_SCHEMA,
  TrackingLossSmoother,
  applyCalibrationProfile,
  applyGazeToWeights,
  buildCalibrationProfileFromSamples,
  buildGazeCalibrationProfile,
  calibrationGuideProgress,
  blendshapeGaze,
  collectGazeCalibrationSample,
  computeQualityScore,
  createCalibrationProfile,
  createGazeCalibrationSession,
  createGuidedCalibrationSession,
  collectGuidedCalibrationSample,
  estimateIrisGaze,
  estimateLandmarkConfidence,
  estimateOneEuroLagMs,
  gazeAngularErrorDegrees,
  isEditableTarget,
  mirrorFacePayload,
  mirrorWeights,
  normalizeHeadLeanRangeCm,
  parseMotionJsonl,
  resolveGaze,
  sanitizeWeights,
  selectTrackedFace,
  semanticFaceControls,
  syntheticBlendshapeFrame,
  syntheticFaceFixture,
  setMirrorPreviewClass,
  validateCalibrationProfile,
  WARNING_TAXONOMY,
} from '../shared/runtime.js';
import {
  createMotionRecord,
  createRecordingMetadata,
  parseRecordingJsonl,
  validateRecordingRecord,
} from '../shared/recording.js';

const root = process.cwd();
const required = [
  'README.md',
  'docs/QUICKSTART.md',
  'docs/PROTOCOL.md',
  'docs/PROTOCOL_V2_DRAFT.md',
  'docs/ARCHITECTURE.md',
  'docs/ARCHITECTURE_TARGET.md',
  'landing/index.html',
  'replay/index.html',
  'replay/replay.js',
  'src/core/types.ts',
  'issues/index.csv',
];
for (const file of required) {
  assert.ok(fs.existsSync(path.join(root, file)), `Missing ${file}`);
}

const issuesDir = path.join(root, 'issues', 'backlog');
const issues = fs.readdirSync(issuesDir).filter((name) => name.endsWith('.md'));
assert.ok(issues.length >= 100, `Expected at least 100 issue files, got ${issues.length}`);

function roundTrip(frame) {
  const decoded = decodeFrame(encodeFrame(frame));
  assert.ok(decoded, 'frame decodes');
  assert.equal(decoded.seq, frame.seq & 0xffff);
  assert.equal(decoded.t, frame.t >>> 0);
  return decoded;
}

function syntheticIrisLandmarks(gaze = { x: 0, y: 0 }) {
  const landmarks = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  writeEye(landmarks, {
    outer: 33,
    inner: 133,
    top: 159,
    bottom: 145,
    iris: [468, 469, 470, 471, 472],
    outerPoint: { x: 0.35, y: 0.43 },
    innerPoint: { x: 0.47, y: 0.43 },
    topPoint: { x: 0.41, y: 0.40 },
    bottomPoint: { x: 0.41, y: 0.46 },
    gaze,
  });
  writeEye(landmarks, {
    outer: 362,
    inner: 263,
    top: 386,
    bottom: 374,
    iris: [473, 474, 475, 476, 477],
    outerPoint: { x: 0.53, y: 0.43 },
    innerPoint: { x: 0.65, y: 0.43 },
    topPoint: { x: 0.59, y: 0.40 },
    bottomPoint: { x: 0.59, y: 0.46 },
    gaze,
  });
  return landmarks;
}

function writeEye(landmarks, { outer, inner, top, bottom, iris, outerPoint, innerPoint, topPoint, bottomPoint, gaze }) {
  landmarks[outer] = { ...outerPoint, z: 0 };
  landmarks[inner] = { ...innerPoint, z: 0 };
  landmarks[top] = { ...topPoint, z: 0 };
  landmarks[bottom] = { ...bottomPoint, z: 0 };
  const center = {
    x: (outerPoint.x + innerPoint.x + topPoint.x + bottomPoint.x) / 4,
    y: (outerPoint.y + innerPoint.y + topPoint.y + bottomPoint.y) / 4,
  };
  const width = Math.hypot(outerPoint.x - innerPoint.x, outerPoint.y - innerPoint.y);
  const height = Math.hypot(topPoint.x - bottomPoint.x, topPoint.y - bottomPoint.y);
  const irisCenter = {
    x: center.x + gaze.x * width * 0.34,
    y: center.y - gaze.y * height * 0.45,
  };
  const offsets = [[0, 0], [0.002, 0], [-0.002, 0], [0, 0.002], [0, -0.002]];
  for (let i = 0; i < iris.length; i++) {
    landmarks[iris[i]] = { x: irisCenter.x + offsets[i][0], y: irisCenter.y + offsets[i][1], z: 0 };
  }
}

function faceBoxLandmarks(x, y, w, h) {
  return [
    { x, y },
    { x: x + w, y },
    { x, y: y + h },
    { x: x + w, y: y + h },
    { x: x + w * 0.5, y: y + h * 0.5 },
  ];
}

{
  const weights = new Float32Array(NUM_CHANNELS);
  weights[CHANNEL_INDEX.jawOpen] = 1;
  const faceOnly = roundTrip({
    t: 123,
    seq: 7,
    face: { quat: [0, 0, 0, 1], pos: [0.1, -0.2, 0.4], weights },
  });
  assert.equal(faceOnly.face.weights.length, NUM_CHANNELS);
  assert.equal(faceOnly.pose, null);

  const posePoints = new Float32Array(NUM_POSE_POINTS * 3);
  for (let i = 0; i < posePoints.length; i++) posePoints[i] = i / 100;
  const facePose = roundTrip({
    t: 456,
    seq: 65535,
    face: { quat: [0.1, -0.2, 0.3, 0.9], pos: [0, 0, 0.4], weights },
    pose: { points: posePoints },
  });
  assert.equal(facePose.pose.points.length, NUM_POSE_POINTS * 3);

  const withHands = roundTrip({
    t: 567,
    seq: 8,
    face: { quat: [0, 0, 0, 1], pos: [0, 0, 0.4], weights },
    hands: [
      { handedness: 'Left', confidence: 0.9, curls: [0, 0.25, 0.5, 0.75, 1], spreads: [-0.2, -0.1, 0, 0.1, 0.2] },
      { handedness: 'Right', confidence: 0.8, curls: [1, 0.75, 0.5, 0.25, 0], spreads: [0.2, 0.1, 0, -0.1, -0.2] },
    ],
  });
  assert.equal(withHands.hands.length, 2);
  assert.equal(withHands.hands[0].handedness, 'Left');
  assert.ok(Math.abs(withHands.hands[0].curls[2] - 0.5) < 0.01);

  const emptyBlocks = roundTrip({ t: 789, seq: 0 });
  assert.equal(emptyBlocks.face, null);
  assert.equal(emptyBlocks.pose, null);
  assert.equal(emptyBlocks.hands, null);
}

{
  const frame = syntheticBlendshapeFrame(42);
  const posePoints = new Float32Array(NUM_POSE_POINTS * 3);
  for (let i = 0; i < posePoints.length; i++) posePoints[i] = i / 10;
  const line = JSON.stringify({
    schema: MOTION_JSONL_SCHEMA,
    t: frame.t,
    seq: frame.seq,
    warnings: ['LOW_LIGHT'],
    face: {
      quat: frame.face.quat,
      pos: frame.face.pos,
      weights: Array.from(frame.face.weights),
    },
    pose: { points: Array.from(posePoints) },
  });
  const parsed = parseMotionJsonl(`${line}\n\n${line}\n`);
  assert.equal(parsed.length, 2);
  assert.ok(parsed[0].face.weights instanceof Float32Array);
  assert.equal(parsed[0].face.weights.length, NUM_CHANNELS);
  assert.equal(parsed[0].pose.points.length, NUM_POSE_POINTS * 3);
  assert.equal(parsed[0].warnings[0], 'LOW_LIGHT');
  assert.throws(() => parseMotionJsonl(''), /No motion frames/);
  assert.throws(() => parseMotionJsonl('{"schema":"unknown","t":1,"seq":1,"face":{}}'), /unsupported schema/);
}

{
  assert.equal(decodeFrame(new Uint8Array()), null);
  assert.equal(decodeFrame(new Uint8Array([0, 1, 2, 3])), null);
  assert.equal(decodeFrame('not bytes'), null);
  const valid = new Uint8Array(encodeFrame(syntheticBlendshapeFrame(22)));
  for (let cut = 0; cut < valid.byteLength; cut++) {
    assert.doesNotThrow(() => decodeFrame(valid.slice(0, cut)));
  }
  for (let i = 0; i < 1_000_000; i++) {
    const len = (i * 31) % 128;
    const bytes = new Uint8Array(len);
    let x = i >>> 0;
    for (let j = 0; j < len; j++) {
      x = (1103515245 * x + 12345) >>> 0;
      bytes[j] = x & 0xff;
    }
    assert.doesNotThrow(() => decodeFrame(bytes));
  }
  for (let i = 0; i < valid.byteLength; i++) {
    const mutated = new Uint8Array(valid);
    mutated[i] ^= 0xff;
    assert.doesNotThrow(() => decodeFrame(mutated));
  }
}

{
  const filter = new OneEuroFilter({ minCutoff: 1.0, beta: 0.1 });
  let y = 0;
  for (let i = 0; i < 120; i++) y = filter.filter(1, i / 60);
  assert.ok(y > 0.95, `One Euro converges toward 1, got ${y}`);

  const quat = new OneEuroQuat();
  const a = quat.filter([0, 0, 0, 1], 0);
  const b = quat.filter([0, 0, 0, -1], 1 / 60);
  assert.ok(a[3] > 0);
  assert.ok(b[3] > 0, 'hemisphere check avoids quaternion sign flip');
}

{
  const gate = new FrameOrderGate();
  assert.equal(gate.accept({ seq: 65534 }).ok, true);
  assert.equal(gate.accept({ seq: 65535 }).ok, true);
  assert.equal(gate.accept({ seq: 0 }).ok, true);
  assert.equal(gate.accept({ seq: 65535 }).ok, false);
  assert.equal(gate.reordered, 1);
  assert.equal(gate.accept({ seq: 3 }).ok, true);
  assert.equal(gate.lost, 2);
}

{
  const previous = { x: 0.1, y: 0.1, w: 0.25, h: 0.25, area: 0.0625 };
  const sticky = selectTrackedFace([
    faceBoxLandmarks(0.58, 0.1, 0.34, 0.34),
    faceBoxLandmarks(0.12, 0.11, 0.24, 0.24),
  ], { previousBox: previous });
  assert.equal(sticky.index, 1, 'sticky overlap beats larger passer-by face');

  const largest = selectTrackedFace([
    faceBoxLandmarks(0.1, 0.1, 0.12, 0.12),
    faceBoxLandmarks(0.55, 0.1, 0.28, 0.28),
  ]);
  assert.equal(largest.index, 1, 'largest face is fallback without previous overlap');

  const locked = selectTrackedFace([
    faceBoxLandmarks(0.05, 0.1, 0.35, 0.35),
    faceBoxLandmarks(0.42, 0.2, 0.18, 0.18),
  ], { lock: { enabled: true, x: 0.35, y: 0.15, w: 0.3, h: 0.5 } });
  assert.equal(locked.index, 1, 'face lock region beats larger outside face');
}

{
  const detector = new DroppedFrameDetector(60);
  assert.equal(detector.sample(0), 0);
  assert.equal(detector.sample(1000 / 60), 0);
  assert.ok(detector.sample(120) >= 5);
  assert.ok(detector.rollingDropped(2500, 120) >= 5);
  assert.ok(detector.rollingJitterMs(2500, 120) > 0);
  assert.ok(estimateOneEuroLagMs(2.4) < estimateOneEuroLagMs(0.9));
  for (let i = 1; i < 180; i++) detector.sample(120 + i * (1000 / 60));
  assert.equal(detector.rollingDropped(2500, 3200), 0, 'rolling dropped-frame window recovers after stable frames');
}

{
  assert.equal(normalizeHeadLeanRangeCm(-4), 0);
  assert.equal(normalizeHeadLeanRangeCm(25), 20);
  const stabilizer = new HeadPositionStabilizer({ recenterHalfLifeMs: 20_000 });
  stabilizer.stabilize([0, 0, 0.4], 0, { leanRangeCm: 8 });
  const quickLean = stabilizer.stabilize([0, 0, 0.6], 100, { leanRangeCm: 8 });
  assert.ok(Math.abs(quickLean[2] - 0.48) < 0.01, 'quick z movement is clamped to configured lean range');

  const drift = new HeadPositionStabilizer({ recenterHalfLifeMs: 20_000 });
  let maxPlanar = 0;
  for (let second = 0; second <= 3600; second++) {
    const rawX = (second / 3600) * 0.5;
    const stabilized = drift.stabilize([rawX, rawX * 0.5, 0.4 + rawX * 0.1], second * 1000, { leanRangeCm: 8 });
    maxPlanar = Math.max(maxPlanar, Math.abs(stabilized[0]), Math.abs(stabilized[1]));
  }
  assert.ok(maxPlanar < 0.02, `one-hour slow drift should recenter below visible range, got ${maxPlanar}`);
}

{
  const raw = new Float32Array(NUM_CHANNELS);
  raw[CHANNEL_INDEX.mouthSmileLeft] = Number.NaN;
  raw[CHANNEL_INDEX.mouthSmileRight] = 2;
  const sanitized = sanitizeWeights(raw);
  assert.equal(sanitized.weights[CHANNEL_INDEX.mouthSmileLeft], 0);
  assert.equal(sanitized.weights[CHANNEL_INDEX.mouthSmileRight], 1);
  assert.ok(sanitized.warnings.length >= 2);
}

{
  const smoother = new TrackingLossSmoother({ fadeMs: 400, reacquireMs: 250 });
  const tracked = new Float32Array(NUM_CHANNELS);
  tracked[CHANNEL_INDEX.jawOpen] = 1;
  assert.equal(smoother.update(true, tracked, 0).weights[CHANNEL_INDEX.jawOpen], 1);
  assert.equal(smoother.update(false, tracked, 0).weights[CHANNEL_INDEX.jawOpen], 1);
  assert.ok(Math.abs(smoother.update(false, tracked, 200).weights[CHANNEL_INDEX.jawOpen] - 0.5) < 0.01);
  assert.equal(smoother.update(false, tracked, 400).active, false);

  const reentry = new Float32Array(NUM_CHANNELS);
  reentry[CHANNEL_INDEX.jawOpen] = 0.8;
  const firstReentry = smoother.update(true, reentry, 500);
  assert.equal(firstReentry.reacquired, true);
  assert.ok(firstReentry.weights[CHANNEL_INDEX.jawOpen] < 0.1, 're-entry starts near neutral');
  const easedReentry = smoother.update(true, reentry, 625);
  assert.ok(easedReentry.weights[CHANNEL_INDEX.jawOpen] > 0.3 && easedReentry.weights[CHANNEL_INDEX.jawOpen] < 0.6);
  assert.ok(Math.abs(smoother.update(true, reentry, 750).weights[CHANNEL_INDEX.jawOpen] - 0.8) < 0.01);
}

{
  const profile = createCalibrationProfile('test');
  profile.offsets[CHANNEL_INDEX.jawOpen] = 0.1;
  profile.gains[CHANNEL_INDEX.jawOpen] = 2;
  profile.deadzones[CHANNEL_INDEX.jawOpen] = 0.05;
  const raw = new Float32Array(NUM_CHANNELS);
  raw[CHANNEL_INDEX.jawOpen] = 0.4;
  const adjusted = applyCalibrationProfile(raw, profile);
  assert.equal(Math.round(adjusted[CHANNEL_INDEX.jawOpen] * 100) / 100, 0.6);
  profile.muted[CHANNEL_INDEX.jawOpen] = true;
  assert.equal(applyCalibrationProfile(raw, profile)[CHANNEL_INDEX.jawOpen], 0);
}

{
  assert.equal(CALIBRATION_GUIDE_TOTAL_MS, 30_000);
  const session = createGuidedCalibrationSession('guided-test', 1000);
  const neutral = new Float32Array(NUM_CHANNELS);
  neutral[CHANNEL_INDEX.jawOpen] = 0.12;
  neutral[CHANNEL_INDEX.browDownLeft] = 0.15;

  for (let t = 1000; t < 4000; t += 250) {
    const progress = collectGuidedCalibrationSample(session, neutral, t);
    assert.equal(progress.step.kind, 'neutral');
  }

  const range = new Float32Array(NUM_CHANNELS);
  range[CHANNEL_INDEX.jawOpen] = 0.62;
  range[CHANNEL_INDEX.browDownLeft] = 0.52;
  range[CHANNEL_INDEX.mouthSmileLeft] = 0.7;
  for (let t = 4000; t < 31_000; t += 250) {
    collectGuidedCalibrationSample(session, range, t);
  }

  const finished = calibrationGuideProgress(1000, 31_000);
  assert.equal(finished.done, true);
  assert.ok(session.neutralSamples.length > 0);
  assert.ok(session.rangeSamples.length > 0);

  const guidedProfile = buildCalibrationProfileFromSamples({
    neutralSamples: session.neutralSamples,
    rangeSamples: session.rangeSamples,
    name: 'guided-test',
    createdAt: '2026-07-06T00:00:00.000Z',
  });
  assert.equal(guidedProfile.offsets.length, NUM_CHANNELS);
  assert.equal(guidedProfile.gains.length, NUM_CHANNELS);
  assert.ok(guidedProfile.offsets.every(Number.isFinite));
  assert.ok(guidedProfile.gains.every(Number.isFinite));
  assert.ok(guidedProfile.gains[CHANNEL_INDEX.jawOpen] > 1);
  assert.ok(guidedProfile.gains[CHANNEL_INDEX.browDownLeft] > 1);

  const calibratedNeutral = applyCalibrationProfile(neutral, guidedProfile);
  assert.ok(Math.max(...calibratedNeutral) < 0.05, 'guided profile neutralizes resting offsets');
}

{
  const centered = estimateIrisGaze(syntheticIrisLandmarks({ x: 0, y: 0 }));
  assert.ok(Math.abs(centered.x) < 0.02);
  assert.ok(Math.abs(centered.y) < 0.02);
  const right = estimateIrisGaze(syntheticIrisLandmarks({ x: 0.55, y: 0.25 }));
  assert.ok(right.x > 0.5);
  assert.ok(right.y > 0.2);

  const blinkWeights = new Float32Array(NUM_CHANNELS);
  blinkWeights[CHANNEL_INDEX.eyeBlinkLeft] = 1;
  blinkWeights[CHANNEL_INDEX.eyeBlinkRight] = 1;
  blinkWeights[CHANNEL_INDEX.eyeLookInLeft] = 1;
  const irisGaze = resolveGaze(blinkWeights, syntheticIrisLandmarks({ x: 0.4, y: 0 }));
  const irisWeights = applyGazeToWeights(blinkWeights, irisGaze);
  assert.ok(blendshapeGaze(irisWeights).x > 0.35, 'iris gaze overrides blink-cross-talk eyeLook weights');

  const fallbackWeights = new Float32Array(NUM_CHANNELS);
  fallbackWeights[CHANNEL_INDEX.eyeLookOutLeft] = 0.5;
  fallbackWeights[CHANNEL_INDEX.eyeLookInRight] = 0.5;
  const fallback = resolveGaze(fallbackWeights, []);
  assert.equal(fallback.source, 'blendshape');
  assert.equal(Math.round(fallback.x * 10) / 10, 0.5);

  const gazeSession = createGazeCalibrationSession('gaze-test', 1000);
  const rawByTarget = {
    center: { x: 0.1, y: -0.05 },
    left: { x: -0.3, y: -0.05 },
    right: { x: 0.5, y: -0.05 },
    up: { x: 0.1, y: 0.35 },
    down: { x: 0.1, y: -0.45 },
  };
  for (let t = 1000; t < 11_000; t += 250) {
    const step = calibrationGuideProgress(1000, t, [
      { id: 'center', target: { x: 0, y: 0 }, durationMs: 2000 },
      { id: 'left', target: { x: -0.8, y: 0 }, durationMs: 2000 },
      { id: 'right', target: { x: 0.8, y: 0 }, durationMs: 2000 },
      { id: 'up', target: { x: 0, y: 0.8 }, durationMs: 2000 },
      { id: 'down', target: { x: 0, y: -0.8 }, durationMs: 2000 },
    ]).step;
    collectGazeCalibrationSample(gazeSession, syntheticIrisLandmarks(rawByTarget[step.id]), t);
  }
  const gazeProfile = buildGazeCalibrationProfile(gazeSession.samples);
  const calibratedRight = estimateIrisGaze(syntheticIrisLandmarks(rawByTarget.right), { calibration: gazeProfile });
  assert.ok(gazeAngularErrorDegrees(calibratedRight, { x: 0.8, y: 0 }) < 5);
}

{
  let winkHits = 0;
  for (let trial = 0; trial < 50; trial++) {
    const stabilizer = new BlinkWinkStabilizer({ winkFrames: 3 });
    const weights = new Float32Array(NUM_CHANNELS);
    let out = weights;
    for (let frame = 0; frame < 4; frame++) {
      weights[CHANNEL_INDEX.eyeBlinkLeft] = 0.72;
      weights[CHANNEL_INDEX.eyeBlinkRight] = 0.4;
      out = stabilizer.filter(weights);
    }
    if (out[CHANNEL_INDEX.eyeBlinkLeft] === 1 && out[CHANNEL_INDEX.eyeBlinkRight] === 0) winkHits++;
  }
  assert.ok(winkHits / 50 > 0.9, `deliberate wink hit rate ${winkHits}/50`);

  const blink = new BlinkWinkStabilizer();
  const blinkWeights = new Float32Array(NUM_CHANNELS);
  blinkWeights[CHANNEL_INDEX.eyeBlinkLeft] = 0.82;
  blinkWeights[CHANNEL_INDEX.eyeBlinkRight] = 0.76;
  const symmetric = blink.filter(blinkWeights);
  assert.equal(symmetric[CHANNEL_INDEX.eyeBlinkLeft], symmetric[CHANNEL_INDEX.eyeBlinkRight]);

  const half = new BlinkWinkStabilizer();
  const halfWeights = new Float32Array(NUM_CHANNELS);
  const outputs = [];
  for (const value of [0.48, 0.52, 0.49, 0.51, 0.5]) {
    halfWeights[CHANNEL_INDEX.eyeBlinkLeft] = value;
    halfWeights[CHANNEL_INDEX.eyeBlinkRight] = value;
    const out = half.filter(halfWeights);
    outputs.push(out[CHANNEL_INDEX.eyeBlinkLeft], out[CHANNEL_INDEX.eyeBlinkRight]);
  }
  assert.equal(new Set(outputs).size, 1, 'half-closed eye positions do not flicker across thresholds');
}

{
  const weights = new Float32Array(NUM_CHANNELS);
  weights[CHANNEL_INDEX.eyeBlinkLeft] = 0.75;
  const mirrored = mirrorWeights(weights);
  assert.equal(mirrored[CHANNEL_INDEX.eyeBlinkRight], 0.75);
  assert.equal(mirrored[CHANNEL_INDEX.eyeBlinkLeft], 0);

  const payload = mirrorFacePayload({ quat: [0.1, 0.2, -0.3, 0.9], pos: [0.2, 0.1, 0.4], weights });
  assert.deepEqual(payload.quat, [0.1, -0.2, 0.3, 0.9]);
  assert.equal(payload.pos[0], -0.2);
  assert.equal(payload.weights[CHANNEL_INDEX.eyeBlinkRight], 0.75);

  const classList = { mirrored: false, toggle(name, value) { if (name === 'mirrored') this.mirrored = value; } };
  assert.equal(setMirrorPreviewClass({ classList }, true), true);
  assert.equal(classList.mirrored, true);
}

{
  const weights = new Float32Array(NUM_CHANNELS);
  weights[CHANNEL_INDEX.jawOpen] = 0.8;
  assert.equal(semanticFaceControls(weights).vowel, 'A');
  const stableFace = [
    { x: 0.35, y: 0.35 }, { x: 0.65, y: 0.35 }, { x: 0.35, y: 0.65 }, { x: 0.65, y: 0.65 },
    { x: 0.4, y: 0.4 }, { x: 0.6, y: 0.4 }, { x: 0.45, y: 0.55 }, { x: 0.55, y: 0.55 },
  ];
  assert.ok(estimateLandmarkConfidence(stableFace) > 0.9);
  assert.equal(estimateLandmarkConfidence(stableFace.map((point) => ({ ...point, x: point.x + 2 }))), 0);
  const confidenceTracker = new LandmarkConfidenceTracker(1000);
  assert.ok(confidenceTracker.sample(1, 0) > 0.9);
  assert.ok(confidenceTracker.sample(0, 500) < 0.5);

  const quality = computeQualityScore({ meanLuma: 12, fps: 12, droppedFrames: 6, confidence: 0.2 });
  assert.equal(quality.state, 'poor');
  assert.ok(quality.warnings.length >= 2);

  const qualityCases = [
    ['good indoor', { meanLuma: 110, fps: 60, droppedFrames: 0, confidence: 0.95, inferenceMs: 8, motionBlur: 0 }, 'good'],
    ['normal indoor', { meanLuma: 72, fps: 30, droppedFrames: 0, confidence: 0.85, inferenceMs: 16, motionBlur: 0.1 }, 'degraded'],
    ['low light', { meanLuma: 18, fps: 60, droppedFrames: 0, confidence: 0.9 }, 'degraded'],
    ['occlusion', { meanLuma: 110, fps: 60, droppedFrames: 0, confidence: 0.2 }, 'degraded'],
    ['motion blur', { meanLuma: 110, fps: 60, droppedFrames: 0, confidence: 0.9, motionBlur: 0.8 }, 'good'],
    ['high inference', { meanLuma: 110, fps: 60, droppedFrames: 0, confidence: 0.9, inferenceMs: 45 }, 'degraded'],
  ];
  for (const [name, input, minimum] of qualityCases) {
    const result = computeQualityScore(input);
    if (name === 'normal indoor') assert.notEqual(result.state, 'poor');
    if (minimum === 'good') assert.equal(result.state, 'good');
    else assert.notEqual(result.state, 'poor', `${name} should stay recoverable unless multiple inputs fail`);
  }
}

{
  const invalid = validateCalibrationProfile({ schema: 'wrong' });
  assert.equal(invalid.ok, false);
  const partial = validateCalibrationProfile({
    schema: 'minamo.calibration.v1',
    gains: [3, Number.NaN],
    offsets: [0.1],
    deadzones: [0.5],
    muted: [1],
  });
  assert.equal(partial.ok, true);
  assert.equal(partial.profile.gains[0], 2);
  assert.equal(partial.profile.gains[1], 0);
  assert.ok(partial.warnings.length >= 4);
}

{
  const wink = syntheticFaceFixture('wink-left');
  assert.ok(wink.face.weights[CHANNEL_INDEX.eyeBlinkLeft] > 0.9);
  assert.equal(wink.face.weights[CHANNEL_INDEX.eyeBlinkRight], 0);
  const lowConfidence = sanitizeWeights(syntheticFaceFixture('low-confidence').face.weights);
  assert.ok(lowConfidence.warnings.some((warning) => warning.startsWith('NON_FINITE_SIGNAL')));
}

{
  const frame = syntheticBlendshapeFrame(33);
  const metadata = createRecordingMetadata({
    version: 'test',
    modelSource: 'synthetic',
    settings: { mode: 'local', mirror: true, hands: false, pose: false, resolution: '720p', fps: '60' },
    calibration: createCalibrationProfile('fixture'),
  });
  const motion = createMotionRecord(frame, { quality: { state: 'good', score: 1 }, warnings: [] });
  assert.equal(validateRecordingRecord(metadata, 1).ok, true);
  assert.equal(validateRecordingRecord(motion, 2).ok, true);
  assert.deepEqual(Object.keys(metadata.settings).sort(), ['fps', 'hands', 'mirror', 'mode', 'pose', 'resolution', 'smoothingGroup'].sort());
  assert.equal(JSON.stringify(metadata).includes('video'), false);
  assert.equal(JSON.stringify(metadata).includes('audio'), false);
  const parsed = parseRecordingJsonl(`${JSON.stringify(metadata)}\n${JSON.stringify(motion)}\n`);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.frames.length, 1);
  const malformed = parseRecordingJsonl(`${JSON.stringify(metadata)}\n{"schema":"minamo.kgm1.motion-jsonl.v1","t":"bad"}\n`);
  assert.equal(malformed.errors[0].line, 2);
  assert.ok(malformed.errors[0].errors.includes('frame.t must be finite'));
  const badWarnings = validateRecordingRecord({ ...motion, warnings: ['LOW_LIGHT', 3] }, 3);
  assert.equal(badWarnings.ok, false);
  assert.ok(badWarnings.errors.includes('frame.warnings[1] must be a string'));
  const badQuality = validateRecordingRecord({ ...motion, quality: { state: 'idle', score: 2 } }, 4);
  assert.equal(badQuality.ok, false);
  assert.ok(badQuality.errors.includes('frame.quality.state must be good, degraded, or poor'));
  assert.ok(badQuality.errors.includes('frame.quality.score must be between 0 and 1'));
  const rawMetadata = validateRecordingRecord({ ...metadata, video: 'data:video/webm;base64,AAAA' }, 5);
  assert.equal(rawMetadata.ok, false);
  assert.ok(rawMetadata.errors.some((error) => error.includes('raw media data')));
  const rawNested = parseRecordingJsonl(`${JSON.stringify(metadata)}\n${JSON.stringify({ ...motion, face: { ...motion.face, imageData: 'raw pixels' } })}\n`);
  assert.equal(rawNested.errors[0].line, 2);
  assert.ok(rawNested.errors[0].errors.some((error) => error.includes('record.face.imageData')));
  const fixture = parseRecordingJsonl(fs.readFileSync(path.join(root, 'tests/fixtures/kgm1-synthetic.jsonl'), 'utf8'));
  assert.equal(fixture.errors.length, 0);
  assert.equal(fixture.frames.length, 1);
  for (const code of ['LOW_LIGHT', 'MOTION_BLUR', 'DROPPED_FRAMES', 'OCCLUSION', 'NON_FINITE_SIGNAL', 'SIGNAL_CLAMPED']) {
    assert.ok(Object.values(WARNING_TAXONOMY).includes(code), `warning taxonomy exposes ${code}`);
  }
}

{
  const previousElement = globalThis.Element;
  globalThis.Element = class {
    constructor(tagName, editable = false) {
      this.tagName = tagName;
      this.isContentEditable = editable;
    }
  };
  assert.equal(isEditableTarget(new globalThis.Element('INPUT')), true);
  assert.equal(isEditableTarget(new globalThis.Element('DIV', true)), true);
  assert.equal(isEditableTarget(new globalThis.Element('BUTTON')), false);
  if (previousElement === undefined) delete globalThis.Element;
  else globalThis.Element = previousElement;
}

assert.equal(ARKIT_52.length, NUM_CHANNELS);
console.log(`OK: ${issues.length} issue files found; codec, filters, sequencing, calibration, mirror, quality, recording, and shortcut tests passed.`);
