import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { encodeFrame, decodeFrame, HAND_TARGET_BYTES } from '../shared/codec.js';
import {
  E2EE_OVERHEAD_BYTES,
  ciphertextLooksOpaque,
  decryptFrame as decryptE2eeFrame,
  deriveRoomKey,
  encryptFrame as encryptE2eeFrame,
} from '../shared/e2ee.js';
import {
  decodeKgm1bHeader,
  decodeKgm1bPacket,
  encodeKgm1bHeader,
  encodeKgm1bPacket,
} from '../shared/kgm1b.js';
import {
  KGM_RECORDING_MAGIC,
  encodeKgmRecording,
  parseKgmRecording,
  tenMinuteKgmEstimateBytes,
} from '../shared/kgm-recording.js';
import {
  VRMA_EXTENSION,
  exportVrmaFromFrames,
  parseVrmaGlb,
} from '../shared/vrma-export.js';
import {
  formatInspection as formatGlbInspection,
  parseGlb,
  summarizeGltf,
} from '../scripts/inspect-glb.mjs';
import {
  EXPRESSION_MAPPING_SCHEMA,
  createDefaultVrmExpressionMap,
  createPerfectSyncExpressionMap,
  detectPerfectSyncExpressions,
  evaluateExpressionMap,
  parseExpressionMap,
  serializeExpressionMap,
} from '../shared/expression-mapping.js';
import {
  LAYERED_AVATAR_SCHEMA,
  classifyLayerName,
  createLayeredAvatarManifest,
  layeredAvatarStateFromWeights,
  layerTransformForDepth,
  parseLayeredAvatarManifest,
  serializeLayeredAvatarManifest,
} from '../shared/layered-avatar.js';
import {
  computeLossPercent,
  controlledNetemHudCheck,
  latencyWithinTolerance,
  percentileSample,
} from '../shared/hud-metrics.js';
import {
  applyVoiceActivityAccents,
  voiceActivityLevelFromRms,
} from '../shared/voice-activity.js';
import {
  AUDIO_LIPSYNC_TARGET_LATENCY_MS,
  audioLipsyncWithinLatency,
  createSilentAudioLipsyncFrame,
  estimateAudioLipsyncFrame,
  fuseAudioLipsyncWeights,
  smoothAudioLipsyncFrame,
} from '../shared/audio-lipsync.js';
import {
  ClockOffsetEstimator,
  KGM2_FACE_CHANNELS,
  KGM2_FACE_MASK_BYTES,
  KGM2_HEADER_BYTES,
  KGM2_TYPE_DELTA,
  KGM2_TYPE_KEYFRAME,
  Kgm2FaceDecoder,
  Kgm2FaceEncoder,
  MultiSourceClockSync,
  completeClockSyncProbe,
  createClockSyncProbe,
  packSmallestThreeQuat,
  unpackSmallestThreeQuat,
} from '../shared/kgm2.js';
import {
  NewestOnlyMailbox,
  classifyCongestion,
  computeTransportLatencyMs,
  transportFallbackPlan,
  transportSecurityNote,
} from '../shared/transport.js';
import { OneEuroFilter, OneEuroQuat } from '../shared/filters.js';
import { ARKIT_52, NUM_CHANNELS, NUM_POSE_POINTS, CHANNEL_INDEX } from '../shared/blendshapes.js';
import {
  CALIBRATION_GUIDE_TOTAL_MS,
  HAND_CALIBRATION_TOTAL_MS,
  HAND_INFERENCE_INTERVAL_MS,
  BlinkWinkStabilizer,
  FrameOrderGate,
  DroppedFrameDetector,
  HandTargetStabilizer,
  HeadPositionStabilizer,
  LandmarkConfidenceTracker,
  MOTION_JSONL_SCHEMA,
  TrackingLossSmoother,
  applyCalibrationProfile,
  applyGazeToWeights,
  applyHandCalibrationProfile,
  buildCalibrationProfileFromSamples,
  buildGazeCalibrationProfile,
  buildHandCalibrationProfile,
  calibrationGuideProgress,
  blendshapeGaze,
  classifyHandGesture,
  collectHandCalibrationSample,
  collectGazeCalibrationSample,
  computeQualityScore,
  createCalibrationProfile,
  createDefaultDrumKitConfig,
  createGazeCalibrationSession,
  createGuidedCalibrationSession,
  createHandCalibrationProfile,
  createHandCalibrationSession,
  collectGuidedCalibrationSample,
  deriveDrumOverlayState,
  drumKitCalibrationSummary,
  estimateIrisGaze,
  estimateLandmarkConfidence,
  estimateOneEuroLagMs,
  gazeAngularErrorDegrees,
  isEditableTarget,
  mirrorFacePayload,
  mirrorWeights,
  normalizeDrumKitConfig,
  normalizeHandCalibrationProfile,
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
  'shared/voice-activity.js',
  'shared/audio-lipsync.js',
  'shared/vrma-export.js',
  'src/core/types.ts',
  'tests/fixtures/hand-golden-clip.json',
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

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function encodeJsonGlb(json) {
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const paddedLength = Math.ceil(encoded.length / 4) * 4;
  const totalLength = 12 + 8 + paddedLength;
  const bytes = new Uint8Array(totalLength);
  bytes.set(encoded, 20);
  bytes.fill(0x20, 20 + encoded.length, 20 + paddedLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, paddedLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  return bytes;
}

function deterministicRandom(seed = 0x12345678) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomQuat(rand) {
  const u1 = rand();
  const u2 = rand();
  const u3 = rand();
  const a = Math.sqrt(1 - u1);
  const b = Math.sqrt(u1);
  const t1 = 2 * Math.PI * u2;
  const t2 = 2 * Math.PI * u3;
  return [a * Math.sin(t1), a * Math.cos(t1), b * Math.sin(t2), b * Math.cos(t2)];
}

function quatAngularErrorDegrees(a, b) {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, Math.max(-1, dot))) * 180 / Math.PI;
}

