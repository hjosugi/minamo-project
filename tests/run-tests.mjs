import assert from 'node:assert/strict';
import { takeLateFailures, withStubbedDom } from './helpers/dom-stub.mjs';
import { localizeDesktopStatus } from '../desktop/status-i18n.js';
import { applyPitchOffset, mat4ToQuat, mat4ToQuatInto } from '../shared/pose-math.js';
import { fingerCurl, fingerSpread, fingerVector, jointAngle } from '../shared/hand-math.js';
import { roomLayout, slotOffsetX } from '../shared/room-layout.js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import {
  MESSAGES,
  SUPPORTED_LANGUAGES,
  applyTranslations,
  createI18n,
  detectLanguage,
  normalizeLanguage,
  setupPageI18n,
} from '../shared/i18n.js';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import QRCode from 'qrcode';
import { responseLooksLikeAsset } from '../shared/asset-probe.js';
import {
  CAMERA_METADATA_TIMEOUT_MS,
  startVideoPlayback,
  waitForVideoMetadata,
} from '../shared/camera-startup.js';
import { encodeFrame, decodeFrame, HAND_TARGET_BYTES } from '../shared/codec.js';
import {
  E2EE_ENVELOPE_VERSION,
  E2EE_OVERHEAD_BYTES,
  ciphertextLooksOpaque,
  decryptFrame as decryptE2eeFrame,
  deriveRoomKey,
  encryptFrame as encryptE2eeFrame,
} from '../shared/e2ee.js';
import {
  decodeKgm1bHeader,
  decodeKgm1bPacket,
  KGM1B_SUPPORTED_VERSION_MAJORS,
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
  REQUIRED_UPDATER_PLATFORMS,
  validateUpdaterManifest,
} from '../scripts/validate-updater-manifest.mjs';
import {
  parseCargoPackageVersion,
  validateReleaseMetadata,
  validateReleaseMetadataAtRoot,
} from '../scripts/validate-release-metadata.mjs';
import {
  AVATAR_DECODER_SUPPORT,
  describeAvatarLoadError,
} from '../viewer/avatar-loader.js';
import {
  EXPRESSION_MAPPING_SCHEMA,
  createDefaultInochiExpressionMap,
  createDefaultVrmExpressionMap,
  createPerfectSyncExpressionMap,
  detectPerfectSyncExpressions,
  evaluateExpressionMap,
  parseExpressionMap,
  serializeExpressionMap,
} from '../shared/expression-mapping.js';
import {
  INOX2D_UPSTREAM_REVISION,
  Inochi2DRuntime,
  describeInochi2DError,
  inspectInochi2DFile,
  isInochi2DFile,
} from '../viewer/inochi2d-runtime.js';
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
  KGM2_MAX_KEYFRAMES,
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
  validateTransportEndpoint,
} from '../shared/transport.js';
import {
  LEGACY_PARTICIPANT_ID,
  RoomParticipantStore,
  assignParticipantAvatars,
  createParticipantId,
  MAX_PARTICIPANT_ID_BYTES,
  ROOM_FRAME_HEADER_BYTES,
  ROOM_FRAME_MAGIC,
  ROOM_FRAME_VERSION,
  decodeRoomFrame,
  encodeRoomFrame,
  normalizeParticipantId,
} from '../shared/room-envelope.js';
import { OneEuroFilter, OneEuroQuat } from '../shared/filters.js';
import { ARKIT_52, NUM_CHANNELS, NUM_POSE_POINTS, CHANNEL_INDEX, MIRROR_INDEX } from '../shared/blendshapes.js';
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
  mirrorFacePayloadInPlace,
  mergeWarningsInto,
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
import {
  DATASET_RECORD_SCHEMA,
  createDatasetRecord,
  serializeDatasetRecords,
  validateDatasetRecord,
} from '../shared/dataset.js';
import {
  ASSET_COMPRESSION_CHECKLIST,
  REQUIRED_REGRESSION_POSES,
  evaluateAssetChecklist,
} from '../shared/compression-checklist.js';
import {
  KEYFRAME_INTERVAL_MS,
  createEncoderState,
  decodeMotionStream,
  encodeMotionFrame,
  quantizeWeightDeltas,
  dequantizeWeightDeltas,
  shortestPathQuat,
  shouldForceKeyframe,
} from '../shared/motion-quant.js';
import {
  DRUM_OVERLAY_SCHEMA,
  createDrumOverlayState,
  deriveObsOverlayState,
  reduceDrumOverlay,
} from '../shared/drum-overlay.js';
import {
  KAGAMI_PACK_SCHEMA,
  formatSizeTable,
  planAvatarPack,
} from '../scripts/kagami-pack.mjs';
import {
  buildPhoneTrackerUrl,
  buildViewerPairingUrl,
  normalizePairingTtlSeconds,
  pairingTokenApiUrl,
  pairingTokenState,
  parsePhoneTrackerUrl,
  parsePairingRoom,
  recommendPhoneTransport,
  redactPairingUrl,
} from '../shared/pairing.js';

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
  'shared/asset-probe.js',
  'shared/audio-lipsync.js',
  'shared/vrma-export.js',
  'src/core/types.ts',
  'tests/fixtures/hand-golden-clip.json',
  'issues/index.csv',
];
for (const file of required) {
  assert.ok(fs.existsSync(path.join(root, file)), `Missing ${file}`);
}

{
  const platformNames = [...REQUIRED_UPDATER_PLATFORMS];
  const version = '9.8.7';
  const manifest = {
    version,
    platforms: Object.fromEntries(platformNames.map((name) => [name, {
      signature: 's'.repeat(100),
      url: `https://api.github.com/releases/assets/${name}`,
    }])),
  };
  assert.deepEqual(validateUpdaterManifest(manifest, version), platformNames);
  assert.throws(() => validateUpdaterManifest(manifest, '9.8.6'), /does not match/);
  assert.throws(
    () => validateUpdaterManifest({
      ...manifest,
      platforms: { ...manifest.platforms, 'darwin-x86_64': undefined },
    }, version),
    /missing darwin-x86_64/,
  );
  assert.throws(
    () => validateUpdaterManifest({
      ...manifest,
      platforms: {
        ...manifest.platforms,
        'linux-x86_64': {
          ...manifest.platforms['linux-x86_64'],
          url: 'http://updates.invalid/appimage',
        },
      },
    }, version),
    /must use HTTPS/,
  );
  assert.throws(
    () => validateUpdaterManifest({
      ...manifest,
      platforms: {
        ...manifest.platforms,
        'windows-x86_64': {
          ...manifest.platforms['windows-x86_64'],
          url: 'not a URL',
        },
      },
    }, version),
    /is invalid/,
  );
}

{
  const version = '9.8.7';
  const releaseMetadata = {
    tag: `v${version}`,
    packageVersion: version,
    tauriVersion: version,
    cargoVersion: version,
    releaseNotesPath: `docs/releases/v${version}.md`,
    releaseNotesExists: true,
  };
  assert.equal(
    parseCargoPackageVersion(`[package]\nname = "example"\nversion = "${version}"\n\n[dependencies]\n`),
    version,
  );
  assert.deepEqual(validateReleaseMetadata(releaseMetadata), {
    tag: `v${version}`,
    version,
    releaseNotesPath: `docs/releases/v${version}.md`,
  });
  assert.throws(
    () => validateReleaseMetadata({ ...releaseMetadata, tag: 'v9.8.6' }),
    /release tag v9.8.6 does not match/,
  );
  assert.throws(
    () => validateReleaseMetadata({ ...releaseMetadata, tauriVersion: '9.8.6' }),
    /Tauri version 9.8.6 does not match/,
  );
  assert.throws(
    () => validateReleaseMetadata({ ...releaseMetadata, cargoVersion: '9.8.6' }),
    /Cargo version 9.8.6 does not match/,
  );
  assert.throws(
    () => validateReleaseMetadata({ ...releaseMetadata, releaseNotesExists: false }),
    /release notes are missing/,
  );
  const currentVersion = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
  ).version;
  assert.equal(validateReleaseMetadataAtRoot(`v${currentVersion}`, root).version, currentVersion);
}

{
  const response = (ok, contentType) => ({
    ok,
    headers: { get: (name) => name === 'content-type' ? contentType : null },
  });
  assert.equal(responseLooksLikeAsset(response(true, 'application/javascript')), true);
  assert.equal(responseLooksLikeAsset(response(true, 'application/octet-stream')), true);
  assert.equal(
    responseLooksLikeAsset(response(true, 'text/html; charset=utf-8')),
    false,
    'SPA HTML fallbacks must not be mistaken for local model assets',
  );
  assert.equal(responseLooksLikeAsset(response(false, 'application/javascript')), false);
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

  // All three implementations must agree on the version gate (#256), not just on
  // the happy path — a decoder that accepts a future major while its peers reject
  // it is exactly the interop hazard the shared golden vector exists to prevent.
  const futureHeaderHex = bytesToHex(new Uint8Array(encodeKgm1bHeader({ ...headerInput, versionMajor: 2 })));
  assert.equal(decodeKgm1bHeader(hexToBytes(futureHeaderHex)), null, 'JS must reject an unknown major');
  let pythonRejected = false;
  try {
    execFileSync('python3', ['-m', 'kgm1_codec', 'decode-header', futureHeaderHex], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONPATH: path.join(root, 'packages/kgm1-codec-py') },
    });
  } catch (error) {
    pythonRejected = true;
    assert.match(String(error.stderr ?? error.message), /unsupported version_major/,
      'the Python decoder must reject an unknown major with a clear reason');
  }
  assert.ok(pythonRejected, 'the Python decoder accepted an unknown version_major');

  // Shared conformance vectors (#257). The Rust side used to check a hex literal
  // hand-copied from this file, so a JS format change would diverge silently
  // until someone remembered to update the copy. All three implementations now
  // read tests/fixtures/kgm1b-vectors.txt; Rust does so in its own test, and the
  // Python check is driven from here so one `pnpm test` covers all three.
  const vectorPath = path.join(root, 'tests/fixtures/kgm1b-vectors.txt');
  const vectorRows = fs.readFileSync(vectorPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split('|'));
  let vectorRoundtrips = 0;
  let vectorRejects = 0;
  for (const row of vectorRows) {
    const [kind, name, packetHex] = row;
    const packetBytes = hexToBytes(packetHex);
    if (kind === 'roundtrip') {
      const payload = row[12] === '-' ? new Uint8Array() : hexToBytes(row[12]);
      const header = {
        versionMajor: Number(row[3]),
        versionMinor: Number(row[4]),
        frameId: BigInt(row[5]),
        sourceTimeNs: BigInt(row[6]),
        monotonicTimeNs: BigInt(row[7]),
        flags: Number(row[8]),
        encoding: Number(row[9]),
        payloadType: Number(row[10]),
        payloadLen: Number(row[11]),
      };
      assert.equal(bytesToHex(new Uint8Array(encodeKgm1bPacket(header, payload))), packetHex,
        `vector ${name}: encode mismatch`);
      const decoded = decodeKgm1bPacket(packetBytes);
      assert.ok(decoded, `vector ${name}: decode failed`);
      assert.equal(decoded.header.frameId, header.frameId, `vector ${name}: frameId mismatch`);
      assert.equal(decoded.header.sourceTimeNs, header.sourceTimeNs, `vector ${name}: sourceTimeNs mismatch`);
      assert.equal(decoded.header.flags, header.flags, `vector ${name}: flags mismatch`);
      assert.equal(decoded.header.payloadLen, header.payloadLen, `vector ${name}: payloadLen mismatch`);
      assert.deepEqual(Array.from(decoded.payload), Array.from(payload), `vector ${name}: payload mismatch`);
      vectorRoundtrips += 1;
    } else if (kind === 'reject') {
      assert.equal(decodeKgm1bPacket(packetBytes), null, `vector ${name}: these bytes must be rejected`);
      vectorRejects += 1;
    } else {
      assert.fail(`vector ${name}: unknown kind ${kind}`);
    }
  }
  // Guard against a fixture that silently loses its contents.
  assert.ok(vectorRoundtrips >= 5, `expected several roundtrip vectors, saw ${vectorRoundtrips}`);
  assert.ok(vectorRejects >= 5, `expected several reject vectors, saw ${vectorRejects}`);

  const pyVectors = JSON.parse(execFileSync('python3', ['-m', 'kgm1_codec', 'verify-vectors', vectorPath], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PYTHONPATH: path.join(root, 'packages/kgm1-codec-py'), NODE_V8_COVERAGE: '' },
  }));
  assert.equal(pyVectors.roundtrip, vectorRoundtrips, 'Python and JS must agree on the roundtrip vector count');
  assert.equal(pyVectors.reject, vectorRejects, 'Python and JS must agree on the reject vector count');
}

