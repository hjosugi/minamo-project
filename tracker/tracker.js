// Minamo tracker.
// Pipeline: webcam -> MediaPipe Face Landmarker (GPU, in-browser)
//        -> head pose + 52 blendshapes -> One Euro filtering
//        -> KGM1 binary encode -> transport (local / ws / wt).
// The camera image never leaves this page. Only ~76 bytes/frame go out.

import { ARKIT_52, CHANNEL_INDEX, NUM_CHANNELS, POSE_POINTS, NUM_POSE_POINTS } from '../shared/blendshapes.js';
import { OneEuroArray, OneEuroQuat } from '../shared/filters.js';
import { encodeFrame } from '../shared/codec.js';
import { MinamoTransport } from '../shared/transport.js';
import { createParticipantId, normalizeParticipantId } from '../shared/room-envelope.js';
import {
  buildViewerPairingUrl,
  parsePhoneTrackerUrl,
  parsePairingRoom,
} from '../shared/pairing.js';
import {
  CALIBRATION_GUIDE_TOTAL_MS,
  DEFAULT_SMOOTHING_SETTINGS,
  DEFAULT_TRACKER_SETTINGS,
  DRUM_KIT_STORAGE_KEY,
  FILTER_PRESETS,
  GAZE_CALIBRATION_STEPS,
  GAZE_CALIBRATION_TOTAL_MS,
  HAND_CALIBRATION_TOTAL_MS,
  HAND_INFERENCE_INTERVAL_MS,
  HAND_PROFILE_STORAGE_KEY,
  PROFILE_STORAGE_KEY,
  RESOLUTION_CONSTRAINTS,
  SMOOTHING_GROUPS,
  TRACKER_STORAGE_KEY,
  WARNING_TAXONOMY,
  BlinkWinkStabilizer,
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
  classifyHandGesture,
  clamp,
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
  defaultFaceLockRegion,
  deriveDrumOverlayState,
  drumKitCalibrationSummary,
  estimateLandmarkConfidence,
  estimateOneEuroLagMs,
  handCalibrationProgress,
  handTargetDebugRows,
  isEditableTarget,
  loadJson,
  mirrorFacePayloadInPlace,
  mergeWarningsInto,
  normalizeDrumKitConfig,
  normalizeHandCalibrationProfile,
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
import { createDatasetRecord, serializeDatasetRecords } from '../shared/dataset.js';
import { KGM_RECORDING_MIME, encodeKgmRecording, tenMinuteKgmEstimateBytes } from '../shared/kgm-recording.js';
import { percentileSample } from '../shared/hud-metrics.js';
import { applyVoiceActivityAccents } from '../shared/voice-activity.js';
import { responseLooksLikeAsset } from '../shared/asset-probe.js';
import { waitForVideoMetadata, startVideoPlayback } from '../shared/camera-startup.js';
import { setupPageI18n } from '../shared/i18n.js';
import {
  DEFAULT_SITUATION_ID,
  applySituationToTrackerSettings,
  getSituationPreset,
  isSituationId,
  situationObsPlan,
  situationViewerUrl,
} from '../shared/situation-presets.js';
import { createObsBridge } from '../shared/obs-bridge.js';
import { PERCUSSION_KITS, getPercussionKit } from '../shared/percussion.js';
import { mat4ToQuatInto, applyPitchOffset } from '../shared/pose-math.js';
import { fingerCurl, fingerSpread, fingerVector } from '../shared/hand-math.js';
import {
  AUDIO_LIPSYNC_TARGET_LATENCY_MS,
  audioLipsyncWithinLatency,
  createSilentAudioLipsyncFrame,
  fuseAudioLipsyncWeights,
} from '../shared/audio-lipsync.js';

// Runtime EN/JA localization (#267): static markup carries data-i18n keys, and
// `t` localizes everything this module renders imperatively. Those imperative
// renders run after applyTranslations and would otherwise pin the first
// language, so a toggle replays them all.
// `bootDone` must be declared above setupPageI18n, which renders synchronously:
// reading it from the temporal dead zone would abort the module.
let bootDone = false;
const { t } = setupPageI18n({
  onRender: () => {
    if (!bootDone) return;
    if (lastStatus) setStatus(lastStatus.key, lastStatus.params);
    refreshCameras().catch(() => {});
    updateChannelControls();
    updateDrumKitUi();
    updateSituationUi();
    updateDatasetCaptureUi();
    updateSmoothingControls();
    renderLightingChecklist();
  },
});

// The status chip is rendered from a key so a language toggle can replay the
// message currently on screen instead of resetting it to "idle".
let lastStatus = { key: 'tracker.status.idle', params: undefined };
function setStatus(key, params = undefined, chipState = undefined) {
  lastStatus = { key, params };
  chip.textContent = t(key, params);
  if (chipState !== undefined) chip.dataset.state = chipState;
}

// Already-composed text (URLs, upstream error details) has no key to replay, so
// a language toggle leaves whatever is on screen alone.
function setStatusText(text, chipState = undefined) {
  lastStatus = null;
  chip.textContent = text;
  if (chipState !== undefined) chip.dataset.state = chipState;
}

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
const faceDebug = $('faceDebug');
const faceDebugCtx = faceDebug.getContext('2d');
const handDebug = $('handDebug');
const handDebugCtx = handDebug.getContext('2d');
const chip = $('statusChip');
const qualityChip = $('qualityChip');
const warningList = $('warningList');

const css = getComputedStyle(document.documentElement);
const COLOR_FACE = css.getPropertyValue('--face').trim();
const COLOR_POSE = css.getPropertyValue('--pose').trim();
const COLOR_DIM = css.getPropertyValue('--ink-dim').trim();
const COLOR_INK = css.getPropertyValue('--ink').trim();

const phonePairingQuery = parsePhoneTrackerUrl(location.href);
let transientPairingToken = phonePairingQuery.token || '';
const settings = normalizeTrackerSettings({
  ...loadJson(localStorage, TRACKER_STORAGE_KEY, DEFAULT_TRACKER_SETTINGS),
  ...trackerSettingsFromPairingQuery(phonePairingQuery),
});
redactPairingTokenFromAddress(phonePairingQuery);
let profile = normalizeProfile(loadJson(localStorage, PROFILE_STORAGE_KEY, createCalibrationProfile('default')));
let handProfile = normalizeHandCalibrationProfile(loadJson(localStorage, HAND_PROFILE_STORAGE_KEY, createHandCalibrationProfile('default')));
let drumKit = normalizeDrumKitConfig(loadJson(localStorage, DRUM_KIT_STORAGE_KEY, createDefaultDrumKitConfig('default')));
let resolvedAssets = null;

// Stands in for "no hands this frame" so the loop stops allocating a throwaway
// array 60 times a second (#259). Frozen because it is shared across every frame:
// a stray push would otherwise leave a phantom hand behind for the rest of the
// session, which is far harder to notice than the TypeError.
const EMPTY_HANDS = Object.freeze([]);

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
  // Buffers and objects the 60 fps loop refills instead of reallocating (#259).
  // Everything here is either consumed synchronously (encode, overlay drawing) or
  // snapshotted by its consumer — see the comment on state._frame.
  _posScratch: new Float32Array(3), // head-position filter
  _quatIn: [0, 0, 0, 1], // this frame's head rotation, before filtering
  _posIn: [0, 0, 0.4], // this frame's head position, before stabilizing
  _frameWarnings: [], // warnings raised while building this frame
  _warningSet: new Set(), // membership test for the state.warnings dedupe
  posePoints: new Float32Array(NUM_POSE_POINTS * 3),
  hasPose: false,
  hasHands: false,
  hands: EMPTY_HANDS,
  handTargets: null,
  lastHandResult: null,
  lastHandInferenceMs: -Infinity,
  handDebugRows: [],
  faceDebugHistory: [],
  drumPlacementArmed: false,
  drumOverlayState: deriveDrumOverlayState([], drumKit),
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
  handTargetStabilizer: new HandTargetStabilizer(),
  blinkWinkStabilizer: new BlinkWinkStabilizer(),
  trackingLossSmoother: new TrackingLossSmoother(),
  dropDetector: new DroppedFrameDetector(Number(settings.fps) || 60),
  confidenceTracker: new LandmarkConfidenceTracker(),
  cameraControls: { supported: [], attempted: [], unavailable: true, lowLightNudged: false },
  selectedChannel: ARKIT_52.indexOf('jawOpen'),
  warnings: [], // refilled in place each frame; never replaced
  // The outgoing frame, refilled per frame rather than rebuilt. Safe to reuse
  // because both consumers that outlive the frame snapshot it: createMotionRecord
  // is JSON.stringify-ed on the spot, and createDatasetRecord copies every array
  // out via roundNumberArray. tests/run-tests.mjs pins that, since reuse here is
  // only correct for as long as it holds.
  // Fields are pointed at the live state buffers each frame, exactly as the
  // per-frame literal used to be; only the wrappers are reused.
  _frame: { t: 0, seq: 0, face: { quat: null, pos: null, weights: null }, pose: null, hands: null },
  _framePose: { points: null },
  quality: { state: 'idle', score: 0, reasons: [], warnings: [] },
  lastFps: 0,
  qualityCanvas: document.createElement('canvas'),
  voice: {
    stream: null,
    context: null,
    source: null,
    analyser: null,
    buffer: null,
    worklet: null,
    rms: 0,
    level: 0,
    lipsync: createSilentAudioLipsyncFrame(),
    lipsyncLatencyMs: null,
    lipsyncReceivedAtMs: 0,
  },
  recording: { enabled: false, lines: [], frames: [], metadata: null },
  datasetCapture: { enabled: false, records: [], seq: 0, lastAutoCaptureMs: -Infinity },
  calibrationSession: null,
  gazeCalibrationSession: null,
  handCalibrationSession: null,
  meterPointer: { dragging: false, pointerId: null, startX: 0, startY: 0, longPressTimer: null, longPressFired: false },
  // stats
  frames: 0,
  lastStats: performance.now(),
  inferMs: 0,
  inferSamples: [],
  lastBytesOut: 0,
  lastPacketBytes: 0,
};

