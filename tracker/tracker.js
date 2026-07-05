// Minamo tracker.
// Pipeline: webcam -> MediaPipe Face Landmarker (GPU, in-browser)
//        -> head pose + 52 blendshapes -> One Euro filtering
//        -> KGM1 binary encode -> transport (local / ws / wt).
// The camera image never leaves this page. Only ~76 bytes/frame go out.

import { ARKIT_52, NUM_CHANNELS, MIRROR_INDEX, POSE_POINTS, NUM_POSE_POINTS } from '../shared/blendshapes.js';
import { OneEuroArray, OneEuroQuat } from '../shared/filters.js';
import { encodeFrame } from '../shared/codec.js';
import { MinamoTransport } from '../shared/transport.js';
import {
  CALIBRATION_GUIDE_TOTAL_MS,
  DEFAULT_SMOOTHING_SETTINGS,
  DEFAULT_TRACKER_SETTINGS,
  FILTER_PRESETS,
  GAZE_CALIBRATION_STEPS,
  GAZE_CALIBRATION_TOTAL_MS,
  PROFILE_STORAGE_KEY,
  RESOLUTION_CONSTRAINTS,
  SMOOTHING_GROUPS,
  TRACKER_STORAGE_KEY,
  WARNING_TAXONOMY,
  BlinkWinkStabilizer,
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
  clamp,
  collectGazeCalibrationSample,
  computeQualityScore,
  createCalibrationProfile,
  createGazeCalibrationSession,
  createGuidedCalibrationSession,
  collectGuidedCalibrationSample,
  defaultFaceLockRegion,
  estimateLandmarkConfidence,
  estimateOneEuroLagMs,
  isEditableTarget,
  loadJson,
  mirrorFacePayload,
  normalizeProfile,
  normalizeHeadLeanRangeCm,
  sanitizeWeights,
  saveJson,
  selectTrackedFace,
  setMirrorPreviewClass,
  validateCalibrationProfile,
  resolveGaze,
} from '../shared/runtime.js';
import { createMotionRecord, createRecordingMetadata } from '../shared/recording.js';

const MEDIAPIPE_VERSION = '0.10.35';
const CDN_TASKS_VISION_BUNDLE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
const CDN_TASKS_VISION_INTEGRITY = 'sha256-VderYk+7cNzFrcSubX6pz8tWkTnT2/vysd6vy5ZrwP4=';
const CDN_WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const CDN_FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const CDN_POSE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const CDN_HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const LOCAL_TASKS_VISION_BUNDLE = `../vendor/mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
const LOCAL_WASM_ROOT = `../vendor/mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const LOCAL_FACE_MODEL = '../vendor/mediapipe/models/face_landmarker.task';
const LOCAL_POSE_MODEL = '../vendor/mediapipe/models/pose_landmarker_lite.task';
const LOCAL_HAND_MODEL = '../vendor/mediapipe/models/hand_landmarker.task';
let FilesetResolver;
let FaceLandmarker;
let HandLandmarker;
let PoseLandmarker;

/** @param {string} id @returns {any} */
const $ = (id) => document.getElementById(id);
const video = $('video');
const overlay = $('overlay');
const overlayCtx = overlay.getContext('2d');
const meters = $('meters');
const metersCtx = meters.getContext('2d');
const chip = $('statusChip');
const qualityChip = $('qualityChip');
const warningList = $('warningList');

const css = getComputedStyle(document.documentElement);
const COLOR_FACE = css.getPropertyValue('--face').trim();
const COLOR_POSE = css.getPropertyValue('--pose').trim();
const COLOR_DIM = css.getPropertyValue('--ink-dim').trim();
const COLOR_INK = css.getPropertyValue('--ink').trim();

const settings = normalizeTrackerSettings(loadJson(localStorage, TRACKER_STORAGE_KEY, DEFAULT_TRACKER_SETTINGS));
let profile = normalizeProfile(loadJson(localStorage, PROFILE_STORAGE_KEY, createCalibrationProfile('default')));
let resolvedAssets = null;

const state = {
  running: false,
  mirror: Boolean(settings.mirror),
  poseEnabled: Boolean(settings.pose),
  handsEnabled: Boolean(settings.hands),
  faceLandmarker: null,
  poseLandmarker: null,
  handLandmarker: null,
  transport: new MinamoTransport(),
  seq: 0,
  weights: new Float32Array(NUM_CHANNELS),
  raw: new Float32Array(NUM_CHANNELS),
  quat: [0, 0, 0, 1],
  pos: [0, 0, 0.4],
  posePoints: new Float32Array(NUM_POSE_POINTS * 3),
  hasPose: false,
  hasHands: false,
  hands: [],
  handTargets: null,
  trackedFaceBox: null,
  nameToIndex: null, // built from the first MediaPipe result
  // filters
  weightFilter: new OneEuroArray(NUM_CHANNELS, filterOptions('face')),
  quatFilter: new OneEuroQuat(filterOptions('headRotation')),
  posFilter: new OneEuroArray(3, filterOptions('headPosition')),
  headPositionStabilizer: new HeadPositionStabilizer(),
  poseFilter: new OneEuroArray(NUM_POSE_POINTS * 3, filterOptions('pose')),
  handCurlFilter: new OneEuroArray(10, filterOptions('hands')),
  handSpreadFilter: new OneEuroArray(10, filterOptions('hands')),
  blinkWinkStabilizer: new BlinkWinkStabilizer(),
  trackingLossSmoother: new TrackingLossSmoother(),
  dropDetector: new DroppedFrameDetector(Number(settings.fps) || 60),
  confidenceTracker: new LandmarkConfidenceTracker(),
  cameraControls: { supported: [], attempted: [], unavailable: true, lowLightNudged: false },
  selectedChannel: ARKIT_52.indexOf('jawOpen'),
  warnings: [],
  quality: { state: 'idle', score: 0, reasons: [], warnings: [] },
  lastFps: 0,
  qualityCanvas: document.createElement('canvas'),
  recording: { enabled: false, lines: [] },
  calibrationSession: null,
  gazeCalibrationSession: null,
  meterPointer: { dragging: false, pointerId: null, startX: 0, startY: 0, longPressTimer: null, longPressFired: false },
  // stats
  frames: 0,
  lastStats: performance.now(),
  inferMs: 0,
  lastBytesOut: 0,
  lastPacketBytes: 0,
};

// ---------------------------------------------------------------- math

// Column-major 4x4 -> unit quaternion [x, y, z, w].
function mat4ToQuat(m) {
  const m00 = m[0], m01 = m[4], m02 = m[8];
  const m10 = m[1], m11 = m[5], m12 = m[9];
  const m20 = m[2], m21 = m[6], m22 = m[10];
  const tr = m00 + m11 + m22;
  let x, y, z, w;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1.0) * 2;
    w = 0.25 * s;
    x = (m21 - m12) / s;
    y = (m02 - m20) / s;
    z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1.0 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1.0 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1.0 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }
  const len = Math.hypot(x, y, z, w) || 1;
  return [x / len, y / len, z / len, w / len];
}

// ---------------------------------------------------------------- setup