{
  const randomForAccuracy = deterministicRandom(0xdecafbad);
  let maxError = 0;
  let packedSink = 0;
  const halfSqrt = 1 / Math.sqrt(2);
  const negativeEndpoint = packSmallestThreeQuat([halfSqrt, -halfSqrt, 0, 0]);
  const positiveEndpoint = packSmallestThreeQuat([halfSqrt, halfSqrt, 0, 0]);
  assert.equal((negativeEndpoint >>> 2) & 0x03ff, 0, 'smallest-three negative endpoint uses code 0');
  assert.equal((positiveEndpoint >>> 2) & 0x03ff, 1023, 'smallest-three positive endpoint uses code 1023');
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
  const measureSmallestThree = () => {
    const t0 = performance.now();
    for (const quat of perfQuats) {
      const packed = packSmallestThreeQuat(quat);
      packedSink ^= packed;
      if (unpackSmallestThreeQuat(packed)[3] > 2) packedSink ^= 1;
    }
    return (performance.now() - t0) * 1000 / perfQuats.length;
  };
  measureSmallestThree(); // Let the runtime optimize the hot path before measuring.
  // Fastest round, not the median (#306). The median tracks machine load, so on
  // a busy runner this failed spuriously and blocked unrelated PRs. Scheduler
  // noise only ever *adds* time, so the fastest round is the honest estimate of
  // how fast the code can go, while a real regression raises that floor too.
  //
  // Measured on this hardware: ~0.4 us/quat idle, and a deliberately injected 4x
  // slowdown lands at ~1.6 — so the 1 us budget still catches a real regression.
  // Under 8-way CPU saturation the median reached 1.9 (the observed flake) while
  // the best of 25 rounds stayed at 0.57-0.77, hence the retry budget below.
  //
  // Rounds stop as soon as one beats the budget: an idle machine pays for a
  // single round, and only a contended one escalates.
  const SMALLEST_THREE_BUDGET_US = 1;
  const SMALLEST_THREE_MAX_ROUNDS = 25;
  // Under V8 coverage the same code measures ~2.7x slower (every round lands at
  // 1.10-1.27 us, tightly clustered — instrumentation overhead, not noise), so a
  // wall-clock budget there would only measure the profiler. `pnpm coverage`
  // re-runs this whole suite, and `pnpm test` already enforces the budget
  // uninstrumented, so skip rather than invent a second threshold.
  if (process.env.NODE_V8_COVERAGE) {
    console.log('SKIP: smallest-three throughput budget (meaningless under V8 coverage instrumentation)');
  } else {
    const timings = [];
    let bestUsPerQuat = Infinity;
    while (timings.length < SMALLEST_THREE_MAX_ROUNDS && bestUsPerQuat >= SMALLEST_THREE_BUDGET_US) {
      const round = measureSmallestThree();
      timings.push(round);
      bestUsPerQuat = Math.min(bestUsPerQuat, round);
    }
    assert.ok(
      bestUsPerQuat < SMALLEST_THREE_BUDGET_US,
      `smallest-three JS encode+decode best of ${timings.length} rounds was ${bestUsPerQuat.toFixed(3)} us/quat, `
      + `over the ${SMALLEST_THREE_BUDGET_US} us budget `
      + `(rounds: ${timings.map((value) => value.toFixed(3)).join(', ')}); sink=${packedSink}`,
    );
  }

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

  const longSessionEncoder = new Kgm2FaceEncoder({ keyframeInterval: 1 });
  const longSessionDecoder = new Kgm2FaceDecoder();
  for (let seq = 0; seq <= 0xffff + KGM2_MAX_KEYFRAMES; seq++) {
    const packet = longSessionEncoder.encode(kgm2FaceFrame(seq));
    assert.ok(longSessionDecoder.decode(packet));
  }
  assert.equal(
    longSessionDecoder.keyframes.size,
    KGM2_MAX_KEYFRAMES,
    'decoder bounds keyframe history after keyId wrap',
  );

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
  assert.deepEqual(
    transportFallbackPlan('wt', { local: true, ws: true, wt: true }, {
      secureOnly: true,
      allowLocalFallback: false,
      pageProtocol: 'https:',
      wtUrl: 'https://relay.example:4433',
      wsUrl: 'wss://relay.example/ws',
    }),
    ['wt', 'ws'],
    'secure phone pairing prefers runtime WebTransport and falls back only to WSS',
  );
  assert.deepEqual(
    transportFallbackPlan('wt', { local: true, ws: true, wt: false }, {
      secureOnly: true,
      allowLocalFallback: false,
      pageProtocol: 'https:',
      wtUrl: 'https://relay.example:4433',
      wsUrl: 'ws://relay.example/ws',
    }),
    [],
    'HTTPS pairing rejects plain WS and never silently falls back to local',
  );
  assert.equal(validateTransportEndpoint('ws', 'wss://relay.example/ws', { secureOnly: true }), 'wss://relay.example/ws');
  assert.throws(() => validateTransportEndpoint('ws', 'ws://relay.example/ws', { pageProtocol: 'https:' }), /mixed content/);
  assert.throws(() => validateTransportEndpoint('wt', 'http://relay.example:4433'), /https:\/\//);
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
  // Participant envelopes and lifecycle keep multi-source motion isolated (#225).
  const participantId = createParticipantId('camera', { randomUUID: () => '12345678-1234-1234-1234-123456789abc' });
  assert.equal(participantId, 'camera-123456781234');
  assert.equal(normalizeParticipantId('../bad'), LEGACY_PARTICIPANT_ID);
  const rawFrame = encodeFrame({
    t: 123,
    seq: 7,
    face: { quat: [0, 0, 0, 1], pos: [0, 0, 0.4], weights: new Float32Array(NUM_CHANNELS) },
  });
  const envelope = encodeRoomFrame('alice', rawFrame);
  const decodedEnvelope = decodeRoomFrame(envelope);
  assert.equal(decodedEnvelope.participantId, 'alice');
  assert.equal(decodedEnvelope.enveloped, true);
  assert.equal(decodeFrame(decodedEnvelope.frameBytes).seq, 7);
  assert.equal(decodeRoomFrame(rawFrame).participantId, LEGACY_PARTICIPANT_ID, 'legacy KGM1 remains compatible');
  assert.equal(decodeRoomFrame(new Uint8Array([0x4d, 0x52, 0x4d, 0x31, 9, 1, 0x61, 0])), null);

  const disposed = [];
  const store = new RoomParticipantStore({
    staleAfterMs: 100,
    fadeMs: 200,
    disposeAvatar: (avatar, id) => disposed.push(`${id}:${avatar}`),
  });
  store.ingest('bob', { seq: 1, direction: 'left' }, 1000);
  store.ingest('alice', { seq: 4, direction: 'right' }, 1000);
  store.assignAvatar('bob', 'vrm-b');
  store.assignAvatar('alice', 'vrm-a');
  assert.deepEqual(store.snapshot(1050).map((entry) => [entry.participantId, entry.latestFrame.direction]), [
    ['alice', 'right'],
    ['bob', 'left'],
  ], 'opposite motion remains participant-local and slots are deterministic');
  store.ingest('alice', { seq: 5, direction: 'up' }, 1150);
  const oneStale = store.snapshot(1200);
  assert.equal(oneStale.find((entry) => entry.participantId === 'alice').fade, 1);
  assert.ok(oneStale.find((entry) => entry.participantId === 'bob').fade < 1, 'only the stale source fades');
  assert.deepEqual(store.prune(1301), ['bob']);
  assert.deepEqual(disposed, ['bob:vrm-b']);
  const reconnected = store.ingest('bob', { seq: 0, direction: 'down' }, 1310);
  assert.equal(reconnected.generation, 2, 'reconnect creates one fresh generation');
  assert.equal(store.participants.size, 2, 'reconnect does not leave a duplicate participant');
}

{
  // Per-participant avatar-file assignment for shared rooms (#225): distinct,
  // deterministic, and stable across frames.
  const pool = ['vrm-a.vrm', 'vrm-b.vrm', 'vrm-c.vrm'];
  const first = assignParticipantAvatars(['bob', 'alice'], pool);
  assert.deepEqual([...first.entries()], [['alice', 'vrm-a.vrm'], ['bob', 'vrm-b.vrm']],
    'each source gets a distinct avatar, ordered deterministically by id');

  // A new participant keeps everyone else's avatar stable and takes a free one.
  const second = assignParticipantAvatars(['bob', 'alice', 'carol'], pool, first);
  assert.equal(second.get('alice'), 'vrm-a.vrm');
  assert.equal(second.get('bob'), 'vrm-b.vrm');
  assert.equal(second.get('carol'), 'vrm-c.vrm');

  // When a participant leaves, its avatar frees up and a newcomer reuses it.
  const third = assignParticipantAvatars(['alice', 'carol', 'dave'], pool, second);
  assert.equal(third.get('alice'), 'vrm-a.vrm');
  assert.equal(third.get('carol'), 'vrm-c.vrm');
  assert.equal(third.get('dave'), 'vrm-b.vrm', 'the freed avatar is reused, not left idle');

  // Pool smaller than the room: assignments cycle instead of going empty.
  const crowded = assignParticipantAvatars(['a', 'b', 'c'], ['only.vrm']);
  assert.deepEqual([...new Set(crowded.values())], ['only.vrm']);
  assert.equal(assignParticipantAvatars(['a'], []).get('a'), null, 'empty pool yields no avatar');
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
  // This checks the DD-005 *topology simulation*, which is plain JavaScript and
  // runs no Erlang (#258). A pass says the modelled design has the intended
  // latency and isolation properties; it says nothing about a relay
  // implementation, because there is not one.
  //
  // NODE_V8_COVERAGE is inherited by child processes, so under `pnpm coverage`
  // this helper would write its own partial profile into the same temp
  // directory and get merged with the suite's. That made the coverage totals
  // depend on process timing — the same commit passed on one CI run and failed
  // on the next. It is not code under test, so it is excluded.
  const out = execFileSync('node', ['services/erlang-router/topology-simulation.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_V8_COVERAGE: '' },
  });
  const result = JSON.parse(out);
  assert.equal(result.subscribers, 5000);
  assert.equal(result.nodes, 3);
  assert.ok(result.p99Ms < 30, `DD-005 topology simulation p99 ${result.p99Ms} ms`);
  assert.equal(result.localOnlyDrop, true, 'node loss drops only local subscribers');
  assert.equal(result.pass, true);
}

{
  const frame = new Uint8Array(encodeFrame(syntheticBlendshapeFrame(71)));
  const key = await deriveRoomKey('correct horse battery staple', 'e2ee-room');
  const wrongKey = await deriveRoomKey('wrong key', 'e2ee-room');
  const sealed = await encryptE2eeFrame(frame, key);
  assert.equal(key.version, E2EE_ENVELOPE_VERSION);
  assert.equal(E2EE_ENVELOPE_VERSION, 2, 'E2EE packets use the fail-closed v2 profile');
  assert.equal(E2EE_OVERHEAD_BYTES, 24);
  assert.equal(sealed.byteLength - frame.byteLength, E2EE_OVERHEAD_BYTES, 'E2EE overhead stays at 24 bytes/frame');
  assert.equal(ciphertextLooksOpaque(sealed, frame), true, 'relay ciphertext test asserts the KGM1 frame is opaque');
  const opened = await decryptE2eeFrame(sealed, key);
  assert.deepEqual(Array.from(opened), Array.from(frame));
  await assert.rejects(
    decryptE2eeFrame(sealed, wrongKey),
    /wrong room key or corrupted frame/,
    'wrong-key subscriber gets a clear decrypt error'
  );

  const senderNonces = [
    Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
    Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13]),
  ];
  const simulatedSenderCrypto = senderNonces.map((senderNonce) => ({
    subtle: globalThis.crypto.subtle,
    getRandomValues(target) {
      assert.equal(target.byteLength, 12, 'each sender fills the complete 96-bit GCM nonce');
      target.set(senderNonce);
      return target;
    },
  }));
  const simulatedPackets = await Promise.all(simulatedSenderCrypto.map(async (cryptoImpl) => {
    const senderKey = await deriveRoomKey('correct horse battery staple', 'e2ee-room', cryptoImpl);
    return encryptE2eeFrame(frame, senderKey, cryptoImpl);
  }));
  assert.deepEqual(
    simulatedPackets.map((packet) => Array.from(packet.slice(0, 12))),
    senderNonces.map((nonce) => Array.from(nonce)),
    'independent senders transmit unique full-width random nonces',
  );
  assert.notDeepEqual(
    Array.from(simulatedPackets[0].slice(0, 12)),
    Array.from(simulatedPackets[1].slice(0, 12)),
    'senders do not share a deterministic nonce prefix',
  );

  const legacyMaterial = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('correct horse battery staple'),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const legacyKey = await globalThis.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode('minamo:e2ee-room'),
      iterations: 120_000,
      hash: 'SHA-256',
    },
    legacyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const legacyPrefix = new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode('nonce:e2ee-room:correct horse battery staple'),
  )).slice(0, 4);
  const legacyNonce = new Uint8Array(12);
  legacyNonce.set(legacyPrefix);
  legacyNonce.set(Uint8Array.from([21, 22, 23, 24, 25, 26, 27, 28]), 4);
  const legacyCiphertext = new Uint8Array(await globalThis.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: legacyNonce,
      additionalData: new TextEncoder().encode('minamo.kgm.e2ee.v1'),
      tagLength: 128,
    },
    legacyKey,
    frame,
  ));
  const legacyPacket = new Uint8Array(8 + legacyCiphertext.byteLength);
  legacyPacket.set(legacyNonce.slice(4));
  legacyPacket.set(legacyCiphertext, 8);
  await assert.rejects(
    decryptE2eeFrame(legacyPacket, key),
    /wrong room key or corrupted frame/,
    'the v2 profile fails closed when it receives a legacy v1 envelope',
  );
  const legacyReceiverNonce = new Uint8Array(12);
  legacyReceiverNonce.set(legacyPrefix);
  legacyReceiverNonce.set(sealed.slice(0, 8), 4);
  await assert.rejects(
    globalThis.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: legacyReceiverNonce,
        additionalData: new TextEncoder().encode('minamo.kgm.e2ee.v1'),
        tagLength: 128,
      },
      legacyKey,
      sealed.slice(8),
    ),
    'a legacy v1 receiver fails closed when it receives a v2 envelope',
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

  const coldFilter = new OneEuroFilter({ minCutoff: 1.0, beta: 0.1 });
  assert.equal(coldFilter.filter(Number.NaN, 0), 0, 'non-finite first sample uses a finite fallback');
  assert.equal(coldFilter.filter(0.5, 1 / 60), 0.5, 'non-finite first sample does not initialize filter state');

  const recoveringFilter = new OneEuroFilter({ minCutoff: 1.0, beta: 0.1 });
  recoveringFilter.filter(0, 0);
  const beforeBadSample = recoveringFilter.filter(1, 1 / 60);
  assert.equal(
    recoveringFilter.filter(Number.NaN, 2 / 60),
    beforeBadSample,
    'NaN sample holds the previous smoothed value',
  );
  assert.equal(
    recoveringFilter.filter(Number.POSITIVE_INFINITY, 3 / 60),
    beforeBadSample,
    'infinite sample holds the previous smoothed value',
  );
  const recovered = recoveringFilter.filter(1, 4 / 60);
  assert.ok(Number.isFinite(recovered), 'filter recovers on the first finite sample');
  assert.ok(recovered > beforeBadSample, 'recovered filter continues converging');

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
  // The allocation-free forms the 60 fps tracker loop uses must agree with the
  // allocating ones they replaced (#259) — otherwise this is not a perf change,
  // it is a silent behaviour change nobody would see until a stream looked wrong.

  // mat4ToQuatInto fills the caller's array and returns it.
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const out = [9, 9, 9, 9];
  assert.equal(mat4ToQuatInto(out, identity), out, 'mat4ToQuatInto must return the array it was handed');
  const matrices = [
    identity,
    [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1], // 180 about x
    [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1], // 180 about y
    [-1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], // 180 about z
    [], // degenerate: every branch of the dispatch, plus the identity fallback
    [0, 0, 0],
  ];
  for (const matrix of matrices) {
    assert.deepEqual(mat4ToQuatInto([0, 0, 0, 0], matrix), mat4ToQuat(matrix),
      `mat4ToQuatInto must match mat4ToQuat for ${JSON.stringify(matrix)}`);
  }

  // The in-place mirror swaps channel pairs with no scratch buffer, which is only
  // valid because MIRROR_INDEX is an involution. If a one-way channel is ever
  // added, that assumption breaks silently, so it is checked rather than trusted.
  for (let i = 0; i < NUM_CHANNELS; i++) {
    assert.equal(MIRROR_INDEX[MIRROR_INDEX[i]], i,
      `MIRROR_INDEX must be an involution; channel ${i} (${ARKIT_52[i]}) maps to ${MIRROR_INDEX[i]} which maps back to ${MIRROR_INDEX[MIRROR_INDEX[i]]}`);
  }

  const source = new Float32Array(NUM_CHANNELS);
  for (let i = 0; i < NUM_CHANNELS; i++) source[i] = (i % 7) / 7;
  source[CHANNEL_INDEX.eyeBlinkLeft] = Number.NaN; // mirrorWeights coerces this to 0
  const mirrorQuat = [0.1, 0.2, -0.3, 0.9];
  const mirrorPos = [0.2, 0.1, 0.4];
  const expected = mirrorFacePayload({ quat: mirrorQuat, pos: mirrorPos, weights: source });
  const inPlaceQuat = mirrorQuat.slice();
  const inPlacePos = mirrorPos.slice();
  const inPlaceWeights = Float32Array.from(source);
  mirrorFacePayloadInPlace(inPlaceQuat, inPlacePos, inPlaceWeights);
  assert.deepEqual(inPlaceQuat, expected.quat, 'in-place mirror must reflect the rotation the same way');
  assert.deepEqual(inPlacePos, expected.pos, 'in-place mirror must reflect the position the same way');
  for (let i = 0; i < NUM_CHANNELS; i++) {
    assert.equal(inPlaceWeights[i], expected.weights[i],
      `in-place mirror must match mirrorFacePayload on channel ${i} (${ARKIT_52[i]})`);
  }

  // Mirroring is its own inverse, which is the involution above observed end to
  // end. Finite channels only: the NaN coercion is deliberately not reversible.
  const finiteWeights = Float32Array.from(source, (w) => (Number.isFinite(w) ? w : 0));
  const twiceQuat = mirrorQuat.slice();
  const twicePos = mirrorPos.slice();
  const twiceWeights = Float32Array.from(finiteWeights);
  for (let pass = 0; pass < 2; pass++) mirrorFacePayloadInPlace(twiceQuat, twicePos, twiceWeights);
  assert.deepEqual(twiceQuat, mirrorQuat, 'mirroring twice must restore the rotation');
  assert.deepEqual(twicePos, mirrorPos, 'mirroring twice must restore the position');
  assert.deepEqual(Array.from(twiceWeights), Array.from(finiteWeights), 'mirroring twice must restore every channel');

  // mergeWarningsInto replaces `[...new Set([...a, ...b])]` without allocating.
  const dedup = [];
  const seen = new Set();
  const a = ['WEIGHT_CLAMPED:jawOpen', 'HAND_LOW_CONFIDENCE', 'WEIGHT_CLAMPED:jawOpen'];
  const b = ['HAND_LOW_CONFIDENCE', 'QUALITY_LOW_LIGHT'];
  const merged = mergeWarningsInto(dedup, seen, a, b);
  assert.equal(merged, dedup, 'mergeWarningsInto must fill the array it was handed');
  assert.deepEqual(merged, [...new Set([...a, ...b])], 'must match the spread-into-a-Set expression it replaced');
  mergeWarningsInto(dedup, seen, ['DRUMMER_MODE_NEEDS_HANDS'], null);
  assert.deepEqual(dedup, ['DRUMMER_MODE_NEEDS_HANDS'], 'the previous frame\'s warnings must not survive into this one');
  assert.deepEqual(mergeWarningsInto(dedup, seen, null, null), [], 'no sources means no warnings');
}