state.transport.addEventListener('status', (/** @type {any} */ ev) => {
  if (ev.detail.state === 'fallback') {
    setStatusText(ev.detail.detail, 'idle');
  }
});

// ---------------------------------------------------------------- math

// Column-major 4x4 -> unit quaternion [x, y, z, w].
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
  if (!isSituationId(base.situation)) base.situation = DEFAULT_SITUATION_ID;
  if (!/^wss?:\/\//i.test(String(base.obsUrl || ''))) base.obsUrl = DEFAULT_TRACKER_SETTINGS.obsUrl;
  base.obsAutoScene = Boolean(base.obsAutoScene);
  if (!['seated', 'standing'].includes(base.bodyMode)) base.bodyMode = 'seated';
  base.faceLock = Boolean(base.faceLock);
  base.drummerMode = Boolean(base.drummerMode);
  base.voiceAccents = Boolean(base.voiceAccents);
  base.audioLipsync = Boolean(base.audioLipsync);
  base.cameraFacing = base.cameraFacing === 'environment' ? 'environment' : 'user';
  if (!['480p', '720p', '1080p'].includes(base.resolution)) base.resolution = '720p';
  base.fps = ['30', '60'].includes(String(base.fps)) ? String(base.fps) : '60';
  base.participantId = normalizeParticipantId(base.participantId, createParticipantId());
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

function trackerSettingsFromPairingQuery(query) {
  const paired = {};
  if (['local', 'ws', 'wt'].includes(query.mode)) paired.mode = query.mode;
  if (query.room) {
    try {
      paired.room = parsePairingRoom(query.room);
    } catch {}
  }
  if (query.token) paired.token = query.token;
  if (query.wsUrl) paired.wsUrl = query.wsUrl;
  if (query.wtUrl) paired.wtUrl = query.wtUrl;
  if (query.wtHash) paired.wtHash = query.wtHash;
  if (['480p', '720p', '1080p'].includes(query.resolution)) paired.resolution = query.resolution;
  if ([30, 60].includes(Number(query.fps))) paired.fps = String(query.fps);
  if (typeof query.mirror === 'boolean') paired.mirror = query.mirror;
  if (query.camera === 'user' || query.camera === 'environment') {
    paired.cameraFacing = query.camera;
    paired.cameraId = '';
  }
  return paired;
}

function redactPairingTokenFromAddress(query) {
  if (!query.token || !globalThis.history?.replaceState) return;
  try {
    const safe = new URL(location.href);
    safe.searchParams.delete('token');
    history.replaceState(history.state, '', safe);
  } catch {}
}

async function loadModels() {
  setStatus('tracker.status.loadingModels');
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
    ? await import(/* @vite-ignore */ LOCAL_TASKS_VISION_BUNDLE)
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
    return await import(/* @vite-ignore */ blobUrl);
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
  else videoConstraints.facingMode = { ideal: settings.cameraFacing };
  const stream = await navigator.mediaDevices.getUserMedia({
    video: videoConstraints,
    audio: false,
  });
  video.srcObject = stream;
  try {
    // Bounded metadata wait + actionable play() handling so a stalled camera
    // cannot hang startup forever (#253).
    await waitForVideoMetadata(video);
    await startVideoPlayback(video);
  } catch (error) {
    for (const t of stream.getTracks()) t.stop();
    if (video.srcObject === stream) video.srcObject = null;
    throw error;
  }
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
  const track = stream.getVideoTracks()[0];
  if (track) await configureCameraQualityControls(track);
  const trackSettings = track?.getSettings?.() || {};
  $('statCamera').textContent = `${trackSettings.width || video.videoWidth}x${trackSettings.height || video.videoHeight}@${Math.round(trackSettings.frameRate || fps)}`;
  await refreshCameras();
  if (settings.voiceAccents) await startVoiceAccents();
  if (settings.audioLipsync) await startAudioLipsync();
}

async function startVoiceAccents() {
  if (!settings.voiceAccents) return;
  await ensureAudioInput();
}

async function startAudioLipsync() {
  if (!settings.audioLipsync) return;
  await ensureAudioInput();
}

async function ensureAudioInput() {
  if (!settings.voiceAccents && !settings.audioLipsync) return;
  if (state.voice.stream && state.voice.context && state.voice.source && state.voice.analyser) {
    try {
      if (settings.audioLipsync && !state.voice.worklet) await attachAudioLipsyncWorklet();
    } catch (error) {
      handleAudioInputError(error);
    }
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone API is unavailable.');
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    const AudioContextCtor = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!AudioContextCtor) throw new Error('Web Audio API is unavailable.');
    const context = new AudioContextCtor();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.35;
    source.connect(analyser);
    state.voice = {
      stream,
      context,
      source,
      analyser,
      buffer: new Float32Array(analyser.fftSize),
      worklet: null,
      rms: 0,
      level: 0,
      lipsync: createSilentAudioLipsyncFrame(),
      lipsyncLatencyMs: null,
      lipsyncReceivedAtMs: 0,
    };
    if (settings.audioLipsync) await attachAudioLipsyncWorklet();
  } catch (error) {
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    handleAudioInputError(error);
  }
}

function handleAudioInputError(error) {
  stopAudioInput();
  settings.voiceAccents = false;
  settings.audioLipsync = false;
  $('chkVoiceAccents').checked = false;
  $('chkAudioLipsync').checked = false;
  saveJson(localStorage, TRACKER_STORAGE_KEY, settings);
  setStatus('tracker.error.audioInput', { detail: error?.message || String(error) }, 'error');
}

function stopVoiceAccents() {
  state.voice.rms = 0;
  state.voice.level = 0;
  if (!settings.audioLipsync) stopAudioInput();
}

function stopAudioLipsync() {
  detachAudioLipsyncWorklet();
  state.voice.lipsync = createSilentAudioLipsyncFrame();
  state.voice.lipsyncLatencyMs = null;
  state.voice.lipsyncReceivedAtMs = 0;
  if (!settings.voiceAccents) stopAudioInput();
}

function stopAudioInput() {
  detachAudioLipsyncWorklet();
  state.voice.source?.disconnect?.();
  state.voice.analyser?.disconnect?.();
  if (state.voice.stream) {
    for (const track of state.voice.stream.getTracks()) track.stop();
  }
  if (state.voice.context?.state !== 'closed') state.voice.context?.close?.().catch(() => {});
  state.voice = {
    stream: null,
    context: null,
    source: null,
    analyser: null,
    buffer: null,
    worklet: null,
    rms: 0,
    level: 0,
    lipsync: createSilentAudioLipsyncFrame(),
    lipsyncLatencyMs: null,
    lipsyncReceivedAtMs: 0,
  };
}

async function attachAudioLipsyncWorklet() {
  if (!settings.audioLipsync || !state.voice.context || !state.voice.source || state.voice.worklet) return;
  if (!state.voice.context.audioWorklet || typeof AudioWorkletNode === 'undefined') {
    throw new Error('AudioWorklet is unavailable in this browser.');
  }
  await state.voice.context.audioWorklet.addModule(new URL('./audio-lipsync-worklet.js', import.meta.url));
  const worklet = new AudioWorkletNode(state.voice.context, 'minamo-audio-lipsync', {
    numberOfInputs: 1,
    numberOfOutputs: 0,
  });
  worklet.port.onmessage = (event) => {
    if (event.data?.type !== 'viseme') return;
    const context = state.voice.context;
    if (!context) return;
    state.voice.lipsync = event.data;
    state.voice.lipsyncReceivedAtMs = performance.now();
    state.voice.lipsyncLatencyMs = Math.max(0, context.currentTime * 1000 - Number(event.data.contextTimeMs || 0));
  };
  state.voice.source.connect(worklet);
  state.voice.worklet = worklet;
}

function detachAudioLipsyncWorklet() {
  if (!state.voice.worklet) return;
  state.voice.worklet.port.onmessage = null;
  state.voice.worklet.port.close?.();
  try {
    state.voice.worklet.disconnect?.();
  } catch {}
  state.voice.worklet = null;
}

function sampleVoiceRms() {
  if (!settings.voiceAccents || !state.voice.analyser || !state.voice.buffer) {
    state.voice.rms = 0;
    state.voice.level = 0;
    return 0;
  }
  state.voice.analyser.getFloatTimeDomainData(state.voice.buffer);
  let sum = 0;
  for (let i = 0; i < state.voice.buffer.length; i++) sum += state.voice.buffer[i] * state.voice.buffer[i];
  state.voice.rms = Math.sqrt(sum / state.voice.buffer.length);
  return state.voice.rms;
}

function currentAudioLipsyncLatencyMs(nowMs = performance.now()) {
  if (!settings.audioLipsync || !state.voice.lipsyncReceivedAtMs || state.voice.lipsyncLatencyMs === null) return Infinity;
  return state.voice.lipsyncLatencyMs + Math.max(0, nowMs - state.voice.lipsyncReceivedAtMs);
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
    return responseLooksLikeAsset(res);
  } catch {
    return false;
  }
}

async function refreshCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const selected = $('selCamera').value || settings.cameraId || '';
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  $('selCamera').replaceChildren(new Option(t('tracker.ui.option.defaultCamera'), ''));
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
  state.handTargetStabilizer.reset();
  state.lastHandResult = null;
  state.lastHandInferenceMs = -Infinity;
}