function normalizeTrackerSettings(raw) {
  const base = { ...DEFAULT_TRACKER_SETTINGS, ...(raw || {}) };
  const smoothing = {};
  for (const group of Object.keys(SMOOTHING_GROUPS)) {
    smoothing[group] = {
      ...DEFAULT_SMOOTHING_SETTINGS[group],
      ...(raw?.smoothing?.[group] || {}),
    };
  }
  if (!SMOOTHING_GROUPS[base.smoothingGroup]) base.smoothingGroup = 'face';
  base.headLeanRangeCm = normalizeHeadLeanRangeCm(base.headLeanRangeCm);
  base.faceLock = Boolean(base.faceLock);
  if (!raw?.smoothing?.face) {
    smoothing.face = {
      filterPreset: base.filterPreset || DEFAULT_SMOOTHING_SETTINGS.face.filterPreset,
      minCutoff: Number(base.minCutoff ?? DEFAULT_SMOOTHING_SETTINGS.face.minCutoff),
      beta: Number(base.beta ?? DEFAULT_SMOOTHING_SETTINGS.face.beta),
    };
  }
  base.smoothing = smoothing;
  return base;
}

async function loadModels() {
  chip.textContent = 'loading models...';
  await loadMediaPipeTasksVision();
  const assets = await resolveModelAssets();
  const fileset = await FilesetResolver.forVisionTasks(assets.wasmRoot);
  state.faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: assets.faceModel, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numFaces: 4,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  });
  if (state.poseEnabled && !state.poseLandmarker) {
    state.poseLandmarker = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: assets.poseModel, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
    });
  }
  if (state.handsEnabled && !state.handLandmarker) {
    state.handLandmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: assets.handModel, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: 2,
    });
  }
  state._fileset = fileset;
}

async function loadMediaPipeTasksVision() {
  if (FilesetResolver) return;
  const localAvailable = await assetExists(LOCAL_TASKS_VISION_BUNDLE);
  const vision = localAvailable
    ? await import(LOCAL_TASKS_VISION_BUNDLE)
    : await importVerifiedModule(CDN_TASKS_VISION_BUNDLE, CDN_TASKS_VISION_INTEGRITY);
  ({ FilesetResolver, FaceLandmarker, HandLandmarker, PoseLandmarker } = vision);
}

async function importVerifiedModule(url, integrity) {
  if (!globalThis.crypto?.subtle) throw new Error('Cannot verify CDN MediaPipe integrity in this browser context.');
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`MediaPipe CDN bundle failed: ${response.status}`);
  const source = await response.text();
  const actual = await sha256Integrity(source);
  if (actual !== integrity) throw new Error('MediaPipe CDN bundle integrity check failed.');
  const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    return await import(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

async function sha256Integrity(source) {
  const bytes = new TextEncoder().encode(source);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const raw = String.fromCharCode(...new Uint8Array(digest));
  return `sha256-${btoa(raw)}`;
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera API is unavailable. Use HTTPS or localhost in a modern browser.');
  }
  if (video.srcObject) {
    for (const t of video.srcObject.getTracks()) t.stop();
    video.srcObject = null;
  }
  const res = RESOLUTION_CONSTRAINTS[$('selResolution').value] || RESOLUTION_CONSTRAINTS['720p'];
  const deviceId = $('selCamera').value;
  const fps = Number($('selFps').value) || 60;
  state.dropDetector = new DroppedFrameDetector(fps);
  state.confidenceTracker = new LandmarkConfidenceTracker();
  state.headPositionStabilizer.reset();
  state.trackedFaceBox = null;
  const videoConstraints = {
    width: { ideal: res.width },
    height: { ideal: res.height },
    frameRate: { ideal: fps },
  };
  if (deviceId) videoConstraints.deviceId = { exact: deviceId };
  const stream = await navigator.mediaDevices.getUserMedia({
    video: videoConstraints,
    audio: false,
  });
  video.srcObject = stream;
  await new Promise((r) => { video.onloadedmetadata = r; });
  await video.play();
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
  const track = stream.getVideoTracks()[0];
  if (track) await configureCameraQualityControls(track);
  const trackSettings = track?.getSettings?.() || {};
  $('statCamera').textContent = `${trackSettings.width || video.videoWidth}x${trackSettings.height || video.videoHeight}@${Math.round(trackSettings.frameRate || fps)}`;
  await refreshCameras();
}

async function configureCameraQualityControls(track) {
  const caps = track.getCapabilities?.() || {};
  const attempted = [];
  const supported = [];
  const advanced = {};
  if (Array.isArray(caps.exposureMode) && caps.exposureMode.includes('continuous')) {
    advanced.exposureMode = 'continuous';
    supported.push('continuous exposure');
  }
  if (Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes('continuous')) {
    advanced.whiteBalanceMode = 'continuous';
    supported.push('continuous white balance');
  }
  if (caps.brightness && Number.isFinite(caps.brightness.min) && Number.isFinite(caps.brightness.max)) {
    supported.push('brightness');
  }
  if (Object.keys(advanced).length) {
    try {
      await track.applyConstraints({ advanced: [advanced] });
      attempted.push(...Object.keys(advanced));
    } catch (error) {
      attempted.push(`constraint unavailable: ${error.message}`);
    }
  }
  state.cameraControls = {
    track,
    caps,
    supported,
    attempted,
    unavailable: supported.length === 0,
    lowLightNudged: false,
  };
}

async function resolveModelAssets() {
  if (resolvedAssets) return resolvedAssets;
  const hasLocalModels = await assetExists(LOCAL_FACE_MODEL) && await assetExists(LOCAL_POSE_MODEL) && await assetExists(LOCAL_HAND_MODEL);
  resolvedAssets = hasLocalModels
    ? { wasmRoot: LOCAL_WASM_ROOT, faceModel: LOCAL_FACE_MODEL, poseModel: LOCAL_POSE_MODEL, handModel: LOCAL_HAND_MODEL, source: 'local vendor' }
    : { wasmRoot: CDN_WASM_ROOT, faceModel: CDN_FACE_MODEL, poseModel: CDN_POSE_MODEL, handModel: CDN_HAND_MODEL, source: 'cdn fallback' };
  return resolvedAssets;
}

async function assetExists(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

async function refreshCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const selected = $('selCamera').value || settings.cameraId || '';
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  $('selCamera').replaceChildren(new Option('default camera', ''));
  devices.forEach((device, index) => {
    const label = device.label || `camera ${index + 1}`;
    $('selCamera').append(new Option(label, device.deviceId));
  });
  if ([...$('selCamera').options].some((opt) => opt.value === selected)) $('selCamera').value = selected;
}

function filterOptions(group = 'face') {
  const groupSettings = settings.smoothing?.[group] || DEFAULT_SMOOTHING_SETTINGS[group] || DEFAULT_SMOOTHING_SETTINGS.face;
  const preset = FILTER_PRESETS[groupSettings.filterPreset] || FILTER_PRESETS.balanced;
  return {
    minCutoff: Number(groupSettings.minCutoff ?? preset.minCutoff),
    beta: Number(groupSettings.beta ?? preset.beta),
    dCutoff: preset.dCutoff,
  };
}

