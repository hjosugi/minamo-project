// KAGAMI tracker.
// Pipeline: webcam -> MediaPipe Face Landmarker (GPU, in-browser)
//        -> head pose + 52 blendshapes -> One Euro filtering
//        -> KGM1 binary encode -> transport (local / ws / wt).
// The camera image never leaves this page. Only ~76 bytes/frame go out.

import {
  FilesetResolver,
  FaceLandmarker,
  HandLandmarker,
  PoseLandmarker,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs';

import { ARKIT_52, NUM_CHANNELS, MIRROR_INDEX, POSE_POINTS, NUM_POSE_POINTS } from '../shared/blendshapes.js';
import { OneEuroArray, OneEuroQuat } from '../shared/filters.js';
import { encodeFrame } from '../shared/codec.js';
import { KagamiTransport } from '../shared/transport.js';
import {
  DEFAULT_TRACKER_SETTINGS,
  FILTER_PRESETS,
  PROFILE_STORAGE_KEY,
  RESOLUTION_CONSTRAINTS,
  TRACKER_STORAGE_KEY,
  WARNING_TAXONOMY,
  DroppedFrameDetector,
  applyCalibrationProfile,
  computeQualityScore,
  createCalibrationProfile,
  loadJson,
  normalizeProfile,
  sanitizeWeights,
  saveJson,
} from '../shared/runtime.js';

const MEDIAPIPE_VERSION = '0.10.35';
const CDN_WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const CDN_FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const CDN_POSE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const CDN_HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const LOCAL_WASM_ROOT = `../vendor/mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const LOCAL_FACE_MODEL = '../vendor/mediapipe/models/face_landmarker.task';
const LOCAL_POSE_MODEL = '../vendor/mediapipe/models/pose_landmarker_lite.task';
const LOCAL_HAND_MODEL = '../vendor/mediapipe/models/hand_landmarker.task';

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

const settings = loadJson(localStorage, TRACKER_STORAGE_KEY, DEFAULT_TRACKER_SETTINGS);
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
  transport: new KagamiTransport(),
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
  nameToIndex: null, // built from the first MediaPipe result
  // filters
  weightFilter: new OneEuroArray(NUM_CHANNELS, filterOptions()),
  quatFilter: new OneEuroQuat({ minCutoff: 1.2, beta: 0.8, dCutoff: 1.0 }),
  posFilter: new OneEuroArray(3, { minCutoff: 1.0, beta: 0.3 }),
  poseFilter: new OneEuroArray(NUM_POSE_POINTS * 3, { minCutoff: 0.8, beta: 0.2 }),
  dropDetector: new DroppedFrameDetector(Number(settings.fps) || 60),
  selectedChannel: ARKIT_52.indexOf('jawOpen'),
  warnings: [],
  quality: { state: 'idle', score: 0, reasons: [], warnings: [] },
  lastFps: 0,
  qualityCanvas: document.createElement('canvas'),
  recording: { enabled: false, lines: [] },
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

async function loadModels() {
  chip.textContent = 'loading models...';
  const assets = await resolveModelAssets();
  const fileset = await FilesetResolver.forVisionTasks(assets.wasmRoot);
  state.faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: assets.faceModel, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numFaces: 1,
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
  const trackSettings = track?.getSettings?.() || {};
  $('statCamera').textContent = `${trackSettings.width || video.videoWidth}x${trackSettings.height || video.videoHeight}@${Math.round(trackSettings.frameRate || fps)}`;
  await refreshCameras();
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

function filterOptions() {
  const preset = FILTER_PRESETS[settings.filterPreset] || FILTER_PRESETS.balanced;
  return {
    minCutoff: Number(settings.minCutoff || preset.minCutoff),
    beta: Number(settings.beta || preset.beta),
    dCutoff: preset.dCutoff,
  };
}

function resetFilters() {
  state.weightFilter = new OneEuroArray(NUM_CHANNELS, filterOptions());
  state.quatFilter.reset();
  state.posFilter.reset();
  state.poseFilter.reset();
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
  return warnings;
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
    const hasFace = faceRes.faceBlendshapes && faceRes.faceBlendshapes.length > 0;
    const frameWarnings = [];

    if (hasFace) {
      // --- blendshapes, mapped by name into the canonical KGM1 order
      const cats = faceRes.faceBlendshapes[0].categories;
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
      if (mats && mats.length > 0) {
        const m = mats[0].data;
        quat = mat4ToQuat(m);
        pos = [m[12] / 100, m[13] / 100, m[14] / 100];
      }

      // --- mirror: reflect rotation across the YZ plane and swap L/R channels
      if (state.mirror) {
        quat = [quat[0], -quat[1], -quat[2], quat[3]];
        pos = [-pos[0], pos[1], pos[2]];
        const tmp = new Float32Array(NUM_CHANNELS);
        for (let i = 0; i < NUM_CHANNELS; i++) tmp[MIRROR_INDEX[i]] = state.raw[i];
        state.raw.set(tmp);
      }

      // --- safety, calibration, and One Euro filtering
      const sanitized = sanitizeWeights(state.raw);
      frameWarnings.push(...sanitized.warnings);
      state.weights.set(applyCalibrationProfile(sanitized.weights, profile));
      state.weightFilter.filter(state.weights, tSec);
      state.quat = state.quatFilter.filter(quat, tSec);
      const p = new Float32Array(pos);
      state.posFilter.filter(p, tSec);
      state.pos = [p[0], p[1], p[2]];
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
      state.handTargets = deriveHandTargets(handRes);
      if (handRes.landmarks.some((hand) => hand.some((lm) => lm.x < -0.05 || lm.x > 1.05 || lm.y < -0.05 || lm.y > 1.05))) {
        frameWarnings.push('hand outside frame');
      }
    }

    state.quality = computeQualityScore({
      meanLuma: sampleLuma(),
      confidence: hasFace ? 1 : 0,
      inferenceMs: state.inferMs,
      fps: state.lastFps || Number($('selFps').value) || 60,
      droppedFrames: state.dropDetector.dropped,
    });
    state.warnings = [...new Set([...frameWarnings, ...state.quality.warnings])];

    // --- encode and send
    if (hasFace) {
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

    drawOverlay(faceRes, poseRes, handRes);
    drawMeters();
    state.frames++;
  }

  updateStats(nowMs);
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- drawing

function drawOverlay(faceRes, poseRes, handRes) {
  const w = overlay.width, h = overlay.height;
  overlayCtx.clearRect(0, 0, w, h);
  overlayCtx.save();
  if (state.mirror) {
    overlayCtx.translate(w, 0);
    overlayCtx.scale(-1, 1);
  }

  if (faceRes.faceLandmarks && faceRes.faceLandmarks.length > 0) {
    overlayCtx.fillStyle = COLOR_FACE;
    overlayCtx.globalAlpha = 0.7;
    const lms = faceRes.faceLandmarks[0];
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
  state.recording.lines.push(JSON.stringify({
    schema: 'kagami.kgm1.motion-jsonl.v1',
    t: frame.t,
    seq: frame.seq,
    quality: state.quality,
    warnings: state.warnings,
    face: frame.face ? {
      quat: frame.face.quat,
      pos: frame.face.pos,
      weights: Array.from(frame.face.weights),
    } : null,
    pose: frame.pose ? { points: Array.from(frame.pose.points) } : null,
  }));
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
  $('chkPrivacy').checked = Boolean(settings.privacyLocalOnly);
  $('selResolution').value = settings.resolution;
  $('selFps').value = settings.fps;
  $('selFilterPreset').value = settings.filterPreset;
  $('rngMinCutoff').value = settings.minCutoff;
  $('rngBeta').value = settings.beta;
  state.mirror = Boolean(settings.mirror);
  state.poseEnabled = Boolean(settings.pose);
  state.handsEnabled = Boolean(settings.hands);
  video.classList.toggle('mirrored', state.mirror);
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
  settings.privacyLocalOnly = $('chkPrivacy').checked;
  settings.cameraId = $('selCamera').value;
  settings.resolution = $('selResolution').value;
  settings.fps = $('selFps').value;
  settings.filterPreset = $('selFilterPreset').value;
  settings.minCutoff = Number($('rngMinCutoff').value);
  settings.beta = Number($('rngBeta').value);
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

function saveProfile() {
  profile = normalizeProfile(profile);
  saveJson(localStorage, PROFILE_STORAGE_KEY, profile);
  updateChannelControls();
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
}

function selectMeterChannel(ev) {
  const rect = meters.getBoundingClientRect();
  const y = ev.clientY - rect.top;
  state.selectedChannel = Math.max(0, Math.min(NUM_CHANNELS - 1, Math.floor((y / rect.height) * NUM_CHANNELS)));
  updateChannelControls();
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
    checkCapabilities();
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
  video.classList.toggle('mirrored', state.mirror);
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
$('selCamera').addEventListener('change', restartCameraIfRunning);
$('selResolution').addEventListener('change', restartCameraIfRunning);
$('selFps').addEventListener('change', restartCameraIfRunning);

$('selMode').addEventListener('change', () => {
  updateModeFields();
  persistSettings();
});

$('inpRoom').addEventListener('input', persistSettings);
$('inpToken').addEventListener('input', persistSettings);
$('inpWtUrl').addEventListener('input', persistSettings);
$('inpWtHash').addEventListener('input', persistSettings);

$('selFilterPreset').addEventListener('change', () => {
  const preset = FILTER_PRESETS[$('selFilterPreset').value] || FILTER_PRESETS.balanced;
  $('rngMinCutoff').value = preset.minCutoff;
  $('rngBeta').value = preset.beta;
  applyFilterControls();
});
$('rngMinCutoff').addEventListener('input', () => {
  $('selFilterPreset').value = 'balanced';
  applyFilterControls();
});
$('rngBeta').addEventListener('input', () => {
  $('selFilterPreset').value = 'balanced';
  applyFilterControls();
});

meters.addEventListener('pointerdown', selectMeterChannel);
meters.addEventListener('contextmenu', (ev) => {
  ev.preventDefault();
  selectMeterChannel(ev);
  profile.muted[state.selectedChannel] = !profile.muted[state.selectedChannel];
  saveProfile();
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
  profile.muted[state.selectedChannel] = !profile.muted[state.selectedChannel];
  saveProfile();
});
$('btnCalibrateNeutral').addEventListener('click', () => {
  profile.offsets = Array.from(state.raw);
  profile.createdAt = new Date().toISOString();
  saveProfile();
  chip.textContent = 'neutral captured';
  chip.dataset.state = 'open';
});
$('btnExportProfile').addEventListener('click', () => {
  downloadText('kagami-calibration-profile.json', `${JSON.stringify(profile, null, 2)}\n`);
});
$('btnImportProfile').addEventListener('click', () => $('fileProfile').click());
$('fileProfile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  profile = normalizeProfile(JSON.parse(await file.text()));
  saveProfile();
});
$('btnResetSettings').addEventListener('click', () => {
  Object.assign(settings, DEFAULT_TRACKER_SETTINGS);
  profile = createCalibrationProfile('default');
  saveJson(localStorage, TRACKER_STORAGE_KEY, settings);
  saveProfile();
  applySettingsToUi();
  resetFilters();
  chip.textContent = 'settings reset';
  chip.dataset.state = 'idle';
});

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
  if (state.recording.enabled) state.recording.lines = [];
  $('btnDownloadRecording').disabled = state.recording.lines.length === 0;
});

$('btnDownloadRecording').addEventListener('click', () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadText(`kagami-motion-${stamp}.jsonl`, `${state.recording.lines.join('\n')}\n`, 'application/x-ndjson');
});

window.addEventListener('keydown', (ev) => {
  if (ev.key.toLowerCase() !== 'r' || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  resetFilters();
  state.nameToIndex = null;
  chip.textContent = 'tracking reset';
  chip.dataset.state = state.running ? 'open' : 'idle';
});

applySettingsToUi();
checkCapabilities();
refreshCameras().catch(() => {});
navigator.mediaDevices?.addEventListener?.('devicechange', refreshCameras);
