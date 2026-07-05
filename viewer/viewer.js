// Minamo viewer.
// Receives KGM1 frames, decodes them, and drives either a loaded VRM avatar
// or a built-in primitive bot. Incoming values are treated as targets and
// the render loop eases toward them, so network jitter never reaches bones.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

import { ARKIT_52, CHANNEL_INDEX, NUM_CHANNELS } from '../shared/blendshapes.js';
import { decodeFrame } from '../shared/codec.js';
import {
  createDefaultVrmExpressionMap,
  createPerfectSyncExpressionMap,
  detectPerfectSyncExpressions,
  evaluateExpressionMap,
  parseExpressionMap,
  serializeExpressionMap,
} from '../shared/expression-mapping.js';
import { MinamoTransport } from '../shared/transport.js';
import {
  DEFAULT_VIEWER_SETTINGS,
  VIEWER_STORAGE_KEY,
  FrameOrderGate,
  loadJson,
  parseMotionJsonl,
  saveJson,
} from '../shared/runtime.js';

/** @param {string} id @returns {any} */
const $ = (id) => document.getElementById(id);
const chip = $('statusChip');
const C = CHANNEL_INDEX;
const params = new URLSearchParams(location.search);

const SCENE_PRESETS = Object.freeze({
  soft: Object.freeze({
    label: 'soft key',
    backgroundColor: '#0f1220',
    hemi: [0xdfe6ff, 0x1a1e33, 1.1],
    key: [0xffffff, 1.6, [0.6, 1.8, 1.2]],
    rim: [0x6fe3ff, 0.5, [-1.2, 1.4, -1.0]],
    floor: 0x161a2c,
    bloom: false,
    vignette: false,
  }),
  anime: Object.freeze({
    label: 'anime rim',
    backgroundColor: '#151221',
    hemi: [0xe9edff, 0x24142f, 0.85],
    key: [0xfff3d5, 1.25, [0.3, 1.9, 1.3]],
    rim: [0xff7aa2, 1.35, [-1.3, 1.5, -0.9]],
    floor: 0x1d1830,
    bloom: true,
    vignette: true,
  }),
  flat: Object.freeze({
    label: 'flat',
    backgroundColor: '#24283a',
    hemi: [0xffffff, 0xffffff, 1.4],
    key: [0xffffff, 0.65, [0.2, 1.5, 1.5]],
    rim: [0xffffff, 0, [-1.2, 1.4, -1.0]],
    floor: 0x202436,
    bloom: false,
    vignette: false,
  }),
});

const settings = loadJson(localStorage, VIEWER_STORAGE_KEY, DEFAULT_VIEWER_SETTINGS);
applyQuerySettings(settings, params);
document.body.classList.toggle('hud-hidden', params.get('hud') === '0' || params.get('preset') === 'obs');

// ---------------------------------------------------------------- scene

const container = $('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = settings.transparent ? null : new THREE.Color(settings.backgroundColor);

const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 30);
applyLockedCamera();