{
  // The tracker refills one frame object, one pose wrapper and one warnings array
  // every frame rather than rebuilding them (#259). That is only correct while the
  // consumers outliving a frame keep their own copy, so the copy is asserted here
  // instead of assumed — this test is what makes the reuse safe to keep.
  const weights = new Float32Array(NUM_CHANNELS);
  weights[CHANNEL_INDEX.jawOpen] = 0.5;
  const frame = {
    t: 10,
    seq: 3,
    face: { quat: [0, 0, 0, 1], pos: [0.1, 0.2, 0.4], weights },
    pose: { points: new Float32Array(NUM_POSE_POINTS * 3).fill(0.25) },
    hands: [],
  };
  const warnings = ['WEIGHT_CLAMPED:jawOpen'];
  const record = createDatasetRecord({ frame, warnings, label: 'reuse', license: '0BSD' });
  const snapshot = JSON.stringify(record);

  // Exactly what the next frame does to the buffers the stored record came from.
  frame.t = 999;
  frame.seq = 4;
  frame.face.quat[0] = 0.9;
  frame.face.pos[0] = -0.9;
  weights[CHANNEL_INDEX.jawOpen] = 0;
  frame.pose.points.fill(-1);
  warnings.length = 0;
  warnings.push('SOMETHING_ELSE');

  assert.equal(JSON.stringify(record), snapshot,
    'createDatasetRecord retains its record, so it must snapshot the frame and warnings the tracker reuses');

  // createMotionRecord does alias `warnings` and `hands`, which is only safe
  // because recordFrame JSON-stringifies the result on the spot. The arrays it
  // does copy are pinned so a regression to aliasing face/pose is caught.
  const motionFrame = {
    t: 1,
    seq: 1,
    face: { quat: [0, 0, 0, 1], pos: [0, 0, 0.4], weights },
    pose: { points: new Float32Array(NUM_POSE_POINTS * 3) },
    hands: null,
  };
  const motion = createMotionRecord(motionFrame, { warnings: [] });
  motionFrame.face.pos[2] = 5;
  motionFrame.pose.points[0] = 5;
  assert.equal(motion.face.pos[2], 0.4, 'createMotionRecord must copy face.pos out of the reused frame');
  assert.equal(motion.pose.points[0], 0, 'createMotionRecord must copy pose.points out of the reused frame');
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
  const dataset = createDatasetRecord({
    seq: 1,
    label: 'stick-tip',
    license: '0BSD',
    frame,
    quality: { state: 'good', score: 0.98765, reasons: [] },
    warnings: ['HAND_DRUM_GRIP'],
    settings: { mirror: true, hands: true, pose: false, resolution: '720p', fps: '60', drummerMode: true },
    handTargets: [{ handedness: 'Right', wrist: [0.123456, -0.2, 0], curls: [0.2, 0.3], gesture: { label: 'drum grip' } }],
    drumKit: { zones: [{ id: 'snare', type: 'snare', x: 0.5, y: 0.6, radius: 0.08, calibrated: true }] },
    drumOverlay: { activeZoneIds: ['snare'], summary: { ready: true, calibrated: 1, total: 1, missing: [] } },
  });
  assert.equal(dataset.schema, DATASET_RECORD_SCHEMA);
  assert.equal(dataset.consent.rawMedia, false);
  assert.equal(dataset.hands[0].wrist[0], 0.1235);
  assert.equal(validateDatasetRecord(dataset).ok, true);
  assert.equal(serializeDatasetRecords([dataset]).trim().split('\n').length, 1);
  const rawDataset = validateDatasetRecord({ ...dataset, imageData: 'raw pixels' });
  assert.equal(rawDataset.ok, false);
  assert.ok(rawDataset.errors.some((error) => error.includes('raw media data')));
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

  const inochiMap = createDefaultInochiExpressionMap([
    'Eye:: Left:: Blink',
    'Eye:: Right:: Blink',
    'Mouth:: Open',
    'Mouth:: Smile',
  ]);
  assert.deepEqual(inochiMap.targets.map((target) => target.out), [
    'Eye:: Left:: Blink',
    'Eye:: Right:: Blink',
    'Mouth:: Open',
    'Mouth:: Smile',
  ]);
}

