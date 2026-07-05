// KAGAMI tracker.
// Pipeline: webcam -> MediaPipe Face Landmarker (GPU, in-browser)
//        -> head pose + 52 blendshapes -> One Euro filtering
//        -> KGM1 binary encode -> transport (local / ws / wt).
// The camera image never leaves this page. Only ~76 bytes/frame go out.

import {
  FilesetResolver,
  FaceLandmarker,
  PoseLandmarker,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs';

import { ARKIT_52, NUM_CHANNELS, MIRROR_INDEX, POSE_POINTS, NUM_POSE_POINTS } from '../shared/blendshapes.js';
import { OneEuroArray, OneEuroQuat } from '../shared/filters.js';
import { encodeFrame } from '../shared/codec.js';
import { KagamiTransport } from '../shared/transport.js';

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const POSE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

const $ = (id) => document.getElementById(id);
const video = $('video');
const overlay = $('overlay');
const overlayCtx = overlay.getContext('2d');
const meters = $('meters');
const metersCtx = meters.getContext('2d');
const chip = $('statusChip');

const css = getComputedStyle(document.documentElement);
const COLOR_FACE = css.getPropertyValue('--face').trim();
const COLOR_POSE = css.getPropertyValue('--pose').trim();
const COLOR_DIM = css.getPropertyValue('--ink-dim').trim();
const COLOR_INK = css.getPropertyValue('--ink').trim();

const state = {
  running: false,
  mirror: true,
  poseEnabled: false,
  faceLandmarker: null,
  poseLandmarker: null,
  transport: new KagamiTransport(),
  seq: 0,
  weights: new Float32Array(NUM_CHANNELS),
  raw: new Float32Array(NUM_CHANNELS),
  quat: [0, 0, 0, 1],
  pos: [0, 0, 0.4],
  posePoints: new Float32Array(NUM_POSE_POINTS * 3),
  hasPose: false,
  nameToIndex: null, // built from the first MediaPipe result
  // filters
  weightFilter: new OneEuroArray(NUM_CHANNELS, { minCutoff: 1.6, beta: 0.4 }),
  quatFilter: new OneEuroQuat({ minCutoff: 1.2, beta: 0.8, dCutoff: 1.0 }),
  posFilter: new OneEuroArray(3, { minCutoff: 1.0, beta: 0.3 }),
  poseFilter: new OneEuroArray(NUM_POSE_POINTS * 3, { minCutoff: 0.8, beta: 0.2 }),
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
  const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
  state.faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  });
  if (state.poseEnabled && !state.poseLandmarker) {
    state.poseLandmarker = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: POSE_MODEL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
    });
  }
  state._fileset = fileset;
}

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } },
    audio: false,
  });
  video.srcObject = stream;
  await new Promise((r) => { video.onloadedmetadata = r; });
  await video.play();
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
}

// ---------------------------------------------------------------- loop

let lastVideoTime = -1;

function loop() {
  if (!state.running) return;
  const nowMs = performance.now();

  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const t0 = performance.now();

    const faceRes = state.faceLandmarker.detectForVideo(video, nowMs);
    let poseRes = null;
    if (state.poseEnabled && state.poseLandmarker) {
      poseRes = state.poseLandmarker.detectForVideo(video, nowMs);
    }
    state.inferMs = performance.now() - t0;

    const tSec = nowMs / 1000;
    const hasFace = faceRes.faceBlendshapes && faceRes.faceBlendshapes.length > 0;

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

      // --- One Euro filtering
      state.weights.set(state.raw);
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

    // --- encode and send
    if (hasFace) {
      const buf = encodeFrame({
        t: Math.round(nowMs),
        seq: state.seq++,
        face: { quat: state.quat, pos: state.pos, weights: state.weights },
        pose: state.hasPose ? { points: state.posePoints } : null,
      });
      state.lastPacketBytes = buf.byteLength;
      state.transport.send(buf);
    }

    drawOverlay(faceRes, poseRes);
    drawMeters();
    state.frames++;
  }

  updateStats(nowMs);
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- drawing

function drawOverlay(faceRes, poseRes) {
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
  overlayCtx.restore();
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
    ctx.fillStyle = COLOR_DIM;
    ctx.fillText(ARKIT_52[i], 4, y);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(labelW, y - 2, barW, 4);
    ctx.fillStyle = COLOR_FACE;
    ctx.globalAlpha = 0.35 + v * 0.65;
    ctx.fillRect(labelW, y - 2, barW * v, 4);
    ctx.globalAlpha = 1;
    if (v > 0.02) {
      ctx.fillStyle = COLOR_INK;
      ctx.fillText(v.toFixed(2), labelW + barW + 6, y);
    }
  }
}

function updateStats(nowMs) {
  if (nowMs - state.lastStats < 500) return;
  const dt = (nowMs - state.lastStats) / 1000;
  $('statFps').textContent = (state.frames / dt).toFixed(0);
  $('statInfer').textContent = state.inferMs.toFixed(1);
  $('statPacket').textContent = state.lastPacketBytes || '--';
  const rate = (state.transport.bytesOut - state.lastBytesOut) / dt / 1024;
  $('statRate').textContent = rate.toFixed(1);
  state.lastBytesOut = state.transport.bytesOut;
  state.frames = 0;
  state.lastStats = nowMs;
}

// ---------------------------------------------------------------- ui

$('btnStart').addEventListener('click', async () => {
  $('btnStart').disabled = true;
  try {
    await loadModels();
    await startCamera();
    $('stageHint').hidden = true;
    state.running = true;
    chip.textContent = 'tracking';
    chip.dataset.state = 'open';
    $('btnStop').disabled = false;
    requestAnimationFrame(loop);
  } catch (e) {
    chip.textContent = `error: ${e.message}`;
    chip.dataset.state = 'error';
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
});

$('chkPose').addEventListener('change', async (e) => {
  state.poseEnabled = e.target.checked;
  if (state.poseEnabled && state.running && !state.poseLandmarker && state._fileset) {
    state.poseLandmarker = await PoseLandmarker.createFromOptions(state._fileset, {
      baseOptions: { modelAssetPath: POSE_MODEL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
    });
  }
});

$('selMode').addEventListener('change', () => {
  const wt = $('selMode').value === 'wt';
  $('fieldWtUrl').hidden = !wt;
  $('fieldWtHash').hidden = !wt;
});

$('inpRoom').addEventListener('input', () => {
  $('lnkViewer').href = `../viewer/?room=${encodeURIComponent($('inpRoom').value || 'demo')}`;
});

$('btnConnect').addEventListener('click', async () => {
  try {
    await state.transport.connect({
      mode: $('selMode').value,
      room: $('inpRoom').value || 'demo',
      role: 'pub',
      wtUrl: $('inpWtUrl').value,
      certHashHex: $('inpWtHash').value,
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