function resetFilters({ resetTrackingLoss = true } = {}) {
  state.weightFilter = new OneEuroArray(NUM_CHANNELS, filterOptions('face'));
  state.quatFilter = new OneEuroQuat(filterOptions('headRotation'));
  state.posFilter = new OneEuroArray(3, filterOptions('headPosition'));
  state.headPositionStabilizer.reset();
  state.blinkWinkStabilizer.reset();
  if (resetTrackingLoss) {
    state.trackingLossSmoother.reset();
    state.trackedFaceBox = null;
  }
  state.poseFilter = new OneEuroArray(NUM_POSE_POINTS * 3, filterOptions('pose'));
  state.handCurlFilter = new OneEuroArray(10, filterOptions('hands'));
  state.handSpreadFilter = new OneEuroArray(10, filterOptions('hands'));
}

function checkCapabilities() {
  const warnings = [];
  if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    warnings.push({
      code: WARNING_TAXONOMY.insecureContext,
      text: 'Camera access requires HTTPS or localhost. See docs/DEV_HTTPS.md.',
    });
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    warnings.push({ code: WARNING_TAXONOMY.noCameraApi, text: 'Camera API unavailable in this browser/context.' });
  }
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) warnings.push({ code: WARNING_TAXONOMY.noWebgl2, text: 'WebGL2 unavailable; GPU MediaPipe will not start.' });
  const wtOption = [...$('selMode').options].find((opt) => opt.value === 'wt');
  if (typeof WebTransport === 'undefined') {
    warnings.push({ code: WARNING_TAXONOMY.noWebtransport, text: 'WebTransport unsupported; wt mode is disabled.' });
    if (wtOption) wtOption.disabled = true;
    if ($('selMode').value === 'wt') $('selMode').value = 'local';
  } else if (wtOption) {
    wtOption.disabled = false;
  }
  renderWarnings(warnings.map((w) => w.text));
  if (!state.running && warnings.length) {
    $('stageHint').textContent = warnings.map((w) => w.text).join('\n');
    $('stageHint').hidden = false;
  }
  return warnings;
}

function blockingCapabilityMessage(warnings) {
  const fatal = warnings.find((warning) => [
    WARNING_TAXONOMY.insecureContext,
    WARNING_TAXONOMY.noCameraApi,
    WARNING_TAXONOMY.noWebgl2,
  ].includes(warning.code));
  return fatal?.text || '';
}

// ---------------------------------------------------------------- loop

let lastVideoTime = -1;

function loop() {
  if (!state.running) return;
  const nowMs = performance.now();

  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const t0 = performance.now();
    state.dropDetector.sample(nowMs);

    const faceRes = state.faceLandmarker.detectForVideo(video, nowMs);
    let poseRes = null;
    let handRes = null;
    if (state.poseEnabled && state.poseLandmarker) {
      poseRes = state.poseLandmarker.detectForVideo(video, nowMs);
    }
    if (state.handsEnabled && state.handLandmarker) {
      handRes = state.handLandmarker.detectForVideo(video, nowMs);
    }
    state.inferMs = performance.now() - t0;

    const tSec = nowMs / 1000;
    const faceSelection = selectTrackedFace(faceRes.faceLandmarks || [], {
      previousBox: state.trackedFaceBox,
      lock: defaultFaceLockRegion(settings.faceLock),
    });
    const faceIndex = faceSelection.index;
    const selectedLandmarks = faceIndex >= 0 ? faceRes.faceLandmarks?.[faceIndex] : null;
    const hasFace = faceIndex >= 0 && faceRes.faceBlendshapes && faceRes.faceBlendshapes[faceIndex];
    let shouldSendFace = false;
    const frameWarnings = [];

    if (hasFace) {
      state.trackedFaceBox = faceSelection.box;
      // --- blendshapes, mapped by name into the canonical KGM1 order
      const cats = faceRes.faceBlendshapes[faceIndex].categories;
      if (!state.nameToIndex) {
        state.nameToIndex = new Map();
        for (let i = 0; i < cats.length; i++) {
          const idx = ARKIT_52.indexOf(cats[i].categoryName);
          if (idx >= 0) state.nameToIndex.set(i, idx);
        }
      }
      state.raw.fill(0);
      for (const [srcI, dstI] of state.nameToIndex) {
        state.raw[dstI] = cats[srcI].score;
      }

      // --- head pose from the facial transformation matrix (cm -> m)
      let quat = [0, 0, 0, 1];
      let pos = [0, 0, 0.4];
      const mats = faceRes.facialTransformationMatrixes;
      if (mats && mats[faceIndex]) {
        const m = mats[faceIndex].data;
        quat = mat4ToQuat(m);
        pos = [m[12] / 100, m[13] / 100, m[14] / 100];
      }

      // --- mirror: reflect rotation across the YZ plane and swap L/R channels
      if (state.mirror) {
        const mirrored = mirrorFacePayload({ quat, pos, weights: state.raw });
        quat = mirrored.quat;
        pos = mirrored.pos;
        state.raw.set(mirrored.weights);
      }

      const gaze = resolveGaze(state.raw, selectedLandmarks, { mirror: state.mirror, calibration: profile.gaze });
      state.raw.set(applyGazeToWeights(state.raw, gaze));
      state.raw.set(state.blinkWinkStabilizer.filter(state.raw));
      sampleGazeCalibration(selectedLandmarks);

      // --- safety, calibration, and One Euro filtering
      const sanitized = sanitizeWeights(state.raw);
      frameWarnings.push(...sanitized.warnings);
      sampleGuidedCalibration(sanitized.weights);
      const calibratedWeights = applyCalibrationProfile(sanitized.weights, profile);
      const lossState = state.trackingLossSmoother.update(true, calibratedWeights, nowMs);
      if (lossState.reacquired) resetFilters({ resetTrackingLoss: false });
      state.weights.set(lossState.weights);
      state.weightFilter.filter(state.weights, tSec);
      state.quat = state.quatFilter.filter(quat, tSec);
      const stabilizedPos = state.headPositionStabilizer.stabilize(pos, nowMs, { leanRangeCm: settings.headLeanRangeCm });
      const p = new Float32Array(stabilizedPos);
      state.posFilter.filter(p, tSec);
      state.pos = [p[0], p[1], p[2]];
      shouldSendFace = true;
    } else {
      const lossState = state.trackingLossSmoother.update(false, state.weights, nowMs);
      state.weights.set(lossState.weights);
      shouldSendFace = lossState.active;
    }

    // --- pose points (upper body), hip-centered world meters
    state.hasPose = false;
    if (poseRes && poseRes.worldLandmarks && poseRes.worldLandmarks.length > 0) {
      const wl = poseRes.worldLandmarks[0];
      for (let i = 0; i < NUM_POSE_POINTS; i++) {
        const lm = wl[POSE_POINTS[i].mp];
        const sx = state.mirror ? -1 : 1;
        state.posePoints[i * 3 + 0] = sx * lm.x;
        state.posePoints[i * 3 + 1] = -lm.y; // MediaPipe y is down; KGM1 y is up
        state.posePoints[i * 3 + 2] = -lm.z;
      }
      state.poseFilter.filter(state.posePoints, tSec);
      state.hasPose = true;
    }

    state.hasHands = false;
    state.hands = [];
    state.handTargets = null;
    if (handRes && handRes.landmarks && handRes.landmarks.length > 0) {
      state.hasHands = true;
      state.hands = handRes.landmarks;
      state.handTargets = filterHandTargets(deriveHandTargets(handRes), tSec);
      if (handRes.landmarks.some((hand) => hand.some((lm) => lm.x < -0.05 || lm.x > 1.05 || lm.y < -0.05 || lm.y > 1.05))) {
        frameWarnings.push('hand outside frame');
      }
    }

    const landmarkConfidence = state.confidenceTracker.sample(estimateLandmarkConfidence(selectedLandmarks), nowMs);
    state.quality = computeQualityScore({
      meanLuma: sampleLuma(),
      confidence: landmarkConfidence,
      inferenceMs: state.inferMs,
      fps: state.lastFps || Number($('selFps').value) || 60,
      droppedFrames: state.dropDetector.rollingDropped(2500, nowMs),
    });
    state.warnings = [...new Set([...frameWarnings, ...state.quality.warnings])];

    // --- encode and send
    if (shouldSendFace) {
      const frame = {
        t: Math.round(nowMs),
        seq: state.seq++,
        face: { quat: state.quat, pos: state.pos, weights: state.weights },
        pose: state.hasPose ? { points: state.posePoints } : null,
        hands: state.handTargets,
      };
      const buf = encodeFrame(frame);
      state.lastPacketBytes = buf.byteLength;
      state.transport.send(buf);
      recordFrame(frame);
    }

    drawOverlay(faceRes, poseRes, handRes, faceIndex);
    drawMeters();
    state.frames++;
  }

  tickGuidedCalibration();
  tickGazeCalibration();
  updateStats(nowMs);
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- drawing