function checkCapabilities() {
  const warnings = [];
  if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    warnings.push({
      code: WARNING_TAXONOMY.insecureContext,
      text: t('tracker.capability.insecureContext'),
    });
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    warnings.push({ code: WARNING_TAXONOMY.noCameraApi, text: t('tracker.capability.noCameraApi') });
  }
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) warnings.push({ code: WARNING_TAXONOMY.noWebgl2, text: t('tracker.capability.noWebgl2') });
  const wtOption = [...$('selMode').options].find((opt) => opt.value === 'wt');
  if (typeof WebTransport === 'undefined') {
    warnings.push({ code: WARNING_TAXONOMY.noWebtransport, text: t('tracker.capability.noWebtransport') });
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

/**
 * `target.push(...source)` without the spread's per-call argument array — this
 * runs several times per frame at 60 fps (#259).
 * @template T
 * @param {T[]} target
 * @param {Iterable<T>} source
 */
function pushAll(target, source) {
  for (const item of source) target.push(item);
}

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
    if (state.handsEnabled && state.handLandmarker && nowMs - state.lastHandInferenceMs >= HAND_INFERENCE_INTERVAL_MS) {
      handRes = state.handLandmarker.detectForVideo(video, nowMs);
      state.lastHandResult = handRes;
      state.lastHandInferenceMs = nowMs;
    } else if (state.handsEnabled) {
      handRes = state.lastHandResult;
    }
    state.inferMs = performance.now() - t0;
    state.inferSamples.push(state.inferMs);
    if (state.inferSamples.length > 240) state.inferSamples.shift();

    const tSec = nowMs / 1000;
    const faceSelection = selectTrackedFace(faceRes.faceLandmarks || [], {
      previousBox: state.trackedFaceBox,
      lock: defaultFaceLockRegion(settings.faceLock),
    });
    const faceIndex = faceSelection.index;
    const selectedLandmarks = faceIndex >= 0 ? faceRes.faceLandmarks?.[faceIndex] : null;
    const hasFace = faceIndex >= 0 && faceRes.faceBlendshapes && faceRes.faceBlendshapes[faceIndex];
    let shouldSendFace = false;
    const frameWarnings = state._frameWarnings;
    frameWarnings.length = 0;

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
      const quat = state._quatIn;
      const pos = state._posIn;
      const mats = faceRes.facialTransformationMatrixes;
      if (mats && mats[faceIndex]) {
        const m = mats[faceIndex].data;
        mat4ToQuatInto(quat, m);
        pos[0] = m[12] / 100;
        pos[1] = m[13] / 100;
        pos[2] = m[14] / 100;
      } else {
        quat[0] = 0; quat[1] = 0; quat[2] = 0; quat[3] = 1;
        pos[0] = 0; pos[1] = 0; pos[2] = 0.4;
      }

      // --- mirror: reflect rotation across the YZ plane and swap L/R channels
      if (state.mirror) mirrorFacePayloadInPlace(quat, pos, state.raw);

      const gaze = resolveGaze(state.raw, selectedLandmarks, { mirror: state.mirror, calibration: profile.gaze });
      state.raw.set(applyGazeToWeights(state.raw, gaze));
      state.raw.set(state.blinkWinkStabilizer.filter(state.raw));
      sampleGazeCalibration(selectedLandmarks);

      // --- safety, calibration, and One Euro filtering
      const sanitized = sanitizeWeights(state.raw);
      pushAll(frameWarnings, sanitized.warnings);
      sampleGuidedCalibration(sanitized.weights);
      const calibratedWeights = applyCalibrationProfile(sanitized.weights, profile);
      const lossState = state.trackingLossSmoother.update(true, calibratedWeights, nowMs);
      if (lossState.reacquired) resetFilters({ resetTrackingLoss: false });
      state.weights.set(lossState.weights);
      state.weightFilter.filter(state.weights, tSec);
      state.quat = state.quatFilter.filter(quat, tSec);
      const stabilizedPos = state.headPositionStabilizer.stabilize(pos, nowMs, { leanRangeCm: settings.headLeanRangeCm });
      // Reuse a scratch buffer + mutate state.pos in place instead of allocating
      // a Float32Array and a new array every frame (#259). state.pos is consumed
      // synchronously (encode / dataset capture), like the reused state.weights.
      state._posScratch.set(stabilizedPos);
      state.posFilter.filter(state._posScratch, tSec);
      state.pos[0] = state._posScratch[0];
      state.pos[1] = state._posScratch[1];
      state.pos[2] = state._posScratch[2];
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
      if (settings.bodyMode === 'seated') {
        const shoulderX = (state.posePoints[1 * 3 + 0] + state.posePoints[2 * 3 + 0]) * 0.5;
        const shoulderY = (state.posePoints[1 * 3 + 1] + state.posePoints[2 * 3 + 1]) * 0.5;
        const shoulderZ = (state.posePoints[1 * 3 + 2] + state.posePoints[2 * 3 + 2]) * 0.5;
        for (let i = 0; i < NUM_POSE_POINTS; i++) {
          state.posePoints[i * 3 + 0] -= shoulderX;
          state.posePoints[i * 3 + 1] -= shoulderY;
          state.posePoints[i * 3 + 2] -= shoulderZ;
        }
      }
      state.poseFilter.filter(state.posePoints, tSec);
      state.hasPose = true;
    }

    state.hasHands = false;
    state.hands = EMPTY_HANDS;
    state.handTargets = null;
    // handTargets and handDebugRows are set by both branches below.
    if (handRes && handRes.landmarks && handRes.landmarks.length > 0) {
      state.hasHands = true;
      state.hands = handRes.landmarks;
      const rawHandTargets = filterHandTargets(deriveHandTargets(handRes, state.mirror), tSec);
      const calibratedHandTargets = applyHandCalibrationProfile(rawHandTargets, handProfile);
      sampleHandCalibration(rawHandTargets, nowMs);
      const stableHands = state.handTargetStabilizer.update(calibratedHandTargets, nowMs);
      state.handTargets = stableHands.targets.length ? stableHands.targets : null;
      state.handDebugRows = handTargetDebugRows(state.handTargets || calibratedHandTargets);
      pushAll(frameWarnings, stableHands.warnings);
      if (stableHands.warnings.some((warning) => warning.startsWith('HAND_CURL_CLAMPED') || warning.startsWith('HAND_SPREAD_CLAMPED'))) {
        frameWarnings.push('HAND_FAST_MOTION_BLUR');
      }
      for (const target of state.handTargets || []) {
        if ((target.confidence ?? 1) < 0.45) frameWarnings.push('HAND_LOW_CONFIDENCE');
        if (target.gesture?.drumGrip) frameWarnings.push('HAND_DRUM_GRIP');
      }
      if (handRes.landmarks.some((hand) => hand.some((lm) => lm.x < -0.05 || lm.x > 1.05 || lm.y < -0.05 || lm.y > 1.05))) {
        frameWarnings.push('HAND_OUTSIDE_FRAME');
      }
    } else {
      const stableHands = state.handTargetStabilizer.update([], nowMs);
      state.handTargets = stableHands.targets.length ? stableHands.targets : null;
      state.handDebugRows = handTargetDebugRows(state.handTargets || []);
      pushAll(frameWarnings, stableHands.warnings);
    }

    state.drumOverlayState = deriveDrumOverlayState(state.handTargets || [], drumKit);
    if (settings.drummerMode) {
      const summary = state.drumOverlayState.summary;
      if (!summary.ready) frameWarnings.push(`DRUM_KIT_INCOMPLETE:${summary.missing.join(',')}`);
      if (!state.handsEnabled) frameWarnings.push('DRUMMER_MODE_NEEDS_HANDS');
    }

    const landmarkConfidence = state.confidenceTracker.sample(estimateLandmarkConfidence(selectedLandmarks), nowMs);
    state.quality = computeQualityScore({
      meanLuma: sampleLuma(),
      confidence: landmarkConfidence,
      inferenceMs: state.inferMs,
      fps: state.lastFps || Number($('selFps').value) || 60,
      droppedFrames: state.dropDetector.rollingDropped(2500, nowMs),
    });
    if (state.handsEnabled && state.quality.warnings.includes(WARNING_TAXONOMY.lowLight)) frameWarnings.push('HAND_LOW_LIGHT');
    if (state.handsEnabled && state.quality.warnings.includes(WARNING_TAXONOMY.motionBlur)) frameWarnings.push('HAND_FAST_MOTION_BLUR');
    mergeWarningsInto(state.warnings, state._warningSet, frameWarnings, state.quality.warnings);

    // --- encode and send
    if (shouldSendFace) {
      const lipsyncLatencyMs = currentAudioLipsyncLatencyMs(nowMs);
      const lipsync = fuseAudioLipsyncWeights(state.weights, state.voice.lipsync, {
        enabled: settings.audioLipsync,
        visualConfidence: state.quality.score,
        latencyMs: lipsyncLatencyMs,
        maxLatencyMs: AUDIO_LIPSYNC_TARGET_LATENCY_MS,
      });
      const voiceAccent = applyVoiceActivityAccents(lipsync.weights, {
        enabled: settings.voiceAccents,
        rms: sampleVoiceRms(),
      });
      state.voice.level = voiceAccent.level;
      const voiceNod = voiceAccent.headNod > 0
        ? voiceAccent.headNod * Math.sin(nowMs * 0.018)
        : 0;
      const faceQuat = applyPitchOffset(state.quat, voiceNod);
      const frame = state._frame;
      frame.t = Math.round(nowMs);
      frame.seq = state.seq++;
      frame.face.quat = faceQuat;
      frame.face.pos = state.pos;
      frame.face.weights = voiceAccent.weights;
      if (state.hasPose) {
        state._framePose.points = state.posePoints;
        frame.pose = state._framePose;
      } else {
        frame.pose = null;
      }
      frame.hands = state.handTargets;
      const buf = encodeFrame(frame);
      state.lastPacketBytes = buf.byteLength;
      state.transport.send(buf);
      recordFrame(frame, buf);
      captureDatasetSample('auto', frame, nowMs);
    }

    drawOverlay(faceRes, poseRes, handRes, faceIndex);
    drawMeters();
    sampleFaceDebug(nowMs);
    drawFaceDebug();
    drawHandDebug();
    state.frames++;
  }

  tickGuidedCalibration();
  tickGazeCalibration();
  tickHandCalibration();
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
  if (settings.drummerMode) drawDrumZoneOverlay(w, h);
}