const hemi = new THREE.HemisphereLight(0xdfe6ff, 0x1a1e33, 1.1);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(0.6, 1.8, 1.2);
scene.add(key);
const rim = new THREE.DirectionalLight(0x6fe3ff, 0.5);
rim.position.set(-1.2, 1.4, -1.0);
scene.add(rim);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(1.2, 48),
  new THREE.MeshStandardMaterial({ color: 0x161a2c, roughness: 0.9 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
applyBackground();

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.28, 0.35, 0.86);
composer.addPass(renderPass);
composer.addPass(bloomPass);
const vignette = $('sceneVignette');
applySceneState();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  if (params.get('camera') === 'locked' || params.get('preset') === 'obs') applyLockedCamera();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// Gaze target: a child of the camera, offset by decoded eye-look weights,
// so the avatar keeps eye contact and glances around it.
const lookAtTarget = new THREE.Object3D();
camera.add(lookAtTarget);
scene.add(camera);

// ---------------------------------------------------------------- avatar state

const target = {
  quat: new THREE.Quaternion(),
  pos: new THREE.Vector3(0, 0, 0.4),
  weights: new Float32Array(NUM_CHANNELS),
  posePoints: null,
  hands: null,
  fresh: false,
};
const current = {
  quat: new THREE.Quaternion(),
  pos: new THREE.Vector3(0, 0, 0.4),
  weights: new Float32Array(NUM_CHANNELS),
};
const refQuatInv = new THREE.Quaternion(); // calibration: "Center" pose
let hasRef = false;

const IDENT = new THREE.Quaternion();
const tmpQ = new THREE.Quaternion();
const tmpPos = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const BONE_DOWN = new THREE.Vector3(0, -1, 0);

let vrm = null;
let bot = buildBot();
scene.add(bot.group);
let expressionMap = createDefaultVrmExpressionMap();
let availableExpressionNames = [];
let perfectSyncState = detectPerfectSyncExpressions([]);
let mappingEditTimer = null;

// ---------------------------------------------------------------- built-in bot

function buildBot() {
  const group = new THREE.Group();
  group.position.set(0, 1.15, 0);

  const matBody = new THREE.MeshStandardMaterial({ color: 0x2a3154, roughness: 0.55 });
  const matFace = new THREE.MeshStandardMaterial({ color: 0x3a4270, roughness: 0.4 });
  const matEye = new THREE.MeshStandardMaterial({ color: 0xe9ebf8, roughness: 0.2 });
  const matPupil = new THREE.MeshStandardMaterial({ color: 0x0f1220 });
  const matAccent = new THREE.MeshStandardMaterial({ color: 0xff7aa2, roughness: 0.3 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.22, 8, 16), matBody);
  torso.position.y = 0;
  group.add(torso);

  const head = new THREE.Group();
  head.position.y = 0.34;
  group.add(head);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.15, 32, 24), matFace);
  skull.scale.set(1, 0.95, 0.9);
  head.add(skull);

  const mkEye = (sx) => {
    const e = new THREE.Group();
    e.position.set(sx * 0.06, 0.02, 0.125);
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 12), matEye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), matPupil);
    pupil.position.z = 0.02;
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.031, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), matFace);
    lid.scale.y = 0.05;
    lid.position.y = 0.028;
    e.add(white, pupil, lid);
    return { group: e, pupil, lid };
  };
  const eyeL = mkEye(-1);
  const eyeR = mkEye(1);
  head.add(eyeL.group, eyeR.group);

  const mkBrow = (sx) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.012), matAccent);
    b.position.set(sx * 0.06, 0.075, 0.13);
    return b;
  };
  const browL = mkBrow(-1);
  const browR = mkBrow(1);
  head.add(browL, browR);

  const jaw = new THREE.Group();
  jaw.position.set(0, -0.055, 0.06);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.028, 0.05), matAccent);
  mouth.position.set(0, -0.02, 0.06);
  jaw.add(mouth);
  head.add(jaw);

  return { group, head, eyeL, eyeR, browL, browR, jaw };
}

function applyBot(dt) {
  const w = current.weights;
  const lean = avatarLeanOffset();
  bot.group.position.set(lean.x, 1.15 + lean.y, lean.z);
  bot.head.quaternion.copy(current.quat);

  const blinkL = w[C.eyeBlinkLeft];
  const blinkR = w[C.eyeBlinkRight];
  bot.eyeL.lid.scale.y = 0.05 + blinkL * 1.6;
  bot.eyeL.lid.position.y = 0.028 - blinkL * 0.028;
  bot.eyeR.lid.scale.y = 0.05 + blinkR * 1.6;
  bot.eyeR.lid.position.y = 0.028 - blinkR * 0.028;

  const gx = gazeX(w) * 0.016;
  const gy = gazeY(w) * 0.012;
  bot.eyeL.pupil.position.set(gx, gy, 0.02);
  bot.eyeR.pupil.position.set(gx, gy, 0.02);

  const browLift = w[C.browInnerUp] * 0.02 - (w[C.browDownLeft] + w[C.browDownRight]) * 0.008;
  bot.browL.position.y = 0.075 + browLift;
  bot.browR.position.y = 0.075 + browLift;

  bot.jaw.rotation.x = w[C.jawOpen] * 0.55;

  // subtle body sway from experimental pose points
  if (target.posePoints) {
    const p = target.posePoints;
    // points: 0 nose, 1 lShoulder, 2 rShoulder (x, y, z each)
    const dx = p[2 * 3 + 0] - p[1 * 3 + 0];
    const dy = p[2 * 3 + 1] - p[1 * 3 + 1];
    const dz = p[2 * 3 + 2] - p[1 * 3 + 2];
    const roll = Math.atan2(dy, Math.abs(dx) || 1e-4) * 0.8;
    const yaw = Math.atan2(dz, dx) * 0.5;
    tmpQ.setFromEuler(new THREE.Euler(0, yaw, roll));
    bot.group.quaternion.slerp(tmpQ, 1 - Math.exp(-dt * 8));
  }
}