{
  // Pinned Inox2D browser adapter lifecycle (issue #229).
  const payload = new TextEncoder().encode(JSON.stringify({
    meta: { name: 'Fixture Puppet', artist: 'Minamo', version: '1.0' },
    param: [
      { name: 'Head:: Yaw-Pitch', is_vec2: true, min: [-1, -1], max: [1, 1], defaults: [0, 0] },
      { name: 'Mouth:: Open', is_vec2: false, min: [0, 0], max: [1, 0], defaults: [0, 0] },
    ],
  }));
  const bytes = new Uint8Array(12 + payload.length);
  bytes.set([0x54, 0x52, 0x4e, 0x53, 0x52, 0x54, 0x53, 0x00]);
  new DataView(bytes.buffer).setUint32(8, payload.length, false);
  bytes.set(payload, 12);

  const inspected = inspectInochi2DFile(bytes);
  assert.equal(inspected.name, 'Fixture Puppet');
  assert.equal(inspected.parameters[0].isVec2, true);
  assert.deepEqual(inspected.parameters.map((parameter) => parameter.name), ['Head:: Yaw-Pitch', 'Mouth:: Open']);
  assert.equal(isInochi2DFile('avatar.inp'), true);
  assert.equal(isInochi2DFile('avatar.INX'), true);
  assert.equal(isInochi2DFile('avatar.vrm'), false);
  assert.match(INOX2D_UPSTREAM_REVISION, /^[a-f0-9]{40}$/);
  assert.throws(() => inspectInochi2DFile(new Uint8Array(12)), /magic/);
  assert.equal(describeInochi2DError(new Error('BC7 texture encoding is not supported yet')).key, 'viewer.error.inochi.bc7');

  let canvasRemoved = false;
  let contextLost = false;
  const canvas = {
    id: '', width: 0, height: 0, className: '', style: {},
    setAttribute() {},
    remove() { canvasRemoved = true; },
    getContext(kind) {
      if (kind !== 'webgl2') return null;
      return { getExtension: () => ({ loseContext: () => { contextLost = true; } }) };
    },
  };
  const documentRef = {
    body: { appendChild() {} },
    createElement(tag) { assert.equal(tag, 'canvas'); return canvas; },
  };
  let model;
  class FakeInoxModel {
    constructor(modelBytes, canvasId) {
      assert.equal(modelBytes.byteLength, bytes.byteLength);
      assert.match(canvasId, /^minamo-inochi2d-/);
      this.calls = [];
      this.freed = false;
      model = this;
    }
    set_parameter(name, value) { this.calls.push(['set1', name, value]); }
    set_parameter_2d(name, x, y) { this.calls.push(['set2', name, x, y]); }
    update(dt) { this.calls.push(['update', dt]); }
    draw() { this.calls.push(['draw']); }
    free() { this.freed = true; }
  }
  const runtime = new Inochi2DRuntime({
    documentRef,
    moduleLoader: async () => ({ default: async () => {}, InoxModel: FakeInoxModel }),
  });
  await runtime.load(bytes);
  runtime.setParam('Mouth:: Open', 0.7);
  runtime.setParam('Head:: Yaw-Pitch', [0.2, -0.1]);
  runtime.update(0.2);
  const texture = { needsUpdate: false };
  runtime.render(texture);
  assert.deepEqual(runtime.listParams(), ['Head:: Yaw-Pitch', 'Mouth:: Open']);
  assert.deepEqual(model.calls, [
    ['set1', 'Mouth:: Open', 0.7],
    ['set2', 'Head:: Yaw-Pitch', 0.2, -0.1],
    ['update', 0.1],
    ['draw'],
  ]);
  assert.equal(texture.needsUpdate, true);
  runtime.dispose();
  runtime.dispose();
  assert.equal(model.freed, true);
  assert.equal(canvasRemoved, true);
  assert.equal(contextLost, true);
  assert.throws(() => runtime.update(0.01), /disposed/);
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

{
  // Sample-asset compression checklist (issues #156-#163).
  const baseline = {
    fileBytes: 5_000_000,
    counts: { nodes: 60, morphTargets: 52, materials: 4, textures: 3 },
    vrm: {
      version: 'VRM 1.0',
      humanBones: ['hips', 'spine', 'head'],
      expressions: ['aa', 'blink', 'happy'],
      springBoneJoints: 12,
      springBoneColliders: 4,
    },
  };
  const goodLicense = { source: 'https://example.test/avatar', name: 'CC-BY-4.0', redistribution: true, modification: true, attribution: true };
  const passing = evaluateAssetChecklist({ baseline, optimized: baseline, regressionPoses: [...REQUIRED_REGRESSION_POSES], license: goodLicense });
  assert.equal(passing.ok, true);
  assert.equal(passing.failures.length, 0);
  assert.ok(ASSET_COMPRESSION_CHECKLIST.length >= 8);
  assert.equal(REQUIRED_REGRESSION_POSES.length, 13);

  const stripped = { counts: { morphTargets: 0, materials: 0 }, vrm: { version: 'none', humanBones: [], expressions: [], springBoneJoints: 0 } };
  assert.equal(evaluateAssetChecklist({ baseline: stripped }).ok, false);

  const broken = { counts: { morphTargets: 40, materials: 2 }, vrm: { humanBones: ['hips', 'spine'], expressions: ['aa'], springBoneJoints: 0 } };
  const brokenResult = evaluateAssetChecklist({ baseline, optimized: broken });
  assert.equal(brokenResult.ok, false);
  assert.ok(brokenResult.failures.some((entry) => entry.includes('morph target count dropped')));
  assert.ok(brokenResult.failures.some((entry) => entry.includes('expressions removed')));
  assert.ok(brokenResult.failures.some((entry) => entry.includes('material count dropped')));

  assert.ok(evaluateAssetChecklist({ baseline, regressionPoses: ['neutral'] }).failures.some((entry) => entry.includes('missing poses')));
  assert.ok(evaluateAssetChecklist({ baseline, license: { source: 'x', name: 'proprietary', redistribution: false, modification: false } }).failures.some((entry) => entry.includes('redistribution is not permitted')));
}

{
  // Compressed avatar loader diagnostics (issue #223).
  assert.equal(AVATAR_DECODER_SUPPORT.ktx2, 'KHR_texture_basisu');
  assert.equal(AVATAR_DECODER_SUPPORT.meshopt, 'EXT_meshopt_compression');
  assert.equal(AVATAR_DECODER_SUPPORT.draco, 'KHR_draco_mesh_compression');
  // The loaders classify a failure into an i18n key; the caller renders it in the
  // reader's language and can replay it on a language toggle (#307).
  assert.equal(describeAvatarLoadError(new Error('KTX2Loader: transcoder failed')).key, 'viewer.error.avatar.ktx2');
  assert.equal(describeAvatarLoadError(new Error('MeshoptDecoder rejected stream')).key, 'viewer.error.avatar.meshopt');
  assert.equal(describeAvatarLoadError(new Error('DRACOLoader bad data')).key, 'viewer.error.avatar.draco');
  assert.equal(describeAvatarLoadError(new Error('Unexpected end of JSON input')).key, 'viewer.error.avatar.corrupt');
  assert.equal(describeAvatarLoadError(new Error('boom')).key, 'viewer.error.avatar.generic');

  // The upstream detail still reaches the reader, and a URL secret still does not.
  const redacted = describeAvatarLoadError(new Error('fetch https://example.test/avatar.vrm?token=secret failed'));
  assert.equal(redacted.key, 'viewer.error.avatar.network');
  assert.ok(!redacted.params.detail.includes('secret'), 'a query-string secret must stay redacted');

  // Every branch must render in both languages with the detail interpolated.
  for (const describe of [describeAvatarLoadError, describeInochi2DError]) {
    for (const probe of ['KTX2Loader failed', 'MeshoptDecoder failed', 'DRACOLoader failed',
      'Unexpected end of JSON input', 'fetch failed', 'BC7 unsupported', 'WebGL2 missing', 'whatever']) {
      const descriptor = describe(new Error(probe));
      for (const lang of SUPPORTED_LANGUAGES) {
        const rendered = createI18n({ lang }).t(descriptor.key, descriptor.params);
        assert.notEqual(rendered, descriptor.key, `${descriptor.key} is missing from the ${lang} table`);
        assert.ok(rendered.includes(probe), `${lang} ${descriptor.key} must include the upstream detail`);
        assert.ok(!rendered.includes('{detail}'), `${lang} ${descriptor.key} left its token uninterpolated`);
      }
    }
  }
}

{
  // Motion delta quantization reference codec (issue #161).
  assert.equal(KEYFRAME_INTERVAL_MS, 2000);
  assert.deepEqual(quantizeWeightDeltas([0, 0, 0], [0, 0, 0]), [0, 0, 0]);
  assert.deepEqual(dequantizeWeightDeltas([0, 0, 0], [0, 0, 0]), [0, 0, 0]);

  const keyWeights = [0.1, 0.5, 0.9];
  const nextWeights = [0.14, 0.52, 0.83];
  const reconstructed = dequantizeWeightDeltas(keyWeights, quantizeWeightDeltas(keyWeights, nextWeights));
  reconstructed.forEach((value, i) => assert.ok(Math.abs(value - nextWeights[i]) <= 1 / 127 + 1e-9));

  assert.deepEqual(shortestPathQuat([0, 0, 0, 1], [0, 0, 0, -1]), [0, 0, 0, 1]);

  const state = createEncoderState();
  assert.equal(shouldForceKeyframe(state, { tMs: 0 }), true);
  const frames = [
    { frameId: 0, tMs: 0, weights: [0, 0], quat: [0, 0, 0, 1], modelId: 'vrm-a' },
    { frameId: 1, tMs: 33, weights: [0.02, 0.5], quat: [0, 0.03, 0, 0.9995], modelId: 'vrm-a' },
    { frameId: 2, tMs: 66, weights: [0.04, 0.5], quat: [0, 0.05, 0, 0.9987], modelId: 'vrm-a' },
  ];
  const packets = frames.map((frame) => encodeMotionFrame(state, frame));
  assert.equal(packets[0].type, 'keyframe');
  assert.equal(packets[1].type, 'delta');
  const decoded = decodeMotionStream(packets);
  assert.equal(decoded.frames.length, 3);
  assert.ok(Math.abs(decoded.frames[2].weights[1] - 0.5) <= 1 / 127 + 1e-9);

  const fastRotationState = createEncoderState();
  const halfSqrt = 1 / Math.sqrt(2);
  const fastRotationPackets = [
    encodeMotionFrame(fastRotationState, {
      frameId: 0,
      tMs: 0,
      weights: [],
      quat: [halfSqrt, 0, 0, halfSqrt],
    }),
    encodeMotionFrame(fastRotationState, {
      frameId: 1,
      tMs: 33,
      weights: [],
      quat: [-halfSqrt, 0, 0, halfSqrt],
    }),
  ];
  assert.equal(fastRotationPackets[1].type, 'keyframe', 'saturated quaternion delta forces a keyframe');
  const fastRotationDecoded = decodeMotionStream(fastRotationPackets);
  assert.ok(
    quatAngularErrorDegrees(fastRotationPackets[1].quat, fastRotationDecoded.frames[1].quat) < 0.01,
    'fast rotation round-trip stays within 0.01 degrees',
  );

  assert.equal(encodeMotionFrame(state, { frameId: 3, tMs: 80, weights: [0.04, 0.5], quat: [0, 0.05, 0, 0.9987], modelId: 'vrm-a' }, { reconnected: true }).type, 'keyframe');
  assert.equal(encodeMotionFrame(state, { frameId: 4, tMs: 90, weights: [0.04, 0.5], quat: [0, 0.05, 0, 0.9987], modelId: 'vrm-b' }).type, 'keyframe');
  assert.equal(shouldForceKeyframe(state, { tMs: state.keyframe.tMs + KEYFRAME_INTERVAL_MS, modelId: 'vrm-b' }), true);

  const stale = [
    { type: 'keyframe', keyframeSeq: 0, frameId: 0, tMs: 0, weights: [0], quat: [0, 0, 0, 1] },
    { type: 'keyframe', keyframeSeq: 1, frameId: 1, tMs: 10, weights: [0.2], quat: [0, 0, 0, 1] },
    { type: 'delta', keyframeSeq: 0, frameId: 2, tMs: 20, weightDeltas: [10], quatDelta: [0, 0, 0, 0] },
  ];
  const staleDecoded = decodeMotionStream(stale);
  assert.equal(staleDecoded.frames.length, 2);
  assert.equal(staleDecoded.dropped, 1);
}

{
  // OBS drum overlay reducer (issue #120).
  const state = createDrumOverlayState();
  assert.equal(state.schema, DRUM_OVERLAY_SCHEMA);
  reduceDrumOverlay(state, { eventId: 'a', zoneId: 'snare', zoneType: 'snare', confidence: 0.9, hand: 'Right' }, 0);
  reduceDrumOverlay(state, { eventId: 'a', zoneId: 'snare', zoneType: 'snare', confidence: 0.9 }, 5); // duplicate ignored
  reduceDrumOverlay(state, { eventId: 'b', zoneId: 'hihat', zoneType: 'hihat', confidence: 0.5 }, 10);
  assert.equal(state.hitCount, 2);

  const atHit = deriveObsOverlayState(state, 10);
  const snareNow = atHit.zones.find((zone) => zone.zoneId === 'snare');
  assert.ok(snareNow.flash > 0);
  assert.equal(snareNow.hits, 1);
  assert.equal(snareNow.lastHand, 'Right');

  const decayed = deriveObsOverlayState(state, 400); // past the 220 ms decay window
  assert.equal(decayed.zones.find((zone) => zone.zoneId === 'snare').flash, 0);
  assert.equal(decayed.activeZoneIds.length, 0);
  assert.equal(decayed.hitCount, 2);
}

{
  // kagami-pack avatar asset pack planner (issue #41).
  const summary = {
    fileBytes: 8_000_000,
    counts: { morphTargets: 52, materials: 4 },
    vrm: { expressions: ['aa', 'blink'], humanBones: ['hips', 'head'], springBoneJoints: 12 },
  };
  const meshoptPlan = planAvatarPack(summary, {});
  assert.equal(meshoptPlan.schema, KAGAMI_PACK_SCHEMA);
  assert.equal(meshoptPlan.geometry, 'meshopt');
  assert.ok(meshoptPlan.stages.some((stage) => stage.id === 'geometry' && stage.command.includes('gltfpack')));
  assert.ok(meshoptPlan.stages.some((stage) => stage.id === 'ktx2'));
  assert.equal(meshoptPlan.warnings.length, 0);

  const dracoPlan = planAvatarPack(summary, { geometry: 'draco', texture: false });
  assert.ok(dracoPlan.stages.some((stage) => stage.id === 'geometry' && stage.command.includes('draco')));
  assert.ok(!dracoPlan.stages.some((stage) => stage.id === 'ktx2'));
  assert.ok(dracoPlan.warnings.some((warning) => warning.includes('morph-heavy')));

  const broken = planAvatarPack({ fileBytes: 1000, counts: { morphTargets: 0 }, vrm: {} }, {});
  assert.ok(broken.warnings.some((warning) => warning.includes('no morph targets')));

  const table = formatSizeTable({ fileBytes: 8_000_000, gpuMemoryMb: 120 }, { fileBytes: 2_400_000, gpuMemoryMb: 40 });
  assert.ok(table.includes('file size'));
  assert.ok(table.includes('-70.0%'));
  assert.ok(table.includes('gpu memory'));
}

{
  // Phone-as-tracker pairing helpers (issue #51).
  const url = buildPhoneTrackerUrl({
    base: 'https://studio.example/tracker/',
    mode: 'ws',
    room: 'r1',
    token: 't1',
    wsUrl: 'wss://relay.example/ws',
    resolution: '720p',
    fps: 60,
    mirror: true,
    camera: 'environment',
  });
  assert.ok(url.startsWith('https://studio.example/tracker/?'));

  // Exercise the exact payload passed to the QR encoder, then parse it back.
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  assert.equal(qr.segments.length, 1);
  const qrPayload = new TextDecoder().decode(qr.segments[0].data);
  assert.equal(qrPayload, url);
  const parsed = parsePhoneTrackerUrl(qrPayload);
  assert.equal(parsed.mode, 'ws');
  assert.equal(parsed.room, 'r1');
  assert.equal(parsed.token, 't1');
  assert.equal(parsed.wsUrl, 'wss://relay.example/ws');
  assert.equal(parsed.fps, 60);
  assert.equal(parsed.mirror, true);
  assert.equal(parsed.camera, 'environment');

  const viewerUrl = buildViewerPairingUrl({
    base: 'https://studio.example/viewer/',
    mode: 'ws',
    room: 'r1',
    token: 't1',
    wsUrl: 'wss://relay.example/ws',
  });
  const viewerParams = new URL(viewerUrl).searchParams;
  assert.equal(viewerParams.get('room'), 'r1');
  assert.equal(viewerParams.get('token'), 't1');
  assert.equal(viewerParams.get('wsUrl'), 'wss://relay.example/ws');
  const redacted = redactPairingUrl(viewerUrl);
  assert.equal(redacted.includes('t1'), false);
  assert.equal(new URL(redacted).searchParams.get('token'), 'REDACTED');
  assert.equal(pairingTokenApiUrl('wss://relay.example/ws?token=do-not-copy'), 'https://relay.example/api/pairing-tokens');
  assert.deepEqual(pairingTokenState(10_000, 9_000), { state: 'active', expiresAt: 10_000, remainingMs: 1_000 });
  assert.deepEqual(pairingTokenState(10_000, 10_000), { state: 'expired', expiresAt: 10_000, remainingMs: 0 });
  assert.equal(normalizePairingTtlSeconds(1), 30);
  assert.equal(normalizePairingTtlSeconds(99_999), 900);
  assert.equal(parsePairingRoom('phone-stage_1'), 'phone-stage_1');
  assert.throws(() => parsePairingRoom('../unsafe'), /Room must be/);

  const pairingHtml = fs.readFileSync(path.join(root, 'desktop/index.html'), 'utf8');
  for (const id of [
    'pairingQr',
    'pairingStatus',
    'btnGeneratePairing',
    'btnExpirePairing',
    'btnCopyTrackerUrl',
    'btnCopyViewerUrl',
    'openTrackerPairing',
    'openViewerPairing',
    'checkForUpdates',
    'updateStatus',
  ]) {
    assert.ok(pairingHtml.includes(`id="${id}"`), `desktop pairing UI is missing #${id}`);
  }
  assert.match(pairingHtml, /id="pairingQr"[^>]+role="img"/);
  assert.match(pairingHtml, /class="pairing-state" aria-live="polite"/);
  const trackerHtml = fs.readFileSync(path.join(root, 'tracker/index.html'), 'utf8');
  assert.match(trackerHtml, /id="selCameraFacing"/);

  // Runtime feature detection, rather than a Safari/iOS UA allow-list, decides
  // whether the configured WebTransport endpoint is attempted.
  assert.equal(recommendPhoneTransport({ webTransportAvailable: true, wtUrl: 'https://relay.example:4433' }), 'wt');
  assert.equal(recommendPhoneTransport({ webTransportAvailable: false, wtUrl: 'https://relay.example:4433' }), 'ws');
  assert.equal(recommendPhoneTransport({ webTransportAvailable: true, wtUrl: 'http://relay.example:4433' }), 'ws');
}

{
  // Camera startup: bounded metadata wait + actionable play() handling (#253).
  const stubVideo = (readyState = 0) => {
    const listeners = new Map();
    return {
      readyState,
      listeners,
      addEventListener(type, fn) { listeners.set(type, fn); },
      removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); },
      emit(type) { listeners.get(type)?.(); },
    };
  };
  const makeTimers = () => {
    let scheduled = null;
    return {
      setTimeoutFn: (fn) => { scheduled = fn; return 1; },
      clearTimeoutFn: () => { scheduled = null; },
      fire: () => { scheduled?.(); },
    };
  };

  // Resolves and cleans up when metadata arrives.
  {
    const t = makeTimers();
    const video = stubVideo();
    const p = waitForVideoMetadata(video, { setTimeoutFn: t.setTimeoutFn, clearTimeoutFn: t.clearTimeoutFn });
    video.emit('loadedmetadata');
    await p;
    assert.equal(video.listeners.size, 0, 'metadata listeners are removed after resolve');
  }
  // A stalled camera rejects on timeout instead of hanging forever.
  {
    const t = makeTimers();
    const video = stubVideo();
    const p = waitForVideoMetadata(video, { timeoutMs: 8000, setTimeoutFn: t.setTimeoutFn, clearTimeoutFn: t.clearTimeoutFn });
    t.fire();
    await assert.rejects(p, (err) => err.name === 'CameraMetadataTimeoutError');
    assert.equal(video.listeners.size, 0, 'metadata listeners are removed after timeout');
  }
  // A media error rejects with an actionable error.
  {
    const t = makeTimers();
    const video = stubVideo();
    const p = waitForVideoMetadata(video, { setTimeoutFn: t.setTimeoutFn, clearTimeoutFn: t.clearTimeoutFn });
    video.emit('error');
    await assert.rejects(p, (err) => err.name === 'CameraMetadataError');
  }
  // Already-loaded metadata resolves synchronously (no timer scheduled).
  {
    const t = makeTimers();
    await waitForVideoMetadata(stubVideo(2), { setTimeoutFn: t.setTimeoutFn, clearTimeoutFn: t.clearTimeoutFn });
  }
  // Autoplay-policy rejection becomes an actionable message.
  await assert.rejects(
    startVideoPlayback({ play: () => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })) }),
    (err) => err.name === 'CameraPlaybackBlockedError',
  );
  // A superseded-load AbortError is non-fatal.
  await startVideoPlayback({ play: () => Promise.reject(Object.assign(new Error('interrupted'), { name: 'AbortError' })) });
  // A normal play() resolves.
  let played = false;
  await startVideoPlayback({ play: () => { played = true; return Promise.resolve(); } });
  assert.equal(played, true, 'play() success resolves');
  assert.ok(CAMERA_METADATA_TIMEOUT_MS > 0, 'camera metadata timeout is configured');
}

