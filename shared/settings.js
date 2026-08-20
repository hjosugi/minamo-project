// Persisted settings, their defaults, and the vocabulary they are written in.
//
// One module because these move together: a new tracker setting needs a default,
// a storage key to survive a reload, and usually a warning code for when it
// cannot be honoured. Splitting them meant three files edited for one change.
//
// Below every behavioural module, so those can read a default without importing
// runtime.js and closing a cycle back onto themselves.

import { clamp } from './math.js';

export const WARNING_TAXONOMY = Object.freeze({
  insecureContext: 'INSECURE_CONTEXT',
  noCameraApi: 'NO_CAMERA_API',
  cameraDenied: 'CAMERA_PERMISSION_DENIED',
  noCamera: 'NO_CAMERA_DEVICE',
  noWebgl2: 'NO_WEBGL2',
  noWebtransport: 'NO_WEBTRANSPORT',
  lowLight: 'LOW_LIGHT',
  motionBlur: 'MOTION_BLUR',
  droppedFrames: 'DROPPED_FRAMES',
  occlusion: 'OCCLUSION',
  outlier: 'TEMPORAL_OUTLIER',
  nonFinite: 'NON_FINITE_SIGNAL',
  clamped: 'SIGNAL_CLAMPED',
});

export const FILTER_PRESETS = Object.freeze({
  responsive: Object.freeze({ minCutoff: 2.4, beta: 0.75, dCutoff: 1.0 }),
  balanced: Object.freeze({ minCutoff: 1.6, beta: 0.4, dCutoff: 1.0 }),
  smooth: Object.freeze({ minCutoff: 0.9, beta: 0.18, dCutoff: 1.0 }),
});

export const SMOOTHING_GROUPS = Object.freeze({
  face: 'Face weights',
  headRotation: 'Head rotation',
  headPosition: 'Head position',
  pose: 'Upper-body pose',
  hands: 'Hands',
});

export const DEFAULT_SMOOTHING_SETTINGS = Object.freeze({
  face: Object.freeze({ filterPreset: 'balanced', minCutoff: FILTER_PRESETS.balanced.minCutoff, beta: FILTER_PRESETS.balanced.beta }),
  headRotation: Object.freeze({ filterPreset: 'balanced', minCutoff: 1.2, beta: 0.8 }),
  headPosition: Object.freeze({ filterPreset: 'smooth', minCutoff: 1.0, beta: 0.3 }),
  pose: Object.freeze({ filterPreset: 'smooth', minCutoff: 0.8, beta: 0.2 }),
  hands: Object.freeze({ filterPreset: 'balanced', minCutoff: 1.8, beta: 0.5 }),
});

export const HAND_PROFILE_STORAGE_KEY = 'minamo.hand.profile.v1';

export const DEFAULT_TRACKER_SETTINGS = Object.freeze({
  situation: 'talk',
  mode: 'local',
  room: 'demo',
  participantId: '',
  token: '',
  wsUrl: '',
  wtUrl: 'https://localhost:4433',
  wtHash: '',
  mirror: true,
  pose: false,
  hands: false,
  voiceAccents: false,
  audioLipsync: false,
  faceLock: false,
  drummerMode: false,
  cameraId: '',
  cameraFacing: 'user',
  resolution: '720p',
  fps: '60',
  headLeanRangeCm: 8,
  bodyMode: 'seated',
  filterPreset: 'balanced',
  minCutoff: FILTER_PRESETS.balanced.minCutoff,
  beta: FILTER_PRESETS.balanced.beta,
  smoothingGroup: 'face',
  smoothing: DEFAULT_SMOOTHING_SETTINGS,
  privacyLocalOnly: true,
  // OBS control endpoint. The password is deliberately absent: it is read from
  // the field when connecting and never persisted, the same rule the relay room
  // token follows.
  obsUrl: 'ws://127.0.0.1:4455',
  obsAutoScene: false,
});

export const DEFAULT_VIEWER_SETTINGS = Object.freeze({
  situation: 'talk',
  mode: 'local',
  room: 'demo',
  token: '',
  wsUrl: '',
  wtUrl: 'https://localhost:4433',
  wtHash: '',
  transparent: false,
  armSolver: true,
  drumOverlay: false,
  scenePreset: 'soft',
  backgroundColor: '#0f1220',
  bloom: false,
  vignette: false,
});

export const RESOLUTION_CONSTRAINTS = Object.freeze({
  '480p': Object.freeze({ width: 854, height: 480 }),
  '720p': Object.freeze({ width: 1280, height: 720 }),
  '1080p': Object.freeze({ width: 1920, height: 1080 }),
});

export const TRACKER_STORAGE_KEY = 'minamo.tracker.settings.v2';

export const VIEWER_STORAGE_KEY = 'minamo.viewer.settings.v2';

export const PROFILE_STORAGE_KEY = 'minamo.calibration.profile.v1';

export const MOTION_JSONL_SCHEMA = 'minamo.kgm1.motion-jsonl.v1';

export const MAX_MOTION_JSONL_FRAMES = 36_000;

export function estimateOneEuroLagMs(minCutoff = FILTER_PRESETS.balanced.minCutoff) {
  const cutoff = Math.max(0.001, Number(minCutoff) || FILTER_PRESETS.balanced.minCutoff);
  return 1000 / (2 * Math.PI * cutoff);
}

export function normalizeHeadLeanRangeCm(value) {
  return Math.round(clamp(Number(value ?? DEFAULT_TRACKER_SETTINGS.headLeanRangeCm), 0, 20) * 10) / 10;
}

export function loadJson(storage, key, fallback) {
  try {
    return { ...fallback, ...JSON.parse(storage.getItem(key) || '{}') };
  } catch {
    return { ...fallback };
  }
}

export function saveJson(storage, key, value) {
  storage.setItem(key, JSON.stringify(value));
}