function drawDrumZoneOverlay(width, height) {
  const activeZones = new Set(state.drumOverlayState.activeZoneIds || []);
  const selectedId = $('selDrumZone').value;
  overlayCtx.save();
  overlayCtx.font = '12px "IBM Plex Mono", monospace';
  overlayCtx.textBaseline = 'middle';
  for (const zone of drumKit.zones) {
    const x = (state.mirror ? 1 - zone.x : zone.x) * width;
    const y = zone.y * height;
    const radius = zone.radius * Math.min(width, height);
    const active = activeZones.has(zone.id);
    overlayCtx.globalAlpha = zone.calibrated ? 0.92 : 0.38;
    overlayCtx.lineWidth = zone.id === selectedId ? 4 : 2;
    overlayCtx.strokeStyle = active ? COLOR_POSE : zone.calibrated ? COLOR_FACE : COLOR_DIM;
    overlayCtx.fillStyle = active ? 'rgba(111,227,255,0.16)' : 'rgba(255,122,162,0.10)';
    overlayCtx.beginPath();
    overlayCtx.arc(x, y, radius, 0, Math.PI * 2);
    overlayCtx.fill();
    overlayCtx.stroke();
    overlayCtx.globalAlpha = 1;
    overlayCtx.fillStyle = active ? COLOR_POSE : zone.calibrated ? COLOR_INK : COLOR_DIM;
    overlayCtx.fillText(zone.label, x + radius + 6, y);
  }
  if (state.drumPlacementArmed) {
    overlayCtx.fillStyle = COLOR_POSE;
    overlayCtx.fillText('placing zone', 12, height - 18);
  }
  overlayCtx.restore();
}

const FACE_DEBUG_CHANNELS = Object.freeze([
  { name: 'jaw', index: CHANNEL_INDEX.jawOpen, color: '#ff7aa2' },
  { name: 'wide', index: CHANNEL_INDEX.mouthStretchLeft, color: '#ffc46b' },
  { name: 'smile', index: CHANNEL_INDEX.mouthSmileLeft, color: '#7ce7a9' },
  { name: 'blink', index: CHANNEL_INDEX.eyeBlinkLeft, color: '#6fe3ff' },
  { name: 'brow', index: CHANNEL_INDEX.browInnerUp, color: '#e9ebf8' },
]);

function sampleFaceDebug(nowMs) {
  state.faceDebugHistory.push({
    timeMs: nowMs,
    values: FACE_DEBUG_CHANNELS.map((channel) => clamp(state.weights[channel.index] || 0)),
  });
  const cutoff = nowMs - 4000;
  while (state.faceDebugHistory.length && state.faceDebugHistory[0].timeMs < cutoff) state.faceDebugHistory.shift();
}

function drawFaceDebug() {
  const dpr = window.devicePixelRatio || 1;
  const cw = faceDebug.clientWidth, ch = faceDebug.clientHeight;
  if (faceDebug.width !== cw * dpr) { faceDebug.width = cw * dpr; faceDebug.height = ch * dpr; }
  const ctx = faceDebugCtx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = '#0b0e1a';
  ctx.fillRect(0, 0, cw, ch);
  ctx.font = '10px "IBM Plex Mono", monospace';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLOR_DIM;
  ctx.fillText('face expression debug', 8, 12);
  if (state.faceDebugHistory.length < 2) {
    ctx.fillText('start tracking to inspect mouth, blink, brow, and smile stability', 8, ch / 2);
    return;
  }
  const left = 42;
  const top = 22;
  const width = Math.max(10, cw - left - 8);
  const height = Math.max(20, ch - top - 12);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = top + (height * i) / 4;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + width, y);
    ctx.stroke();
  }
  const start = state.faceDebugHistory[0].timeMs;
  const span = Math.max(1, state.faceDebugHistory[state.faceDebugHistory.length - 1].timeMs - start);
  for (let c = 0; c < FACE_DEBUG_CHANNELS.length; c++) {
    const channel = FACE_DEBUG_CHANNELS[c];
    ctx.strokeStyle = channel.color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < state.faceDebugHistory.length; i++) {
      const sample = state.faceDebugHistory[i];
      const x = left + ((sample.timeMs - start) / span) * width;
      const y = top + height * (1 - sample.values[c]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = channel.color;
    ctx.fillText(channel.name, 8, top + 10 + c * 18);
  }
}

const HAND_CHAINS = [
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];