// ---------------------------------------------------------------- vrm

async function loadVrmFromUrl(url, label) {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.loadAsync(url);
  const next = gltf.userData.vrm;
  if (!next) throw new Error('not a VRM file');

  try { VRMUtils.removeUnnecessaryVertices(gltf.scene); } catch {}
  try { VRMUtils.combineSkeletons(gltf.scene); } catch {}
  try { VRMUtils.rotateVRM0(next); } catch {}

  if (vrm) {
    scene.remove(vrm.scene);
    try { VRMUtils.deepDispose(vrm.scene); } catch {}
  }
  vrm = next;
  vrm.scene.position.set(0, 0, 0);
  scene.add(vrm.scene);
  if (vrm.lookAt) vrm.lookAt.target = lookAtTarget;
  configureExpressionMapping(label);
  bot.group.visible = false;
  $('statAvatar').textContent = label;
}

const expr = (name, v) => {
  const em = vrm.expressionManager;
  if (em && em.getExpressionTrackName(name) !== null) em.setValue(name, v);
};
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function listVrmExpressionNames(model = vrm) {
  if (!model?.expressionManager) return [];
  const em = model.expressionManager;
  const known = new Set([
    ...ARKIT_52,
    'aa', 'ih', 'ou', 'ee', 'oh',
    'blink', 'blinkLeft', 'blinkRight',
    'happy', 'angry', 'sad', 'relaxed', 'surprised', 'neutral',
  ]);
  const found = [];
  for (const name of known) {
    if (em.getExpressionTrackName(name) !== null) found.push(name);
  }
  return found;
}

function configureExpressionMapping(label = 'avatar') {
  availableExpressionNames = listVrmExpressionNames();
  perfectSyncState = detectPerfectSyncExpressions(availableExpressionNames);
  expressionMap = perfectSyncState.active
    ? createPerfectSyncExpressionMap(availableExpressionNames)
    : createDefaultVrmExpressionMap(availableExpressionNames);
  expressionMap.name = `${label} ${perfectSyncState.active ? 'Perfect Sync' : 'fallback'} map`;
  refreshExpressionMapEditor();
}

function refreshExpressionMapEditor() {
  $('txtExpressionMap').value = serializeExpressionMap(expressionMap);
  $('statMapping').textContent = perfectSyncState.active
    ? `Perfect Sync ${perfectSyncState.matched.length}/52`
    : `fallback ${expressionMap.targets.length} targets`;
}

function applyExpressionMapFromEditor() {
  try {
    expressionMap = parseExpressionMap($('txtExpressionMap').value);
    $('statMapping').textContent = `${expressionMap.targets.length} mapped targets`;
    chip.textContent = 'mapping applied';
    chip.dataset.state = 'open';
  } catch (err) {
    chip.textContent = `mapping error: ${err.message}`;
    chip.dataset.state = 'error';
  }
}

function queueExpressionMapApply() {
  if (mappingEditTimer !== null) clearTimeout(mappingEditTimer);
  mappingEditTimer = setTimeout(() => {
    mappingEditTimer = null;
    applyExpressionMapFromEditor();
  }, 250);
}

function applyVrmExpressionMap(weights) {
  for (const targetExpression of evaluateExpressionMap(expressionMap, weights)) {
    expr(targetExpression.out, targetExpression.value);
  }
}

