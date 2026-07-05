import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { encodeFrame, decodeFrame } from '../shared/codec.js';
import { OneEuroFilter, OneEuroQuat } from '../shared/filters.js';
import { ARKIT_52, NUM_CHANNELS, NUM_POSE_POINTS, CHANNEL_INDEX } from '../shared/blendshapes.js';
import {
  FrameOrderGate,
  DroppedFrameDetector,
  applyCalibrationProfile,
  computeQualityScore,
  createCalibrationProfile,
  mirrorWeights,
  sanitizeWeights,
  semanticFaceControls,
  syntheticBlendshapeFrame,
} from '../shared/runtime.js';

const root = process.cwd();
const required = [
  'README.md',
  'docs/QUICKSTART.md',
  'docs/PROTOCOL.md',
  'docs/PROTOCOL_V2_DRAFT.md',
  'docs/ARCHITECTURE.md',
  'docs/ARCHITECTURE_TARGET.md',
  'landing/index.html',
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

  const emptyBlocks = roundTrip({ t: 789, seq: 0 });
  assert.equal(emptyBlocks.face, null);
  assert.equal(emptyBlocks.pose, null);
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
  const detector = new DroppedFrameDetector(60);
  assert.equal(detector.sample(0), 0);
  assert.equal(detector.sample(1000 / 60), 0);
  assert.ok(detector.sample(120) >= 5);
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
  const profile = createCalibrationProfile('test');
  profile.offsets[CHANNEL_INDEX.jawOpen] = 0.1;
  profile.gains[CHANNEL_INDEX.jawOpen] = 2;
  profile.deadzones[CHANNEL_INDEX.jawOpen] = 0.05;
  const raw = new Float32Array(NUM_CHANNELS);
  raw[CHANNEL_INDEX.jawOpen] = 0.4;
  const adjusted = applyCalibrationProfile(raw, profile);
  assert.equal(Math.round(adjusted[CHANNEL_INDEX.jawOpen] * 100) / 100, 0.6);
}

{
  const weights = new Float32Array(NUM_CHANNELS);
  weights[CHANNEL_INDEX.eyeBlinkLeft] = 0.75;
  const mirrored = mirrorWeights(weights);
  assert.equal(mirrored[CHANNEL_INDEX.eyeBlinkRight], 0.75);
  assert.equal(mirrored[CHANNEL_INDEX.eyeBlinkLeft], 0);
}

{
  const weights = new Float32Array(NUM_CHANNELS);
  weights[CHANNEL_INDEX.jawOpen] = 0.8;
  assert.equal(semanticFaceControls(weights).vowel, 'A');
  const quality = computeQualityScore({ meanLuma: 12, fps: 12, droppedFrames: 6, confidence: 0.2 });
  assert.equal(quality.state, 'poor');
  assert.ok(quality.warnings.length >= 2);
}

assert.equal(ARKIT_52.length, NUM_CHANNELS);
console.log(`OK: ${issues.length} issue files found; codec, filters, sequencing, calibration, mirror, and quality tests passed.`);