function kgm2FaceFrame(seq, overrides = {}) {
  const weights = new Float32Array(KGM2_FACE_CHANNELS);
  for (let i = 0; i < KGM2_FACE_CHANNELS; i++) weights[i] = 0.08;
  for (const [index, value] of Object.entries(overrides.weights || {})) {
    weights[Number(index)] = value;
  }
  return {
    t: 10_000 + seq * 16,
    seq,
    face: {
      quat: overrides.quat || [0.01 * Math.sin(seq / 20), -0.02 * Math.sin(seq / 25), 0.015 * Math.cos(seq / 30), 0.999],
      pos: overrides.pos || [0.02 * Math.sin(seq / 40), -0.01 * Math.cos(seq / 50), 0.42],
      weights,
    },
  };
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
      { flags: 1, handedness: 'Left', confidence: 0.9, curls: [0, 0.25, 0.5, 0.75, 1], spreads: [-0.2, -0.1, 0, 0.1, 0.2], wrist: [0.2, -0.1, 0.05] },
      { flags: 2, handedness: 'Right', confidence: 0.8, curls: [1, 0.75, 0.5, 0.25, 0], spreads: [0.2, 0.1, 0, -0.1, -0.2], wrist: [-0.2, 0.1, -0.05] },
    ],
  });
  assert.equal(HAND_TARGET_BYTES, 16);
  assert.equal(encodeFrame({
    t: 567,
    seq: 8,
    face: { quat: [0, 0, 0, 1], pos: [0, 0, 0.4], weights },
    hands: [
      { flags: 1, handedness: 'Left', confidence: 0.9, curls: [0, 0.25, 0.5, 0.75, 1], spreads: [-0.2, -0.1, 0, 0.1, 0.2], wrist: [0.2, -0.1, 0.05] },
      { flags: 2, handedness: 'Right', confidence: 0.8, curls: [1, 0.75, 0.5, 0.25, 0], spreads: [0.2, 0.1, 0, -0.1, -0.2], wrist: [-0.2, 0.1, -0.05] },
    ],
  }).byteLength, 10 + 66 + 1 + HAND_TARGET_BYTES * 2);
  assert.equal(withHands.hands.length, 2);
  assert.equal(withHands.hands[0].flags, 1);
  assert.equal(withHands.hands[0].handedness, 'Left');
  assert.ok(Math.abs(withHands.hands[0].curls[2] - 0.5) < 0.01);
  assert.ok(Math.abs(withHands.hands[0].wrist[0] - 0.2) < 0.01);

  const emptyBlocks = roundTrip({ t: 789, seq: 0 });
  assert.equal(emptyBlocks.face, null);
  assert.equal(emptyBlocks.pose, null);
  assert.equal(emptyBlocks.hands, null);
}