function exportExpressionMap() {
  const blob = new Blob([serializeExpressionMap(expressionMap)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(expressionMap.name || 'minamo-expression-map').replace(/[^a-z0-9._-]+/gi, '-')}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function applyVrm(dt) {
  const w = current.weights;
  const h = vrm.humanoid;
  const lean = avatarLeanOffset();
  vrm.scene.position.set(lean.x, lean.y, lean.z);

  // Distribute head rotation across head and neck for a natural look.
  const head = h.getNormalizedBoneNode('head');
  const neck = h.getNormalizedBoneNode('neck');
  if (head) head.quaternion.copy(IDENT).slerp(current.quat, 0.65);
  if (neck) neck.quaternion.copy(IDENT).slerp(current.quat, 0.35);

  // Expressions are retargeted through the editable mapping profile. Perfect
  // Sync avatars use ARKit 52 names 1:1; other VRMs use a curated fallback map.
  applyVrmExpressionMap(w);
  lookAtTarget.position.set(gazeX(w) * 0.6, gazeY(w) * 0.4, 0);

  if (target.posePoints) {
    applyVrmUpperBodyPose(h, target.posePoints, dt);
  }

  if (target.hands) applyVrmHands(h, target.hands);

  vrm.update(dt);
}

function avatarLeanOffset() {
  return tmpPos.set(
    current.pos.x * 0.5,
    current.pos.y * 0.35,
    (0.4 - current.pos.z) * 0.9
  );
}

const FINGER_NAMES = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const FINGER_BONES = {
  thumb: ['ThumbMetacarpal', 'ThumbProximal', 'ThumbDistal'],
  index: ['IndexProximal', 'IndexIntermediate', 'IndexDistal'],
  middle: ['MiddleProximal', 'MiddleIntermediate', 'MiddleDistal'],
  ring: ['RingProximal', 'RingIntermediate', 'RingDistal'],
  pinky: ['LittleProximal', 'LittleIntermediate', 'LittleDistal'],
};

function applyVrmHands(humanoid, hands) {
  for (const hand of hands) {
    const side = hand.handedness === 'Left' ? 'left' : 'right';
    const handBone = humanoid.getNormalizedBoneNode(`${side}Hand`);
    if (handBone && hand.wrist) {
      tmpQ.setFromEuler(new THREE.Euler(
        Math.max(-0.45, Math.min(0.45, -(hand.wrist[1] || 0) * 0.4)),
        Math.max(-0.45, Math.min(0.45, (hand.wrist[0] || 0) * 0.4)),
        Math.max(-0.45, Math.min(0.45, (hand.wrist[2] || 0) * 0.3)),
      ));
      handBone.quaternion.slerp(tmpQ, 0.25);
    }
    for (let i = 0; i < FINGER_NAMES.length; i++) {
      const finger = FINGER_NAMES[i];
      const curl = smoothstep(clamp01(hand.curls?.[i] ?? 0));
      const spread = Math.max(-0.6, Math.min(0.6, hand.spreads?.[i] ?? 0));
      const bones = FINGER_BONES[finger];
      for (let j = 0; j < bones.length; j++) {
        const bone = humanoid.getNormalizedBoneNode(`${side}${bones[j]}`);
        if (!bone) continue;
        const curlScale = j === 0 ? 1.0 : j === 1 ? 0.85 : 0.7;
        const spreadScale = j === 0 ? 0.35 : 0;
        tmpQ.setFromEuler(new THREE.Euler(curl * curlScale, spread * spreadScale, 0));
        bone.quaternion.slerp(tmpQ, 0.45);
      }
    }
  }
}

function applyVrmUpperBodyPose(humanoid, p, dt) {
  const dx = p[2 * 3 + 0] - p[1 * 3 + 0];
  const dy = p[2 * 3 + 1] - p[1 * 3 + 1];
  const dz = p[2 * 3 + 2] - p[1 * 3 + 2];
  const roll = Math.atan2(dy, Math.abs(dx) || 1e-4) * 0.6;
  const yaw = Math.atan2(dz, dx) * 0.4;
  const chest = humanoid.getNormalizedBoneNode('chest') || humanoid.getNormalizedBoneNode('spine');
  if (chest) {
    tmpQ.setFromEuler(new THREE.Euler(0, yaw, roll));
    chest.quaternion.slerp(tmpQ, 1 - Math.exp(-dt * 6));
  }
  if (!settings.armSolver) return;
  applyArmChain(humanoid, 'left', posePoint(p, 1), posePoint(p, 3), posePoint(p, 5), dt);
  applyArmChain(humanoid, 'right', posePoint(p, 2), posePoint(p, 4), posePoint(p, 6), dt);
}

function applyArmChain(humanoid, side, shoulder, elbow, wrist, dt) {
  const upper = tmpA.copy(elbow).sub(shoulder);
  const lower = tmpB.copy(wrist).sub(elbow);
  const reach = tmpC.copy(wrist).sub(shoulder);
  if (upper.length() < 0.04 || lower.length() < 0.04 || reach.length() < 0.08) return;
  const upperArm = humanoid.getNormalizedBoneNode(`${side}UpperArm`);
  const lowerArm = humanoid.getNormalizedBoneNode(`${side}LowerArm`);
  if (upperArm) {
    tmpQ.setFromUnitVectors(BONE_DOWN, upper.normalize());
    upperArm.quaternion.slerp(tmpQ, 1 - Math.exp(-dt * 10));
  }
  if (lowerArm) {
    tmpQ.setFromUnitVectors(BONE_DOWN, lower.normalize());
    lowerArm.quaternion.slerp(tmpQ, 1 - Math.exp(-dt * 12));
  }
}

function posePoint(points, index) {
  return new THREE.Vector3(points[index * 3], points[index * 3 + 1], points[index * 3 + 2]);
}

function smoothstep(value) {
  return value * value * (3 - 2 * value);
}

// Signed gaze from the four eye-look channel pairs. Positive x = look left
// on screen. If a model's eyes go the wrong way, flip GAZE_SIGN.
const GAZE_SIGN = 1;
function gazeX(w) {
  return GAZE_SIGN * ((w[C.eyeLookOutLeft] + w[C.eyeLookInRight]) - (w[C.eyeLookInLeft] + w[C.eyeLookOutRight])) * 0.5;
}
function gazeY(w) {
  return ((w[C.eyeLookUpLeft] + w[C.eyeLookUpRight]) - (w[C.eyeLookDownLeft] + w[C.eyeLookDownRight])) * 0.5;
}

// ---------------------------------------------------------------- receive

const transport = new MinamoTransport();
const orderGate = new FrameOrderGate();
let recvFrames = 0;
let lastBytesIn = 0;
let lastStats = performance.now();
let replayTimer = null;
let replayToken = 0;

function resetOrderGate() {
  orderGate.lastSeq = null;
  orderGate.accepted = 0;
  orderGate.reordered = 0;
  orderGate.lost = 0;
  orderGate.lastAcceptedAt = null;
  orderGate.sourceFps = 0;
}

function applyIncomingFrame(frame) {
  if (!frame || !frame.face) return false;
  const accepted = orderGate.accept(frame);
  if (!accepted.ok) return false;
  const q = frame.face.quat;
  tmpQ.set(q[0], q[1], q[2], q[3]);
  if (!hasRef) {
    refQuatInv.copy(tmpQ).invert();
    hasRef = true;
  }
  target.quat.copy(refQuatInv).multiply(tmpQ); // rotation relative to Center
  target.pos.set(frame.face.pos[0], frame.face.pos[1], frame.face.pos[2]);
  target.weights.set(frame.face.weights);
  target.posePoints = frame.pose ? frame.pose.points : null;
  target.hands = frame.hands;
  target.fresh = true;
  recvFrames++;
  return true;
}

transport.addEventListener('frame', (/** @type {any} */ ev) => {
  const frame = decodeFrame(ev.detail);
  applyIncomingFrame(frame);
});

transport.addEventListener('status', (/** @type {any} */ ev) => {
  chip.textContent = ev.detail.detail || ev.detail.state;
  chip.dataset.state = ev.detail.state;
});

// ---------------------------------------------------------------- render loop

const clock = new THREE.Clock();
function render() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const k = 1 - Math.exp(-dt * orderGate.easingPerSecond()); // adapts to inbound source fps

  current.quat.slerp(target.quat, k);
  current.pos.lerp(target.pos, k);
  for (let i = 0; i < NUM_CHANNELS; i++) {
    current.weights[i] += (target.weights[i] - current.weights[i]) * k;
  }

  if (vrm) applyVrm(dt);
  else applyBot(dt);

  if (settings.bloom && !settings.transparent) composer.render();
  else renderer.render(scene, camera);

  const now = performance.now();
  if (now - lastStats > 500) {
    const dts = (now - lastStats) / 1000;
    const transportStats = transport.getStats();
    $('statFps').textContent = (recvFrames / dts).toFixed(0);
    $('statRate').textContent = ((transport.bytesIn - lastBytesIn) / dts / 1024).toFixed(1);
    $('statTransportMode').textContent = transportStats.mode || settings.mode || 'local';
    $('statLatency').textContent = transportStats.latencyMs === null ? '--' : transportStats.latencyMs.toFixed(0);
    $('statLoss').textContent = String(orderGate.lost);
    $('statReorder').textContent = String(orderGate.reordered);
    recvFrames = 0;
    lastBytesIn = transport.bytesIn;
    lastStats = now;
  }
  requestAnimationFrame(render);
}
render();

// ---------------------------------------------------------------- ui

function applySettingsToUi() {
  $('selMode').value = settings.mode;
  $('inpRoom').value = settings.room;
  $('inpToken').value = settings.token;
  $('inpWtUrl').value = settings.wtUrl;
  $('inpWtHash').value = settings.wtHash;
  $('selScenePreset').value = settings.scenePreset;
  $('inpBgColor').value = normalizeHexColor(settings.backgroundColor) || SCENE_PRESETS.soft.backgroundColor;
  $('chkTransparent').checked = Boolean(settings.transparent);
  $('chkArmSolver').checked = Boolean(settings.armSolver);
  $('chkBloom').checked = Boolean(settings.bloom);
  $('chkVignette').checked = Boolean(settings.vignette);
  updateModeFields();
  applySceneState();
}

function readSettingsFromUi() {
  settings.mode = $('selMode').value;
  settings.room = $('inpRoom').value || 'demo';
  settings.token = $('inpToken').value;
  settings.wtUrl = $('inpWtUrl').value;
  settings.wtHash = $('inpWtHash').value;
  settings.scenePreset = $('selScenePreset').value;
  settings.backgroundColor = normalizeHexColor($('inpBgColor').value) || SCENE_PRESETS.soft.backgroundColor;
  settings.transparent = $('chkTransparent').checked;
  settings.armSolver = $('chkArmSolver').checked;
  settings.bloom = $('chkBloom').checked;
  settings.vignette = $('chkVignette').checked;
  return settings;
}

function persistSettings() {
  saveJson(localStorage, VIEWER_STORAGE_KEY, readSettingsFromUi());
}

function updateModeFields() {
  const wt = $('selMode').value === 'wt';
  $('fieldWtUrl').hidden = !wt;
  $('fieldWtHash').hidden = !wt;
}

function applyBackground() {
  settings.backgroundColor = normalizeHexColor(settings.backgroundColor) || SCENE_PRESETS.soft.backgroundColor;
  renderer.setClearColor(0x000000, settings.transparent ? 0 : 1);
  scene.background = settings.transparent ? null : new THREE.Color(settings.backgroundColor);
  floor.visible = !settings.transparent;
}

function activeScenePreset() {
  if (!SCENE_PRESETS[settings.scenePreset]) settings.scenePreset = 'soft';
  return SCENE_PRESETS[settings.scenePreset];
}

function applyScenePresetDefaults(targetSettings, presetName) {
  const preset = SCENE_PRESETS[presetName];
  if (!preset) return;
  targetSettings.scenePreset = presetName;
  targetSettings.backgroundColor = preset.backgroundColor;
  targetSettings.bloom = preset.bloom;
  targetSettings.vignette = preset.vignette;
}

function applySceneState() {
  const preset = activeScenePreset();
  hemi.color.setHex(preset.hemi[0]);
  hemi.groundColor.setHex(preset.hemi[1]);
  hemi.intensity = preset.hemi[2];
  key.color.setHex(preset.key[0]);
  key.intensity = preset.key[1];
  key.position.set(...preset.key[2]);
  rim.color.setHex(preset.rim[0]);
  rim.intensity = preset.rim[1];
  rim.position.set(...preset.rim[2]);
  floor.material.color.setHex(preset.floor);
  bloomPass.enabled = Boolean(settings.bloom && !settings.transparent);
  bloomPass.strength = settings.bloom ? 0.28 : 0;
  renderer.toneMappingExposure = settings.bloom ? 1.05 : 1;
  vignette.classList.toggle('enabled', Boolean(settings.vignette && !settings.transparent));
  applyBackground();
}

function normalizeHexColor(value) {
  const text = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) return text.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(text)) return `#${text.toLowerCase()}`;
  return null;
}