{
  // Runtime i18n (#267): every key must exist in both languages, and the engine
  // detects/falls back correctly.
  for (const lang of SUPPORTED_LANGUAGES) {
    assert.ok(MESSAGES[lang], `MESSAGES missing language ${lang}`);
  }
  const enKeys = Object.keys(MESSAGES.en).sort();
  const jaKeys = Object.keys(MESSAGES.ja).sort();
  assert.deepEqual(jaKeys, enKeys, 'EN and JA string tables must have identical keys');
  for (const [lang, table] of Object.entries(MESSAGES)) {
    for (const [key, value] of Object.entries(table)) {
      assert.equal(typeof value, 'string', `${lang}.${key} must be a string`);
      assert.ok(value.length > 0, `${lang}.${key} must not be empty`);
    }
  }

  assert.equal(normalizeLanguage('ja-JP'), 'ja');
  assert.equal(normalizeLanguage('en-US'), 'en');
  assert.equal(normalizeLanguage('fr'), '');
  assert.equal(detectLanguage({ stored: 'ja', navigatorLanguage: 'en-US' }), 'ja');
  assert.equal(detectLanguage({ stored: '', navigatorLanguage: 'ja-JP' }), 'ja');
  assert.equal(detectLanguage({ stored: 'zz', navigatorLanguage: 'fr' }), 'en');

  const i18n = createI18n({ lang: 'ja' });
  assert.equal(i18n.t('landing.demo.running'), 'デモ実行中');
  i18n.setLang('en');
  assert.equal(i18n.t('landing.demo.running'), 'Demo running');
  assert.equal(i18n.t('missing.key', 'fallback'), 'fallback');
  // Fallback to EN when a key is only defined there.
  const partial = createI18n({ messages: { en: { only: 'E' }, ja: {} }, lang: 'ja' });
  assert.equal(partial.t('only'), 'E');
  // {token} interpolation for app status/error strings.
  assert.equal(createI18n({ lang: 'en' }).t('replay.status.blocked', { n: 3 }), 'blocked: 3 error(s)');
  assert.equal(createI18n({ lang: 'ja' }).t('viewer.error.mapping', { detail: 'boom' }), 'マッピングエラー: boom');
  assert.equal(createI18n({ lang: 'en' }).t('viewer.error.mapping', {}), 'mapping error: {detail}');

  // applyTranslations walks data-i18n / data-i18n-attr via a stubbed DOM.
  const makeEl = (attrs) => {
    const el = { textContent: '', _a: { ...attrs }, getAttribute: (k) => el._a[k] ?? null, setAttribute: (k, v) => { el._a[k] = v; } };
    return el;
  };
  const textEl = makeEl({ 'data-i18n': 'landing.hero.startDemo' });
  const attrEl = makeEl({ 'data-i18n-attr': 'aria-label:lang.toggle.aria' });
  const root = {
    querySelectorAll: (sel) => (sel === '[data-i18n]' ? [textEl] : sel === '[data-i18n-attr]' ? [attrEl] : []),
  };
  applyTranslations(root, createI18n({ lang: 'en' }).t);
  assert.equal(textEl.textContent, 'Start the demo');
  assert.equal(attrEl.getAttribute('aria-label'), 'Switch to Japanese');
}