function drawOverlay(faceRes, poseRes, handRes, faceIndex = 0) {
  const w = overlay.width, h = overlay.height;
  overlayCtx.clearRect(0, 0, w, h);
  overlayCtx.save();
  if (state.mirror) {
    overlayCtx.translate(w, 0);
    overlayCtx.scale(-1, 1);
  }

  if (faceRes.faceLandmarks && faceRes.faceLandmarks[faceIndex]) {
    overlayCtx.fillStyle = COLOR_FACE;
    overlayCtx.globalAlpha = 0.7;
    const lms = faceRes.faceLandmarks[faceIndex];
    for (let i = 0; i < lms.length; i += 3) {
      overlayCtx.fillRect(lms[i].x * w - 1, lms[i].y * h - 1, 2, 2);
    }
  }

  if (poseRes && poseRes.landmarks && poseRes.landmarks.length > 0) {
    overlayCtx.strokeStyle = COLOR_POSE;
    overlayCtx.fillStyle = COLOR_POSE;
    overlayCtx.globalAlpha = 0.85;
    overlayCtx.lineWidth = 3;
    const lm = poseRes.landmarks[0];
    const seg = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16]];
    for (const [a, b] of seg) {
      overlayCtx.beginPath();
      overlayCtx.moveTo(lm[a].x * w, lm[a].y * h);
      overlayCtx.lineTo(lm[b].x * w, lm[b].y * h);
      overlayCtx.stroke();
    }
  }

  if (handRes && handRes.landmarks && handRes.landmarks.length > 0) {
    overlayCtx.strokeStyle = COLOR_FACE;
    overlayCtx.fillStyle = COLOR_FACE;
    overlayCtx.globalAlpha = 0.85;
    overlayCtx.lineWidth = 2;
    const seg = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [0, 9], [9, 10], [10, 11], [11, 12],
      [0, 13], [13, 14], [14, 15], [15, 16],
      [0, 17], [17, 18], [18, 19], [19, 20],
      [5, 9], [9, 13], [13, 17],
    ];
    for (const hand of handRes.landmarks) {
      for (const [a, b] of seg) {
        overlayCtx.beginPath();
        overlayCtx.moveTo(hand[a].x * w, hand[a].y * h);
        overlayCtx.lineTo(hand[b].x * w, hand[b].y * h);
        overlayCtx.stroke();
      }
      for (const lm of hand) overlayCtx.fillRect(lm.x * w - 2, lm.y * h - 2, 4, 4);
    }
  }
  overlayCtx.restore();
}

const HAND_CHAINS = [
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];

function deriveHandTargets(handRes) {
  return handRes.landmarks.slice(0, 2).map((landmarks, handIndex) => {
    const handedness = handRes.handedness?.[handIndex]?.[0]?.categoryName === 'Left' ? 'Left' : 'Right';
    const middle = fingerVector(landmarks, HAND_CHAINS[2]);
    return {
      handedness,
      confidence: handRes.handedness?.[handIndex]?.[0]?.score ?? 1,
      curls: HAND_CHAINS.map((chain) => fingerCurl(landmarks, chain)),
      spreads: HAND_CHAINS.map((chain) => fingerSpread(landmarks, chain, middle)),
    };
  });
}

function filterHandTargets(targets, tSec) {
  if (!targets?.length) return targets;
  const curls = new Float32Array(10);
  const spreads = new Float32Array(10);
  for (let h = 0; h < Math.min(2, targets.length); h++) {
    for (let i = 0; i < 5; i++) {
      curls[h * 5 + i] = targets[h].curls[i] ?? 0;
      spreads[h * 5 + i] = targets[h].spreads[i] ?? 0;
    }
  }
  state.handCurlFilter.filter(curls, tSec);
  state.handSpreadFilter.filter(spreads, tSec);
  return targets.map((target, h) => ({
    ...target,
    curls: target.curls.map((_, i) => curls[h * 5 + i]),
    spreads: target.spreads.map((_, i) => spreads[h * 5 + i]),
  }));
}

function fingerVector(landmarks, chain) {
  const a = landmarks[chain[0]];
  const b = landmarks[chain[1]];
  return { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
}

function fingerCurl(landmarks, chain) {
  const a = angle(landmarks[chain[0]], landmarks[chain[1]], landmarks[chain[2]]);
  const b = angle(landmarks[chain[1]], landmarks[chain[2]], landmarks[chain[3]]);
  return Math.max(0, Math.min(1, ((Math.PI - a) + (Math.PI - b)) / (Math.PI * 1.2)));
}

function fingerSpread(landmarks, chain, middle) {
  const v = fingerVector(landmarks, chain);
  const cross = middle.x * v.y - middle.y * v.x;
  const dot = middle.x * v.x + middle.y * v.y;
  return Math.max(-1.5, Math.min(1.5, Math.atan2(cross, dot)));
}

function angle(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const cb = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const denom = Math.hypot(ab.x, ab.y, ab.z) * Math.hypot(cb.x, cb.y, cb.z) || 1;
  const dot = (ab.x * cb.x + ab.y * cb.y + ab.z * cb.z) / denom;
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

function drawMeters() {
  const dpr = window.devicePixelRatio || 1;
  const cw = meters.clientWidth, ch = meters.clientHeight;
  if (meters.width !== cw * dpr) { meters.width = cw * dpr; meters.height = ch * dpr; }
  const ctx = metersCtx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);

  const rowH = ch / NUM_CHANNELS;
  const labelW = 118;
  const barW = cw - labelW - 42;
  ctx.font = '9px "IBM Plex Mono", monospace';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < NUM_CHANNELS; i++) {
    const y = i * rowH + rowH / 2;
    const v = state.weights[i];
    const selected = i === state.selectedChannel;
    const muted = profile.muted[i];
    if (selected) {
      ctx.fillStyle = 'rgba(111,227,255,0.12)';
      ctx.fillRect(0, i * rowH, cw, rowH);
    }
    ctx.fillStyle = muted ? 'rgba(138,144,184,0.35)' : COLOR_DIM;
    ctx.fillText(ARKIT_52[i], 4, y);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(labelW, y - 2, barW, 4);
    ctx.fillStyle = muted ? COLOR_DIM : COLOR_FACE;
    ctx.globalAlpha = muted ? 0.25 : 0.35 + v * 0.65;
    ctx.fillRect(labelW, y - 2, barW * v, 4);
    ctx.globalAlpha = 1;
    if (v > 0.02) {
      ctx.fillStyle = COLOR_INK;
      ctx.fillText(v.toFixed(2), labelW + barW + 6, y);
    }
  }
}