function parseBoolParam(value) {
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  return null;
}

function serializeViewerSceneUrl() {
  const url = new URL(location.href);
  url.searchParams.set('mode', settings.mode);
  url.searchParams.set('room', settings.room || 'demo');
  if (settings.token) url.searchParams.set('token', settings.token);
  else url.searchParams.delete('token');
  if (settings.wtUrl) url.searchParams.set('wtUrl', settings.wtUrl);
  if (settings.wtHash) url.searchParams.set('wtHash', settings.wtHash);
  url.searchParams.set('scene', settings.scenePreset);
  url.searchParams.set('bg', settings.transparent ? 'transparent' : 'solid');
  url.searchParams.set('bgColor', settings.backgroundColor);
  url.searchParams.set('bloom', settings.bloom ? '1' : '0');
  url.searchParams.set('vignette', settings.vignette ? '1' : '0');
  url.searchParams.set('camera', params.get('camera') || 'locked');
  if (document.body.classList.contains('hud-hidden')) url.searchParams.set('hud', '0');
  return url.toString();
}

async function copySceneUrl() {
  const url = serializeViewerSceneUrl();
  try {
    await navigator.clipboard.writeText(url);
    chip.textContent = 'scene URL copied';
    chip.dataset.state = 'open';
  } catch {
    chip.textContent = url;
    chip.dataset.state = 'open';
  }
}