{
  const headerInput = {
    versionMajor: 1,
    versionMinor: 7,
    frameId: 0x0102030405060708n,
    sourceTimeNs: 1_720_000_000_123_456_789n,
    monotonicTimeNs: 9_876_543_210n,
    flags: 0x21,
    encoding: 3,
    payloadType: 2,
    payloadLen: 4,
  };
  const headerBytes = new Uint8Array(encodeKgm1bHeader(headerInput));
  const headerHex = bytesToHex(headerBytes);
  assert.equal(headerBytes.byteLength, 40);
  assert.equal(headerHex, '4b474d3101000700080706050403020115cd071de3aade17ea16b04c020000002100030204000000');
  const decodedHeader = decodeKgm1bHeader(headerBytes);
  assert.equal(decodedHeader.frameId, headerInput.frameId);
  assert.equal(decodedHeader.sourceTimeNs, headerInput.sourceTimeNs);
  assert.equal(decodedHeader.monotonicTimeNs, headerInput.monotonicTimeNs);
  assert.equal(decodedHeader.flags, headerInput.flags);

  const payload = new Uint8Array([0xca, 0xfe, 0xba, 0xbe]);
  const packetBytes = new Uint8Array(encodeKgm1bPacket(headerInput, payload));
  const packet = decodeKgm1bPacket(packetBytes);
  assert.equal(packet.header.payloadLen, payload.byteLength);
  assert.deepEqual(Array.from(packet.payload), Array.from(payload));

  const pyOut = execFileSync('python3', ['scripts/kgm1b_codec.py', 'decode-packet', bytesToHex(packetBytes)], {
    cwd: root,
    encoding: 'utf8',
  });
  const pyDecoded = JSON.parse(pyOut);
  assert.equal(pyDecoded.header.frame_id, headerInput.frameId.toString());
  assert.equal(pyDecoded.header.source_time_ns, headerInput.sourceTimeNs.toString());
  assert.equal(pyDecoded.header.monotonic_time_ns, headerInput.monotonicTimeNs.toString());
  assert.equal(pyDecoded.header.payload_len, payload.byteLength);
  assert.equal(pyDecoded.payload_hex, bytesToHex(payload));
  assert.deepEqual(Array.from(hexToBytes(pyDecoded.payload_hex)), Array.from(payload));

  const pyModuleOut = execFileSync('python3', ['-m', 'kgm1_codec', 'decode-header', headerHex], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PYTHONPATH: path.join(root, 'packages/kgm1-codec-py') },
  });
  assert.equal(JSON.parse(pyModuleOut).header.frame_id, headerInput.frameId.toString());
}