function sampleLuma() {
  const canvas = state.qualityCanvas;
  canvas.width = 32;
  canvas.height = 18;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  try {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    }
    return sum / (data.length / 4);
  } catch {
    return 128;
  }
}

function recordFrame(frame) {
  if (!state.recording.enabled) return;
  state.recording.lines.push(JSON.stringify(createMotionRecord(frame, {
    quality: state.quality,
    warnings: state.warnings,
  })));
  if (state.recording.lines.length > 36_000) state.recording.lines.shift();
  $('btnDownloadRecording').disabled = state.recording.lines.length === 0;
}

function updateStats(nowMs) {
  if (nowMs - state.lastStats < 500) return;
  const dt = (nowMs - state.lastStats) / 1000;
  state.lastFps = state.frames / dt;
  $('statFps').textContent = state.lastFps.toFixed(0);
  $('statInfer').textContent = state.inferMs.toFixed(1);
  $('statPacket').textContent = state.lastPacketBytes || '--';
  $('statDropped').textContent = String(state.dropDetector.dropped);
  $('statFilterLag').textContent = estimateOneEuroLagMs(settings.smoothing.face.minCutoff).toFixed(0);
  $('statJitter').textContent = state.dropDetector.rollingJitterMs(2500, nowMs).toFixed(1);
  $('statHands').textContent = state.hasHands ? String(state.hands.length) : '0';
  const rate = (state.transport.bytesOut - state.lastBytesOut) / dt / 1024;
  $('statRate').textContent = rate.toFixed(1);
  qualityChip.textContent = `${state.quality.state} ${Math.round((state.quality.score || 0) * 100)}%`;
  qualityChip.dataset.state = state.quality.state;
  const visibleWarnings = [
    ...state.quality.reasons,
    ...state.warnings.filter((w) => typeof w === 'string').slice(0, 4),
  ];
  renderWarnings([...new Set(visibleWarnings)]);
  renderLightingChecklist();
  state.lastBytesOut = state.transport.bytesOut;
  state.frames = 0;
  state.lastStats = nowMs;
}

function renderWarnings(messages) {
  warningList.replaceChildren(...messages.slice(0, 6).map((message) => {
    const li = document.createElement('li');
    li.textContent = message;
    return li;
  }));
}

function renderLightingChecklist() {
  const active = state.running || state.quality.state !== 'idle';
  const exposureOk = !hasQualityWarning(WARNING_TAXONOMY.lowLight);
  setChecklistState('checkExposure', active, exposureOk, exposureOk ? exposureStatusHint() : exposureFixHint());
  setChecklistState('checkFps', active, !hasQualityWarning(WARNING_TAXONOMY.droppedFrames), 'lower resolution or close heavy apps');
  setChecklistState('checkBlur', active, !hasQualityWarning(WARNING_TAXONOMY.motionBlur), 'slow the motion or raise camera fps');
  setChecklistState('checkConfidence', active, !hasQualityWarning(WARNING_TAXONOMY.occlusion), 'keep face and hands inside frame');
  if (active && !exposureOk) nudgeBrightnessForLowLight().catch(() => {});
}

function hasQualityWarning(code) {
  return state.quality.warnings.includes(code) || state.warnings.some((warning) => String(warning).startsWith(code));
}

function setChecklistState(id, active, ok, hint) {
  const item = $(id);
  item.dataset.state = active ? (ok ? 'ok' : 'check') : 'idle';
  item.querySelector('b').textContent = active ? (ok ? 'ok' : 'check') : 'wait';
  item.querySelector('small').textContent = active ? (ok ? 'stable' : hint) : 'start camera';
}

function exposureStatusHint() {
  if (state.cameraControls.unavailable) return 'manual camera exposure';
  if (state.cameraControls.attempted.length) return `auto ${state.cameraControls.attempted.join(', ')}`;
  return `${state.cameraControls.supported.join(', ')} available`;
}

function exposureFixHint() {
  if (state.cameraControls.unavailable) return 'add front light; camera controls unavailable';
  return 'add front light; trying supported exposure controls';
}

async function nudgeBrightnessForLowLight() {
  const controls = state.cameraControls;
  if (controls.lowLightNudged || !controls.track || !controls.caps?.brightness) return;
  const { min, max } = controls.caps.brightness;
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return;
  const target = min + (max - min) * 0.7;
  controls.lowLightNudged = true;
  try {
    await controls.track.applyConstraints({ advanced: [{ brightness: target }] });
    controls.attempted.push('brightness');
  } catch (error) {
    controls.attempted.push(`brightness unavailable: ${error.message}`);
  }
}

// ---------------------------------------------------------------- ui

function applySettingsToUi() {
  $('selMode').value = settings.mode;
  $('inpRoom').value = settings.room;
  $('inpToken').value = settings.token;
  $('inpWtUrl').value = settings.wtUrl;
  $('inpWtHash').value = settings.wtHash;
  $('chkMirror').checked = Boolean(settings.mirror);
  $('chkPose').checked = Boolean(settings.pose);
  $('chkHands').checked = Boolean(settings.hands);
  $('chkFaceLock').checked = Boolean(settings.faceLock);
  $('chkPrivacy').checked = Boolean(settings.privacyLocalOnly);
  $('selResolution').value = settings.resolution;
  $('selFps').value = settings.fps;
  $('rngHeadLean').value = settings.headLeanRangeCm;
  $('outHeadLean').textContent = `${settings.headLeanRangeCm} cm`;
  $('selSmoothingGroup').value = settings.smoothingGroup;
  updateSmoothingControls();
  state.mirror = Boolean(settings.mirror);
  state.poseEnabled = Boolean(settings.pose);
  state.handsEnabled = Boolean(settings.hands);
  setMirrorPreviewClass(video, state.mirror);
  updateModeFields();
  updateViewerLink();
  updateChannelControls();
}

function readSettingsFromUi() {
  settings.mode = $('selMode').value;
  settings.room = $('inpRoom').value || 'demo';
  settings.token = $('inpToken').value;
  settings.wtUrl = $('inpWtUrl').value;
  settings.wtHash = $('inpWtHash').value;
  settings.mirror = $('chkMirror').checked;
  settings.pose = $('chkPose').checked;
  settings.hands = $('chkHands').checked;
  settings.faceLock = $('chkFaceLock').checked;
  settings.privacyLocalOnly = $('chkPrivacy').checked;
  settings.cameraId = $('selCamera').value;
  settings.resolution = $('selResolution').value;
  settings.fps = $('selFps').value;
  settings.headLeanRangeCm = normalizeHeadLeanRangeCm($('rngHeadLean').value);
  $('outHeadLean').textContent = `${settings.headLeanRangeCm} cm`;
  readSmoothingFromUi();
  return settings;
}