$('selMode').addEventListener('change', () => {
  updateModeFields();
  persistSettings();
});
$('inpRoom').addEventListener('input', persistSettings);
$('inpToken').addEventListener('input', persistSettings);
$('inpWtUrl').addEventListener('input', persistSettings);
$('inpWtHash').addEventListener('input', persistSettings);
$('selScenePreset').addEventListener('change', () => {
  applyScenePresetDefaults(settings, $('selScenePreset').value);
  applySettingsToUi();
  persistSettings();
});
$('inpBgColor').addEventListener('input', () => {
  settings.backgroundColor = normalizeHexColor($('inpBgColor').value) || settings.backgroundColor;
  settings.transparent = false;
  $('chkTransparent').checked = false;
  applySceneState();
  persistSettings();
});
$('chkTransparent').addEventListener('change', () => {
  persistSettings();
  applySceneState();
});
$('chkArmSolver').addEventListener('change', persistSettings);
$('chkBloom').addEventListener('change', () => {
  persistSettings();
  applySceneState();
});
$('chkVignette').addEventListener('change', () => {
  persistSettings();
  applySceneState();
});
$('btnCopySceneUrl').addEventListener('click', copySceneUrl);
$('txtExpressionMap').addEventListener('input', queueExpressionMapApply);
$('btnApplyMapping').addEventListener('click', applyExpressionMapFromEditor);
$('btnExportMapping').addEventListener('click', exportExpressionMap);
$('btnImportMapping').addEventListener('click', () => $('fileExpressionMap').click());
$('btnResetMapping').addEventListener('click', () => {
  expressionMap = perfectSyncState.active
    ? createPerfectSyncExpressionMap(availableExpressionNames)
    : createDefaultVrmExpressionMap(availableExpressionNames);
  refreshExpressionMapEditor();
});
$('fileExpressionMap').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    expressionMap = parseExpressionMap(await file.text());
    refreshExpressionMapEditor();
    chip.textContent = `mapping loaded: ${file.name}`;
    chip.dataset.state = 'open';
  } catch (err) {
    chip.textContent = `mapping error: ${err.message}`;
    chip.dataset.state = 'error';
  } finally {
    e.target.value = '';
  }
});