{
  // Every data-i18n / data-i18n-attr key used in the shipped markup must exist
  // in the string tables, or the UI silently renders raw key names.
  const pages = ['index.html', 'landing/index.html', 'tracker/index.html', 'viewer/index.html', 'desktop/index.html', 'replay/index.html'];
  let markupKeys = 0;
  for (const page of pages) {
    const file = path.join(root, page);
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');
    const keys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]);
    for (const pair of [...html.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap((m) => m[1].split(';'))) {
      const key = pair.split(':')[1];
      if (key) keys.push(key.trim());
    }
    for (const key of keys) {
      markupKeys += 1;
      assert.ok(MESSAGES.en[key], `${page} references unknown i18n key ${key}`);
    }
    // A page that opts into i18n must ship the toggle the helper binds.
    if (keys.length) assert.match(html, /id="langToggle"/, `${page} uses data-i18n but has no language toggle`);
  }
  assert.ok(markupKeys > 100, `expected the product markup to be localized, saw ${markupKeys} keys`);
}

{
  // setupPageI18n: detect → translate the document → keep <html lang> in sync →
  // toggle and persist on click.
  const nodes = [
    { textContent: '', _a: { 'data-i18n': 'tracker.ui.btn.start' } },
    { textContent: '', _a: { 'data-i18n-attr': 'aria-label:lang.toggle.aria' } },
  ].map((el) => Object.assign(el, {
    getAttribute: (k) => el._a[k] ?? null,
    setAttribute: (k, v) => { el._a[k] = v; },
  }));
  let toggleClick = null;
  const documentElement = { lang: '' };
  const doc = {
    documentElement,
    getElementById: (id) => (id === 'langToggle'
      ? { addEventListener: (type, fn) => { if (type === 'click') toggleClick = fn; } }
      : null),
    querySelectorAll: (sel) => nodes.filter((n) => n.getAttribute(sel.slice(1, -1)) !== null),
  };
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  let renders = 0;
  const page = setupPageI18n({ doc, storage, navigatorLanguage: 'en-US', onRender: () => { renders += 1; } });
  assert.equal(documentElement.lang, 'en');
  assert.equal(nodes[0].textContent, 'Start tracking');
  assert.equal(nodes[1].getAttribute('aria-label'), 'Switch to Japanese');
  assert.equal(renders, 1, 'onRender fires on the initial render');

  toggleClick();
  assert.equal(page.i18n.lang, 'ja');
  assert.equal(documentElement.lang, 'ja');
  assert.equal(nodes[0].textContent, 'トラッキング開始');
  assert.equal(renders, 2, 'onRender fires again after a toggle');
  assert.equal(store.get('minamo.lang'), 'ja', 'the manual override is persisted');
  // A fresh page picks the stored override over navigator.language.
  assert.equal(setupPageI18n({ doc, storage, navigatorLanguage: 'en-US' }).i18n.lang, 'ja');
  // No toggle button and no document must not throw.
  setupPageI18n({ doc: { documentElement: {}, getElementById: () => null, querySelectorAll: () => [] }, storage });
}