function persistSettings() {
  readSettingsFromUi();
  saveJson(localStorage, TRACKER_STORAGE_KEY, settings);
  updateViewerLink();
}

function updateModeFields() {
  const wt = $('selMode').value === 'wt';
  $('fieldWtUrl').hidden = !wt;
  $('fieldWtHash').hidden = !wt;
}

function updateViewerLink() {
  const params = new URLSearchParams({ room: $('inpRoom').value || 'demo' });
  if ($('inpToken').value) params.set('token', $('inpToken').value);
  $('lnkViewer').href = `../viewer/?${params.toString()}`;
}

function updateChannelControls() {
  const i = state.selectedChannel;
  $('outChannel').textContent = `${i + 1}. ${ARKIT_52[i]}${profile.muted[i] ? ' (muted)' : ''}`;
  $('rngGain').value = profile.gains[i];
  $('rngDeadzone').value = profile.deadzones[i];
  $('btnMuteChannel').textContent = profile.muted[i] ? 'Unmute channel' : 'Mute channel';
  drawMeters();
}

function currentSmoothingGroup() {
  const group = $('selSmoothingGroup').value;
  return SMOOTHING_GROUPS[group] ? group : 'face';
}

function updateSmoothingControls() {
  const group = currentSmoothingGroup();
  settings.smoothingGroup = group;
  const groupSettings = settings.smoothing[group] || DEFAULT_SMOOTHING_SETTINGS[group];
  $('selFilterPreset').value = groupSettings.filterPreset || 'custom';
  $('rngMinCutoff').value = groupSettings.minCutoff;
  $('rngBeta').value = groupSettings.beta;
  $('outSmoothingEffective').textContent = `${SMOOTHING_GROUPS[group]} ${Number(groupSettings.minCutoff).toFixed(2)} / ${Number(groupSettings.beta).toFixed(2)}`;
}

function readSmoothingFromUi() {
  const group = currentSmoothingGroup();
  const next = {
    filterPreset: $('selFilterPreset').value,
    minCutoff: Number($('rngMinCutoff').value),
    beta: Number($('rngBeta').value),
  };
  settings.smoothingGroup = group;
  settings.smoothing[group] = next;
  if (group === 'face') {
    settings.filterPreset = next.filterPreset;
    settings.minCutoff = next.minCutoff;
    settings.beta = next.beta;
  }
  $('outSmoothingEffective').textContent = `${SMOOTHING_GROUPS[group]} ${next.minCutoff.toFixed(2)} / ${next.beta.toFixed(2)}`;
}

function saveProfile() {
  profile = normalizeProfile(profile);
  saveJson(localStorage, PROFILE_STORAGE_KEY, profile);
  updateChannelControls();
}

function startGuidedCalibration() {
  if (!state.running) {
    chip.textContent = 'start tracking before calibration';
    chip.dataset.state = 'error';
    return;
  }
  state.calibrationSession = createGuidedCalibrationSession(`guided-${new Date().toISOString()}`, performance.now());
  $('btnStartCalibration').disabled = true;
  $('calibrationGuide').hidden = false;
  $('calibrationResult').textContent = 'collecting samples';
  updateGuidedCalibrationUi({
    done: false,
    elapsedMs: 0,
    totalMs: CALIBRATION_GUIDE_TOTAL_MS,
    step: { label: 'Neutral hold' },
    stepIndex: 0,
    stepElapsedMs: 0,
    stepRemainingMs: 3000,
    progress: 0,
  });
  chip.textContent = 'guided calibration';
  chip.dataset.state = 'idle';
}

function sampleGuidedCalibration(weights) {
  if (!state.calibrationSession) return;
  const progress = collectGuidedCalibrationSample(state.calibrationSession, weights, performance.now());
  updateGuidedCalibrationUi(progress);
  if (progress.done) finishGuidedCalibration();
}

function tickGuidedCalibration() {
  if (!state.calibrationSession) return;
  const progress = calibrationGuideProgress(state.calibrationSession.startedAtMs, performance.now());
  updateGuidedCalibrationUi(progress);
  if (progress.done) finishGuidedCalibration();
}

function updateGuidedCalibrationUi(progress) {
  $('calibrationStep').textContent = progress.step?.label || 'Calibration';
  $('calibrationTime').textContent = `${Math.max(0, (progress.totalMs - progress.elapsedMs) / 1000).toFixed(1)}s`;
  $('calibrationProgress').value = String(progress.progress || 0);
}

function finishGuidedCalibration() {
  const session = state.calibrationSession;
  if (!session) return;
  state.calibrationSession = null;
  $('btnStartCalibration').disabled = false;

  if (session.neutralSamples.length === 0 || session.rangeSamples.length === 0) {
    $('calibrationResult').textContent = 'calibration failed: no face samples';
    chip.textContent = 'calibration failed';
    chip.dataset.state = 'error';
    return;
  }

  profile = buildCalibrationProfileFromSamples({
    neutralSamples: session.neutralSamples,
    rangeSamples: session.rangeSamples,
    name: session.name,
    baseProfile: profile,
  });
  saveProfile();
  resetFilters();
  $('calibrationResult').textContent = `saved ${session.neutralSamples.length} neutral / ${session.rangeSamples.length} range samples`;
  chip.textContent = 'calibration saved';
  chip.dataset.state = 'open';
}

function cancelGuidedCalibration(message = 'calibration cancelled') {
  if (!state.calibrationSession) return;
  state.calibrationSession = null;
  $('btnStartCalibration').disabled = false;
  $('calibrationResult').textContent = message;
  $('calibrationTime').textContent = `${(CALIBRATION_GUIDE_TOTAL_MS / 1000).toFixed(1)}s`;
  $('calibrationProgress').value = '0';
}

function startGazeCalibration() {
  if (!state.running) {
    chip.textContent = 'start tracking before gaze calibration';
    chip.dataset.state = 'error';
    return;
  }
  state.gazeCalibrationSession = createGazeCalibrationSession(`gaze-${new Date().toISOString()}`, performance.now());
  $('btnStartGazeCalibration').disabled = true;
  $('gazeCalibrationGuide').hidden = false;
  $('gazeCalibrationResult').textContent = 'collecting iris samples';
  updateGazeCalibrationUi({
    elapsedMs: 0,
    totalMs: GAZE_CALIBRATION_TOTAL_MS,
    step: { label: 'Look center' },
    progress: 0,
  });
  chip.textContent = 'gaze calibration';
  chip.dataset.state = 'idle';
}

function sampleGazeCalibration(landmarks) {
  if (!state.gazeCalibrationSession) return;
  const progress = collectGazeCalibrationSample(state.gazeCalibrationSession, landmarks, performance.now(), { mirror: state.mirror });
  updateGazeCalibrationUi(progress);
  if (progress.done) finishGazeCalibration();
}