{
  const randomForAccuracy = deterministicRandom(0xdecafbad);
  let maxError = 0;
  let packedSink = 0;
  for (let i = 0; i < 1_000_000; i++) {
    const quat = randomQuat(randomForAccuracy);
    const packed = packSmallestThreeQuat(quat);
    packedSink ^= packed;
    const decoded = unpackSmallestThreeQuat(packed);
    maxError = Math.max(maxError, quatAngularErrorDegrees(quat, decoded));
  }
  assert.ok(maxError < 0.5, `smallest-three quaternion max angular error ${maxError.toFixed(4)} deg`);

  const perfQuats = [];
  const randomForPerf = deterministicRandom(0xfeed5eed);
  for (let i = 0; i < 200_000; i++) perfQuats.push(randomQuat(randomForPerf));
  const t0 = performance.now();
  for (const quat of perfQuats) {
    const packed = packSmallestThreeQuat(quat);
    packedSink ^= packed;
    if (unpackSmallestThreeQuat(packed)[3] > 2) packedSink ^= 1;
  }
  const usPerQuat = (performance.now() - t0) * 1000 / perfQuats.length;
  assert.ok(usPerQuat < 1, `smallest-three JS encode+decode ${usPerQuat.toFixed(3)} us/quat; sink=${packedSink}`);

  const encoder = new Kgm2FaceEncoder({ keyframeInterval: 30 });
  const decoder = new Kgm2FaceDecoder();
  const frames = [];
  for (let seq = 0; seq < 180; seq++) {
    frames.push(kgm2FaceFrame(seq, {
      weights: {
        0: 0.25 + 0.08 * Math.sin(seq / 8),
        1: 0.12 + 0.05 * Math.cos(seq / 9),
        8: 0.34 + 0.04 * Math.sin(seq / 7),
        24: 0.42 + 0.03 * Math.cos(seq / 11),
        51: 0.18 + 0.02 * Math.sin(seq / 5),
      },
    }));
  }
  const packets = frames.map((frame) => new Uint8Array(encoder.encode(frame)));
  const keyframes = packets.filter((packet) => new DataView(packet.buffer, packet.byteOffset, packet.byteLength).getUint8(3) === KGM2_TYPE_KEYFRAME);
  const deltas = packets.filter((packet) => new DataView(packet.buffer, packet.byteOffset, packet.byteLength).getUint8(3) === KGM2_TYPE_DELTA);
  assert.equal(keyframes.length, 6);
  assert.equal(deltas.length, 174);
  assert.equal(KGM2_FACE_MASK_BYTES, 7);
  const averageKgm1FaceSize = frames.reduce((sum, frame) => sum + encodeFrame(frame).byteLength, 0) / frames.length;
  const averageKgm2Size = packets.reduce((sum, packet) => sum + packet.byteLength, 0) / packets.length;
  const reduction = 1 - averageKgm2Size / averageKgm1FaceSize;
  assert.ok(reduction >= 0.35, `KGM2 delta/keyframe average reduction ${(reduction * 100).toFixed(1)}%`);

  const firstDecoded = decoder.decode(packets[0]);
  assert.ok(firstDecoded);
  const deltaDecoded = decoder.decode(packets[1]);
  assert.ok(deltaDecoded);
  assert.equal(Math.round(deltaDecoded.face.weights[10] * 255), Math.round(firstDecoded.face.weights[10] * 255), 'masked channels hold previous keyframe values');

  const idleEncoder = new Kgm2FaceEncoder({ keyframeInterval: 30 });
  idleEncoder.encode(kgm2FaceFrame(0));
  const idleDelta = new Uint8Array(idleEncoder.encode(kgm2FaceFrame(1)));
  assert.equal(new DataView(idleDelta.buffer).getUint8(3), KGM2_TYPE_DELTA);
  assert.equal(idleDelta.byteLength, KGM2_HEADER_BYTES + 4 + 3 + KGM2_FACE_MASK_BYTES);
  assert.ok(idleDelta.byteLength < 30, `idle-face delta frame ${idleDelta.byteLength} bytes`);

  assert.equal(new Kgm2FaceDecoder().decode(packets[1]), null, 'delta with missing base keyframe is rejected');
  const lossyDecoder = new Kgm2FaceDecoder();
  let decodedAfterDroppedKeyframe = null;
  for (const [index, packet] of packets.entries()) {
    const seq = frames[index].seq;
    const dropped = seq === 60 || (seq % 10 === 7);
    if (dropped) continue;
    const decoded = lossyDecoder.decode(packet);
    if (seq >= 60 && decoded) {
      decodedAfterDroppedKeyframe = decoded.seq;
      break;
    }
  }
  assert.equal(decodedAfterDroppedKeyframe, 90, '10% random loss plus a keyframe loss recovers at the next keyframe');

  const estimatorA = new ClockOffsetEstimator();
  const estimatorB = new ClockOffsetEstimator();
  for (let i = 0; i < 8; i++) {
    estimatorA.sample({ clientSendMs: 1000 + i * 100, relayReceiveMs: 1047 + i * 100, relaySendMs: 1051 + i * 100, clientReceiveMs: 1026 + i * 100 });
    estimatorB.sample({ clientSendMs: 2000 + i * 100, relayReceiveMs: 1998 + i * 100, relaySendMs: 2002 + i * 100, clientReceiveMs: 2024 + i * 100 });
  }
  assert.ok(Math.abs(estimatorA.offsetMs() - 36) < 1);
  assert.ok(Math.abs(estimatorB.offsetMs() + 12) < 1);
  assert.ok(Math.abs((1000 + estimatorA.offsetMs()) - (1048 - 12)) < 1, 'sender clock sync supports multi-source phase alignment');

  const sync = new MultiSourceClockSync();
  for (let i = 0; i < 8; i++) {
    const aProbe = createClockSyncProbe(1000 + i * 100);
    const bProbe = createClockSyncProbe(2000 + i * 100);
    sync.sample('ws-source', completeClockSyncProbe(aProbe, {
      relayReceiveMs: 1047 + i * 100,
      relaySendMs: 1051 + i * 100,
      clientReceiveMs: 1026 + i * 100,
    }));
    sync.sample('wt-source', completeClockSyncProbe(bProbe, {
      relayReceiveMs: 1998 + i * 100,
      relaySendMs: 2002 + i * 100,
      clientReceiveMs: 2024 + i * 100,
    }));
  }
  assert.ok(sync.phaseErrorMs('ws-source', 1000, 'wt-source', 1048) < 1, 'two sources align below visible phase offset');
  assert.ok(sync.phaseErrorMs('ws-source', 1000, 'wt-source', 1040) < 10, 'ws/wt source alignment stays inside 10 ms target');
}

