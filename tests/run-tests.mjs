import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { encodeFrame, decodeFrame } from '../shared/codec.js';
import { OneEuroFilter, OneEuroQuat } from '../shared/filters.js';
import { ARKIT_52, NUM_CHANNELS, NUM_POSE_POINTS, CHANNEL_INDEX } from '../shared/blendshapes.js';
import {
  FrameOrderGate,
  DroppedFrameDetector,
  MOTION_JSONL_SCHEMA,
  applyCalibrationProfile,
  computeQualityScore,
  createCalibrationProfile,
  isEditableTarget,
  mirrorFacePayload,
  mirrorWeights,
  parseMotionJsonl,
  sanitizeWeights,
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
  const detector = new DroppedFrameDetector(60);
  assert.equal(detector.sample(0), 0);
  assert.equal(detector.sample(1000 / 60), 0);
  assert.ok(detector.sample(120) >= 5);
  assert.ok(detector.rollingDropped(2500, 120) >= 5);
  for (let i = 1; i < 180; i++) detector.sample(120 + i * (1000 / 60));
  assert.equal(detector.rollingDropped(2500, 3200), 0, 'rolling dropped-frame window recovers after stable frames');
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