function deriveHandTargets(handRes, mirror = false) {
  return handRes.landmarks.slice(0, 2).map((landmarks, handIndex) => {
    const rawHandedness = handRes.handedness?.[handIndex]?.[0]?.categoryName === 'Left' ? 'Left' : 'Right';
    const handedness = mirror ? (rawHandedness === 'Left' ? 'Right' : 'Left') : rawHandedness;
    const middle = fingerVector(landmarks, HAND_CHAINS[2]);
    const worldWrist = handRes.worldLandmarks?.[handIndex]?.[0];
    const screenWrist = landmarks[0];
    const wrist = worldWrist
      ? [(mirror ? -1 : 1) * worldWrist.x, -worldWrist.y, -worldWrist.z]
      : [(mirror ? -1 : 1) * (screenWrist.x - 0.5), 0.5 - screenWrist.y, -screenWrist.z];
    const target = {
      flags: 0,
      handedness,
      confidence: handRes.handedness?.[handIndex]?.[0]?.score ?? 1,
      curls: HAND_CHAINS.map((chain) => fingerCurl(landmarks, chain)),
      spreads: HAND_CHAINS.map((chain) => fingerSpread(landmarks, chain, middle)),
      wrist,
    };
    target.gesture = classifyHandGesture(target);
    return target;
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

function drawHandDebug() {
  const dpr = window.devicePixelRatio || 1;
  const cw = handDebug.clientWidth, ch = handDebug.clientHeight;
  if (handDebug.width !== cw * dpr) { handDebug.width = cw * dpr; handDebug.height = ch * dpr; }
  const ctx = handDebugCtx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = '#0b0e1a';
  ctx.fillRect(0, 0, cw, ch);
  ctx.font = '10px "IBM Plex Mono", monospace';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLOR_DIM;
  ctx.fillText('hand finger debug', 8, 12);

  const rows = state.handDebugRows.slice(0, 10);
  if (!rows.length) {
    ctx.fillText('enable hands to inspect curls, spreads, confidence, and gestures', 8, ch / 2);
    return;
  }
  const labelW = 116;
  const barW = Math.max(40, cw - labelW - 62);
  const rowH = Math.max(16, (ch - 24) / rows.length);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const y = 24 + i * rowH + rowH / 2;
    const curl = clamp(row.curl);
    ctx.fillStyle = row.recovered ? 'rgba(255,196,107,0.18)' : i % 2 ? 'rgba(255,255,255,0.03)' : 'transparent';
    ctx.fillRect(0, 24 + i * rowH, cw, rowH);
    ctx.fillStyle = COLOR_DIM;
    ctx.fillText(`${row.handedness[0]} ${row.finger}`, 8, y);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(labelW, y - 3, barW, 6);
    ctx.fillStyle = row.confidence < 0.45 ? 'rgba(255,141,122,0.9)' : COLOR_POSE;
    ctx.fillRect(labelW, y - 3, barW * curl, 6);
    ctx.fillStyle = COLOR_INK;
    ctx.fillText(`${curl.toFixed(2)} ${row.gesture}`, labelW + barW + 8, y);
  }
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

function recordFrame(frame, encodedBytes) {
  if (!state.recording.enabled) return;
  state.recording.lines.push(JSON.stringify(createMotionRecord(frame, {
    quality: state.quality,
    warnings: state.warnings,
  })));
  state.recording.frames.push({ t: frame.t, bytes: new Uint8Array(encodedBytes) });
  if (state.recording.lines.length > 36_000) state.recording.lines.shift();
  if (state.recording.frames.length > 36_000) state.recording.frames.shift();
  $('btnDownloadRecording').disabled = state.recording.lines.length === 0;
  $('btnDownloadJsonl').disabled = state.recording.lines.length === 0;
}

function currentDatasetFrame(nowMs = performance.now()) {
  return {
    t: Math.round(nowMs),
    seq: state.seq,
    face: { quat: state.quat, pos: state.pos, weights: state.weights },
    pose: state.hasPose ? { points: state.posePoints } : null,
    hands: state.handTargets,
  };
}

function captureDatasetSample(capturedBy = 'manual', frame = null, nowMs = performance.now()) {
  if (capturedBy === 'auto') {
    if (!state.datasetCapture.enabled) return;
    if (nowMs - state.datasetCapture.lastAutoCaptureMs < 500) return;
    state.datasetCapture.lastAutoCaptureMs = nowMs;
  }
  const sampleFrame = frame || currentDatasetFrame(nowMs);
  try {
    const record = createDatasetRecord({
      seq: state.datasetCapture.seq++,
      label: $('selDatasetLabel').value,
      license: $('inpDatasetLicense').value.trim() || '0BSD',
      frame: sampleFrame,
      quality: state.quality,
      warnings: state.warnings,
      settings,
      handTargets: state.handTargets || [],
      drumKit,
      drumOverlay: state.drumOverlayState,
      source: resolvedAssets?.source || 'tracker',
      capturedBy,
    });
    state.datasetCapture.records.push(record);
    if (state.datasetCapture.records.length > 12_000) state.datasetCapture.records.shift();
    updateDatasetCaptureUi();
    if (capturedBy !== 'auto') {
      setStatus('tracker.status.datasetSample', { n: state.datasetCapture.records.length }, 'open');
    }
  } catch (error) {
    setStatus('tracker.error.dataset', { detail: error.message }, 'error');
  }
}

function updateDatasetCaptureUi() {
  const count = state.datasetCapture.records.length;
  $('datasetCaptureStatus').textContent = t(count === 1 ? 'tracker.ui.status.record' : 'tracker.ui.status.records', { n: count });
  $('btnDownloadDataset').disabled = count === 0;
  $('btnClearDataset').disabled = count === 0;
}

function updateStats(nowMs) {
  if (nowMs - state.lastStats < 500) return;
  const dt = (nowMs - state.lastStats) / 1000;
  state.lastFps = state.frames / dt;
  $('statFps').textContent = state.lastFps.toFixed(0);
  $('statInfer').textContent = state.inferMs.toFixed(1);
  $('statInferP50').textContent = percentileSample(state.inferSamples, 0.5).toFixed(1);
  $('statInferP95').textContent = percentileSample(state.inferSamples, 0.95).toFixed(1);
  $('statPacket').textContent = state.lastPacketBytes || '--';
  $('statDropped').textContent = String(state.dropDetector.dropped);
  $('statFilterLag').textContent = estimateOneEuroLagMs(settings.smoothing.face.minCutoff).toFixed(0);
  $('statJitter').textContent = state.dropDetector.rollingJitterMs(2500, nowMs).toFixed(1);
  $('statHands').textContent = state.hasHands ? String(state.hands.length) : '0';
  $('statVoiceAccent').textContent = settings.voiceAccents ? `${Math.round(state.voice.level * 100)}%` : t('tracker.ui.stat.off');
  const audioLatencyMs = currentAudioLipsyncLatencyMs(nowMs);
  $('statAudioLipsync').textContent = settings.audioLipsync
    ? `${Math.round((state.voice.lipsync?.speech || 0) * 100)}% ${audioLipsyncWithinLatency(audioLatencyMs) ? `${Math.round(audioLatencyMs)}ms` : t('tracker.ui.stat.stale')}`
    : t('tracker.ui.stat.off');
  const transportStats = state.transport.getStats();
  $('statTransportMode').textContent = transportStats.mode || settings.mode || 'local';
  $('statLatency').textContent = transportStats.latencyMs === null ? '--' : transportStats.latencyMs.toFixed(0);
  $('statTransportDrop').textContent = String(transportStats.droppedOut);
  const rate = (state.transport.bytesOut - state.lastBytesOut) / dt / 1024;
  $('statRate').textContent = rate.toFixed(1);
  qualityChip.textContent = `${t(`tracker.ui.quality.${state.quality.state}`, state.quality.state)} ${Math.round((state.quality.score || 0) * 100)}%`;
  qualityChip.dataset.state = state.quality.state;
  const visibleWarnings = [
    ...state.quality.reasons,
    ...state.warnings.filter((w) => typeof w === 'string').slice(0, 4),
  ];
  renderWarnings([...new Set(visibleWarnings)]);
  renderLightingChecklist();
  updateDrumKitUi();
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
  setChecklistState('checkFps', active, !hasQualityWarning(WARNING_TAXONOMY.droppedFrames), t('tracker.ui.hint.lowerResolution'));
  setChecklistState('checkBlur', active, !hasQualityWarning(WARNING_TAXONOMY.motionBlur), t('tracker.ui.hint.slowMotion'));
  setChecklistState('checkConfidence', active, !hasQualityWarning(WARNING_TAXONOMY.occlusion), t('tracker.ui.hint.keepInFrame'));
  if (active && !exposureOk) nudgeBrightnessForLowLight().catch(() => {});
}

function hasQualityWarning(code) {
  return state.quality.warnings.includes(code) || state.warnings.some((warning) => String(warning).startsWith(code));
}

function setChecklistState(id, active, ok, hint) {
  const item = $(id);
  item.dataset.state = active ? (ok ? 'ok' : 'check') : 'idle';
  item.querySelector('b').textContent = t(active ? (ok ? 'tracker.ui.checklist.ok' : 'tracker.ui.checklist.check') : 'tracker.ui.checklist.wait');
  item.querySelector('small').textContent = active ? (ok ? t('tracker.ui.checklist.stable') : hint) : t('tracker.ui.checklist.startCamera');
}

function exposureStatusHint() {
  if (state.cameraControls.unavailable) return t('tracker.ui.hint.manualExposure');
  if (state.cameraControls.attempted.length) return t('tracker.ui.hint.autoControls', { controls: state.cameraControls.attempted.join(', ') });
  return t('tracker.ui.hint.controlsAvailable', { controls: state.cameraControls.supported.join(', ') });
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
  $('inpParticipantId').value = settings.participantId;
  $('inpToken').value = settings.token;
  $('inpWsUrl').value = settings.wsUrl;
  $('inpWtUrl').value = settings.wtUrl;
  $('inpWtHash').value = settings.wtHash;
  $('selSituation').value = settings.situation;
  $('inpObsUrl').value = settings.obsUrl;
  $('chkObsAutoScene').checked = Boolean(settings.obsAutoScene);
  $('chkMirror').checked = Boolean(settings.mirror);
  $('chkPose').checked = Boolean(settings.pose);
  $('chkHands').checked = Boolean(settings.hands);
  $('chkVoiceAccents').checked = Boolean(settings.voiceAccents);
  $('chkAudioLipsync').checked = Boolean(settings.audioLipsync);
  $('chkFaceLock').checked = Boolean(settings.faceLock);
  $('chkDrummerMode').checked = Boolean(settings.drummerMode);
  $('chkPrivacy').checked = Boolean(settings.privacyLocalOnly);
  $('selCameraFacing').value = settings.cameraFacing;
  $('selResolution').value = settings.resolution;
  $('selFps').value = settings.fps;
  $('rngHeadLean').value = settings.headLeanRangeCm;
  $('outHeadLean').textContent = `${settings.headLeanRangeCm} cm`;
  $('selBodyMode').value = settings.bodyMode;
  $('selSmoothingGroup').value = settings.smoothingGroup;
  updateSmoothingControls();
  state.mirror = Boolean(settings.mirror);
  state.poseEnabled = Boolean(settings.pose);
  state.handsEnabled = Boolean(settings.hands);
  setMirrorPreviewClass(video, state.mirror);
  updateModeFields();
  updateViewerLink();
  updateChannelControls();
  updateDrumKitUi();
  updateSituationUi();
}

function readSettingsFromUi() {
  settings.situation = isSituationId($('selSituation').value) ? $('selSituation').value : DEFAULT_SITUATION_ID;
  settings.obsUrl = $('inpObsUrl').value.trim() || DEFAULT_TRACKER_SETTINGS.obsUrl;
  settings.obsAutoScene = $('chkObsAutoScene').checked;
  settings.mode = $('selMode').value;
  settings.room = $('inpRoom').value || 'demo';
  settings.participantId = normalizeParticipantId($('inpParticipantId').value, settings.participantId || createParticipantId());
  $('inpParticipantId').value = settings.participantId;
  settings.token = $('inpToken').value;
  settings.wsUrl = $('inpWsUrl').value;
  settings.wtUrl = $('inpWtUrl').value;
  settings.wtHash = $('inpWtHash').value;
  settings.mirror = $('chkMirror').checked;
  settings.pose = $('chkPose').checked;
  settings.hands = $('chkHands').checked;
  settings.voiceAccents = $('chkVoiceAccents').checked;
  settings.audioLipsync = $('chkAudioLipsync').checked;
  settings.faceLock = $('chkFaceLock').checked;
  settings.drummerMode = $('chkDrummerMode').checked;
  settings.privacyLocalOnly = $('chkPrivacy').checked;
  settings.cameraId = $('selCamera').value;
  settings.cameraFacing = $('selCameraFacing').value === 'environment' ? 'environment' : 'user';
  settings.resolution = $('selResolution').value;
  settings.fps = $('selFps').value;
  settings.headLeanRangeCm = normalizeHeadLeanRangeCm($('rngHeadLean').value);
  settings.bodyMode = $('selBodyMode').value === 'standing' ? 'standing' : 'seated';
  $('outHeadLean').textContent = `${settings.headLeanRangeCm} cm`;
  readSmoothingFromUi();
  return settings;
}

function persistSettings() {
  readSettingsFromUi();
  const persisted = transientPairingToken && settings.token === transientPairingToken
    ? { ...settings, token: '' }
    : settings;
  saveJson(localStorage, TRACKER_STORAGE_KEY, persisted);
  updateViewerLink();
}

function updateModeFields() {
  const ws = $('selMode').value === 'ws' || $('selMode').value === 'wt';
  const wt = $('selMode').value === 'wt';
  $('fieldWsUrl').hidden = !ws;
  $('fieldWtUrl').hidden = !wt;
  $('fieldWtHash').hidden = !wt;
}

function updateViewerLink() {
  $('lnkViewer').href = buildViewerPairingUrl({
    base: '../viewer/',
    mode: $('selMode').value,
    room: $('inpRoom').value || 'demo',
    token: $('inpToken').value,
    wsUrl: $('inpWsUrl').value,
    wtUrl: $('inpWtUrl').value,
    wtHash: $('inpWtHash').value,
  });
}

function updateChannelControls() {
  const i = state.selectedChannel;
  $('outChannel').textContent = `${i + 1}. ${ARKIT_52[i]}${profile.muted[i] ? ` ${t('tracker.ui.channel.muted')}` : ''}`;
  $('rngGain').value = profile.gains[i];
  $('rngDeadzone').value = profile.deadzones[i];
  $('btnMuteChannel').textContent = t(profile.muted[i] ? 'tracker.ui.btn.unmuteChannel' : 'tracker.ui.btn.muteChannel');
  drawMeters();
}

function selectedDrumZone() {
  return drumKit.zones.find((zone) => zone.id === $('selDrumZone').value) || drumKit.zones[0];
}

function saveDrumKit() {
  drumKit = normalizeDrumKitConfig(drumKit);
  saveJson(localStorage, DRUM_KIT_STORAGE_KEY, drumKit);
  state.drumOverlayState = deriveDrumOverlayState(state.handTargets || [], drumKit);
  updateDrumKitUi();
}

// The kit and zone selectors are rebuilt from the catalogue rather than written
// into the markup: each kit brings its own zone list, and the labels are
// translated, so a language toggle has to be able to re-render them.
function renderPercussionKitOptions() {
  const select = $('selPercussionKit');
  if (select.value !== drumKit.kit || select.options.length !== PERCUSSION_KITS.length) {
    select.replaceChildren(...PERCUSSION_KITS.map((kit) => new Option(t(kit.labelKey), kit.id)));
  } else {
    for (const option of select.options) {
      const kit = PERCUSSION_KITS.find((entry) => entry.id === option.value);
      if (kit) option.textContent = t(kit.labelKey);
    }
  }
  select.value = drumKit.kit;
}

function renderDrumZoneOptions() {
  const select = $('selDrumZone');
  const wanted = drumKit.zones.map((zone) => zone.id).join(',');
  const current = [...select.options].map((option) => option.value).join(',');
  const previous = select.value;
  if (wanted !== current) {
    select.replaceChildren(...drumKit.zones.map((zone) => new Option(t(`tracker.ui.zone.${zone.id}`, zone.label), zone.id)));
    // Keep the player's selection across a re-render; fall back to the first
    // zone when the kit changed and the old zone no longer exists.
    select.value = drumKit.zones.some((zone) => zone.id === previous) ? previous : drumKit.zones[0].id;
  } else {
    for (const option of select.options) {
      const zone = drumKit.zones.find((z) => z.id === option.value);
      if (zone) option.textContent = t(`tracker.ui.zone.${zone.id}`, zone.label);
    }
  }
}

function applyPercussionKit(kitId) {
  // A kit change swaps the whole zone set, so the stored calibration for the old
  // kit cannot carry over — it is a different instrument in a different place.
  drumKit = normalizeDrumKitConfig(createDefaultDrumKitConfig(drumKit.name || 'default', kitId));
  saveDrumKit();
  state.drumPlacementArmed = false;
  setStatus('tracker.status.percussionKitChanged', { kit: t(getPercussionKit(kitId).labelKey) }, 'idle');
}

function updateDrumKitUi() {
  renderPercussionKitOptions();
  renderDrumZoneOptions();
  const zone = selectedDrumZone();
  if (zone) {
    $('rngDrumZoneRadius').value = String(zone.radius);
    $('outDrumZoneRadius').textContent = `${(zone.radius * 100).toFixed(1)}%`;
  }
  const summary = drumKitCalibrationSummary(drumKit);
  $('drumKitStatus').textContent = t('tracker.ui.status.zones', { calibrated: summary.calibrated, total: summary.total });
  $('drumKitStatus').dataset.state = summary.ready ? 'good' : summary.calibrated ? 'degraded' : 'idle';
  $('btnArmDrumZone').textContent = t(state.drumPlacementArmed ? 'tracker.ui.btn.cancelPlacement' : 'tracker.ui.btn.placeZone');
  renderDrumZoneList();
}

function renderDrumZoneList() {
  const active = new Set(state.drumOverlayState.activeZoneIds || []);
  $('drumZoneList').replaceChildren(...drumKit.zones.map((zone) => {
    const li = document.createElement('li');
    li.dataset.state = active.has(zone.id) ? 'active' : zone.calibrated ? 'set' : 'idle';
    const label = document.createElement('span');
    label.textContent = `${t(`tracker.ui.zone.${zone.id}`, zone.label)} ${t(zone.calibrated ? 'tracker.ui.zone.set' : 'tracker.ui.zone.unset')}`;
    const detail = document.createElement('small');
    detail.textContent = `${(zone.x * 100).toFixed(0)} / ${(zone.y * 100).toFixed(0)} / ${(zone.radius * 100).toFixed(1)}%`;
    li.append(label, detail);
    return li;
  }));
}

function updateSelectedDrumZone(patch) {
  const id = $('selDrumZone').value;
  drumKit.zones = drumKit.zones.map((zone) => zone.id === id ? { ...zone, ...patch } : zone);
  drumKit.createdAt = new Date().toISOString();
  saveDrumKit();
}

function placeSelectedDrumZoneFromEvent(ev) {
  if (!state.drumPlacementArmed || !settings.drummerMode) return;
  ev.preventDefault();
  const rect = overlay.getBoundingClientRect();
  const displayX = clamp((ev.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
  const displayY = clamp((ev.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
  updateSelectedDrumZone({
    x: state.mirror ? 1 - displayX : displayX,
    y: displayY,
    calibrated: true,
  });
  state.drumPlacementArmed = false;
  updateDrumKitUi();
  setStatus('tracker.status.drumZonePlaced', undefined, 'open');
}

async function copyDrumObsUrl() {
  persistSettings();
  const url = new URL('../viewer/', location.href);
  url.searchParams.set('preset', 'obs');
  url.searchParams.set('mode', settings.mode);
  url.searchParams.set('room', settings.room || 'demo');
  if (settings.token) url.searchParams.set('token', settings.token);
  if (settings.wsUrl) url.searchParams.set('wsUrl', settings.wsUrl);
  if (settings.wtUrl) url.searchParams.set('wtUrl', settings.wtUrl);
  if (settings.wtHash) url.searchParams.set('wtHash', settings.wtHash);
  url.searchParams.set('bg', 'transparent');
  url.searchParams.set('hud', '0');
  url.searchParams.set('camera', 'locked');
  url.searchParams.set('drum', '1');
  try {
    await navigator.clipboard.writeText(url.toString());
    setStatus('tracker.status.obsUrlCopied', undefined, 'open');
  } catch {
    setStatusText(url.toString(), 'open');
  }
}

// ---------------------------------------------------------------- situations

// One live OBS connection, reused across situation switches so changing scenes
// costs a scene-switch request rather than a reconnect handshake.
let obsBridge = null;

function currentSituation() {
  return getSituationPreset(settings.situation);
}

function situationObsSceneName(preset) {
  return t(preset.obs.sceneNameKey);
}

function updateSituationUi() {
  const preset = currentSituation();
  $('situationStatus').textContent = t(preset.labelKey);
  $('situationDescription').textContent = t(preset.descriptionKey);
  // The drum kit panel is meaningless outside the drum situation, and leaving it
  // on screen was the whole reason the app read as drum-only.
  $('drummerSetup').hidden = preset.id !== 'drum';
  // What Minamo is deliberately not going to do, listed rather than assumed.
  // Read straight off the preset: this runs on every language toggle, and the
  // list does not depend on the room or the token.
  $('obsHandoffList').replaceChildren(...preset.obs.sources
    .filter((source) => source.owner === 'obs')
    .map((source) => {
      const item = document.createElement('li');
      item.textContent = t(source.hintKey);
      return item;
    }));
}

/**
 * Switch situations, all the way down to the running pipeline.
 *
 * Flipping the checkboxes is not enough: pose and hand inference load their own
 * models, audio lipsync owns a mic stream, and resolution/fps are camera
 * constraints. This does what each individual control's handler would have done,
 * but only for the things the new situation actually changes — a switch that
 * keeps the same resolution must not stutter the camera.
 */
async function applySituation(id) {
  const before = { resolution: settings.resolution, fps: settings.fps, audioLipsync: settings.audioLipsync };
  Object.assign(settings, applySituationToTrackerSettings(settings, id));

  // The situation's filter preset is a face-group choice; per-group smoothing the
  // streamer tuned elsewhere is left alone.
  const filter = FILTER_PRESETS[settings.filterPreset];
  if (filter) {
    settings.minCutoff = filter.minCutoff;
    settings.beta = filter.beta;
    settings.smoothing = {
      ...settings.smoothing,
      face: { filterPreset: settings.filterPreset, minCutoff: filter.minCutoff, beta: filter.beta },
    };
  }

  applySettingsToUi();
  resetFilters();
  persistSettings();

  if (settings.pose) await ensurePoseLandmarkerIfRunning();
  await ensureHandLandmarkerIfRunning();
  if (settings.audioLipsync !== before.audioLipsync) {
    if (settings.audioLipsync && state.running) await startAudioLipsync();
    else stopAudioLipsync();
  }
  if (settings.resolution !== before.resolution || settings.fps !== before.fps) await restartCameraIfRunning();

  if ($('chkObsAutoScene').checked && obsBridge?.identified) await pushSituationToObs();
}

async function copyObsSourceUrl() {
  persistSettings();
  const url = situationViewerUrl(settings.situation, {
    baseUrl: new URL('../viewer/', location.href).toString(),
    mode: settings.mode,
    room: settings.room || 'demo',
    token: settings.token,
    wsUrl: settings.wsUrl,
    wtUrl: settings.wtUrl,
    wtHash: settings.wtHash,
  });
  try {
    await navigator.clipboard.writeText(url);
    setStatus('tracker.status.obsSourceUrlCopied', undefined, 'open');
  } catch {
    setStatusText(url, 'open');
  }
}

async function pushSituationToObs() {
  const preset = currentSituation();
  // Lay the sources out against OBS's real canvas rather than the 1080p
  // reference, so a 720p or 1440p project still gets the intended framing.
  const canvas = await obsBridge.videoCanvas().catch(() => undefined);
  const plan = situationObsPlan(settings.situation, {
    baseUrl: new URL('../viewer/', location.href).toString(),
    canvas,
    mode: settings.mode,
    room: settings.room || 'demo',
    token: settings.token,
    wsUrl: settings.wsUrl,
    wtUrl: settings.wtUrl,
    wtHash: settings.wtHash,
  });
  await obsBridge.applyPlan(plan, situationObsSceneName(preset));
  setStatus('tracker.status.obsSceneApplied', { scene: situationObsSceneName(preset) }, 'open');
}

async function connectObs() {
  persistSettings();
  obsBridge?.close();
  obsBridge = createObsBridge({ url: settings.obsUrl, password: $('inpObsPassword').value });
  setStatus('tracker.status.obsConnecting', undefined, 'wait');
  try {
    await obsBridge.connect();
    await pushSituationToObs();
  } catch (error) {
    obsBridge?.close();
    obsBridge = null;
    // OBS's own message is the actionable part (wrong password, plugin off), so
    // it is surfaced rather than replaced with a generic failure.
    setStatusText(error instanceof Error ? error.message : String(error), 'error');
  }
}

function smoothingGroupLabel(group) {
  return t(`tracker.ui.group.${group}`, SMOOTHING_GROUPS[group] || group);
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
  $('outSmoothingEffective').textContent = `${smoothingGroupLabel(group)} ${Number(groupSettings.minCutoff).toFixed(2)} / ${Number(groupSettings.beta).toFixed(2)}`;
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
  $('outSmoothingEffective').textContent = `${smoothingGroupLabel(group)} ${next.minCutoff.toFixed(2)} / ${next.beta.toFixed(2)}`;
}

function saveProfile() {
  profile = normalizeProfile(profile);
  saveJson(localStorage, PROFILE_STORAGE_KEY, profile);
  updateChannelControls();
}

function startGuidedCalibration() {
  if (!state.running) {
    setStatus('tracker.status.calibrationNeedsTracking', undefined, 'error');
    return;
  }
  state.calibrationSession = createGuidedCalibrationSession(`guided-${new Date().toISOString()}`, performance.now());
  $('btnStartCalibration').disabled = true;
  $('calibrationGuide').hidden = false;
  $('calibrationResult').textContent = t('tracker.calib.collectingSamples');
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
  setStatus('tracker.status.calibrationRunning', undefined, 'idle');
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
  $('calibrationStep').textContent = progress.step?.label || t('tracker.calib.step.calibration');
  $('calibrationTime').textContent = `${Math.max(0, (progress.totalMs - progress.elapsedMs) / 1000).toFixed(1)}s`;
  $('calibrationProgress').value = String(progress.progress || 0);
}

function finishGuidedCalibration() {
  const session = state.calibrationSession;
  if (!session) return;
  state.calibrationSession = null;
  $('btnStartCalibration').disabled = false;

  if (session.neutralSamples.length === 0 || session.rangeSamples.length === 0) {
    $('calibrationResult').textContent = t('tracker.calib.noFaceSamples');
    setStatus('tracker.status.calibrationFailed', undefined, 'error');
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
  $('calibrationResult').textContent = t('tracker.calib.saved', { neutral: session.neutralSamples.length, range: session.rangeSamples.length });
  setStatus('tracker.status.calibrationSaved', undefined, 'open');
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
    setStatus('tracker.status.gazeCalibrationNeedsTracking', undefined, 'error');
    return;
  }
  state.gazeCalibrationSession = createGazeCalibrationSession(`gaze-${new Date().toISOString()}`, performance.now());
  $('btnStartGazeCalibration').disabled = true;
  $('gazeCalibrationGuide').hidden = false;
  $('gazeCalibrationResult').textContent = t('tracker.calib.collectingIris');
  updateGazeCalibrationUi({
    elapsedMs: 0,
    totalMs: GAZE_CALIBRATION_TOTAL_MS,
    step: { label: 'Look center' },
    progress: 0,
  });
  setStatus('tracker.status.gazeCalibrationRunning', undefined, 'idle');
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
  $('gazeCalibrationStep').textContent = progress.step?.label || t('tracker.calib.step.lookCenter');
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
    $('gazeCalibrationResult').textContent = t('tracker.calib.gazeFailed', { covered: coveredSteps.size, total: GAZE_CALIBRATION_STEPS.length });
    setStatus('tracker.status.gazeCalibrationFailed', undefined, 'error');
    return;
  }

  profile.gaze = buildGazeCalibrationProfile(session.samples);
  saveProfile();
  $('gazeCalibrationResult').textContent = t('tracker.calib.gazeSaved', { n: session.samples.length });
  setStatus('tracker.status.gazeCalibrationSaved', undefined, 'open');
}

function cancelGazeCalibration(message = 'gaze calibration cancelled') {
  if (!state.gazeCalibrationSession) return;
  state.gazeCalibrationSession = null;
  $('btnStartGazeCalibration').disabled = false;
  $('gazeCalibrationResult').textContent = message;
  $('gazeCalibrationTime').textContent = `${(GAZE_CALIBRATION_TOTAL_MS / 1000).toFixed(1)}s`;
  $('gazeCalibrationProgress').value = '0';
}

function startHandCalibration() {
  if (!state.running || !state.handsEnabled) {
    setStatus('tracker.status.handCalibrationNeedsHands', undefined, 'error');
    return;
  }
  state.handCalibrationSession = createHandCalibrationSession(`hand-${new Date().toISOString()}`, performance.now());
  $('btnStartHandCalibration').disabled = true;
  $('handCalibrationGuide').hidden = false;
  $('handCalibrationResult').textContent = t('tracker.calib.collectingHands');
  updateHandCalibrationUi({
    elapsedMs: 0,
    totalMs: HAND_CALIBRATION_TOTAL_MS,
    step: { label: 'Open palm' },
    progress: 0,
  });
  setStatus('tracker.status.handCalibrationRunning', undefined, 'idle');
}

function sampleHandCalibration(handTargets, nowMs = performance.now()) {
  if (!state.handCalibrationSession) return;
  const progress = collectHandCalibrationSample(state.handCalibrationSession, handTargets, nowMs);
  updateHandCalibrationUi(progress);
  if (progress.done) finishHandCalibration();
}

function tickHandCalibration() {
  if (!state.handCalibrationSession) return;
  const progress = handCalibrationProgress(state.handCalibrationSession.startedAtMs, performance.now());
  updateHandCalibrationUi(progress);
  if (progress.done) finishHandCalibration();
}

function updateHandCalibrationUi(progress) {
  $('handCalibrationStep').textContent = progress.step?.label || t('tracker.calib.step.openPalm');
  $('handCalibrationTime').textContent = `${Math.max(0, (progress.totalMs - progress.elapsedMs) / 1000).toFixed(1)}s`;
  $('handCalibrationProgress').value = String(progress.progress || 0);
}

function finishHandCalibration() {
  const session = state.handCalibrationSession;
  if (!session) return;
  state.handCalibrationSession = null;
  $('btnStartHandCalibration').disabled = false;

  if (session.openSamples.length === 0 || session.fistSamples.length === 0) {
    $('handCalibrationResult').textContent = t('tracker.calib.handFailed');
    setStatus('tracker.status.handCalibrationFailed', undefined, 'error');
    return;
  }

  handProfile = buildHandCalibrationProfile({
    openSamples: session.openSamples,
    fistSamples: session.fistSamples,
    rangeSamples: session.rangeSamples,
    name: session.name,
  });
  saveJson(localStorage, HAND_PROFILE_STORAGE_KEY, handProfile);
  state.handTargetStabilizer.reset();
  $('handCalibrationResult').textContent = t('tracker.calib.handSaved', { open: session.openSamples.length, fist: session.fistSamples.length });
  setStatus('tracker.status.handCalibrationSaved', undefined, 'open');
}

function cancelHandCalibration(message = 'hand calibration cancelled') {
  if (!state.handCalibrationSession) return;
  state.handCalibrationSession = null;
  $('btnStartHandCalibration').disabled = false;
  $('handCalibrationResult').textContent = message;
  $('handCalibrationTime').textContent = `${(HAND_CALIBRATION_TOTAL_MS / 1000).toFixed(1)}s`;
  $('handCalibrationProgress').value = '0';
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
  setStatus(profile.muted[state.selectedChannel] ? 'tracker.status.channelMuted' : 'tracker.status.channelUnmuted', undefined, 'idle');
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

function downloadBytes(filename, bytes, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function cameraErrorMessage(e) {
  if (e?.name === 'NotAllowedError') return t('tracker.camera.denied');
  if (e?.name === 'NotFoundError') return t('tracker.camera.notFound');
  if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    return t('tracker.camera.https');
  }
  return e?.message || t('tracker.camera.failed');
}

async function ensurePoseLandmarkerIfRunning() {
  if (!state.poseEnabled || !state.running || state.poseLandmarker || !state._fileset) return;
  const assets = await resolveModelAssets();
  state.poseLandmarker = await PoseLandmarker.createFromOptions(state._fileset, {
    baseOptions: { modelAssetPath: assets.poseModel, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numPoses: 1,
  });
}

async function ensureHandLandmarkerIfRunning() {
  if (!state.handsEnabled || !state.running || state.handLandmarker || !state._fileset) return;
  const assets = await resolveModelAssets();
  state.handLandmarker = await HandLandmarker.createFromOptions(state._fileset, {
    baseOptions: { modelAssetPath: assets.handModel, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 2,
  });
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
    setStatus('tracker.status.tracking', undefined, 'open');
    $('btnStop').disabled = false;
    requestAnimationFrame(loop);
  } catch (e) {
    const message = cameraErrorMessage(e);
    setStatus('tracker.error.generic', { detail: message }, 'error');
    $('stageHint').textContent = message;
    $('stageHint').hidden = false;
    $('btnStart').disabled = false;
  }
});

$('btnStop').addEventListener('click', () => {
  state.running = false;
  state.drumPlacementArmed = false;
  cancelGuidedCalibration('calibration stopped');
  cancelGazeCalibration('gaze calibration stopped');
  cancelHandCalibration('hand calibration stopped');
  stopAudioInput();
  if (video.srcObject) {
    for (const t of video.srcObject.getTracks()) t.stop();
    video.srcObject = null;
  }
  setStatus('tracker.status.stopped', undefined, 'closed');
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
  await ensurePoseLandmarkerIfRunning();
});

$('chkHands').addEventListener('change', async (e) => {
  state.handsEnabled = e.target.checked;
  persistSettings();
  await ensureHandLandmarkerIfRunning();
});

$('chkVoiceAccents').addEventListener('change', async (e) => {
  persistSettings();
  if (e.target.checked && state.running) await startVoiceAccents();
  else stopVoiceAccents();
});
$('chkAudioLipsync').addEventListener('change', async (e) => {
  persistSettings();
  if (e.target.checked && state.running) await startAudioLipsync();
  else stopAudioLipsync();
});
$('chkPrivacy').addEventListener('change', persistSettings);
$('chkFaceLock').addEventListener('change', () => {
  state.trackedFaceBox = null;
  persistSettings();
});
$('chkDrummerMode').addEventListener('change', async (e) => {
  settings.drummerMode = e.target.checked;
  if (settings.drummerMode) {
    $('chkHands').checked = true;
    settings.hands = true;
    state.handsEnabled = true;
    await ensureHandLandmarkerIfRunning();
  } else {
    state.drumPlacementArmed = false;
  }
  persistSettings();
  updateDrumKitUi();
});
$('selCamera').addEventListener('change', restartCameraIfRunning);
$('selCameraFacing').addEventListener('change', async () => {
  $('selCamera').value = '';
  settings.cameraId = '';
  await restartCameraIfRunning();
});
$('selResolution').addEventListener('change', restartCameraIfRunning);
$('selFps').addEventListener('change', restartCameraIfRunning);
$('rngHeadLean').addEventListener('input', persistSettings);
$('selBodyMode').addEventListener('change', persistSettings);
overlay.addEventListener('pointerdown', placeSelectedDrumZoneFromEvent);
$('selPercussionKit').addEventListener('change', (e) => {
  applyPercussionKit(e.target.value);
});
$('selDrumZone').addEventListener('change', updateDrumKitUi);
$('rngDrumZoneRadius').addEventListener('input', (e) => {
  updateSelectedDrumZone({ radius: Number(e.target.value) });
});
$('btnArmDrumZone').addEventListener('click', () => {
  if (!settings.drummerMode) {
    $('chkDrummerMode').checked = true;
    settings.drummerMode = true;
    settings.hands = true;
    $('chkHands').checked = true;
    state.handsEnabled = true;
    persistSettings();
    ensureHandLandmarkerIfRunning().catch((error) => {
      setStatus('tracker.error.handModel', { detail: error.message }, 'error');
    });
  }
  state.drumPlacementArmed = !state.drumPlacementArmed;
  updateDrumKitUi();
});
$('btnClearDrumZone').addEventListener('click', () => {
  updateSelectedDrumZone({ calibrated: false });
  setStatus('tracker.status.drumZoneCleared', undefined, 'idle');
});
$('btnResetDrumKit').addEventListener('click', () => {
  state.drumPlacementArmed = false;
  drumKit = createDefaultDrumKitConfig('default');
  saveDrumKit();
  setStatus('tracker.status.drumKitReset', undefined, 'idle');
});
$('btnCopyDrumObsUrl').addEventListener('click', copyDrumObsUrl);

$('selSituation').addEventListener('change', (e) => {
  applySituation(e.target.value).catch((error) => {
    setStatusText(error instanceof Error ? error.message : String(error), 'error');
  });
});
$('btnCopyObsUrl').addEventListener('click', copyObsSourceUrl);
$('btnConnectObs').addEventListener('click', connectObs);
$('inpObsUrl').addEventListener('input', persistSettings);
$('chkObsAutoScene').addEventListener('change', () => {
  persistSettings();
  if ($('chkObsAutoScene').checked && obsBridge?.identified) {
    pushSituationToObs().catch((error) => {
      setStatusText(error instanceof Error ? error.message : String(error), 'error');
    });
  }
});

$('selMode').addEventListener('change', () => {
  updateModeFields();
  persistSettings();
});

$('inpRoom').addEventListener('input', persistSettings);
$('inpParticipantId').addEventListener('change', persistSettings);
$('inpToken').addEventListener('input', () => {
  transientPairingToken = '';
  persistSettings();
});
$('inpWsUrl').addEventListener('input', persistSettings);
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
$('btnStartHandCalibration').addEventListener('click', startHandCalibration);
$('btnCalibrateNeutral').addEventListener('click', () => {
  profile.offsets = Array.from(state.raw);
  profile.createdAt = new Date().toISOString();
  saveProfile();
  setStatus('tracker.status.neutralCaptured', undefined, 'open');
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
    if (result.warnings.length) setStatus('tracker.status.profileImportedAdjusted', { n: result.warnings.length }, 'idle');
    else setStatus('tracker.status.profileImported', undefined, 'open');
  } catch (error) {
    setStatus('tracker.error.profileImport', { detail: error.message }, 'error');
  } finally {
    e.target.value = '';
  }
});
$('btnResetSettings').addEventListener('click', () => {
  cancelGuidedCalibration('calibration reset');
  cancelGazeCalibration('gaze calibration reset');
  cancelHandCalibration('hand calibration reset');
  state.drumPlacementArmed = false;
  Object.assign(settings, normalizeTrackerSettings(DEFAULT_TRACKER_SETTINGS));
  profile = createCalibrationProfile('default');
  handProfile = createHandCalibrationProfile('default');
  drumKit = createDefaultDrumKitConfig('default');
  saveJson(localStorage, TRACKER_STORAGE_KEY, settings);
  saveProfile();
  saveJson(localStorage, HAND_PROFILE_STORAGE_KEY, handProfile);
  saveJson(localStorage, DRUM_KIT_STORAGE_KEY, drumKit);
  applySettingsToUi();
  stopAudioInput();
  resetFilters();
  setStatus('tracker.status.settingsReset', undefined, 'idle');
});

$('btnResetTracking').addEventListener('click', resetTrackingRuntime);

$('btnConnect').addEventListener('click', async () => {
  try {
    persistSettings();
    const mode = $('selMode').value;
    const result = await state.transport.connectAuto({
      mode,
      room: $('inpRoom').value || 'demo',
      role: 'pub',
      participantId: settings.participantId,
      wsUrl: $('inpWsUrl').value,
      wtUrl: $('inpWtUrl').value,
      certHashHex: $('inpWtHash').value,
      token: $('inpToken').value,
    }, {
      secureOnly: location.protocol === 'https:' && mode !== 'local',
      allowLocalFallback: mode === 'local',
      pageProtocol: location.protocol,
    });
    const fallback = result.attempts.length ? ` after ${result.attempts.map((attempt) => attempt.mode).join(' → ')}` : '';
    setStatus('tracker.status.trackingConnected', { mode: result.mode, room: $('inpRoom').value, fallback }, 'open');
    $('btnConnect').disabled = true;
    $('btnDisconnect').disabled = false;
  } catch (e) {
    setStatus('tracker.error.connect', { detail: e.message }, 'error');
  }
});

$('btnDisconnect').addEventListener('click', async () => {
  await state.transport.close();
  $('btnConnect').disabled = false;
  $('btnDisconnect').disabled = true;
});

$('chkDatasetCapture').addEventListener('change', (e) => {
  state.datasetCapture.enabled = e.target.checked;
  state.datasetCapture.lastAutoCaptureMs = -Infinity;
  updateDatasetCaptureUi();
});

$('btnCaptureDatasetSample').addEventListener('click', () => {
  captureDatasetSample('manual');
});

$('btnDownloadDataset').addEventListener('click', () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadText(
    `minamo-dataset-${stamp}.ndjson`,
    serializeDatasetRecords(state.datasetCapture.records),
    'application/x-ndjson',
  );
});

$('btnClearDataset').addEventListener('click', () => {
  state.datasetCapture.records = [];
  state.datasetCapture.seq = 0;
  state.datasetCapture.lastAutoCaptureMs = -Infinity;
  updateDatasetCaptureUi();
  setStatus('tracker.status.datasetCleared', undefined, 'idle');
});

$('chkRecord').addEventListener('change', (e) => {
  state.recording.enabled = e.target.checked;
  if (state.recording.enabled) {
    state.recording.metadata = createRecordingMetadata({
      version: '0.1.0',
      modelSource: resolvedAssets?.source || 'not loaded',
      settings,
      calibration: profile,
    });
    state.recording.lines = [JSON.stringify(state.recording.metadata)];
    state.recording.frames = [];
  }
  $('btnDownloadRecording').disabled = state.recording.lines.length === 0;
  $('btnDownloadJsonl').disabled = state.recording.lines.length === 0;
});

$('btnDownloadRecording').addEventListener('click', () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bytes = encodeKgmRecording(state.recording.frames, {
    source: state.recording.metadata,
    estimatedTenMinuteBytes: tenMinuteKgmEstimateBytes(Number(settings.fps) || 60),
  });
  downloadBytes(`minamo-motion-${stamp}.kgm`, bytes, KGM_RECORDING_MIME);
});

$('btnDownloadJsonl').addEventListener('click', () => {
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
  setStatus('tracker.status.trackingReset', undefined, state.running ? 'open' : 'idle');
}

applySettingsToUi();
updateDatasetCaptureUi();
checkCapabilities();
refreshCameras().catch(() => {});
navigator.mediaDevices?.addEventListener?.('devicechange', refreshCameras);
setStatus('tracker.status.idle', undefined, 'idle');
bootDone = true;