function tickGazeCalibration() {
  if (!state.gazeCalibrationSession) return;
  const progress = calibrationGuideProgress(state.gazeCalibrationSession.startedAtMs, performance.now(), GAZE_CALIBRATION_STEPS);
  updateGazeCalibrationUi(progress);
  if (progress.done) finishGazeCalibration();
}

function updateGazeCalibrationUi(progress) {
  $('gazeCalibrationStep').textContent = progress.step?.label || 'Look center';
  $('gazeCalibrationTime').textContent = `${Math.max(0, (progress.totalMs - progress.elapsedMs) / 1000).toFixed(1)}s`;
  $('gazeCalibrationProgress').value = String(progress.progress || 0);
}

function finishGazeCalibration() {
  const session = state.gazeCalibrationSession;
  if (!session) return;
  state.gazeCalibrationSession = null;
  $('btnStartGazeCalibration').disabled = false;

  const coveredSteps = new Set(session.samples.map((sample) => sample.stepId));
  if (coveredSteps.size < GAZE_CALIBRATION_STEPS.length) {
    $('gazeCalibrationResult').textContent = `gaze calibration failed: ${coveredSteps.size}/${GAZE_CALIBRATION_STEPS.length} targets`;
    chip.textContent = 'gaze calibration failed';
    chip.dataset.state = 'error';
    return;
  }

  profile.gaze = buildGazeCalibrationProfile(session.samples);
  saveProfile();
  $('gazeCalibrationResult').textContent = `saved ${session.samples.length} iris samples`;
  chip.textContent = 'gaze calibration saved';
  chip.dataset.state = 'open';
}

function cancelGazeCalibration(message = 'gaze calibration cancelled') {
  if (!state.gazeCalibrationSession) return;
  state.gazeCalibrationSession = null;
  $('btnStartGazeCalibration').disabled = false;
  $('gazeCalibrationResult').textContent = message;
  $('gazeCalibrationTime').textContent = `${(GAZE_CALIBRATION_TOTAL_MS / 1000).toFixed(1)}s`;
  $('gazeCalibrationProgress').value = '0';
}

async function restartCameraIfRunning() {
  persistSettings();
  if (state.running) {
    await startCamera();
  }
}

function applyFilterControls() {
  persistSettings();
  resetFilters();
  updateSmoothingControls();
}

function meterPointFromEvent(ev) {
  const rect = meters.getBoundingClientRect();
  const x = clamp(ev.clientX - rect.left, 0, rect.width);
  const y = clamp(ev.clientY - rect.top, 0, rect.height);
  const channel = Math.max(0, Math.min(NUM_CHANNELS - 1, Math.floor((y / rect.height) * NUM_CHANNELS)));
  return { x, y, channel, width: rect.width };
}

function selectMeterChannel(ev) {
  const point = meterPointFromEvent(ev);
  state.selectedChannel = point.channel;
  updateChannelControls();
  return point;
}

function gainFromMeterX(x, width) {
  const labelW = 118;
  const barW = Math.max(1, width - labelW - 42);
  return clamp(((x - labelW) / barW) * 2, 0, 2);
}

function applyMeterGain(point) {
  if (point.x < 118) return;
  state.selectedChannel = point.channel;
  profile.gains[state.selectedChannel] = Number(gainFromMeterX(point.x, point.width).toFixed(2));
  saveProfile();
}

function clearMeterLongPress() {
  if (!state.meterPointer.longPressTimer) return;
  clearTimeout(state.meterPointer.longPressTimer);
  state.meterPointer.longPressTimer = null;
}

function toggleSelectedChannelMute() {
  profile.muted[state.selectedChannel] = !profile.muted[state.selectedChannel];
  saveProfile();
  chip.textContent = profile.muted[state.selectedChannel] ? 'channel muted' : 'channel unmuted';
  chip.dataset.state = 'idle';
}

function startMeterInteraction(ev) {
  if (ev.button !== undefined && ev.button !== 0) return;
  ev.preventDefault();
  const point = selectMeterChannel(ev);
  state.meterPointer.dragging = true;
  state.meterPointer.pointerId = ev.pointerId;
  state.meterPointer.startX = point.x;
  state.meterPointer.startY = point.y;
  state.meterPointer.longPressFired = false;
  meters.setPointerCapture?.(ev.pointerId);
  applyMeterGain(point);

  if (ev.pointerType === 'touch' || ev.pointerType === 'pen') {
    clearMeterLongPress();
    state.meterPointer.longPressTimer = setTimeout(() => {
      state.meterPointer.longPressFired = true;
      state.meterPointer.dragging = false;
      toggleSelectedChannelMute();
    }, 550);
  }
}

function moveMeterInteraction(ev) {
  if (!state.meterPointer.dragging || state.meterPointer.pointerId !== ev.pointerId) return;
  const point = meterPointFromEvent(ev);
  const moved = Math.hypot(point.x - state.meterPointer.startX, point.y - state.meterPointer.startY);
  if (moved > 8) clearMeterLongPress();
  if (!state.meterPointer.longPressFired) applyMeterGain(point);
}

function endMeterInteraction(ev) {
  if (state.meterPointer.pointerId !== null && state.meterPointer.pointerId !== ev.pointerId) return;
  clearMeterLongPress();
  state.meterPointer.dragging = false;
  state.meterPointer.pointerId = null;
  if (meters.hasPointerCapture?.(ev.pointerId)) meters.releasePointerCapture(ev.pointerId);
}

function downloadText(filename, content, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function cameraErrorMessage(e) {
  if (e?.name === 'NotAllowedError') return 'Camera permission was denied. Allow camera access in the browser settings and try again.';
  if (e?.name === 'NotFoundError') return 'No camera device was found. Connect a camera and press refresh/start again.';
  if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    return 'Camera requires HTTPS or localhost. See docs/DEV_HTTPS.md for local HTTPS setup.';
  }
  return e?.message || 'Camera startup failed.';
}

$('btnStart').addEventListener('click', async () => {
  $('btnStart').disabled = true;
  try {
    const capabilityWarnings = checkCapabilities();
    const blocked = blockingCapabilityMessage(capabilityWarnings);
    if (blocked) throw new Error(blocked);
    if (!state.faceLandmarker) await loadModels();
    await startCamera();
    $('stageHint').hidden = true;
    state.running = true;
    chip.textContent = 'tracking';
    chip.dataset.state = 'open';
    $('btnStop').disabled = false;
    requestAnimationFrame(loop);
  } catch (e) {
    const message = cameraErrorMessage(e);
    chip.textContent = `error: ${message}`;
    chip.dataset.state = 'error';
    $('stageHint').textContent = message;
    $('stageHint').hidden = false;
    $('btnStart').disabled = false;
  }
});

$('btnStop').addEventListener('click', () => {
  state.running = false;
  cancelGuidedCalibration('calibration stopped');
  cancelGazeCalibration('gaze calibration stopped');
  if (video.srcObject) {
    for (const t of video.srcObject.getTracks()) t.stop();
    video.srcObject = null;
  }
  chip.textContent = 'stopped';
  chip.dataset.state = 'closed';
  $('btnStart').disabled = false;
  $('btnStop').disabled = true;
  $('stageHint').hidden = false;
});