$('btnConnect').addEventListener('click', async () => {
  try {
    persistSettings();
    stopReplay();
    resetOrderGate();
    await transport.connectAuto({
      mode: $('selMode').value,
      room: $('inpRoom').value || 'demo',
      role: 'sub',
      wtUrl: $('inpWtUrl').value,
      certHashHex: $('inpWtHash').value,
      token: $('inpToken').value,
    });
  } catch (e) {
    chip.textContent = `connect error: ${e.message}`;
    chip.dataset.state = 'error';
  }
});

$('btnCenter').addEventListener('click', () => {
  hasRef = false; // next incoming frame becomes the neutral pose
});

$('btnLoadVrm').addEventListener('click', () => $('fileVrm').click());
$('fileVrm').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) await loadVrmFile(file);
});

async function loadVrmFile(file) {
  const url = URL.createObjectURL(file);
  try {
    await loadVrmFromUrl(url, file.name);
  } catch (err) {
    chip.textContent = `vrm error: ${err.message}`;
    chip.dataset.state = 'error';
  } finally {
    URL.revokeObjectURL(url);
  }
}

function isMotionJsonlFile(file) {
  const name = file.name.toLowerCase();
  return name.endsWith('.jsonl') || name.endsWith('.ndjson');
}

async function loadReplayFile(file) {
  try {
    const frames = parseMotionJsonl(await file.text());
    startReplay(frames, file.name);
  } catch (err) {
    chip.textContent = `replay error: ${err.message}`;
    chip.dataset.state = 'error';
  }
}