{
  assert.deepEqual(transportFallbackPlan('local', { local: true, ws: true, wt: true }), ['local'], 'local loopback mode is never upgraded away');
  assert.deepEqual(transportFallbackPlan('wt', { local: true, ws: true, wt: false }), ['ws', 'local'], 'WebTransport falls back to WebSocket then local');
  assert.deepEqual(transportFallbackPlan('ws-json', { local: true, ws: true, wt: false }), ['ws-json', 'ws', 'local'], 'WebSocket JSON fallback is explicit');
  assert.equal(computeTransportLatencyMs(1000, 1042), 42);
  assert.equal(computeTransportLatencyMs(1000, 1042, -10), 32);
  assert.equal(computeTransportLatencyMs(1000, 100_000), null, 'impossible clock skew is rejected instead of reported');
  assert.equal(classifyCongestion({ bufferedBytes: 700_000, latencyMs: 50 }).state, 'severe');
  assert.equal(classifyCongestion({ droppedFrames: 1 }).newestOnly, true);
  assert.equal(classifyCongestion({ latencyMs: 20 }).state, 'clear');
  const note = transportSecurityNote({ token: 'secret', origin: 'https://studio.example' });
  assert.ok(note.includes('motion frames only'));
  assert.ok(note.includes('room token enabled'));
  assert.ok(note.includes('origin restricted'));
  const mailbox = new NewestOnlyMailbox();
  mailbox.push(new Uint8Array([1]));
  mailbox.push(new Uint8Array([2]));
  mailbox.push(new Uint8Array([3]));
  assert.equal(mailbox.lagFrames(), 1, 'slow subscriber remains at most one frame behind');
  assert.deepEqual(Array.from(mailbox.take()), [3]);
  assert.equal(mailbox.replaced, 2, 'packet drop simulation replaces stale frames');
  assert.equal(mailbox.lagFrames(), 0);
  assert.equal(computeLossPercent(10, 90), 10);
  assert.equal(latencyWithinTolerance(54, 50, 10), true);
  assert.equal(latencyWithinTolerance(60, 50, 10), false);
  const netem = controlledNetemHudCheck({
    expectedLossPercent: 10,
    measuredLost: 10,
    measuredAccepted: 90,
    expectedLatencyMs: 50,
    measuredLatencyMs: 54,
  });
  assert.equal(netem.lossOk, true);
  assert.equal(netem.latencyOk, true);
  assert.equal(percentileSample([4, 8, 16, 32, 64], 0.95), 64);
}

{
  assert.equal(voiceActivityLevelFromRms(0.015), 0, 'noise floor is silent');
  assert.equal(voiceActivityLevelFromRms(0.12), 1, 'speech RMS reaches full VAD level');
  const silentWeights = new Float32Array(NUM_CHANNELS);
  const silent = applyVoiceActivityAccents(silentWeights, { enabled: true, rms: 0.005 });
  assert.equal(silent.level, 0);
  assert.equal(silent.headNod, 0);
  assert.equal(silent.weights[CHANNEL_INDEX.browInnerUp], 0, 'silent voice accents leave brows unchanged');
  const disabled = applyVoiceActivityAccents(silentWeights, { enabled: false, rms: 1 });
  assert.equal(disabled.level, 0, 'disabled voice accents ignore audio energy');
  assert.equal(disabled.weights[CHANNEL_INDEX.browInnerUp], 0);
  const active = applyVoiceActivityAccents(silentWeights, { enabled: true, rms: 0.12 });
  assert.ok(active.weights[CHANNEL_INDEX.browInnerUp] > 0, 'speech energy raises brow subtly');
  assert.ok(active.headNod > 0 && active.headNod <= 0.008, 'headNod <= 0.008');
  assert.equal(silentWeights[CHANNEL_INDEX.browInnerUp], 0, 'accent helper does not mutate source weights');
}

{
  const speechFrame = estimateAudioLipsyncFrame({ rms: 0.12, low: 0.05, mid: 0.08, high: 0.02, contextTimeMs: 40 });
  assert.equal(speechFrame.speech, 1, 'speech RMS produces a full audio lipsync frame');
  assert.ok(speechFrame.openness > 0.6, 'audio lipsync estimates jaw openness from speech energy');
  const stillFace = new Float32Array(NUM_CHANNELS);
  const fused = fuseAudioLipsyncWeights(stillFace, speechFrame, {
    enabled: true,
    visualConfidence: 1,
    latencyMs: 42,
  });
  assert.ok(fused.weights[CHANNEL_INDEX.jawOpen] > 0.55, 'speaking with a still face produces plausible mouth motion');
  assert.ok(
    fused.weights[CHANNEL_INDEX.mouthFunnel] > 0 || fused.weights[CHANNEL_INDEX.mouthStretchLeft] > 0,
    'audio lipsync drives reusable ARKit mouth shape channels'
  );
  assert.equal(stillFace[CHANNEL_INDEX.jawOpen], 0, 'audio lipsync fusion does not mutate source weights');
  const stale = fuseAudioLipsyncWeights(stillFace, speechFrame, {
    enabled: true,
    visualConfidence: 1,
    latencyMs: AUDIO_LIPSYNC_TARGET_LATENCY_MS + 1,
  });
  assert.equal(stale.weights[CHANNEL_INDEX.jawOpen], 0, 'stale audio lipsync frames are ignored past the 80 ms budget');
  assert.equal(audioLipsyncWithinLatency(79), true);
  assert.equal(audioLipsyncWithinLatency(80), false);
  const released = smoothAudioLipsyncFrame(speechFrame, createSilentAudioLipsyncFrame({ contextTimeMs: 160 }), 120);
  assert.ok(released.openness < speechFrame.openness, 'audio lipsync release decays mouth motion');
}

{
  const out = execFileSync('node', ['services/erlang-router/load-test.mjs'], { cwd: root, encoding: 'utf8' });
  const result = JSON.parse(out);
  assert.equal(result.subscribers, 5000);
  assert.equal(result.nodes, 3);
  assert.ok(result.p99Ms < 30, `BEAM cluster load harness p99 ${result.p99Ms} ms`);
  assert.equal(result.localOnlyDrop, true, 'node loss drops only local subscribers');
  assert.equal(result.pass, true);
}