{
  // Property tests for the binary parsers on the untrusted path (#262).
  //
  // Every decoder here is fed straight from a network datagram, so the contract
  // is the same for all of them: a hostile or corrupt packet must be rejected,
  // never throw, and never be mistaken for a valid one. decodeFrame already had
  // a random-buffer smoke test; these cover the parsers that had none, and add
  // the structure-aware cases random bytes almost never reach — truncation at
  // every byte offset, and a single flipped bit in an otherwise valid packet.

  const propertyRandom = deterministicRandom(0x5eed1234);
  const randomBytes = (length) => {
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(propertyRandom() * 256);
    return bytes;
  };

  // Each decoder, with a builder for a structurally valid packet.
  const kgm2Sample = (() => {
    const encoder = new Kgm2FaceEncoder({ keyframeInterval: 4 });
    const weights = new Float32Array(NUM_CHANNELS).fill(0.25);
    return new Uint8Array(encoder.encode({ t: 1000, seq: 1, face: { quat: [0, 0, 0, 1], pos: [0, 0, 0.4], weights } }));
  })();
  const kgm1bSample = new Uint8Array(encodeKgm1bPacket(
    { versionMajor: 1, versionMinor: 0, frameId: 3, sourceTimeNs: 1n, monotonicTimeNs: 2n, flags: 0, encoding: 0, payloadType: 0 },
    new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
  ));
  const roomSample = new Uint8Array(encodeRoomFrame('performer-a', encodeFrame({ t: 5, seq: 5, face: null, pose: null, hands: null })));

  const parsers = [
    { name: 'decodeFrame', decode: (bytes) => decodeFrame(bytes), valid: new Uint8Array(encodeFrame({ t: 1, seq: 1, face: null, pose: null, hands: null })) },
    { name: 'decodeKgm1bHeader', decode: (bytes) => decodeKgm1bHeader(bytes), valid: kgm1bSample },
    { name: 'decodeKgm1bPacket', decode: (bytes) => decodeKgm1bPacket(bytes), valid: kgm1bSample },
    { name: 'decodeRoomFrame', decode: (bytes) => decodeRoomFrame(bytes), valid: roomSample },
    // A fresh decoder per call: keyframe state must not make a later packet throw.
    { name: 'Kgm2FaceDecoder.decode', decode: (bytes) => new Kgm2FaceDecoder().decode(bytes), valid: kgm2Sample },
  ];

  for (const parser of parsers) {
    // 1. Arbitrary bytes never throw, at every length that matters.
    for (let round = 0; round < 4000; round++) {
      const bytes = randomBytes(Math.floor(propertyRandom() * 96));
      assert.doesNotThrow(() => parser.decode(bytes), `${parser.name} threw on random bytes: ${bytes}`);
    }

    // 2. Degenerate and wrong-typed inputs are rejected rather than trusted.
    for (const input of [new Uint8Array(), new Uint8Array([0]), new Uint8Array(4), 'not bytes', null, undefined, 42, {}]) {
      assert.doesNotThrow(() => parser.decode(input), `${parser.name} threw on ${JSON.stringify(String(input))}`);
    }

    // 3. The valid sample decodes, and every prefix of it is handled.
    assert.ok(parser.decode(parser.valid), `${parser.name} must accept its own valid sample`);
    for (let cut = 0; cut < parser.valid.byteLength; cut++) {
      assert.doesNotThrow(() => parser.decode(parser.valid.slice(0, cut)),
        `${parser.name} threw on a ${cut}-byte truncation of a valid packet`);
    }

    // 4. Flipping any single bit must still be handled — this reaches parser
    //    states random bytes never do, because the magic/version survive.
    for (let byte = 0; byte < parser.valid.byteLength; byte++) {
      for (let bit = 0; bit < 8; bit++) {
        const mutated = parser.valid.slice();
        mutated[byte] ^= 1 << bit;
        assert.doesNotThrow(() => parser.decode(mutated),
          `${parser.name} threw after flipping bit ${bit} of byte ${byte}`);
      }
    }
  }

  // 5. Round-trip: a frame that survives encode->decode must keep its identity.
  for (let round = 0; round < 500; round++) {
    const weights = new Float32Array(NUM_CHANNELS);
    for (let i = 0; i < NUM_CHANNELS; i++) weights[i] = propertyRandom();
    const seq = Math.floor(propertyRandom() * 65535);
    const t = Math.floor(propertyRandom() * 1e6);
    const decoded = decodeFrame(encodeFrame({ t, seq, face: { quat: [0, 0, 0, 1], pos: [0, 0, 0.4], weights }, pose: null, hands: null }));
    assert.equal(decoded.seq, seq, 'seq must survive a round trip');
    assert.equal(decoded.t, t, 't must survive a round trip');
    for (let i = 0; i < NUM_CHANNELS; i++) {
      // Weights are quantized to a byte, so equality is to within one step.
      assert.ok(Math.abs(decoded.face.weights[i] - weights[i]) <= 1 / 255 + 1e-9,
        `weight ${i} drifted beyond one quantization step`);
    }
  }

  // 6. E2EE: no tampering ever yields plaintext (#262). Every single-bit flip in
  //    a sealed packet must be rejected with the same opaque failure — never
  //    return data, never leak which part of the packet was wrong.
  const e2eeKey = await deriveRoomKey('property-test secret', 'fuzz-room');
  const plainFrame = new Uint8Array(encodeFrame({ t: 42, seq: 9, face: null, pose: null, hands: null }));
  const sealedFrame = await encryptE2eeFrame(plainFrame, e2eeKey);
  const sealedBytes = sealedFrame instanceof Uint8Array ? sealedFrame : new Uint8Array(sealedFrame);
  assert.deepEqual(await decryptE2eeFrame(sealedBytes, e2eeKey), plainFrame, 'an untampered packet must round-trip');

  // Sample bit positions across the nonce, ciphertext and tag rather than all of
  // them: each attempt is a full AES-GCM operation.
  for (let byte = 0; byte < sealedBytes.byteLength; byte += 3) {
    const bit = byte % 8;
    const tampered = sealedBytes.slice();
    tampered[byte] ^= 1 << bit;
    let failed = false;
    try {
      await decryptE2eeFrame(tampered, e2eeKey);
    } catch (error) {
      failed = true;
      assert.match(error.message, /wrong room key or corrupted frame/,
        `tampering at byte ${byte} must fail with the generic message, got: ${error.message}`);
    }
    assert.ok(failed, `tampering byte ${byte} bit ${bit} was accepted as authentic`);
  }

  // Truncation must be rejected too, and never as a successful decrypt.
  for (let cut = 0; cut < sealedBytes.byteLength; cut += 5) {
    await assert.rejects(() => decryptE2eeFrame(sealedBytes.slice(0, cut), e2eeKey), undefined,
      `a ${cut}-byte truncation was accepted`);
  }

  // 7. A hostile participant id must never survive decoding. Random bytes almost
  //    never produce a well-formed envelope, so these are crafted: correct magic
  //    and version, with an attacker-chosen id. An id reaches the DOM (the
  //    viewer's participant selector) and is used for avatar keying, so it must
  //    come back sanitized or not at all.
  const craftEnvelope = (idBytes, frameBytes = new Uint8Array([1, 2, 3, 4])) => {
    const packet = new Uint8Array(ROOM_FRAME_HEADER_BYTES + idBytes.length + frameBytes.length);
    packet.set(ROOM_FRAME_MAGIC, 0);
    packet[4] = ROOM_FRAME_VERSION;
    packet[5] = idBytes.length;
    packet.set(idBytes, ROOM_FRAME_HEADER_BYTES);
    packet.set(frameBytes, ROOM_FRAME_HEADER_BYTES + idBytes.length);
    return packet;
  };
  const hostileIds = [
    '../../etc/passwd',
    '..\\..\\windows',
    '<script>alert(1)</script>',
    'a/b/c',
    'id with spaces',
    'id\u0000withnull',
    'id\nwith\nnewlines',
    '../',
    '.',
    '..',
    'ドラム',
    'a'.repeat(MAX_PARTICIPANT_ID_BYTES),
  ];
  for (const hostile of hostileIds) {
    const idBytes = new TextEncoder().encode(hostile);
    if (idBytes.length === 0 || idBytes.length > MAX_PARTICIPANT_ID_BYTES) continue;
    const decoded = decodeRoomFrame(craftEnvelope(idBytes));
    if (decoded === null) continue; // rejecting outright is a valid answer
    assert.match(decoded.participantId, /^[A-Za-z0-9._-]+$/,
      `decodeRoomFrame returned an unsanitized participant id for ${JSON.stringify(hostile)}: `
      + `${JSON.stringify(decoded.participantId)}`);
    assert.ok(!decoded.participantId.includes('..'),
      `decodeRoomFrame let a path-traversal id through: ${JSON.stringify(decoded.participantId)}`);
    assert.equal(decoded.participantId, normalizeParticipantId(decoded.participantId, ''),
      'a decoded participant id must already be in normalized form');
  }
  // Invalid id lengths must be rejected rather than read out of bounds.
  for (const idLength of [0, MAX_PARTICIPANT_ID_BYTES + 1, 255]) {
    const packet = new Uint8Array(ROOM_FRAME_HEADER_BYTES + 8);
    packet.set(ROOM_FRAME_MAGIC, 0);
    packet[4] = ROOM_FRAME_VERSION;
    packet[5] = idLength;
    assert.equal(decodeRoomFrame(packet), null, `an id length of ${idLength} must be rejected`);
  }

  // 8. An unknown container major version must fail closed (#256). Without this
  //    a future, differently-shaped header is decoded as if it were this layout
  //    and every field is silently misread — worse than rejecting it.
  for (const major of KGM1B_SUPPORTED_VERSION_MAJORS) {
    const accepted = new Uint8Array(encodeKgm1bHeader({ versionMajor: major, versionMinor: 3, payloadLen: 0 }));
    assert.ok(decodeKgm1bHeader(accepted), `version_major ${major} is in the supported set and must decode`);
  }
  for (const major of [2, 3, 7, 255, 4096, 65535]) {
    const future = new Uint8Array(encodeKgm1bHeader({ versionMajor: major, versionMinor: 0, payloadLen: 0 }));
    assert.equal(decodeKgm1bHeader(future), null, `version_major ${major} must be rejected`);
    assert.equal(decodeKgm1bPacket(new Uint8Array(encodeKgm1bPacket({ versionMajor: major }, new Uint8Array([1, 2])))), null,
      `a packet with version_major ${major} must be rejected`);
  }
  // The minor version is not a compatibility boundary and must stay accepted.
  for (const minor of [0, 1, 7, 65535]) {
    const bytes = new Uint8Array(encodeKgm1bHeader({ versionMajor: 1, versionMinor: minor, payloadLen: 0 }));
    assert.ok(decodeKgm1bHeader(bytes), `version_minor ${minor} must still decode`);
  }

  // 9. A container must never report more payload than it actually carries.
  //    Dropping this bounds check is the classic length-field bug, and
  //    ArrayBuffer.slice clamps silently, so "it did not throw" proves nothing.
  const kgm1bHeaderOf = (payloadLen, actualPayload) => {
    const head = new Uint8Array(encodeKgm1bHeader({
      versionMajor: 1, versionMinor: 0, frameId: 1, sourceTimeNs: 0n, monotonicTimeNs: 0n,
      flags: 0, encoding: 0, payloadType: 0, payloadLen,
    }));
    const out = new Uint8Array(head.byteLength + actualPayload.byteLength);
    out.set(head, 0);
    out.set(actualPayload, head.byteLength);
    return out;
  };
  for (const [claimed, actual] of [[64, 8], [1, 0], [0xffffffff, 16], [100, 99]]) {
    const packet = kgm1bHeaderOf(claimed, new Uint8Array(actual));
    assert.equal(decodeKgm1bPacket(packet), null,
      `a packet claiming ${claimed} payload bytes while carrying ${actual} must be rejected`);
  }
  // And when it is accepted, the payload it hands back must match the header.
  for (const size of [0, 1, 8, 64, 255]) {
    const payload = randomBytes(size);
    const decodedPacket = decodeKgm1bPacket(kgm1bHeaderOf(size, payload));
    assert.ok(decodedPacket, `a well-formed ${size}-byte payload must decode`);
    assert.equal(decodedPacket.payload.byteLength, decodedPacket.header.payloadLen,
      'the payload handed back must be exactly as long as the header declares');
    assert.deepEqual(decodedPacket.payload, payload, 'the payload must round-trip byte for byte');
  }
}

{
  // Pure logic extracted from tracker.js / viewer.js (#263). These were
  // previously unreachable from any test: tracker.js needs a DOM, and viewer.js
  // builds a WebGLRenderer at module scope, so neither file can be imported in
  // Node at all.

  // mat4ToQuat: identity in, identity out.
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const q = mat4ToQuat(identity);
  assert.ok(Math.abs(Math.abs(q[3]) - 1) < 1e-9, `identity matrix must give the identity quaternion, got ${q}`);
  assert.ok(Math.hypot(q[0], q[1], q[2]) < 1e-9, 'identity matrix must have no vector part');

  // Each branch of the trace/major-diagonal dispatch must round-trip a known
  // rotation. Column-major 180-degree turns about each axis.
  const rot180 = {
    x: [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1],
    y: [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1],
    z: [-1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  };
  for (const [axis, matrix] of Object.entries(rot180)) {
    const quat = mat4ToQuat(matrix);
    const index = { x: 0, y: 1, z: 2 }[axis];
    assert.ok(Math.abs(Math.abs(quat[index]) - 1) < 1e-6, `180deg about ${axis} must load axis ${index}, got ${quat}`);
    assert.ok(Math.abs(quat[3]) < 1e-6, `180deg about ${axis} must have zero w, got ${quat}`);
  }

  // Every result is normalized, and a short/sparse matrix degrades to a usable
  // rotation instead of NaN.
  for (const matrix of [identity, rot180.x, rot180.y, rot180.z, [], [0, 0, 0]]) {
    const quat = mat4ToQuat(matrix);
    assert.ok(quat.every(Number.isFinite), `mat4ToQuat must never return NaN, got ${quat}`);
    assert.ok(Math.abs(Math.hypot(...quat) - 1) < 1e-9, `mat4ToQuat must return a unit quaternion, got ${quat}`);
  }

  // applyPitchOffset: no-op for zero/non-finite, and two half-turns compose to a
  // full turn (which is -identity, the same rotation).
  const base = [0, 0, 0, 1];
  assert.equal(applyPitchOffset(base, 0), base, 'a zero offset must return the input untouched');
  assert.equal(applyPitchOffset(base, Number.NaN), base, 'a non-finite offset must return the input untouched');
  const quarter = applyPitchOffset(base, Math.PI / 2);
  assert.ok(Math.abs(quarter[0] - Math.SQRT1_2) < 1e-9 && Math.abs(quarter[3] - Math.SQRT1_2) < 1e-9,
    `a quarter turn about X must be (0.707, 0, 0, 0.707), got ${quarter}`);
  const half = applyPitchOffset(applyPitchOffset(base, Math.PI / 2), Math.PI / 2);
  assert.ok(Math.abs(Math.abs(half[0]) - 1) < 1e-9, `two quarter turns must compose to a half turn, got ${half}`);
  assert.ok(Math.abs(Math.hypot(...applyPitchOffset([0.3, 0.2, 0.1, 0.9], 0.4)) - 1) < 1e-9,
    'applyPitchOffset must renormalize');

  // Both helpers divide by `Math.hypot(...) || 1`. That guard is unreachable for
  // finite input — some component is always non-zero — but a NaN entry makes
  // hypot NaN, which is falsy, so the fallback fires. Pinning it documents that
  // `??` guards missing entries while NaN still propagates, and keeps the branch
  // covered rather than sitting as a permanent hole.
  assert.deepEqual(mat4ToQuat([Number.NaN, ...Array(15).fill(0)]).map(Number.isNaN), [true, true, true, true],
    'a NaN matrix entry propagates rather than being silently repaired');
  // Only the components the NaN actually reaches go bad: x and w mix, y and z do not.
  assert.deepEqual(applyPitchOffset([Number.NaN, 0, 0, 1], 0.5).map(Number.isNaN), [true, false, false, true],
    'a NaN quaternion component propagates into the components that mix with it');

  // Finger geometry. A straight chain has no curl; a folded one approaches 1.
  const straight = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 2, z: 0 }, { x: 0, y: 3, z: 0 }];
  const folded = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }];
  const chain = [0, 1, 2, 3];
  assert.ok(fingerCurl(straight, chain) < 1e-9, 'a straight finger must read as uncurled');
  assert.ok(fingerCurl(folded, chain) > 0.8, 'a folded finger must read as strongly curled');
  for (const landmarks of [straight, folded]) {
    const curl = fingerCurl(landmarks, chain);
    assert.ok(curl >= 0 && curl <= 1, `curl must stay in 0..1, got ${curl}`);
  }
  // Coincident landmarks would divide by zero; the guard keeps it finite.
  const degenerate = Array.from({ length: 4 }, () => ({ x: 0, y: 0, z: 0 }));
  assert.ok(Number.isFinite(fingerCurl(degenerate, chain)), 'coincident landmarks must not produce NaN');
  // Coincident points make both segments zero-length; the denominator guard
  // turns that into acos(0) = PI/2, which is finite and harmless.
  assert.equal(jointAngle({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }), Math.PI / 2,
    'a fully degenerate joint stays finite');

  assert.deepEqual(fingerVector(straight, [0, 2]), { x: 0, y: 2, z: 0 });
  // Spread is signed and clamped: mirrored fingers give opposite signs.
  const middleRef = { x: 0, y: 1 };
  const leftward = [{ x: 0, y: 0, z: 0 }, { x: -1, y: 1, z: 0 }];
  const rightward = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }];
  const spreadLeft = fingerSpread(leftward, [0, 1], middleRef);
  const spreadRight = fingerSpread(rightward, [0, 1], middleRef);
  assert.ok(spreadLeft * spreadRight < 0, `mirrored fingers must spread in opposite directions, got ${spreadLeft} and ${spreadRight}`);
  for (const value of [spreadLeft, spreadRight]) {
    assert.ok(Math.abs(value) <= 1.5, `spread must clamp to +/-1.5, got ${value}`);
  }

  // Room layout: a solo avatar is full size, crowds shrink but never past the floor.
  assert.deepEqual(roomLayout(1), { scale: 1, spacing: 0.78 });
  assert.equal(roomLayout(2).scale, 0.9);
  assert.equal(roomLayout(5).spacing, 0.58, 'rooms over four participants tighten the spacing');
  for (const count of [0, 1, 2, 3, 8, 20, 100]) {
    const { scale, spacing } = roomLayout(count);
    assert.ok(scale >= 0.58 && scale <= 1, `scale must stay in 0.58..1, got ${scale} for ${count}`);
    assert.ok(spacing > 0, `spacing must stay positive, got ${spacing} for ${count}`);
  }
  assert.deepEqual(roomLayout(Number.NaN), roomLayout(0), 'a non-finite count must not produce NaN layout');

  // Slots stay centred on the origin whatever the participant count.
  for (const count of [1, 2, 3, 4, 7]) {
    const { spacing } = roomLayout(count);
    const offsets = Array.from({ length: count }, (_, slot) => slotOffsetX(slot, count, spacing));
    const centre = offsets.reduce((sum, value) => sum + value, 0) / count;
    assert.ok(Math.abs(centre) < 1e-9, `slots must be centred for ${count} participants, got ${offsets}`);
    for (let i = 1; i < offsets.length; i += 1) {
      assert.ok(offsets[i] > offsets[i - 1], 'slots must increase left to right');
    }
  }
  assert.equal(slotOffsetX(0, 1, 0.78), 0, 'a solo participant sits at the origin');
}