function stopReplay() {
  replayToken++;
  if (replayTimer !== null) {
    clearTimeout(replayTimer);
    replayTimer = null;
  }
}

function startReplay(frames, label) {
  stopReplay();
  transport.close().catch(() => {});
  resetOrderGate();
  hasRef = false;
  recvFrames = 0;
  lastBytesIn = transport.bytesIn;
  lastStats = performance.now();
  const token = replayToken;
  let index = 0;
  chip.textContent = `replay ${label}`;
  chip.dataset.state = 'open';

  const step = () => {
    if (token !== replayToken) return;
    const frame = frames[index];
    applyIncomingFrame(frame);
    index++;
    if (index >= frames.length) {
      replayTimer = null;
      chip.textContent = `replay complete: ${label}`;
      chip.dataset.state = 'idle';
      return;
    }
    const dt = Number(frames[index].t) - Number(frame.t);
    const delay = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 250) : 1000 / 60;
    replayTimer = setTimeout(step, delay);
  };
  step();
}

// drag and drop
let dragDepth = 0;
document.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; document.body.classList.add('dragging'); });
document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  const file = e.dataTransfer.files[0];
  if (!file) return;
  if (file.name.toLowerCase().endsWith('.vrm')) await loadVrmFile(file);
  else if (isMotionJsonlFile(file)) await loadReplayFile(file);
});

// ?vrm=<url> loads a model directly (must be CORS-accessible)
if (params.get('vrm')) {
  loadVrmFromUrl(params.get('vrm'), params.get('vrm').split('/').pop()).catch((e) => {
    chip.textContent = `vrm error: ${e.message}`;
    chip.dataset.state = 'error';
  });
}

// auto-connect local mode when opened from the tracker link
applySettingsToUi();
refreshExpressionMapEditor();
if (params.get('room')) {
  transport.connectAuto({
    mode: settings.mode,
    room: settings.room,
    role: 'sub',
    wtUrl: settings.wtUrl,
    certHashHex: settings.wtHash,
    token: settings.token,
  }).catch(() => {});
}

function applyQuerySettings(targetSettings, query) {
  if (query.get('preset') === 'obs') {
    targetSettings.transparent = true;
  }
  if (SCENE_PRESETS[query.get('scene')]) {
    applyScenePresetDefaults(targetSettings, query.get('scene'));
  }
  const mode = query.get('mode');
  if (['local', 'ws', 'wt'].includes(mode)) targetSettings.mode = mode;
  if (query.get('room')) targetSettings.room = query.get('room');
  if (query.get('token')) targetSettings.token = query.get('token');
  if (query.get('wtUrl')) targetSettings.wtUrl = query.get('wtUrl');
  if (query.get('wtHash')) targetSettings.wtHash = query.get('wtHash');
  if (query.get('arms') === '0') targetSettings.armSolver = false;
  if (query.get('arms') === '1') targetSettings.armSolver = true;
  if (query.get('bg') === 'transparent' || query.get('transparent') === '1') targetSettings.transparent = true;
  if (query.get('bg') === 'solid' || query.get('transparent') === '0') targetSettings.transparent = false;
  const bgColor = normalizeHexColor(query.get('bgColor')) || normalizeHexColor(query.get('bg'));
  if (bgColor) {
    targetSettings.backgroundColor = bgColor;
    targetSettings.transparent = false;
  }
  const bloom = parseBoolParam(query.get('bloom'));
  if (bloom !== null) targetSettings.bloom = bloom;
  const vignetteParam = parseBoolParam(query.get('vignette'));
  if (vignetteParam !== null) targetSettings.vignette = vignetteParam;
}

function applyLockedCamera() {
  camera.position.set(0, 1.42, 1.4);
  camera.lookAt(0, 1.38, 0);
}