$('chkMirror').addEventListener('change', (e) => {
  state.mirror = e.target.checked;
  setMirrorPreviewClass(video, state.mirror);
  persistSettings();
});

$('chkPose').addEventListener('change', async (e) => {
  state.poseEnabled = e.target.checked;
  persistSettings();
  if (state.poseEnabled && state.running && !state.poseLandmarker && state._fileset) {
    const assets = await resolveModelAssets();
    state.poseLandmarker = await PoseLandmarker.createFromOptions(state._fileset, {
      baseOptions: { modelAssetPath: assets.poseModel, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
    });
  }
});

$('chkHands').addEventListener('change', async (e) => {
  state.handsEnabled = e.target.checked;
  persistSettings();
  if (state.handsEnabled && state.running && !state.handLandmarker && state._fileset) {
    const assets = await resolveModelAssets();
    state.handLandmarker = await HandLandmarker.createFromOptions(state._fileset, {
      baseOptions: { modelAssetPath: assets.handModel, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: 2,
    });
  }
});

$('chkPrivacy').addEventListener('change', persistSettings);
$('chkFaceLock').addEventListener('change', () => {
  state.trackedFaceBox = null;
  persistSettings();
});
$('selCamera').addEventListener('change', restartCameraIfRunning);
$('selResolution').addEventListener('change', restartCameraIfRunning);
$('selFps').addEventListener('change', restartCameraIfRunning);
$('rngHeadLean').addEventListener('input', persistSettings);

$('selMode').addEventListener('change', () => {
  updateModeFields();
  persistSettings();
});

$('inpRoom').addEventListener('input', persistSettings);
$('inpToken').addEventListener('input', persistSettings);
$('inpWtUrl').addEventListener('input', persistSettings);
$('inpWtHash').addEventListener('input', persistSettings);

$('selSmoothingGroup').addEventListener('change', () => {
  settings.smoothingGroup = currentSmoothingGroup();
  updateSmoothingControls();
  persistSettings();
});

$('selFilterPreset').addEventListener('change', () => {
  const preset = FILTER_PRESETS[$('selFilterPreset').value];
  if (preset) {
    $('rngMinCutoff').value = preset.minCutoff;
    $('rngBeta').value = preset.beta;
  }
  applyFilterControls();
});
$('rngMinCutoff').addEventListener('input', () => {
  $('selFilterPreset').value = 'custom';
  applyFilterControls();
});
$('rngBeta').addEventListener('input', () => {
  $('selFilterPreset').value = 'custom';
  applyFilterControls();
});

meters.addEventListener('pointerdown', startMeterInteraction);
meters.addEventListener('pointermove', moveMeterInteraction);
meters.addEventListener('pointerup', endMeterInteraction);
meters.addEventListener('pointercancel', endMeterInteraction);
meters.addEventListener('lostpointercapture', endMeterInteraction);
meters.addEventListener('contextmenu', (ev) => {
  ev.preventDefault();
  selectMeterChannel(ev);
  toggleSelectedChannelMute();
});
$('rngGain').addEventListener('input', (e) => {
  profile.gains[state.selectedChannel] = Number(e.target.value);
  saveProfile();
});
$('rngDeadzone').addEventListener('input', (e) => {
  profile.deadzones[state.selectedChannel] = Number(e.target.value);
  saveProfile();
});
$('btnMuteChannel').addEventListener('click', () => {
  toggleSelectedChannelMute();
});
$('btnStartCalibration').addEventListener('click', startGuidedCalibration);
$('btnStartGazeCalibration').addEventListener('click', startGazeCalibration);
$('btnCalibrateNeutral').addEventListener('click', () => {
  profile.offsets = Array.from(state.raw);
  profile.createdAt = new Date().toISOString();
  saveProfile();
  chip.textContent = 'neutral captured';
  chip.dataset.state = 'open';
});
$('btnExportProfile').addEventListener('click', () => {
  downloadText('minamo-calibration-profile.json', `${JSON.stringify(profile, null, 2)}\n`);
});
$('btnImportProfile').addEventListener('click', () => $('fileProfile').click());
$('fileProfile').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const result = validateCalibrationProfile(parsed);
    if (!result.ok) throw new Error(result.errors.join('; '));
    profile = result.profile;
    saveProfile();
    chip.textContent = result.warnings.length ? `profile imported: ${result.warnings.length} adjustment(s)` : 'profile imported';
    chip.dataset.state = result.warnings.length ? 'idle' : 'open';
  } catch (error) {
    chip.textContent = `profile import error: ${error.message}`;
    chip.dataset.state = 'error';
  } finally {
    e.target.value = '';
  }
});
$('btnResetSettings').addEventListener('click', () => {
  cancelGuidedCalibration('calibration reset');
  cancelGazeCalibration('gaze calibration reset');
  Object.assign(settings, normalizeTrackerSettings(DEFAULT_TRACKER_SETTINGS));
  profile = createCalibrationProfile('default');
  saveJson(localStorage, TRACKER_STORAGE_KEY, settings);
  saveProfile();
  applySettingsToUi();
  resetFilters();
  chip.textContent = 'settings reset';
  chip.dataset.state = 'idle';
});

$('btnResetTracking').addEventListener('click', resetTrackingRuntime);

$('btnConnect').addEventListener('click', async () => {
  try {
    persistSettings();
    await state.transport.connect({
      mode: $('selMode').value,
      room: $('inpRoom').value || 'demo',
      role: 'pub',
      wtUrl: $('inpWtUrl').value,
      certHashHex: $('inpWtHash').value,
      token: $('inpToken').value,
    });
    chip.textContent = `tracking + ${$('selMode').value}:${$('inpRoom').value}`;
    chip.dataset.state = 'open';
    $('btnConnect').disabled = true;
    $('btnDisconnect').disabled = false;
  } catch (e) {
    chip.textContent = `connect error: ${e.message}`;
    chip.dataset.state = 'error';
  }
});

$('btnDisconnect').addEventListener('click', async () => {
  await state.transport.close();
  $('btnConnect').disabled = false;
  $('btnDisconnect').disabled = true;
});

$('chkRecord').addEventListener('change', (e) => {
  state.recording.enabled = e.target.checked;
  if (state.recording.enabled) {
    state.recording.lines = [JSON.stringify(createRecordingMetadata({
      version: '0.1.0',
      modelSource: resolvedAssets?.source || 'not loaded',
      settings,
      calibration: profile,
    }))];
  }
  $('btnDownloadRecording').disabled = state.recording.lines.length === 0;
});

$('btnDownloadRecording').addEventListener('click', () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadText(`minamo-motion-${stamp}.jsonl`, `${state.recording.lines.join('\n')}\n`, 'application/x-ndjson');
});

window.addEventListener('keydown', (ev) => {
  if (ev.key.toLowerCase() !== 'r' || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (isEditableTarget(ev.target)) return;
  ev.preventDefault();
  resetTrackingRuntime();
});

function resetTrackingRuntime() {
  resetFilters();
  state.nameToIndex = null;
  chip.textContent = 'tracking reset';
  chip.dataset.state = state.running ? 'open' : 'idle';
}

applySettingsToUi();
checkCapabilities();
refreshCameras().catch(() => {});
navigator.mediaDevices?.addEventListener?.('devicechange', refreshCameras);