{
  const frame = new Uint8Array(encodeFrame(syntheticBlendshapeFrame(71)));
  const key = await deriveRoomKey('correct horse battery staple', 'e2ee-room');
  const wrongKey = await deriveRoomKey('wrong key', 'e2ee-room');
  const sealed = await encryptE2eeFrame(frame, key);
  assert.equal(E2EE_OVERHEAD_BYTES, 24);
  assert.equal(sealed.byteLength - frame.byteLength, E2EE_OVERHEAD_BYTES, 'E2EE overhead stays <=24 bytes/frame');
  assert.equal(ciphertextLooksOpaque(sealed, frame), true, 'relay ciphertext test asserts the KGM1 frame is opaque');
  const opened = await decryptE2eeFrame(sealed, key);
  assert.deepEqual(Array.from(opened), Array.from(frame));
  await assert.rejects(
    decryptE2eeFrame(sealed, wrongKey),
    /wrong room key or corrupted frame/,
    'wrong-key subscriber gets a clear decrypt error'
  );
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
  assert.equal(Math.round(HAND_INFERENCE_INTERVAL_MS), 33);
  assert.equal(HAND_CALIBRATION_TOTAL_MS, 10_000);
  const session = createHandCalibrationSession('hand-test', 1000);
  const openTarget = { handedness: 'Right', confidence: 1, curls: [0.08, 0.05, 0.04, 0.05, 0.07], spreads: [0, 0.1, 0, -0.08, -0.12], wrist: [0, 0, 0] };
  const fistTarget = { handedness: 'Right', confidence: 1, curls: [0.88, 0.95, 0.97, 0.94, 0.9], spreads: [0, 0.03, 0, -0.03, -0.04], wrist: [0, 0, 0] };
  for (let t = 1000; t < 3500; t += 250) collectHandCalibrationSample(session, [openTarget], t);
  for (let t = 3500; t < 6000; t += 250) collectHandCalibrationSample(session, [fistTarget], t);
  for (let t = 6000; t < 11_000; t += 250) collectHandCalibrationSample(session, [{ ...fistTarget, curls: [0.4, 0.2, 0.7, 0.75, 0.72] }], t);
  const handProfile = buildHandCalibrationProfile({
    openSamples: session.openSamples,
    fistSamples: session.fistSamples,
    rangeSamples: session.rangeSamples,
    name: 'hand-test',
    createdAt: '2026-07-06T00:00:00.000Z',
  });
  assert.equal(handProfile.openCurls.length, 5);
  assert.equal(handProfile.fistCurls.length, 5);
  assert.ok(handProfile.fistCurls[1] > handProfile.openCurls[1]);
  const calibrated = applyHandCalibrationProfile([{ ...openTarget, curls: [0.48, 0.5, 0.5, 0.5, 0.5] }], handProfile)[0];
  assert.ok(calibrated.curls.every((curl) => curl > 0.4 && curl < 0.65), 'hand profile normalizes mid-curl');

  assert.equal(classifyHandGesture({ curls: [0.1, 0.1, 0.1, 0.1, 0.1] }).label, 'open');
  assert.equal(classifyHandGesture({ curls: [0.7, 0.1, 0.8, 0.82, 0.84] }).label, 'point');
  assert.equal(classifyHandGesture({ curls: [0.55, 0.55, 0.62, 0.7, 0.72] }).drumGrip, true);
  const drumKit = createDefaultDrumKitConfig('test-kit');
  assert.equal(drumKitCalibrationSummary(drumKit).calibrated, 0);
  const configuredKit = normalizeDrumKitConfig({
    schema: 'minamo.drum-kit-calibration.v1',
    name: 'configured',
    zones: [{ id: 'snare', x: 0.5, y: 0.6, radius: 0.1, calibrated: true }],
  });
  assert.equal(drumKitCalibrationSummary(configuredKit).calibrated, 1);
  const drumOverlay = deriveDrumOverlayState([{
    handedness: 'Right',
    confidence: 1,
    curls: [0.55, 0.55, 0.62, 0.7, 0.72],
    spreads: [0, 0, 0, 0, 0],
    wrist: [0, -0.1, 0],
  }], configuredKit);
  assert.deepEqual(drumOverlay.activeZoneIds, ['snare']);

  const stabilizer = new HandTargetStabilizer({ holdMs: 250, maxCurlDelta: 0.2, maxSpreadDelta: 0.3 });
  stabilizer.update([openTarget], 0);
  const jumped = stabilizer.update([fistTarget], 16);
  assert.ok(jumped.warnings.some((warning) => warning.startsWith('HAND_CURL_CLAMPED')));
  assert.ok(jumped.targets[0].curls[1] < 0.3, 'unnatural hand curl jump is suppressed');
  const held = stabilizer.update([], 120);
  assert.equal(held.active, true);
  assert.ok(held.targets[0].flags & 0x02, 'short hand absence sets recovery flag');
  assert.equal(stabilizer.update([], 320).active, false, 'long hand absence omits hand block');
  assert.deepEqual(normalizeHandCalibrationProfile({ schema: 'wrong' }).openCurls, createHandCalibrationProfile().openCurls);

  const golden = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/hand-golden-clip.json'), 'utf8'));
  assert.equal(golden.schema, 'minamo.hand-golden-clip.v1');
  const clipStabilizer = new HandTargetStabilizer({ holdMs: 250, maxCurlDelta: 0.24, maxSpreadDelta: 0.36 });
  let clampWarnings = 0;
  let maxCurlStep = 0;
  let previousCurl = null;
  let finalActive = true;
  for (const frame of golden.frames) {
    const targets = Array.isArray(frame.hands) && frame.hands.length === 0
      ? []
      : [{
          handedness: frame.handedness,
          confidence: frame.confidence,
          curls: frame.curls,
          spreads: frame.spreads,
          wrist: [0, 0, 0],
        }];
    const out = clipStabilizer.update(targets, frame.t);
    finalActive = out.active;
    clampWarnings += out.warnings.filter((warning) => warning.startsWith('HAND_CURL_CLAMPED')).length;
    const curl = out.targets[0]?.curls?.[1];
    if (previousCurl !== null && curl !== undefined) maxCurlStep = Math.max(maxCurlStep, Math.abs(curl - previousCurl));
    if (curl !== undefined) previousCurl = curl;
  }
  assert.ok(clampWarnings > 0, 'golden clip detects impossible finger jumps');
  assert.ok(maxCurlStep <= 0.240001, `golden clip curl step clamped to <=0.24, got ${maxCurlStep}`);
  assert.equal(finalActive, false, 'golden clip eventually omits hands after occlusion');
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
  const kgmBytes = encodeKgmRecording(fixture.frames.map((record) => ({
    t: record.t,
    bytes: new Uint8Array(encodeFrame({
      t: Math.round(record.t),
      seq: record.seq,
      face: record.face,
      pose: record.pose,
      hands: record.hands,
    })),
  })), { source: fixture.records[0] });
  assert.equal(String.fromCharCode(...kgmBytes.slice(0, 4)), KGM_RECORDING_MAGIC);
  const parsedKgm = parseKgmRecording(kgmBytes);
  assert.equal(parsedKgm.frames.length, 1);
  assert.equal(parsedKgm.frames[0].seq, 0);
  const fixtureKgm = parseKgmRecording(fs.readFileSync(path.join(root, 'tests/fixtures/kgm1-synthetic.kgm')));
  assert.equal(fixtureKgm.frames.length, 1);
  assert.ok(tenMinuteKgmEstimateBytes(60, 76) < 5_000_000, '10-minute .kgm session remains under 5 MB');
  const vrmaFrames = [0, 33, 66].map((t, i) => {
    const clipFrame = syntheticBlendshapeFrame(300 + i);
    clipFrame.t = t;
    clipFrame.seq = i;
    clipFrame.face.quat = [0, Math.sin(i * 0.05), 0, Math.cos(i * 0.05)];
    clipFrame.face.weights[CHANNEL_INDEX.jawOpen] = i / 2;
    clipFrame.face.weights[CHANNEL_INDEX.eyeBlinkLeft] = i === 1 ? 1 : 0;
    return clipFrame;
  });
  const vrmaBytes = exportVrmaFromFrames(vrmaFrames, { trimStartMs: 0, trimEndMs: 66, loop: true });
  const vrma = parseVrmaGlb(vrmaBytes).json;
  assert.equal(vrma.extensionsUsed.includes(VRMA_EXTENSION), true);
  assert.equal(vrma.extensions[VRMA_EXTENSION].specVersion, '1.0');
  assert.ok(vrma.extensions[VRMA_EXTENSION].humanoid.humanBones.head.node >= 0, 'VRMA exports the head bone mapping');
  assert.ok(vrma.extensions[VRMA_EXTENSION].expressions.preset.aa.node >= 0, 'VRMA exports preset expression mappings');
  assert.ok(vrma.animations[0].channels.some((channel) => channel.target.path === 'rotation'), 'VRMA exports head rotation animation');
  assert.ok(vrma.animations[0].channels.some((channel) => channel.target.path === 'translation'), 'VRMA exports expression weight animation');
  assert.equal(vrma.animations[0].extras.loop, true, 'VRMA loop marker is preserved in animation extras');
  const glbFixture = encodeJsonGlb({
    asset: { version: '2.0', generator: 'minamo-test', copyright: '0BSD' },
    extensionsUsed: ['VRMC_vrm', 'VRMC_springBone'],
    extensions: {
      VRMC_vrm: {
        humanoid: { humanBones: { hips: { node: 0 }, head: { node: 1 } } },
        expressions: { preset: { aa: {}, blink: {} }, custom: { smirk: {} } },
      },
      VRMC_springBone: {
        springs: [{ joints: [{ node: 1 }, { node: 2 }] }],
        colliders: [{ node: 1 }],
      },
    },
    scenes: [{}],
    nodes: [{ name: 'hips' }, { name: 'head' }, { name: 'hair' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, targets: [{ POSITION: 1 }, { POSITION: 2 }] }] }],
    accessors: [{ count: 42 }, { count: 42 }, { count: 42 }, { max: [1.25] }],
    materials: [{}],
    textures: [{}],
    images: [{ mimeType: 'image/png', bufferView: 0 }],
    skins: [{}],
    animations: [{ name: 'wave', samplers: [{ input: 3 }], channels: [{}] }],
  });
  const glbParsed = parseGlb(glbFixture);
  const glbSummary = summarizeGltf(glbParsed.json, glbParsed.length);
  assert.equal(glbSummary.counts.vertices, 42);
  assert.equal(glbSummary.counts.morphTargets, 2);
  assert.equal(glbSummary.vrm.expressions.length, 3);
  assert.equal(glbSummary.vrm.springBoneJoints, 2);
  assert.equal(glbSummary.animations[0].durationSeconds, 1.25);
  assert.equal(glbSummary.warnings.length, 0);
  assert.ok(formatGlbInspection(glbSummary).includes('VRM 1.0'), 'GLB formatter includes VRM summary');
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