{
  // The real Tauri payload carries stable codes; the desktop UI owns their
  // language and can replay the same payload after an EN/JA toggle (#307).
  const nativeStatus = {
    runtime: 'tauri',
    pages: [
      { name: 'tracker', route: 'tracker/index.html', bundled: true },
      { name: 'viewer', route: 'viewer/index.html', bundled: true },
      { name: 'replay', route: 'replay/index.html', bundled: true },
    ],
    virtualCamera: {
      os: 'linux',
      backend: 'v4l2loopback',
      device: null,
      deviceStatus: 'not-found',
      state: 'driver-not-loaded',
      tone: 'err',
    },
  };
  const en = localizeDesktopStatus(nativeStatus, createI18n({ lang: 'en' }).t);
  assert.equal(en.runtime, 'Tauri desktop');
  assert.deepEqual(en.pages.map((page) => page.name), ['Tracker', 'Viewer', 'Replay']);
  assert.equal(en.virtualCamera.device, 'no /dev/video device');
  assert.equal(en.virtualCamera.state, 'driver not loaded');
  assert.equal(en.virtualCamera.tone, 'err');

  const ja = localizeDesktopStatus(nativeStatus, createI18n({ lang: 'ja' }).t);
  assert.equal(ja.runtime, 'Tauriデスクトップ');
  assert.deepEqual(ja.pages.map((page) => page.name), ['トラッカー', 'ビューア', 'リプレイ']);
  assert.equal(ja.virtualCamera.device, '/dev/videoデバイスなし');
  assert.equal(ja.virtualCamera.state, 'ドライバー未読み込み');

  const connected = localizeDesktopStatus({
    ...nativeStatus,
    virtualCamera: {
      ...nativeStatus.virtualCamera,
      device: '/dev/video2',
      deviceStatus: 'detected',
      state: 'driver-loaded',
      tone: 'ok',
    },
  }, createI18n({ lang: 'ja' }).t);
  assert.equal(connected.virtualCamera.device, '/dev/video2', 'native device paths stay verbatim');
  assert.equal(connected.virtualCamera.state, 'ドライバー読み込み済み');
  assert.equal(connected.virtualCamera.tone, 'ok');
}

{
  // Every shipped page entry module must survive a bare page load (#263).
  //
  // This is the one failure mode nothing else catches: the bundle builds, both
  // typechecks pass, and the page silently does nothing in the browser.
  // landing/app.js shipped exactly that in v0.1.11/v0.1.12 — `renderLanguage()`
  // read `running` from its temporal dead zone, so the module aborted before
  // binding a single listener and "Start the demo" was inert (fixed in #302).
  //
  // Each module is imported for real against a stub DOM, then checked for a
  // sign of life so this stays a smoke test rather than a bare import.
  // `bound` names controls whose click handler must exist once the module has
  // loaded. A top-level throw leaves them unbound — that is the whole failure
  // mode, so it is what gets asserted.
  const pages = [
    {
      file: '../landing/app.js',
      bound: ['startDemo', 'langToggle'],
    },
    {
      file: '../replay/replay.js',
      bound: ['btnPlay', 'btnPause', 'btnReset', 'langToggle'],
      // Beyond loading, replay is driven end-to-end with a real recording:
      // file input -> parse+validate -> play -> encode -> BroadcastChannel.
      drive: async ({ document }) => {
        const initialStatus = document.getElementById('statusChip').textContent;
        const fileInput = document.getElementById('fileReplay');
        const onChange = fileInput.listeners.get('change')?.[0];
        assert.ok(onChange, 'replay must bind a change handler to its file input');
        // A File-like object: replay only needs name + text().
        const jsonl = fs.readFileSync(path.join(root, 'tests/fixtures/kgm1-synthetic.jsonl'), 'utf8');
        await onChange({ target: { files: [{ name: 'synthetic.jsonl', text: async () => jsonl }] } });
        const loadedStatus = document.getElementById('statusChip').textContent;
        const play = document.getElementById('btnPlay');
        assert.equal(play.disabled, false, 'a valid recording must enable playback');
        // Frame timestamps are in the past, so the first tick drains the clip.
        await play.listeners.get('click')[0]();
        for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve));
        return { initialStatus, loadedStatus, frameCount: Number(document.getElementById('statFrames').textContent) };
      },
      check: ({ elements, broadcasts, observed }) => {
        assert.equal(observed.initialStatus, '待機中', 'replay renders its initial status from a key');
        assert.equal(observed.loadedStatus, '読み込み完了', 'a valid recording reports as loaded');
        assert.ok(observed.frameCount > 0, 'replay must report the loaded frame count');

        const posted = broadcasts.flatMap((channel) => channel.messages);
        assert.ok(posted.length > 0, 'playing a valid recording must broadcast at least one frame');
        assert.ok(broadcasts.every((channel) => channel.name.startsWith('minamo:')),
          `replay must publish on a namespaced channel, saw ${broadcasts.map((c) => c.name).join(', ')}`);

        // What went on the wire must be a real KGM1 frame the viewer can decode.
        const decoded = decodeFrame(posted[0]);
        assert.ok(decoded, 'the broadcast payload must decode as a KGM1 frame');
        assert.ok(decoded.face, 'a replayed frame must carry a face block');
        assert.equal(decoded.face.weights.length, NUM_CHANNELS, 'a decoded frame carries the full blendshape channel set');
        assert.equal(decoded.face.quat.length, 4, 'a decoded frame carries a head-pose quaternion');
        assert.ok([...decoded.face.quat].every(Number.isFinite) && [...decoded.face.pos].every(Number.isFinite),
          'decoded pose values must be finite');
        assert.ok([...decoded.face.weights].every((w) => w >= 0 && w <= 1),
          'decoded blendshape weights must stay normalized');

        assert.equal(elements.get('statusChip')?.textContent, '完了', 'a drained clip reports finished');
        assert.ok(broadcasts.every((channel) => channel.closed), 'replay must close its channel when playback stops');
      },
    },
    {
      file: '../tracker/tracker.js',
      bound: ['btnStart', 'btnStop', 'btnConnect', 'langToggle'],
      check: ({ elements }) => {
        assert.equal(elements.get('statusChip')?.textContent, '待機中', 'tracker renders its initial status from a key');
        assert.equal(elements.get('statusChip')?.dataset.state, 'idle', 'tracker starts idle');
      },
    },
    {
      file: '../desktop/desktop.js',
      bound: ['refreshStatus', 'btnExpirePairing', 'checkForUpdates', 'langToggle'],
      check: ({ elements }) => {
        assert.equal(elements.get('pairingCountdown')?.textContent, '未生成', 'desktop renders the pairing countdown from a key');
        // The stub refuses network access, so the pairing request fails; the
        // upstream message must reach the status line untranslated (#267).
        assert.match(elements.get('pairingStatus')?.textContent ?? '', /network is disabled in tests/,
          'desktop surfaces an upstream pairing failure verbatim');
        // Without a desktop runtime the page renders its own fallback status,
        // which is ours to localize (#267).
        assert.equal(elements.get('runtimeStatus')?.textContent, 'Webプレビュー', 'desktop localizes the fallback runtime status');
        assert.equal(elements.get('vcState')?.textContent, 'デスクトップランタイム未接続', 'desktop localizes the fallback virtual-camera state');
        assert.equal(elements.get('updateStatus')?.textContent, 'デスクトップアプリで利用できます',
          'browser preview keeps the signed updater behind the Tauri runtime');
        // The warn styling used to be chosen by regex-matching English words in
        // that state string, so localizing it dropped the class entirely. The
        // fallback now carries an explicit tone.
        assert.ok(elements.get('cameraStatus')?.appliedClasses.has('err'),
          'desktop marks the detached virtual camera as an error regardless of language');
      },
    },
  ];

  for (const page of pages) {
    let loadError = null;
    let observed = {};
    const { elements, documentElement, broadcasts } = await withStubbedDom(async (ctx) => {
      try {
        await import(page.file);
      } catch (error) {
        loadError = error;
        return;
      }
      // `drive` runs while the stubs are still installed, so a page can be
      // exercised for real; anything it returns reaches `check` below.
      if (page.drive) observed = (await page.drive(ctx)) ?? {};
    }, { language: 'ja-JP' });
    assert.equal(loadError, null, `${page.file} threw while loading: ${loadError?.stack || ''}`);
    assert.equal(documentElement.lang, 'ja', `${page.file} applies the detected language to <html lang>`);
    for (const id of page.bound) {
      assert.ok(elements.get(id)?.listeners.has('click'), `${page.file} left #${id} without a click handler`);
    }
    page.check?.({ elements, broadcasts, observed });
  }

  // Async work a page started during import can outlive the stubbed window and
  // reject against a restored global. That used to abort the whole suite with a
  // bare stack naming no page; it is now captured and reported here.
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
  const lateFailures = takeLateFailures();
  assert.deepEqual(lateFailures, [], `async work outlived a stubbed page load:\n${lateFailures.join('\n')}`);

  // viewer/viewer.js is deliberately absent: it constructs a THREE.WebGLRenderer
  // at module scope, which needs a real WebGL context (three dies inside
  // WebGLCapabilities reading shader precision). Stubbing enough GL to get past
  // that would assert against the stub, not against three, so the viewer is
  // covered by extracting its pure logic instead — see #263.
}

console.log(`OK: ${issues.length} issue files found; KGM1/KGM2 codec, filters, sequencing, calibration, mirror, quality, recording, GLB inspection, compressed avatar loaders, compression checklist, motion quantization, drum overlay, avatar pack planner, phone pairing, i18n, and shortcut tests passed.`);