{
  const perfectNames = ARKIT_52.slice(0, 45);
  const perfect = detectPerfectSyncExpressions(perfectNames);
  assert.equal(perfect.active, true);
  assert.equal(perfect.matched.length, 45);
  const notPerfect = detectPerfectSyncExpressions(ARKIT_52.slice(0, 44));
  assert.equal(notPerfect.active, false);

  const identityMap = createPerfectSyncExpressionMap(perfectNames);
  assert.equal(identityMap.schema, EXPRESSION_MAPPING_SCHEMA);
  assert.equal(identityMap.targets.length, 45);
  const weights = new Float32Array(NUM_CHANNELS);
  weights[CHANNEL_INDEX.browDownLeft] = 0.7;
  weights[CHANNEL_INDEX.jawOpen] = 0.6;
  const identityOutputs = evaluateExpressionMap(identityMap, weights);
  assert.ok(Math.abs(identityOutputs.find((target) => target.out === 'browDownLeft').value - 0.7) < 1e-6);

  const fallbackMap = createDefaultVrmExpressionMap(['aa', 'happy', 'blink']);
  const roundTripped = parseExpressionMap(serializeExpressionMap(fallbackMap));
  assert.equal(roundTripped.schema, EXPRESSION_MAPPING_SCHEMA);
  assert.deepEqual(roundTripped.targets.map((target) => target.out).sort(), ['aa', 'blink', 'happy']);
  const fallbackOutputs = evaluateExpressionMap(roundTripped, weights);
  assert.ok(Math.abs(fallbackOutputs.find((target) => target.out === 'aa').value - 0.84) < 1e-6);
}

{
  assert.equal(classifyLayerName('eyes closed.png'), 'eyesClosed');
  assert.equal(classifyLayerName('jaw open.png'), 'mouthOpen');
  assert.equal(classifyLayerName('hair back.png'), 'back');
  const manifest = createLayeredAvatarManifest(['body.png', 'eyes open.png', 'eyes closed.png', 'mouth open.png']);
  const roundTripped = parseLayeredAvatarManifest(serializeLayeredAvatarManifest(manifest));
  assert.equal(roundTripped.schema, LAYERED_AVATAR_SCHEMA);
  assert.equal(roundTripped.layers.find((layer) => layer.slot === 'mouthOpen').depth, 0.24);
  const weights = new Float32Array(NUM_CHANNELS);
  weights[CHANNEL_INDEX.eyeBlinkLeft] = 0.8;
  weights[CHANNEL_INDEX.jawOpen] = 0.4;
  const state = layeredAvatarStateFromWeights(weights);
  assert.equal(state.eyesClosed, true);
  assert.equal(state.mouthOpen, true);
  const transform = layerTransformForDepth({ yaw: 0.5, pitch: -0.25, depth: 0.5, parallaxPx: 20 });
  assert.equal(transform.x, -5);
  assert.equal(transform.y, -2.5);
}

console.log(`OK: ${issues.length} issue files found; KGM1/KGM2 codec, filters, sequencing, calibration, mirror, quality, recording, GLB inspection, and shortcut tests passed.`);
